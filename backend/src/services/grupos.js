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

const CONSULTA_ESTUDIANTES_GRUPO = `
  SELECT
    u.uid,
    u.nombre_completo AS "nombreCompleto",
    u.nombre_apodo AS apodo,
    u.activo,
    avance."leccionesCompletadas",
    avance."ultimaActividad"
  FROM grupo_estudiantes ge
  JOIN usuarios u ON u.uid = ge.uid_estudiante
  LEFT JOIN LATERAL (
    SELECT
      (count(*) FILTER (WHERE p.estado = 'completada'))::integer
        AS "leccionesCompletadas",
      max(p.fecha_actualizacion) AS "ultimaActividad"
    FROM progresos p
    JOIN lecciones l ON l.id_leccion = p.id_leccion
    JOIN cursos c ON c.id_curso = l.id_curso
    WHERE p.uid_estudiante = u.uid
      AND l.estado_publicacion = 'publicado'
      AND c.estado_publicacion = 'publicado'
  ) avance ON true
  WHERE ge.id_grupo = $1
`;

function validarSolicitante(usuario) {
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
}

async function comprobarAccesoPrevio(cliente, uid, idGrupo) {
  const solicitante = await cliente.query(
    'SELECT uid, rol, activo FROM usuarios WHERE uid = $1',
    [uid]
  );

  const usuario = solicitante.rows[0];
  validarSolicitante(usuario);

  const grupo = await cliente.query(
    `
      SELECT g.id_grupo
      FROM grupos g
      WHERE g.id_grupo = $1
        AND (
          $2::text = 'administrador'
          OR EXISTS (
            SELECT 1
            FROM grupo_maestros gm
            WHERE gm.id_grupo = g.id_grupo AND gm.uid_maestro = $3
          )
        )
    `,
    [idGrupo, usuario.rol, usuario.uid]
  );

  if (grupo.rowCount !== 1) {
    throw new ErrorOperacionGrupo(
      404,
      'El grupo no está disponible',
      'grupo_no_encontrado'
    );
  }
}

async function ejecutarOperacion(uid, operacion, opciones = {}) {
  const cliente = await pool.connect();
  let transaccionActiva = false;
  let errorAlRevertir;

  try {
    await cliente.query('BEGIN');
    transaccionActiva = true;

    let resultado;

    if (opciones.uidDestino !== undefined) {
      await comprobarAccesoPrevio(cliente, uid, opciones.idGrupo);

      resultado = await cliente.query(
        `
          SELECT uid, rol, activo
          FROM usuarios
          WHERE uid IN ($1, $2)
          ORDER BY uid
          FOR UPDATE
        `,
        [uid, opciones.uidDestino]
      );
    } else {
      resultado = await cliente.query(
        `
          SELECT uid, rol, activo
          FROM usuarios
          WHERE uid = $1
          FOR SHARE
        `,
        [uid]
      );
    }

    const usuario = resultado.rows.find((fila) => fila.uid === uid);
    validarSolicitante(usuario);

    const destinatario = resultado.rows.find(
      (fila) => fila.uid === opciones.uidDestino
    );

    const respuesta = await operacion(cliente, usuario, destinatario);

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

async function obtenerDetalleGrupo(uid, idGrupo) {
  return ejecutarOperacion(uid, async (cliente, usuario) => {
    await bloquearGrupoDisponible(cliente, usuario, idGrupo);

    const resultado = await cliente.query(
      `
        WITH estudiantes AS (
          ${CONSULTA_ESTUDIANTES_GRUPO}
        )
        SELECT
          base."idGrupo",
          base.nombre,
          (
            SELECT count(*)::integer
            FROM lecciones l
            JOIN cursos c ON c.id_curso = l.id_curso
            WHERE l.estado_publicacion = 'publicado'
              AND c.estado_publicacion = 'publicado'
          ) AS "totalLeccionesPublicadas",
          base.maestros,
          COALESCE(
            (
              SELECT json_agg(
                row_to_json(e)
                ORDER BY lower(e."nombreCompleto"), e.uid
              )
              FROM estudiantes e
            ),
            '[]'::json
          ) AS estudiantes
        FROM (
          ${CONSULTA_GRUPOS}
          WHERE g.id_grupo = $1
        ) base
      `,
      [idGrupo]
    );

    return resultado.rows[0];
  });
}

async function asignarEstudiante(uid, idGrupo, uidEstudiante) {
  return ejecutarOperacion(
    uid,
    async (cliente, usuario, estudiante) => {
      await bloquearGrupoDisponible(cliente, usuario, idGrupo);

      if (!estudiante) {
        throw new ErrorOperacionGrupo(
          404,
          'No existe la cuenta solicitada',
          'usuario_no_encontrado'
        );
      }

      if (estudiante.rol !== 'estudiante') {
        throw new ErrorOperacionGrupo(
          400,
          'La cuenta debe tener el rol de estudiante',
          'usuario_no_es_estudiante'
        );
      }

      if (!estudiante.activo) {
        throw new ErrorOperacionGrupo(
          403,
          'La cuenta está desactivada',
          'cuenta_desactivada'
        );
      }

      const asignacion = await cliente.query(
        `
          INSERT INTO grupo_estudiantes (
            id_grupo, uid_estudiante, asignado_por
          )
          VALUES ($1, $2, $3)
          ON CONFLICT (id_grupo, uid_estudiante) DO NOTHING
          RETURNING uid_estudiante
        `,
        [idGrupo, uidEstudiante, usuario.uid]
      );

      if (asignacion.rowCount !== 1) {
        throw new ErrorOperacionGrupo(
          409,
          'El estudiante ya está asignado al grupo',
          'estudiante_ya_asignado'
        );
      }

      const resultado = await cliente.query(
        `${CONSULTA_ESTUDIANTES_GRUPO} AND u.uid = $2`,
        [idGrupo, uidEstudiante]
      );

      return resultado.rows[0];
    },
    { idGrupo, uidDestino: uidEstudiante }
  );
}

async function retirarEstudiante(uid, idGrupo, uidEstudiante) {
  return ejecutarOperacion(
    uid,
    async (cliente, usuario) => {
      await bloquearGrupoDisponible(cliente, usuario, idGrupo);

      const resultado = await cliente.query(
        `
          DELETE FROM grupo_estudiantes
          WHERE id_grupo = $1 AND uid_estudiante = $2
          RETURNING uid_estudiante
        `,
        [idGrupo, uidEstudiante]
      );

      if (resultado.rowCount !== 1) {
        throw new ErrorOperacionGrupo(
          404,
          'La asignación no existe en este grupo',
          'asignacion_no_encontrada'
        );
      }
    },
    { idGrupo, uidDestino: uidEstudiante }
  );
}

module.exports = {
  ErrorOperacionGrupo,
  listarGrupos,
  crearGrupo,
  renombrarGrupo,
  eliminarGrupo,
  obtenerDetalleGrupo,
  asignarEstudiante,
  retirarEstudiante
};
