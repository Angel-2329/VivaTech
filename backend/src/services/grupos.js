const pool = require('../config/database');

class ErrorOperacionGrupo extends Error {
  constructor(estado, mensaje, codigo) {
    super(mensaje);
    this.name = 'ErrorOperacionGrupo';
    this.estado = estado;
    this.codigo = codigo;
  }
}

const CONSULTA_GRUPOS = `
  SELECT
    g.id_grupo::text AS "idGrupo",
    g.nombre,
    (
      SELECT count(*)::integer
      FROM grupo_estudiantes ge
      WHERE ge.id_grupo = g.id_grupo
    ) AS "totalEstudiantes",
    COALESCE(
      (
        SELECT json_agg(
          json_build_object(
            'uid', u.uid,
            'nombreCompleto', u.nombre_completo
          )
          ORDER BY lower(u.nombre_completo), u.uid
        )
        FROM grupo_maestros gm
        JOIN usuarios u ON u.uid = gm.uid_maestro
        WHERE gm.id_grupo = g.id_grupo
      ),
      '[]'::json
    ) AS maestros
  FROM grupos g
`;

async function ejecutarOperacion(uid, operacion) {
  const cliente = await pool.connect();
  let transaccionActiva = false;
  let errorAlRevertir;

  try {
    await cliente.query('BEGIN');
    transaccionActiva = true;

    const resultado = await cliente.query(
      `
        SELECT uid, rol, activo
        FROM usuarios
        WHERE uid = $1
        FOR SHARE
      `,
      [uid]
    );

    const usuario = resultado.rows[0];

    if (!usuario) {
      throw new ErrorOperacionGrupo(
        404,
        'El perfil todavía no está registrado',
        'perfil_no_registrado'
      );
    }

    if (!usuario.activo) {
      throw new ErrorOperacionGrupo(
        403,
        'La cuenta está desactivada',
        'cuenta_desactivada'
      );
    }

    if (!['maestro', 'administrador'].includes(usuario.rol)) {
      throw new ErrorOperacionGrupo(
        403,
        'No tienes permisos para realizar esta acción',
        'rol_no_autorizado'
      );
    }

    const respuesta = await operacion(cliente, usuario);

    await cliente.query('COMMIT');
    transaccionActiva = false;

    return respuesta;
  } catch (error) {
    if (transaccionActiva) {
      try {
        await cliente.query('ROLLBACK');
      } catch (errorRollback) {
        errorAlRevertir = errorRollback;
        console.error('No fue posible confirmar la reversión de la operación de grupos');
      }
    }

    throw error;
  } finally {
    cliente.release(errorAlRevertir);
  }
}

async function bloquearGrupoDisponible(cliente, usuario, idGrupo) {
  const resultado = await cliente.query(
    `
      SELECT id_grupo
      FROM grupos
      WHERE id_grupo = $1
      FOR UPDATE
    `,
    [idGrupo]
  );

  let disponible = resultado.rowCount === 1;

  if (disponible && usuario.rol === 'maestro') {
    const asignacion = await cliente.query(
      `
        SELECT id_grupo
        FROM grupo_maestros
        WHERE id_grupo = $1 AND uid_maestro = $2
        FOR SHARE
      `,
      [idGrupo, usuario.uid]
    );

    disponible = asignacion.rowCount === 1;
  }

  if (!disponible) {
    throw new ErrorOperacionGrupo(
      404,
      'El grupo no está disponible',
      'grupo_no_encontrado'
    );
  }
}

async function consultarGrupo(cliente, idGrupo) {
  const resultado = await cliente.query(
    `${CONSULTA_GRUPOS} WHERE g.id_grupo = $1`,
    [idGrupo]
  );

  return resultado.rows[0];
}

async function listarGrupos(uid) {
  return ejecutarOperacion(uid, async (cliente, usuario) => {
    const resultado = await cliente.query(
      `
        ${CONSULTA_GRUPOS}
        WHERE $1::text = 'administrador'
          OR EXISTS (
            SELECT 1
            FROM grupo_maestros asignacion
            WHERE asignacion.id_grupo = g.id_grupo
              AND asignacion.uid_maestro = $2
          )
        ORDER BY lower(g.nombre), g.id_grupo
      `,
      [usuario.rol, usuario.uid]
    );

    return resultado.rows;
  });
}

async function crearGrupo(uid, nombre) {
  return ejecutarOperacion(uid, async (cliente, usuario) => {
    const resultado = await cliente.query(
      `
        INSERT INTO grupos (nombre, creado_por)
        VALUES ($1, $2)
        RETURNING id_grupo::text AS "idGrupo"
      `,
      [nombre, usuario.uid]
    );

    const { idGrupo } = resultado.rows[0];

    if (usuario.rol === 'maestro') {
      await cliente.query(
        `
          INSERT INTO grupo_maestros (id_grupo, uid_maestro, asignado_por)
          VALUES ($1, $2, $2)
        `,
        [idGrupo, usuario.uid]
      );
    }

    return consultarGrupo(cliente, idGrupo);
  });
}

async function renombrarGrupo(uid, idGrupo, nombre) {
  return ejecutarOperacion(uid, async (cliente, usuario) => {
    await bloquearGrupoDisponible(cliente, usuario, idGrupo);

    await cliente.query(
      'UPDATE grupos SET nombre = $1 WHERE id_grupo = $2',
      [nombre, idGrupo]
    );

    return consultarGrupo(cliente, idGrupo);
  });
}

async function eliminarGrupo(uid, idGrupo) {
  return ejecutarOperacion(uid, async (cliente, usuario) => {
    await bloquearGrupoDisponible(cliente, usuario, idGrupo);

    const estudiantes = await cliente.query(
      `
        SELECT EXISTS (
          SELECT 1 FROM grupo_estudiantes WHERE id_grupo = $1
        ) AS "tieneEstudiantes"
      `,
      [idGrupo]
    );

    if (estudiantes.rows[0].tieneEstudiantes) {
      throw new ErrorOperacionGrupo(
        409,
        'Retira a todos los estudiantes antes de eliminar el grupo',
        'grupo_con_participantes'
      );
    }

    await cliente.query(
      'DELETE FROM grupo_maestros WHERE id_grupo = $1',
      [idGrupo]
    );

    await cliente.query('DELETE FROM grupos WHERE id_grupo = $1', [idGrupo]);
  });
}

module.exports = {
  ErrorOperacionGrupo,
  listarGrupos,
  crearGrupo,
  renombrarGrupo,
  eliminarGrupo
};
