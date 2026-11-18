const pool = require('../config/database');
const { ErrorReglaCurso, obtenerEstadoCurso, puedeVerCursoEstudiante } = require('./reglas-cursos');

const CONSULTA_MIS_CURSOS = `
  SELECT
    ca.id_categoria::text AS "idCategoria",
    ca.nombre AS "nombreCategoria",
    c.id_curso::text AS "idCurso",
    c.titulo,
    c.descripcion,
    c.estado_publicacion,
    c.fecha_cierre::text AS fecha_cierre,
    EXISTS (
      SELECT 1
      FROM progresos avance
      JOIN lecciones iniciada ON iniciada.id_leccion = avance.id_leccion
      WHERE iniciada.id_curso = c.id_curso
        AND avance.uid_estudiante = $1
    ) AS "tieneAvance",
    (h.uid_estudiante IS NOT NULL) AS "tieneHistorial",
    h.curso_completado AS "completadoHistorico",
    CASE WHEN cert.id_certificado IS NULL THEN NULL
      ELSE json_build_object(
        'idCertificado', cert.id_certificado::text,
        'folio', cert.folio
      )
    END AS certificado,
    COALESCE(detalle.lecciones, '[]'::json) AS lecciones
  FROM categorias ca
  JOIN cursos c ON c.id_categoria = ca.id_categoria
  LEFT JOIN historial_cursos_retirados h
    ON h.id_curso = c.id_curso AND h.uid_estudiante = $1
  LEFT JOIN certificados cert
    ON cert.id_curso = c.id_curso AND cert.uid_estudiante = $1
  LEFT JOIN LATERAL (
    SELECT json_agg(
      json_build_object(
        'idLeccion', l.id_leccion::text,
        'titulo', l.titulo,
        'duracionEstimadaMinutos', l.duracion_estimada_minutos,
        'estado', COALESCE(p.estado, 'pendiente')
      ) ORDER BY l.orden, l.id_leccion
    ) AS lecciones
    FROM lecciones l
    LEFT JOIN progresos p
      ON p.id_leccion = l.id_leccion AND p.uid_estudiante = $1
    WHERE l.id_curso = c.id_curso
      AND c.estado_publicacion = 'publicado'
  ) detalle ON true
  WHERE c.estado_publicacion IN ('publicado', 'retirado')
  ORDER BY ca.orden, ca.id_categoria, c.orden, c.id_curso
`;

function comprobarEstudiante(usuario) {
  if (!usuario) {
    throw new ErrorReglaCurso(404, 'El perfil todavía no está registrado', 'perfil_no_registrado');
  }
  if (usuario.activo !== true) {
    throw new ErrorReglaCurso(403, 'La cuenta está desactivada', 'cuenta_desactivada');
  }
  if (usuario.rol !== 'estudiante' || typeof usuario.uid !== 'string'
    || !usuario.uid.trim() || usuario.uid.length > 128) {
    throw new ErrorReglaCurso(403, 'No tienes permisos para realizar esta acción', 'rol_no_autorizado');
  }
}

async function obtenerMisCursos(usuario, { ahora = new Date() } = {}) {
  comprobarEstudiante(usuario);
  const resultado = await pool.query(CONSULTA_MIS_CURSOS, [usuario.uid]);
  const categorias = new Map();

  for (const fila of resultado.rows) {
    if (!puedeVerCursoEstudiante(usuario, fila, {
      tieneAvance: fila.tieneAvance,
      tieneHistorial: fila.tieneHistorial,
      ahora
    })) continue;

    const estadoCurso = obtenerEstadoCurso(fila, { ahora });
    const retirado = estadoCurso === 'retirado';
    if (!retirado && !Array.isArray(fila.lecciones)) {
      throw new TypeError('La consulta de cursos debe devolver un arreglo de lecciones');
    }
    const lecciones = retirado ? [] : fila.lecciones.map((leccion) => ({
      idLeccion: leccion.idLeccion,
      titulo: leccion.titulo,
      duracionEstimadaMinutos: leccion.duracionEstimadaMinutos,
      estado: leccion.estado
    }));
    const certificado = fila.certificado === null ? null : {
      idCertificado: fila.certificado.idCertificado,
      folio: fila.certificado.folio
    };
    const cursoCompletado = retirado
      ? fila.completadoHistorico === true
      : lecciones.length > 0 && lecciones.every((leccion) => leccion.estado === 'completada');

    if (!categorias.has(fila.idCategoria)) {
      categorias.set(fila.idCategoria, {
        idCategoria: fila.idCategoria,
        nombre: fila.nombreCategoria,
        cursos: []
      });
    }
    categorias.get(fila.idCategoria).cursos.push({
      idCurso: fila.idCurso,
      titulo: fila.titulo,
      descripcion: fila.descripcion,
      estadoCurso,
      fechaCierre: fila.fecha_cierre ?? null,
      cursoCompletado,
      certificado,
      lecciones
    });
  }

  return Array.from(categorias.values());
}

module.exports = { obtenerMisCursos };
