const pool = require('../config/database');
const { ErrorReglaCurso } = require('./reglas-cursos');

const MAXIMO_ID = '9223372036854775807';

const CONSULTA_EDITORES = `
  SELECT ce.uid_maestro AS uid,
    maestro.nombre_completo AS "nombreCompleto",
    (maestro.rol = 'maestro' AND maestro.activo) AS activo,
    otorgante.nombre_completo AS "otorgadoPor",
    to_jsonb(ce.fecha_otorgamiento) AS "fechaOtorgamiento"
  FROM curso_editores ce
  JOIN usuarios maestro ON maestro.uid = ce.uid_maestro
  JOIN usuarios otorgante ON otorgante.uid = ce.otorgado_por
  WHERE ce.id_curso = $1::bigint
`;

function comprobarIdCurso(idCurso) {
  if (typeof idCurso !== 'string' || !/^[1-9][0-9]{0,18}$/.test(idCurso)
    || (idCurso.length === MAXIMO_ID.length && idCurso > MAXIMO_ID)) {
    throw new ErrorReglaCurso(400, 'El identificador del curso no es válido', 'id_curso_invalido');
  }
}

function comprobarUid(uid) {
  if (typeof uid !== 'string' || !uid.trim() || uid.length > 128) {
    throw new ErrorReglaCurso(400, 'Indica la cuenta del maestro', 'seleccion_invalida');
  }
}

function comprobarAdministrador(usuario) {
  if (!usuario) throw new ErrorReglaCurso(404, 'El perfil todavía no está registrado', 'perfil_no_registrado');
  if (usuario.activo !== true) throw new ErrorReglaCurso(403, 'La cuenta está desactivada', 'cuenta_desactivada');
  if (usuario.rol !== 'administrador' || typeof usuario.uid !== 'string' || !usuario.uid.trim()) {
    throw new ErrorReglaCurso(403, 'No tienes permisos para realizar esta acción', 'rol_no_autorizado');
  }
}

function datosEditor(fila) {
  if (typeof fila.uid !== 'string' || typeof fila.nombreCompleto !== 'string'
    || typeof fila.activo !== 'boolean' || typeof fila.otorgadoPor !== 'string'
    || typeof fila.fechaOtorgamiento !== 'string') {
    throw new TypeError('La consulta de permisos devolvió un registro inconsistente');
  }
  return {
    uid: fila.uid,
    nombreCompleto: fila.nombreCompleto,
    activo: fila.activo,
    otorgadoPor: fila.otorgadoPor,
    fechaOtorgamiento: fila.fechaOtorgamiento
  };
}

async function ejecutar(usuario, idCurso, operacion) {
  comprobarAdministrador(usuario);
  comprobarIdCurso(idCurso);
  const cliente = await pool.connect();
  let transaccion = false;
  let errorConexion;
  try {
    await cliente.query('BEGIN');
    transaccion = true;
    const { rows: perfiles } = await cliente.query(
      'SELECT uid, rol, activo FROM usuarios WHERE uid = $1 FOR SHARE', [usuario.uid]);
    const administrador = perfiles[0];
    comprobarAdministrador(administrador);
    if (administrador.uid !== usuario.uid) throw new TypeError('El perfil no corresponde al solicitante');
    const { rows: cursos } = await cliente.query(`
      SELECT id_curso::text AS "idCurso", estado_publicacion, creado_por
      FROM cursos WHERE id_curso = $1::bigint FOR SHARE
    `, [idCurso]);
    if (cursos.length === 0) throw new ErrorReglaCurso(404, 'El curso no está disponible', 'curso_no_encontrado');
    if (cursos.length > 1 || cursos[0].idCurso !== idCurso) {
      throw new TypeError('El curso no corresponde al identificador solicitado');
    }
    const respuesta = await operacion(cliente, administrador, cursos[0]);
    await cliente.query('COMMIT');
    transaccion = false;
    return respuesta;
  } catch (error) {
    if (transaccion) {
      try { await cliente.query('ROLLBACK'); } catch (fallo) {
        errorConexion = fallo;
        console.error('No fue posible revertir la operación de permisos del curso');
      }
    } else errorConexion = error;
    throw error;
  } finally {
    if (errorConexion) cliente.release(errorConexion);
    else cliente.release();
  }
}

async function listarEditores(usuario, idCurso) {
  return ejecutar(usuario, idCurso, async (cliente) => {
    const { rows } = await cliente.query(`${CONSULTA_EDITORES}
      ORDER BY lower(maestro.nombre_completo), ce.uid_maestro
    `, [idCurso]);
    return rows.map(datosEditor);
  });
}

async function otorgarPermiso(usuario, idCurso, datos) {
  comprobarAdministrador(usuario);
  comprobarIdCurso(idCurso);
  if (datos === null || typeof datos !== 'object' || Array.isArray(datos)) {
    throw new ErrorReglaCurso(400, 'Envía los datos como un objeto JSON', 'cuerpo_invalido');
  }
  if (Object.keys(datos).some((clave) => clave !== 'uid')) {
    throw new ErrorReglaCurso(400, 'Envía únicamente los campos permitidos para esta operación', 'campos_invalidos');
  }
  comprobarUid(datos.uid);
  const uid = datos.uid;
  return ejecutar(usuario, idCurso, async (cliente, administrador, curso) => {
    if (curso.estado_publicacion === 'retirado') {
      throw new ErrorReglaCurso(409, 'Un curso retirado no admite permisos nuevos', 'curso_retirado');
    }
    const { rows: maestros } = await cliente.query(
      'SELECT uid, rol, activo FROM usuarios WHERE uid = $1 FOR SHARE', [uid]);
    const maestro = maestros[0];
    if (!maestro) throw new ErrorReglaCurso(404, 'La cuenta no existe', 'usuario_no_encontrado');
    if (maestro.uid === curso.creado_por) {
      throw new ErrorReglaCurso(409, 'Esta cuenta es la autora del curso', 'es_autor');
    }
    if (maestro.rol !== 'maestro' || maestro.activo !== true) {
      throw new ErrorReglaCurso(409, 'Solo se puede dar permiso a un maestro activo', 'usuario_no_maestro');
    }
    const insercion = await cliente.query(`
      INSERT INTO curso_editores (id_curso, uid_maestro, otorgado_por)
      VALUES ($1::bigint, $2, $3)
      ON CONFLICT (id_curso, uid_maestro) DO NOTHING
    `, [idCurso, uid, administrador.uid]);
    if (![0, 1].includes(insercion.rowCount)) throw new TypeError('La inserción del permiso afectó registros inesperados');
    const { rows } = await cliente.query(`${CONSULTA_EDITORES}
      AND ce.uid_maestro = $2
    `, [idCurso, uid]);
    if (rows.length !== 1) throw new TypeError('El permiso guardado debe ser único');
    return { creado: insercion.rowCount === 1, editor: datosEditor(rows[0]) };
  });
}

async function quitarPermiso(usuario, idCurso, uid) {
  comprobarAdministrador(usuario);
  comprobarIdCurso(idCurso);
  comprobarUid(uid);
  return ejecutar(usuario, idCurso, async (cliente) => {
    const resultado = await cliente.query(`
      DELETE FROM curso_editores
      WHERE id_curso = $1::bigint AND uid_maestro = $2
    `, [idCurso, uid]);
    if (![0, 1].includes(resultado.rowCount)) throw new TypeError('El retiro del permiso afectó registros inesperados');
    return null;
  });
}

module.exports = { listarEditores, otorgarPermiso, quitarPermiso };
