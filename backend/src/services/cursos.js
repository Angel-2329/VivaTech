const pool = require('../config/database');
const { ErrorReglaCurso, validarEdicionCurso, validarFechaCierre, validarDespublicacionCurso } = require('./reglas-cursos');
const { obtenerContenidoCurso } = require('./contenido');
const { validarCurso } = require('./validar-contenido');

const MAXIMO_ID = '9223372036854775807';
const CAMPOS = ['idCategoria', 'titulo', 'descripcion', 'fechaCierre'];

function comprobarEditor(usuario) {
  if (!usuario) throw new ErrorReglaCurso(404, 'El perfil todavía no está registrado', 'perfil_no_registrado');
  if (usuario.activo !== true) throw new ErrorReglaCurso(403, 'La cuenta está desactivada', 'cuenta_desactivada');
  if (!['maestro', 'administrador'].includes(usuario.rol) || typeof usuario.uid !== 'string'
    || !usuario.uid.trim() || usuario.uid.length > 128) {
    throw new ErrorReglaCurso(403, 'No tienes permisos para realizar esta acción', 'rol_no_autorizado');
  }
}

function comprobarId(valor, tipo) {
  if (typeof valor !== 'string' || !/^[1-9][0-9]{0,18}$/.test(valor)
    || (valor.length === MAXIMO_ID.length && valor > MAXIMO_ID)) {
    throw new ErrorReglaCurso(400,
      tipo === 'categoria' ? 'El identificador de la categoría no es válido' : 'El identificador del curso no es válido',
      tipo === 'categoria' ? 'id_categoria_invalido' : 'id_curso_invalido');
  }
}

function validarDatos(datos, crear) {
  if (datos === null || typeof datos !== 'object' || Array.isArray(datos)) {
    throw new ErrorReglaCurso(400, 'Envía los datos como un objeto JSON', 'cuerpo_invalido');
  }
  const claves = Object.keys(datos);
  const permitidos = crear ? CAMPOS : [...CAMPOS, 'estadoPublicacion'];
  if (claves.some((campo) => !permitidos.includes(campo)) || (!crear && claves.length === 0)) {
    throw new ErrorReglaCurso(400, 'Envía únicamente los campos permitidos para esta operación', 'campos_invalidos');
  }
  const resultado = {};
  if (crear || Object.hasOwn(datos, 'idCategoria')) {
    comprobarId(datos.idCategoria, 'categoria');
    resultado.idCategoria = datos.idCategoria;
  }
  const errores = [];
  for (const [campo, maximo] of [['titulo', 100], ['descripcion', 300]]) {
    if (!crear && !Object.hasOwn(datos, campo)) continue;
    const valor = datos[campo];
    if (typeof valor !== 'string') {
      errores.push({ ruta: `curso.${campo}`, codigo: 'texto_requerido', mensaje: 'Debe ser una cadena de texto' });
    } else if (Array.from(valor.trim()).length < 1 || Array.from(valor.trim()).length > maximo) {
      errores.push({ ruta: `curso.${campo}`, codigo: 'longitud_invalida', mensaje: `El texto debe tener entre 1 y ${maximo} caracteres` });
    } else resultado[campo] = valor.trim();
  }
  if (!crear && Object.hasOwn(datos, 'estadoPublicacion')) {
    if (!['borrador', 'publicado'].includes(datos.estadoPublicacion)) {
      errores.push({ ruta: 'curso.estadoPublicacion', codigo: 'valor_invalido', mensaje: 'El estado debe ser borrador o publicado' });
    } else resultado.estadoPublicacion = datos.estadoPublicacion;
  }
  if (errores.length) {
    const error = new ErrorReglaCurso(400, 'Revisa los datos del curso', 'contenido_invalido');
    error.errores = errores;
    throw error;
  }
  if (Object.hasOwn(datos, 'fechaCierre')) resultado.fechaCierre = datos.fechaCierre;
  return resultado;
}

async function ejecutarOperacion(usuario, operacion) {
  comprobarEditor(usuario);
  const cliente = await pool.connect();
  let transaccion = false;
  let errorConexion;
  try {
    await cliente.query('BEGIN');
    transaccion = true;
    const perfiles = await cliente.query(
      'SELECT uid, rol, activo FROM usuarios WHERE uid = $1 FOR SHARE', [usuario.uid]
    );
    const editor = perfiles.rows[0];
    comprobarEditor(editor);
    if (editor.uid !== usuario.uid) throw new TypeError('El perfil consultado no corresponde al solicitante');
    const respuesta = await operacion(cliente, editor);
    await cliente.query('SET CONSTRAINTS uq_cursos_categoria_orden IMMEDIATE');
    await cliente.query('COMMIT');
    transaccion = false;
    return respuesta;
  } catch (error) {
    if (transaccion) {
      try {
        await cliente.query('ROLLBACK');
      } catch (falloRollback) {
        errorConexion = falloRollback;
        console.error('No fue posible revertir la operación de cursos');
      }
    } else errorConexion = error;
    throw error;
  } finally {
    if (errorConexion) cliente.release(errorConexion);
    else cliente.release();
  }
}

async function bloquearCategoria(cliente, idCategoria) {
  const resultado = await cliente.query(`
    SELECT id_categoria::text AS "idCategoria" FROM categorias
    WHERE id_categoria = $1::bigint FOR UPDATE
  `, [idCategoria]);
  if (resultado.rows.length === 0) {
    throw new ErrorReglaCurso(404, 'La categoría no está disponible', 'categoria_no_encontrada');
  }
}

async function siguienteOrden(cliente, idCategoria) {
  const resultado = await cliente.query(`
    SELECT COALESCE(max(orden), 0)::integer AS "ultimoOrden"
    FROM cursos WHERE id_categoria = $1::bigint
  `, [idCategoria]);
  const ultimo = resultado.rows[0]?.ultimoOrden;
  if (!Number.isInteger(ultimo) || ultimo < 0 || ultimo >= 2147483647) {
    throw new TypeError('No se puede asignar una posición válida al curso');
  }
  return ultimo + 1;
}

const INDICE_TITULO_NORMALIZADO = 'uq_cursos_titulo_normalizado';

async function escribirCurso(cliente, sql, parametros) {
  try {
    return await cliente.query(sql, parametros);
  } catch (error) {
    if (error && error.code === '23505' && error.constraint === INDICE_TITULO_NORMALIZADO) {
      throw new ErrorReglaCurso(409, 'Ya existe un curso con ese título en esta categoría.', 'curso_duplicado');
    }
    throw error;
  }
}

async function crearCurso(usuario, datos, { reloj = () => new Date() } = {}) {
  comprobarEditor(usuario);
  const entrada = validarDatos(datos, true);
  if (typeof reloj !== 'function') throw new TypeError('El reloj debe ser una función');
  return ejecutarOperacion(usuario, async (cliente, editor) => {
    await bloquearCategoria(cliente, entrada.idCategoria);
    const fecha = validarFechaCierre(Object.hasOwn(entrada, 'fechaCierre') ? entrada.fechaCierre : null, { ahora: reloj() });
    const orden = await siguienteOrden(cliente, entrada.idCategoria);
    const resultado = await escribirCurso(cliente, `
      INSERT INTO cursos (id_categoria, titulo, descripcion, estado_publicacion,
        creado_por, orden, fecha_cierre)
      VALUES ($1::bigint, $2, $3, 'borrador', $4, $5, $6::date)
      RETURNING id_curso::text AS "idCurso"
    `, [entrada.idCategoria, entrada.titulo, entrada.descripcion, editor.uid, orden, fecha]);
    if (resultado.rows.length !== 1) throw new TypeError('La creación debe devolver un curso único');
    comprobarId(resultado.rows[0].idCurso, 'curso');
    return obtenerContenidoCurso(editor, resultado.rows[0].idCurso, { conexion: cliente });
  });
}

async function validarPublicacion(cliente, idCurso, metadatos) {
  const { rows: categorias } = await cliente.query(
    'SELECT nombre FROM categorias WHERE id_categoria = $1::bigint', [metadatos.idCategoria]
  );
  if (categorias.length !== 1) throw new TypeError('La publicación requiere una categoría existente');
  const { rows: lecciones } = await cliente.query(`
    SELECT id_leccion::text AS "idLeccion", titulo, objetivo,
      duracion_estimada_minutos AS "duracionEstimadaMinutos", orden
    FROM lecciones WHERE id_curso = $1::bigint
    ORDER BY orden, id_leccion FOR UPDATE
  `, [idCurso]);
  const { rows: pasos } = await cliente.query(`
    SELECT p.id_leccion::text AS "idLeccion", p.orden, p.instruccion, p.recursos, p.actividad
    FROM pasos p JOIN lecciones l ON l.id_leccion = p.id_leccion
    WHERE l.id_curso = $1::bigint
    ORDER BY p.id_leccion, p.orden, p.id_paso FOR UPDATE OF p
  `, [idCurso]);
  const contenido = {
    categoria: categorias[0].nombre,
    titulo: metadatos.titulo,
    descripcion: metadatos.descripcion,
    orden: metadatos.orden,
    lecciones: lecciones.map((leccion) => ({
      ...leccion, pasos: pasos.filter((paso) => paso.idLeccion === leccion.idLeccion)
    }))
  };
  const validacion = validarCurso(contenido, { publicable: true });
  if (!validacion.valido) {
    const error = new ErrorReglaCurso(409, 'Completa el contenido del curso antes de publicarlo', 'contenido_incompleto');
    error.errores = validacion.errores.map(({ ruta, codigo, mensaje }) => ({ ruta, codigo, mensaje }));
    throw error;
  }
}

async function editarCurso(usuario, idCurso, datos, { reloj = () => new Date() } = {}) {
  comprobarEditor(usuario);
  comprobarId(idCurso, 'curso');
  const entrada = validarDatos(datos, false);
  if (typeof reloj !== 'function') throw new TypeError('El reloj debe ser una función');
  return ejecutarOperacion(usuario, async (cliente, editor) => {
    const resultado = await cliente.query(`
      SELECT id_curso::text AS "idCurso", id_categoria::text AS "idCategoria",
        titulo, descripcion, estado_publicacion, creado_por, orden,
        fecha_cierre::text AS fecha_cierre
      FROM cursos WHERE id_curso = $1::bigint FOR UPDATE
    `, [idCurso]);
    const curso = resultado.rows[0];
    validarEdicionCurso(editor, curso);

    const destino = entrada.idCategoria ?? curso.idCategoria;
    let orden = curso.orden;
    if (destino !== curso.idCategoria) {
      if (editor.rol !== 'administrador') {
        throw new ErrorReglaCurso(403, 'Solo el administrador puede trasladar un curso de categoría', 'rol_no_autorizado');
      }
      await bloquearCategoria(cliente, destino);
      orden = await siguienteOrden(cliente, destino);
    }

    const fechaActual = curso.fecha_cierre ?? null;
    let fecha = fechaActual;
    if (Object.hasOwn(entrada, 'fechaCierre') && entrada.fechaCierre !== fechaActual) {
      fecha = validarFechaCierre(entrada.fechaCierre, { ahora: reloj() });
    }
    const titulo = entrada.titulo ?? curso.titulo;
    const descripcion = entrada.descripcion ?? curso.descripcion;
    const estado = entrada.estadoPublicacion ?? curso.estado_publicacion;
    const cambiaEstado = estado !== curso.estado_publicacion;
    if (cambiaEstado && estado === 'publicado') {
      await validarPublicacion(cliente, idCurso, { idCategoria: destino, titulo, descripcion, orden });
    }
    if (cambiaEstado && estado === 'borrador') {
      const { rows: [avance] } = await cliente.query(`
        SELECT EXISTS (SELECT 1 FROM progresos p
          JOIN lecciones l ON l.id_leccion = p.id_leccion
          WHERE l.id_curso = $1::bigint) AS "tieneAvance"
      `, [idCurso]);
      validarDespublicacionCurso(editor, curso, { tieneAvance: avance?.tieneAvance });
    }
    if (destino !== curso.idCategoria || titulo !== curso.titulo || descripcion !== curso.descripcion || fecha !== fechaActual || cambiaEstado) {
      const actualizado = await escribirCurso(cliente, `
        UPDATE cursos SET id_categoria = $1::bigint, titulo = $2, descripcion = $3,
          orden = $4, fecha_cierre = $5::date, estado_publicacion = $7
        WHERE id_curso = $6::bigint RETURNING id_curso::text AS "idCurso"
      `, [destino, titulo, descripcion, orden, fecha, idCurso, estado]);
      if (actualizado.rows.length !== 1) throw new TypeError('La actualización debe devolver un curso único');
    }
    if (cambiaEstado) {
      await cliente.query(`
        UPDATE lecciones SET estado_publicacion = $1
        WHERE id_curso = $2::bigint AND estado_publicacion <> $1
      `, [estado, idCurso]);
    }
    return obtenerContenidoCurso(editor, idCurso, { conexion: cliente });
  });
}

module.exports = { crearCurso, editarCurso };
