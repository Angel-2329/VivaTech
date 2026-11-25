const { isDeepStrictEqual } = require('node:util');
const pool = require('../config/database');
const { ErrorReglaCurso, validarEdicionCurso, validarCambioEstructural } = require('./reglas-cursos');
const { validarLeccion, validarPaso } = require('./validar-contenido');
const { normalizarRecursosVideo } = require('./normalizar-video');
const { tienePermisoEditor } = require('./permisos-curso');

const MODELOS = {
  leccion: { tabla: 'lecciones', id: 'id_leccion', padre: 'id_curso', clave: 'idLeccion', lista: 'idsLecciones', maximo: 10, limite: 'limite_lecciones' },
  paso: { tabla: 'pasos', id: 'id_paso', padre: 'id_leccion', clave: 'idPaso', lista: 'idsPasos', maximo: 8, limite: 'limite_pasos' }
};
const MAXIMO_ID = '9223372036854775807';
const esObjeto = (valor) => valor !== null && typeof valor === 'object' && !Array.isArray(valor);
const texto = (valor) => typeof valor === 'string' ? valor.trim() : valor;

function comprobarEditor(usuario) {
  if (!usuario) throw new ErrorReglaCurso(404, 'El perfil todavía no está registrado', 'perfil_no_registrado');
  if (usuario.activo !== true) throw new ErrorReglaCurso(403, 'La cuenta está desactivada', 'cuenta_desactivada');
  if (!['maestro', 'administrador'].includes(usuario.rol) || typeof usuario.uid !== 'string'
    || !usuario.uid.trim() || usuario.uid.length > 128) {
    throw new ErrorReglaCurso(403, 'No tienes permisos para realizar esta acción', 'rol_no_autorizado');
  }
}

function esId(id) {
  return typeof id === 'string' && /^[1-9][0-9]{0,18}$/.test(id)
    && (id.length < MAXIMO_ID.length || id <= MAXIMO_ID);
}

function comprobarId(id, tipo) {
  if (!esId(id)) throw new ErrorReglaCurso(400, 'El identificador no es válido', `id_${tipo}_invalido`);
}

function comprobarCuerpo(datos, permitidos, parche = false) {
  if (!esObjeto(datos)) throw new ErrorReglaCurso(400, 'Envía los datos como un objeto JSON', 'cuerpo_invalido');
  if ((parche && Object.keys(datos).length === 0) || Object.keys(datos).some((clave) => !permitidos.includes(clave))) {
    throw new ErrorReglaCurso(400, 'Envía únicamente los campos permitidos para esta operación', 'campos_invalidos');
  }
}

function contenidoInvalido(errores) {
  const error = new ErrorReglaCurso(400, 'Revisa los datos del contenido', 'contenido_invalido');
  error.errores = errores.map(({ ruta, codigo, mensaje }) => ({ ruta, codigo, mensaje }));
  return error;
}

function exigirValidacion(resultado) {
  if (!resultado.valido) throw contenidoInvalido(resultado.errores);
}

function comprobarCamposInternos(valor, permitidos, ruta) {
  if (esObjeto(valor) && Object.keys(valor).some((clave) => !permitidos.includes(clave))) {
    throw contenidoInvalido([{ ruta, codigo: 'campos_invalidos', mensaje: 'El objeto contiene campos no permitidos' }]);
  }
}

function prepararPaso(datos) {
  const nuevo = structuredClone(datos);
  nuevo.instruccion = texto(nuevo.instruccion);
  const actividad = nuevo.actividad;
  if (esObjeto(actividad)) {
    const permitidos = actividad.tipo === 'lectura' ? ['tipo']
      : actividad.tipo === 'opcion' ? ['tipo', 'pregunta', 'opciones', 'correcta', 'pista', 'mensajeAcierto']
        : ['tipo', 'pantalla', 'opciones', 'correcta', 'pista', 'mensajeAcierto'];
    comprobarCamposInternos(actividad, permitidos, 'paso.actividad');
    for (const campo of ['pregunta', 'pista', 'mensajeAcierto']) {
      if (Object.hasOwn(actividad, campo)) actividad[campo] = texto(actividad[campo]);
    }
    if (esObjeto(actividad.pantalla)) {
      comprobarCamposInternos(actividad.pantalla, ['titulo', 'subtitulo'], 'paso.actividad.pantalla');
      actividad.pantalla.titulo = texto(actividad.pantalla.titulo);
      if (Object.hasOwn(actividad.pantalla, 'subtitulo')) actividad.pantalla.subtitulo = texto(actividad.pantalla.subtitulo);
    }
    if (Array.isArray(actividad.opciones)) actividad.opciones.forEach((opcion, indice) => {
      comprobarCamposInternos(opcion, actividad.tipo === 'toque' ? ['id', 'texto', 'icono'] : ['id', 'texto'], `paso.actividad.opciones[${indice}]`);
      if (esObjeto(opcion)) opcion.texto = texto(opcion.texto);
    });
  }
  nuevo.recursos = normalizarRecursosVideo(nuevo.recursos, actividad?.tipo);
  if (Array.isArray(nuevo.recursos)) nuevo.recursos.forEach((recurso, indice) => {
    if (!esObjeto(recurso) || recurso.tipo === 'video') return;
    const permitidos = { icono: ['tipo', 'nombre', 'alt'], lista: ['tipo', 'elementos'], aviso: ['tipo', 'texto'] }[recurso.tipo];
    if (permitidos) comprobarCamposInternos(recurso, permitidos, `paso.recursos[${indice}]`);
    for (const campo of ['nombre', 'alt', 'texto']) if (Object.hasOwn(recurso, campo)) recurso[campo] = texto(recurso[campo]);
    if (Array.isArray(recurso.elementos)) recurso.elementos = recurso.elementos.map(texto);
  });
  exigirValidacion(validarPaso(nuevo));
  return nuevo;
}

function estructuraPaso(paso) {
  const copia = structuredClone({ instruccion: paso.instruccion, recursos: paso.recursos, actividad: paso.actividad });
  const anular = (objeto, campos) => {
    if (esObjeto(objeto)) for (const campo of campos) if (Object.hasOwn(objeto, campo)) objeto[campo] = null;
  };
  anular(copia, ['instruccion']);
  if (Array.isArray(copia.recursos)) for (const recurso of copia.recursos) {
    if (!esObjeto(recurso)) continue;
    if (recurso.tipo === 'icono') anular(recurso, ['alt']);
    if (recurso.tipo === 'aviso') anular(recurso, ['texto']);
    if (recurso.tipo === 'video') anular(recurso, ['titulo']);
    if (recurso.tipo === 'lista' && Array.isArray(recurso.elementos)) recurso.elementos = recurso.elementos.map(() => null);
  }
  anular(copia.actividad, ['pregunta', 'pista', 'mensajeAcierto']);
  anular(copia.actividad?.pantalla, ['titulo', 'subtitulo']);
  if (Array.isArray(copia.actividad?.opciones)) copia.actividad.opciones.forEach((opcion) => anular(opcion, ['texto']));
  return copia;
}

function errorOrden() {
  return new ErrorReglaCurso(400, 'Envía todos los identificadores una sola vez y sin elementos ajenos', 'orden_invalido');
}

function prepararOrden(datos, tipo) {
  const clave = MODELOS[tipo].lista;
  comprobarCuerpo(datos, [clave]);
  const ids = datos[clave];
  if (!Array.isArray(ids) || Array.from(ids).some((id) => !esId(id)) || new Set(ids).size !== ids.length) throw errorOrden();
  return [...ids];
}

async function resolverPadre(cliente, tipo, id) {
  if (tipo === 'curso') return { idCurso: id };
  const sql = tipo === 'leccion' ? `
    SELECT id_curso::text AS "idCurso", id_leccion::text AS "idLeccion"
    FROM lecciones WHERE id_leccion = $1::bigint
  ` : `
    SELECT l.id_curso::text AS "idCurso", p.id_leccion::text AS "idLeccion"
    FROM pasos p JOIN lecciones l ON l.id_leccion = p.id_leccion
    WHERE p.id_paso = $1::bigint
  `;
  const resultado = await cliente.query(sql, [id]);
  if (resultado.rows.length) return resultado.rows[0];
  if (tipo === 'leccion') {
    const historico = await cliente.query(`
      SELECT c.id_curso::text AS "idCurso" FROM cursos c
      WHERE c.estado_publicacion = 'retirado' AND EXISTS (
        SELECT 1 FROM historial_cursos_retirados h
        CROSS JOIN LATERAL jsonb_array_elements(h.lecciones) historica
        WHERE h.id_curso = c.id_curso AND historica->>'idLeccion' = $1::text
      ) LIMIT 1
    `, [id]);
    if (historico.rows.length) return historico.rows[0];
  }
  throw new ErrorReglaCurso(404, tipo === 'leccion' ? 'La lección no está disponible' : 'El paso no está disponible',
    tipo === 'leccion' ? 'leccion_no_encontrada' : 'paso_no_encontrado');
}

async function ejecutar(usuario, tipo, id, operacion) {
  comprobarEditor(usuario);
  comprobarId(id, tipo);
  const cliente = await pool.connect();
  let transaccion = false;
  let errorConexion;
  try {
    await cliente.query('BEGIN');
    transaccion = true;
    const perfiles = await cliente.query('SELECT uid, rol, activo FROM usuarios WHERE uid = $1 FOR SHARE', [usuario.uid]);
    const editor = perfiles.rows[0];
    comprobarEditor(editor);
    if (editor.uid !== usuario.uid) throw new TypeError('El perfil no corresponde al solicitante');
    const padre = await resolverPadre(cliente, tipo, id);
    const cursos = await cliente.query(`
      SELECT id_curso::text AS "idCurso", estado_publicacion, creado_por
      FROM cursos WHERE id_curso = $1::bigint FOR UPDATE
    `, [padre.idCurso]);
    const curso = cursos.rows[0];
    const esEditor = await tienePermisoEditor(cliente, editor, curso);
    validarEdicionCurso(editor, curso, { esEditor });
    const avances = await cliente.query(`
      SELECT EXISTS (SELECT 1 FROM progresos p
        JOIN lecciones l ON l.id_leccion = p.id_leccion
        WHERE l.id_curso = $1::bigint) AS "tieneAvance"
    `, [curso.idCurso]);
    const tieneAvance = avances.rows[0]?.tieneAvance;
    if (typeof tieneAvance !== 'boolean') throw new TypeError('El avance debe proceder de PostgreSQL');
    const contexto = { cliente, editor, curso, tieneAvance, esEditor };
    if (tipo !== 'curso') {
      const lecciones = await cliente.query(`
        SELECT id_leccion::text AS "idLeccion", titulo, objetivo,
          duracion_estimada_minutos AS "duracionEstimadaMinutos", orden
        FROM lecciones WHERE id_leccion = $1::bigint AND id_curso = $2::bigint FOR UPDATE
      `, [padre.idLeccion || id, curso.idCurso]);
      if (!lecciones.rows.length) throw new ErrorReglaCurso(404, 'La lección no está disponible', 'leccion_no_encontrada');
      contexto.leccion = lecciones.rows[0];
    }
    if (tipo === 'paso') {
      const pasos = await cliente.query(`
        SELECT id_paso::text AS "idPaso", orden, instruccion, recursos, actividad
        FROM pasos WHERE id_paso = $1::bigint AND id_leccion = $2::bigint FOR UPDATE
      `, [id, contexto.leccion.idLeccion]);
      if (!pasos.rows.length) throw new ErrorReglaCurso(404, 'El paso no está disponible', 'paso_no_encontrado');
      contexto.paso = pasos.rows[0];
    }
    const respuesta = await operacion(contexto);
    await cliente.query('SET CONSTRAINTS uq_lecciones_curso_orden, uq_pasos_leccion_orden IMMEDIATE');
    await cliente.query('COMMIT');
    transaccion = false;
    return respuesta;
  } catch (error) {
    if (transaccion) {
      try { await cliente.query('ROLLBACK'); } catch (fallo) {
        errorConexion = fallo;
        console.error('No fue posible revertir la escritura de contenido');
      }
    } else errorConexion = error;
    if (['23503', '23001'].includes(error.code)
      && ['fk_progresos_leccion', 'fk_progresos_paso_correcto'].includes(error.constraint)) {
      throw new ErrorReglaCurso(409, 'No se puede cambiar la estructura de un curso con avance registrado', 'curso_con_avance');
    }
    throw error;
  } finally {
    if (errorConexion) cliente.release(errorConexion);
    else cliente.release();
  }
}

function exigirEstructura(contexto) {
  validarCambioEstructural(contexto.editor, contexto.curso, {
    tieneAvance: contexto.tieneAvance, esEditor: contexto.esEditor
  });
}

const recursoPaso = (fila) => ({ idPaso: fila.idPaso, orden: fila.orden, instruccion: fila.instruccion, recursos: fila.recursos, actividad: fila.actividad });

async function leerPaso(cliente, id) {
  const { rows } = await cliente.query(`
    SELECT id_paso::text AS "idPaso", orden, instruccion, recursos, actividad
    FROM pasos WHERE id_paso = $1::bigint
  `, [id]);
  if (rows.length !== 1) throw new TypeError('El guardado no devolvió un paso único');
  return recursoPaso(rows[0]);
}

async function leerLeccion(cliente, id) {
  const { rows } = await cliente.query(`
    SELECT id_leccion::text AS "idLeccion", titulo, objetivo,
      duracion_estimada_minutos AS "duracionEstimadaMinutos", orden
    FROM lecciones WHERE id_leccion = $1::bigint
  `, [id]);
  if (rows.length !== 1) throw new TypeError('El guardado no devolvió una lección única');
  const { rows: pasos } = await cliente.query(`
    SELECT id_paso::text AS "idPaso", orden, instruccion, recursos, actividad
    FROM pasos WHERE id_leccion = $1::bigint ORDER BY orden, id_paso
  `, [id]);
  const fila = rows[0];
  return { idLeccion: fila.idLeccion, titulo: fila.titulo, objetivo: fila.objetivo,
    duracionEstimadaMinutos: fila.duracionEstimadaMinutos, orden: fila.orden, pasos: pasos.map(recursoPaso) };
}

async function posicionNueva(cliente, tipo, padre) {
  const modelo = MODELOS[tipo];
  const { rows: [fila] } = await cliente.query(`
    SELECT count(*)::integer AS total, COALESCE(max(orden), 0)::integer AS ultimo
    FROM ${modelo.tabla} WHERE ${modelo.padre} = $1::bigint
  `, [padre]);
  if (!fila || !Number.isInteger(fila.total) || !Number.isInteger(fila.ultimo)
    || fila.total < 0 || fila.ultimo < 0 || fila.ultimo >= 2147483647) throw new TypeError('Conteo de contenido inválido');
  if (fila.total >= modelo.maximo) {
    throw new ErrorReglaCurso(409, `Se alcanzó el máximo de ${modelo.maximo} elementos permitidos`, modelo.limite);
  }
  if (tipo === 'paso' && fila.total !== fila.ultimo) throw new TypeError('Reordena los pasos antes de agregar contenido a una secuencia inconsistente');
  return fila.ultimo + 1;
}

function idGuardado(resultado, clave) {
  if (resultado.rows.length !== 1 || !esId(resultado.rows[0][clave])) throw new TypeError('El guardado debe devolver un identificador único');
  return resultado.rows[0][clave];
}

async function crearLeccion(usuario, idCurso, datos) {
  comprobarEditor(usuario);
  comprobarCuerpo(datos, ['titulo', 'objetivo', 'duracionEstimadaMinutos']);
  return ejecutar(usuario, 'curso', idCurso, async (ctx) => {
    exigirEstructura(ctx);
    const orden = await posicionNueva(ctx.cliente, 'leccion', idCurso);
    const meta = { orden, titulo: texto(datos.titulo), objetivo: texto(datos.objetivo), duracionEstimadaMinutos: datos.duracionEstimadaMinutos, pasos: [] };
    exigirValidacion(validarLeccion(meta, { publicable: false }));
    const resultado = await ctx.cliente.query(`
      INSERT INTO lecciones (id_curso, titulo, objetivo, duracion_estimada_minutos, estado_publicacion, creado_por, orden)
      VALUES ($1::bigint, $2, $3, $4, $5, $6, $7) RETURNING id_leccion::text AS "idLeccion"
    `, [idCurso, meta.titulo, meta.objetivo, meta.duracionEstimadaMinutos, ctx.curso.estado_publicacion, ctx.editor.uid, orden]);
    return leerLeccion(ctx.cliente, idGuardado(resultado, 'idLeccion'));
  });
}

async function editarLeccion(usuario, idLeccion, datos) {
  comprobarEditor(usuario);
  comprobarCuerpo(datos, ['titulo', 'objetivo', 'duracionEstimadaMinutos'], true);
  return ejecutar(usuario, 'leccion', idLeccion, async (ctx) => {
    const actual = ctx.leccion;
    const meta = {
      titulo: Object.hasOwn(datos, 'titulo') ? texto(datos.titulo) : actual.titulo,
      objetivo: Object.hasOwn(datos, 'objetivo') ? texto(datos.objetivo) : actual.objetivo,
      duracionEstimadaMinutos: Object.hasOwn(datos, 'duracionEstimadaMinutos') ? datos.duracionEstimadaMinutos : actual.duracionEstimadaMinutos
    };
    exigirValidacion(validarLeccion({ ...meta, orden: actual.orden, pasos: [] }, { publicable: false }));
    if (meta.duracionEstimadaMinutos !== actual.duracionEstimadaMinutos) exigirEstructura(ctx);
    if (!isDeepStrictEqual(meta, { titulo: actual.titulo, objetivo: actual.objetivo, duracionEstimadaMinutos: actual.duracionEstimadaMinutos })) {
      const resultado = await ctx.cliente.query(`
        UPDATE lecciones SET titulo = $1, objetivo = $2, duracion_estimada_minutos = $3
        WHERE id_leccion = $4::bigint AND id_curso = $5::bigint RETURNING id_leccion::text AS "idLeccion"
      `, [meta.titulo, meta.objetivo, meta.duracionEstimadaMinutos, idLeccion, ctx.curso.idCurso]);
      idGuardado(resultado, 'idLeccion');
    }
    return leerLeccion(ctx.cliente, idLeccion);
  });
}

async function crearPaso(usuario, idLeccion, datos) {
  comprobarEditor(usuario);
  comprobarCuerpo(datos, ['instruccion', 'recursos', 'actividad']);
  return ejecutar(usuario, 'leccion', idLeccion, async (ctx) => {
    exigirEstructura(ctx);
    const orden = await posicionNueva(ctx.cliente, 'paso', idLeccion);
    const nuevo = prepararPaso({ ...datos, orden });
    const resultado = await ctx.cliente.query(`
      INSERT INTO pasos (id_leccion, orden, instruccion, recursos, actividad)
      VALUES ($1::bigint, $2, $3, $4::jsonb, $5::jsonb) RETURNING id_paso::text AS "idPaso"
    `, [idLeccion, orden, nuevo.instruccion, JSON.stringify(nuevo.recursos), JSON.stringify(nuevo.actividad)]);
    return leerPaso(ctx.cliente, idGuardado(resultado, 'idPaso'));
  });
}

async function editarPaso(usuario, idPaso, datos) {
  comprobarEditor(usuario);
  comprobarCuerpo(datos, ['instruccion', 'recursos', 'actividad'], true);
  return ejecutar(usuario, 'paso', idPaso, async (ctx) => {
    const actual = ctx.paso;
    const nuevo = prepararPaso({
      orden: actual.orden,
      instruccion: Object.hasOwn(datos, 'instruccion') ? datos.instruccion : actual.instruccion,
      recursos: Object.hasOwn(datos, 'recursos') ? datos.recursos : actual.recursos,
      actividad: Object.hasOwn(datos, 'actividad') ? datos.actividad : actual.actividad
    });
    if (!isDeepStrictEqual(estructuraPaso(actual), estructuraPaso(nuevo))) exigirEstructura(ctx);
    if (!isDeepStrictEqual({ instruccion: actual.instruccion, recursos: actual.recursos, actividad: actual.actividad },
      { instruccion: nuevo.instruccion, recursos: nuevo.recursos, actividad: nuevo.actividad })) {
      const resultado = await ctx.cliente.query(`
        UPDATE pasos SET instruccion = $1, recursos = $2::jsonb, actividad = $3::jsonb
        WHERE id_paso = $4::bigint AND id_leccion = $5::bigint RETURNING id_paso::text AS "idPaso"
      `, [nuevo.instruccion, JSON.stringify(nuevo.recursos), JSON.stringify(nuevo.actividad), idPaso, ctx.leccion.idLeccion]);
      idGuardado(resultado, 'idPaso');
    }
    return leerPaso(ctx.cliente, idPaso);
  });
}

async function renumerar(cliente, tipo, padre) {
  const m = MODELOS[tipo];
  await cliente.query(`
    UPDATE ${m.tabla} AS elemento SET orden = nueva.posicion::integer
    FROM (SELECT ${m.id}, row_number() OVER (ORDER BY orden, ${m.id}) AS posicion
      FROM ${m.tabla} WHERE ${m.padre} = $1::bigint) nueva
    WHERE elemento.${m.id} = nueva.${m.id} AND elemento.orden <> nueva.posicion::integer
  `, [padre]);
}

async function eliminarLeccion(usuario, idLeccion) {
  comprobarEditor(usuario);
  return ejecutar(usuario, 'leccion', idLeccion, async (ctx) => {
    exigirEstructura(ctx);
    await ctx.cliente.query('DELETE FROM pasos WHERE id_leccion = $1::bigint', [idLeccion]);
    const resultado = await ctx.cliente.query(`
      DELETE FROM lecciones WHERE id_leccion = $1::bigint AND id_curso = $2::bigint
      RETURNING id_leccion::text AS "idLeccion"
    `, [idLeccion, ctx.curso.idCurso]);
    idGuardado(resultado, 'idLeccion');
    await renumerar(ctx.cliente, 'leccion', ctx.curso.idCurso);
  });
}

async function eliminarPaso(usuario, idPaso) {
  comprobarEditor(usuario);
  return ejecutar(usuario, 'paso', idPaso, async (ctx) => {
    exigirEstructura(ctx);
    const resultado = await ctx.cliente.query(`
      DELETE FROM pasos WHERE id_paso = $1::bigint AND id_leccion = $2::bigint
      RETURNING id_paso::text AS "idPaso"
    `, [idPaso, ctx.leccion.idLeccion]);
    idGuardado(resultado, 'idPaso');
    await renumerar(ctx.cliente, 'paso', ctx.leccion.idLeccion);
  });
}

async function aplicarOrden(ctx, tipo, padre, ids) {
  exigirEstructura(ctx);
  const m = MODELOS[tipo];
  const { rows } = await ctx.cliente.query(`
    SELECT ${m.id}::text AS id FROM ${m.tabla}
    WHERE ${m.padre} = $1::bigint ORDER BY orden, ${m.id} FOR UPDATE
  `, [padre]);
  const actuales = new Set(rows.map((fila) => fila.id));
  if (actuales.size !== ids.length || ids.some((id) => !actuales.has(id))) throw errorOrden();
  await ctx.cliente.query(`
    UPDATE ${m.tabla} AS elemento SET orden = nueva.posicion::integer
    FROM unnest($1::bigint[]) WITH ORDINALITY AS nueva(id, posicion)
    WHERE elemento.${m.id} = nueva.id AND elemento.${m.padre} = $2::bigint
      AND elemento.orden <> nueva.posicion::integer
  `, [ids, padre]);
  const resultado = await ctx.cliente.query(`
    SELECT ${m.id}::text AS "${m.clave}", orden FROM ${m.tabla}
    WHERE ${m.padre} = $1::bigint ORDER BY orden, ${m.id}
  `, [padre]);
  return resultado.rows.map((fila) => ({ [m.clave]: fila[m.clave], orden: fila.orden }));
}

async function reordenarLecciones(usuario, idCurso, datos) {
  comprobarEditor(usuario);
  const ids = prepararOrden(datos, 'leccion');
  return ejecutar(usuario, 'curso', idCurso, (ctx) => aplicarOrden(ctx, 'leccion', idCurso, ids));
}

async function reordenarPasos(usuario, idLeccion, datos) {
  comprobarEditor(usuario);
  const ids = prepararOrden(datos, 'paso');
  return ejecutar(usuario, 'leccion', idLeccion, (ctx) => aplicarOrden(ctx, 'paso', idLeccion, ids));
}

module.exports = { crearLeccion, editarLeccion, eliminarLeccion, reordenarLecciones,
  crearPaso, editarPaso, eliminarPaso, reordenarPasos };
