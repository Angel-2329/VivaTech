const pool = require('../config/database');
const { ErrorReglaCurso } = require('./reglas-cursos');

const COLUMNAS = 'id_categoria::text AS "idCategoria", nombre, orden';
const MAXIMO_ID = '9223372036854775807';

function comprobarAdministrador(usuario) {
  if (!usuario) {
    throw new ErrorReglaCurso(404, 'El perfil todavía no está registrado', 'perfil_no_registrado');
  }
  if (usuario.activo !== true) {
    throw new ErrorReglaCurso(403, 'La cuenta está desactivada', 'cuenta_desactivada');
  }
  if (usuario.rol !== 'administrador' || typeof usuario.uid !== 'string'
    || !usuario.uid.trim() || usuario.uid.length > 128) {
    throw new ErrorReglaCurso(403, 'No tienes permisos para realizar esta acción', 'rol_no_autorizado');
  }
}

function esId(valor) {
  return typeof valor === 'string' && /^[1-9][0-9]{0,18}$/.test(valor)
    && (valor.length < MAXIMO_ID.length || valor <= MAXIMO_ID);
}

function comprobarId(idCategoria) {
  if (!esId(idCategoria)) {
    throw new ErrorReglaCurso(400, 'El identificador de la categoría no es válido', 'id_categoria_invalido');
  }
}

function validarNombre(valor) {
  let codigo;
  if (typeof valor !== 'string') codigo = 'texto_requerido';
  else if (Array.from(valor.trim()).length < 1 || Array.from(valor.trim()).length > 60) codigo = 'longitud_invalida';
  if (codigo) {
    const error = new ErrorReglaCurso(400, 'Revisa el nombre de la categoría', 'contenido_invalido');
    error.errores = [{
      ruta: 'categoria.nombre', codigo,
      mensaje: codigo === 'texto_requerido'
        ? 'Debe ser una cadena de texto'
        : 'El nombre debe tener entre 1 y 60 caracteres'
    }];
    throw error;
  }
  return valor.trim();
}

function errorOrden() {
  return new ErrorReglaCurso(400, 'Envía la lista completa de categorías, sin repeticiones ni identificadores ajenos', 'orden_invalido');
}

function validarOrden(idsCategorias) {
  if (!Array.isArray(idsCategorias) || idsCategorias.length > 2147483647
    || idsCategorias.some((id) => !esId(id))
    || new Set(idsCategorias).size !== idsCategorias.length) {
    throw errorOrden();
  }
}

function recurso(fila) {
  if (!fila || !esId(fila.idCategoria) || typeof fila.nombre !== 'string'
    || !Number.isInteger(fila.orden) || fila.orden < 1) {
    throw new TypeError('La operación debe devolver una categoría válida');
  }
  return { idCategoria: fila.idCategoria, nombre: fila.nombre, orden: fila.orden };
}

function traducirError(error) {
  if (error.code === '23505' && error.constraint === 'uq_categorias_nombre') {
    return new ErrorReglaCurso(409, 'Ya existe una categoría con ese nombre', 'categoria_duplicada');
  }
  if (['23503', '23001'].includes(error.code) && error.constraint === 'fk_cursos_categoria') {
    return new ErrorReglaCurso(409, 'No puedes eliminar una categoría que contiene cursos', 'categoria_con_cursos');
  }
  return error;
}

async function ejecutarOperacion(usuario, operacion) {
  comprobarAdministrador(usuario);
  const cliente = await pool.connect();
  let transaccion = false;
  let errorConexion;
  try {
    await cliente.query('BEGIN');
    transaccion = true;
    const perfiles = await cliente.query(
      'SELECT uid, rol, activo FROM usuarios WHERE uid = $1 FOR SHARE', [usuario.uid]
    );
    const administrador = perfiles.rows[0];
    comprobarAdministrador(administrador);
    if (administrador.uid !== usuario.uid) throw new TypeError('El perfil consultado no corresponde al solicitante');

    await cliente.query('LOCK TABLE categorias IN SHARE ROW EXCLUSIVE MODE');
    const respuesta = await operacion(cliente, administrador);
    await cliente.query('SET CONSTRAINTS uq_categorias_orden IMMEDIATE');
    await cliente.query('COMMIT');
    transaccion = false;
    return respuesta;
  } catch (error) {
    if (transaccion) {
      try {
        await cliente.query('ROLLBACK');
      } catch (falloRollback) {
        errorConexion = falloRollback;
        console.error('No fue posible revertir la operación de categorías');
      }
    } else errorConexion = error;
    throw traducirError(error);
  } finally {
    if (errorConexion) cliente.release(errorConexion);
    else cliente.release();
  }
}

async function bloquearCategoria(cliente, idCategoria) {
  const resultado = await cliente.query(
    `SELECT ${COLUMNAS} FROM categorias WHERE id_categoria = $1::bigint FOR UPDATE`, [idCategoria]
  );
  if (resultado.rows.length === 0) {
    throw new ErrorReglaCurso(404, 'La categoría no está disponible', 'categoria_no_encontrada');
  }
  return recurso(resultado.rows[0]);
}

async function crearCategoria(usuario, nombre) {
  comprobarAdministrador(usuario);
  const limpio = validarNombre(nombre);
  return ejecutarOperacion(usuario, async (cliente, administrador) => {
    const resultado = await cliente.query('SELECT COALESCE(max(orden), 0)::integer AS "ultimoOrden" FROM categorias');
    const ultimo = resultado.rows[0]?.ultimoOrden;
    if (!Number.isInteger(ultimo) || ultimo < 0 || ultimo >= 2147483647) {
      throw new TypeError('No se puede asignar una posición válida a la categoría');
    }
    const creado = await cliente.query(`
      INSERT INTO categorias (nombre, creado_por, orden)
      VALUES ($1, $2, $3) RETURNING ${COLUMNAS}
    `, [limpio, administrador.uid, ultimo + 1]);
    if (creado.rows.length !== 1) throw new TypeError('La creación debe devolver una categoría única');
    return recurso(creado.rows[0]);
  });
}

async function renombrarCategoria(usuario, idCategoria, nombre) {
  comprobarAdministrador(usuario);
  comprobarId(idCategoria);
  const limpio = validarNombre(nombre);
  return ejecutarOperacion(usuario, async (cliente) => {
    const actual = await bloquearCategoria(cliente, idCategoria);
    if (actual.nombre === limpio) return actual;
    const resultado = await cliente.query(`
      UPDATE categorias SET nombre = $1 WHERE id_categoria = $2::bigint
      RETURNING ${COLUMNAS}
    `, [limpio, idCategoria]);
    if (resultado.rows.length !== 1) throw new TypeError('La actualización debe devolver una categoría única');
    return recurso(resultado.rows[0]);
  });
}

async function reordenarCategorias(usuario, idsCategorias) {
  comprobarAdministrador(usuario);
  validarOrden(idsCategorias);
  return ejecutarOperacion(usuario, async (cliente) => {
    const actual = await cliente.query(`SELECT ${COLUMNAS} FROM categorias ORDER BY orden, id_categoria FOR UPDATE`);
    const idsActuales = new Set(actual.rows.map((fila) => recurso(fila).idCategoria));
    if (idsActuales.size !== idsCategorias.length || idsCategorias.some((id) => !idsActuales.has(id))) throw errorOrden();
    await cliente.query(`
      UPDATE categorias AS c SET orden = nueva.posicion::integer
      FROM unnest($1::bigint[]) WITH ORDINALITY AS nueva(id, posicion)
      WHERE c.id_categoria = nueva.id AND c.orden <> nueva.posicion::integer
    `, [idsCategorias]);
    const resultado = await cliente.query(`SELECT ${COLUMNAS} FROM categorias ORDER BY orden, id_categoria`);
    return resultado.rows.map((fila) => {
      const categoria = recurso(fila);
      return { idCategoria: categoria.idCategoria, orden: categoria.orden };
    });
  });
}

async function eliminarCategoria(usuario, idCategoria) {
  comprobarAdministrador(usuario);
  comprobarId(idCategoria);
  return ejecutarOperacion(usuario, async (cliente) => {
    const categoria = await bloquearCategoria(cliente, idCategoria);
    const resultado = await cliente.query(
      'SELECT EXISTS (SELECT 1 FROM cursos WHERE id_categoria = $1::bigint) AS "tieneCursos"', [idCategoria]
    );
    const tieneCursos = resultado.rows[0]?.tieneCursos;
    if (typeof tieneCursos !== 'boolean') throw new TypeError('La consulta debe indicar si la categoría tiene cursos');
    if (tieneCursos) {
      throw new ErrorReglaCurso(409, 'No puedes eliminar una categoría que contiene cursos', 'categoria_con_cursos');
    }
    const eliminado = await cliente.query(
      'DELETE FROM categorias WHERE id_categoria = $1::bigint RETURNING id_categoria::text AS "idCategoria"', [idCategoria]
    );
    if (eliminado.rows.length !== 1) throw new TypeError('La eliminación debe afectar una categoría única');
    await cliente.query('UPDATE categorias SET orden = orden - 1 WHERE orden > $1', [categoria.orden]);
  });
}

module.exports = { crearCategoria, renombrarCategoria, reordenarCategorias, eliminarCategoria };
