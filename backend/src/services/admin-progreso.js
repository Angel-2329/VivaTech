const pool = require('../config/database');

const LECCIONES_VISIBLES = `
  SELECT l.id_leccion
  FROM lecciones l
  JOIN cursos c ON c.id_curso = l.id_curso
  WHERE l.estado_publicacion = 'publicado'
    AND c.estado_publicacion = 'publicado'
`;

async function obtenerResumen() {
  const resultado = await pool.query(
    `
      WITH lecciones_visibles AS (
        ${LECCIONES_VISIBLES}
      )
      SELECT
        (count(*) FILTER (WHERE rol = 'estudiante'))::integer
          AS "totalEstudiantes",
        (count(*) FILTER (WHERE rol = 'estudiante' AND activo))::integer
          AS "estudiantesActivos",
        (count(*) FILTER (WHERE rol = 'estudiante' AND NOT activo))::integer
          AS "estudiantesInactivos",
        (count(*) FILTER (WHERE rol = 'maestro'))::integer
          AS "totalMaestros",
        (count(*) FILTER (WHERE rol = 'maestro' AND activo))::integer
          AS "maestrosActivos",
        (count(*) FILTER (WHERE rol = 'maestro' AND NOT activo))::integer
          AS "maestrosInactivos",
        (SELECT count(*)::integer FROM grupos) AS "totalGrupos",
        (SELECT count(*)::integer FROM lecciones_visibles)
          AS "totalLeccionesPublicadas",
        (
          SELECT count(*)::integer
          FROM progresos p
          JOIN lecciones_visibles lv ON lv.id_leccion = p.id_leccion
          JOIN usuarios estudiante ON estudiante.uid = p.uid_estudiante
          WHERE p.estado = 'completada'
            AND estudiante.rol = 'estudiante'
        ) AS "leccionesCompletadas"
      FROM usuarios
    `
  );

  return resultado.rows[0];
}

async function listarProgreso({ buscar, limite, desplazamiento }) {
  const resultado = await pool.query(
    `
      WITH lecciones_visibles AS (
        ${LECCIONES_VISIBLES}
      ), pagina_estudiantes AS (
        SELECT uid, nombre_completo, activo
        FROM usuarios
        WHERE rol = 'estudiante'
          AND strpos(lower(nombre_completo), lower($1::text)) > 0
        ORDER BY lower(nombre_completo), uid
        LIMIT $2 OFFSET $3
      )
      SELECT
        e.uid,
        e.nombre_completo AS "nombreCompleto",
        e.activo,
        COALESCE(
          (
            SELECT json_agg(g.nombre ORDER BY lower(g.nombre), g.id_grupo)
            FROM grupo_estudiantes ge
            JOIN grupos g ON g.id_grupo = ge.id_grupo
            WHERE ge.uid_estudiante = e.uid
          ),
          '[]'::json
        ) AS grupos,
        avance."leccionesCompletadas",
        (SELECT count(*)::integer FROM lecciones_visibles)
          AS "totalLeccionesPublicadas",
        avance."ultimaActividad"
      FROM pagina_estudiantes e
      LEFT JOIN LATERAL (
        SELECT
          (count(*) FILTER (WHERE p.estado = 'completada'))::integer
            AS "leccionesCompletadas",
          max(p.fecha_actualizacion) AS "ultimaActividad"
        FROM progresos p
        JOIN lecciones_visibles lv ON lv.id_leccion = p.id_leccion
        WHERE p.uid_estudiante = e.uid
      ) avance ON true
      ORDER BY lower(e.nombre_completo), e.uid
    `,
    [buscar, limite, desplazamiento]
  );

  return resultado.rows;
}

module.exports = { obtenerResumen, listarProgreso };
