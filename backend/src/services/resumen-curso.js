const pool = require('../config/database');
const { ErrorReglaCurso, obtenerEstadoCurso } = require('./reglas-cursos');

const CONSULTA_RESUMENES = `
  SELECT
    ca.id_categoria::text AS "idCategoria",
    ca.nombre AS "nombreCategoria",
    ca.orden AS "ordenCategoria",
    c.id_curso::text AS "idCurso",
    c.titulo,
    c.descripcion,
    c.estado_publicacion,
    c.fecha_cierre::text AS fecha_cierre,
    avance."tieneAvance",
    avance."fechaUltimaActividad",
    avance."fechaFinalizacionCurso",
    (h.uid_estudiante IS NOT NULL) AS "tieneHistorial",
    h.lecciones AS "leccionesHistorial",
    h.curso_completado AS "completadoHistorico",
    to_jsonb(h.fecha_finalizacion_curso) AS "fechaFinalizacionHistorica",
    CASE WHEN cert.id_certificado IS NULL THEN NULL
      ELSE json_build_object(
        'idCertificado', cert.id_certificado::text,
        'folio', cert.folio,
        'codigoVerificacion', cert.codigo_verificacion::text
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
    SELECT
      count(*) > 0 AS "tieneAvance",
      to_jsonb(max(p.fecha_actualizacion)) AS "fechaUltimaActividad",
      to_jsonb(max(p.fecha_finalizacion)) AS "fechaFinalizacionCurso"
    FROM progresos p
    JOIN lecciones l ON l.id_leccion = p.id_leccion
    WHERE l.id_curso = c.id_curso
      AND p.uid_estudiante = $1
  ) avance ON true
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

const ESTADOS_LECCION = ['pendiente', 'en_progreso', 'completada'];
const esTexto = (valor) => typeof valor === 'string' && valor.trim().length > 0;
const esInstante = (valor) => typeof valor === 'string' && Number.isFinite(Date.parse(valor));

function inconsistente(detalle) {
  return new TypeError(`El resumen del curso es inconsistente: ${detalle}`);
}

function comprobarEstudiante(usuario) {
  if (!usuario) {
    throw new ErrorReglaCurso(404, 'El perfil todavía no está registrado', 'perfil_no_registrado');
  }
  if (usuario.activo !== true) {
    throw new ErrorReglaCurso(403, 'La cuenta está desactivada', 'cuenta_desactivada');
  }
  if (usuario.rol !== 'estudiante' || !esTexto(usuario.uid) || usuario.uid.length > 128) {
    throw new ErrorReglaCurso(403, 'No tienes permisos para realizar esta acción', 'rol_no_autorizado');
  }
}

async function consultarResumenes(uid) {
  const { rows } = await pool.query(CONSULTA_RESUMENES, [uid]);
  return rows;
}

function instanteOpcional(valor, nombre) {
  if (valor === null || valor === undefined) return null;
  if (!esInstante(valor)) throw inconsistente(`${nombre} no es un instante válido`);
  return valor;
}

function certificadoDe(fila) {
  if (fila.certificado === null || fila.certificado === undefined) return null;
  const { idCertificado, folio, codigoVerificacion } = fila.certificado;
  if (!esTexto(idCertificado) || !esTexto(folio) || !esTexto(codigoVerificacion)) {
    throw inconsistente('certificado incompleto');
  }
  return { idCertificado, folio, codigoVerificacion };
}

function resumenPublicado(fila, estadoCurso) {
  if (!Array.isArray(fila.lecciones)) throw inconsistente('las lecciones deben ser un arreglo');
  const lecciones = fila.lecciones;
  for (const leccion of lecciones) {
    if (!leccion || !esTexto(leccion.idLeccion) || !esTexto(leccion.titulo)
      || !Number.isInteger(leccion.duracionEstimadaMinutos)
      || !ESTADOS_LECCION.includes(leccion.estado)) {
      throw inconsistente('lección no válida');
    }
  }
  const totalLecciones = lecciones.length;
  const leccionesCompletadas = lecciones.filter((l) => l.estado === 'completada').length;
  const hayProgreso = lecciones.some((l) => l.estado !== 'pendiente');
  let estado = 'sin_empezar';
  if (totalLecciones > 0 && leccionesCompletadas === totalLecciones) estado = 'terminado';
  else if (hayProgreso) estado = 'en_curso';

  let siguiente = null;
  if (estado === 'sin_empezar') siguiente = lecciones[0] ?? null;
  else if (estado === 'en_curso') {
    siguiente = lecciones.find((l) => l.estado === 'en_progreso')
      ?? lecciones.find((l) => l.estado === 'pendiente') ?? null;
  }

  const fechaFinalizacion = estado === 'terminado'
    ? instanteOpcional(fila.fechaFinalizacionCurso, 'fechaFinalizacionCurso')
    : null;
  if (estado === 'terminado' && fechaFinalizacion === null) {
    throw inconsistente('curso terminado sin fecha de finalización');
  }

  return {
    estado,
    leccionesCompletadas,
    totalLecciones,
    duracionTotalMinutos: lecciones.reduce((suma, l) => suma + l.duracionEstimadaMinutos, 0),
    fechaCierre: fila.fecha_cierre ?? null,
    cerrado: estadoCurso === 'cerrado',
    retirado: false,
    siguienteLeccion: siguiente === null ? null : { idLeccion: siguiente.idLeccion, titulo: siguiente.titulo },
    fechaUltimaActividad: estado === 'sin_empezar'
      ? null
      : instanteOpcional(fila.fechaUltimaActividad, 'fechaUltimaActividad'),
    fechaFinalizacion
  };
}

function resumenRetirado(fila) {
  if (fila.tieneHistorial !== true || typeof fila.completadoHistorico !== 'boolean'
    || !Array.isArray(fila.leccionesHistorial) || fila.leccionesHistorial.length === 0) {
    throw inconsistente('curso retirado sin historial válido');
  }
  const lecciones = fila.leccionesHistorial;
  let ultima = null;
  for (const leccion of lecciones) {
    if (!leccion || typeof leccion !== 'object' || !esTexto(leccion.titulo)) {
      throw inconsistente('lección del historial no válida');
    }
    if (Object.hasOwn(leccion, 'estado') && !ESTADOS_LECCION.includes(leccion.estado)) {
      throw inconsistente('estado de lección del historial no válido');
    }
    const fecha = instanteOpcional(leccion.fechaActualizacion, 'fechaActualizacion del historial');
    if (fecha !== null && (ultima === null || Date.parse(fecha) > Date.parse(ultima))) ultima = fecha;
  }
  const terminado = fila.completadoHistorico;
  const fechaFinalizacion = terminado
    ? instanteOpcional(fila.fechaFinalizacionHistorica, 'fechaFinalizacionHistorica')
    : null;
  if (terminado && fechaFinalizacion === null) throw inconsistente('historial completo sin fecha de finalización');

  return {
    estado: terminado ? 'terminado' : 'en_curso',
    leccionesCompletadas: lecciones.filter((l) => l.estado === 'completada').length,
    totalLecciones: lecciones.length,
    duracionTotalMinutos: null,
    fechaCierre: null,
    cerrado: false,
    retirado: true,
    siguienteLeccion: null,
    fechaUltimaActividad: ultima,
    fechaFinalizacion
  };
}

function resumirCurso(fila, { ahora = new Date() } = {}) {
  const estadoCurso = obtenerEstadoCurso(fila, { ahora });
  if (estadoCurso === null) throw inconsistente('un borrador no tiene resumen');
  if (!esTexto(fila.idCurso) || !esTexto(fila.idCategoria) || !Number.isInteger(fila.ordenCategoria)) {
    throw inconsistente('identificadores no válidos');
  }
  const detalle = estadoCurso === 'retirado' ? resumenRetirado(fila) : resumenPublicado(fila, estadoCurso);
  return {
    idCurso: fila.idCurso,
    titulo: fila.titulo,
    descripcion: fila.descripcion,
    categoria: { idCategoria: fila.idCategoria, nombre: fila.nombreCategoria, orden: fila.ordenCategoria },
    estado: detalle.estado,
    leccionesCompletadas: detalle.leccionesCompletadas,
    totalLecciones: detalle.totalLecciones,
    duracionTotalMinutos: detalle.duracionTotalMinutos,
    fechaCierre: detalle.fechaCierre,
    cerrado: detalle.cerrado,
    retirado: detalle.retirado,
    siguienteLeccion: detalle.siguienteLeccion,
    fechaUltimaActividad: detalle.fechaUltimaActividad,
    fechaFinalizacion: detalle.fechaFinalizacion,
    certificado: certificadoDe(fila)
  };
}

module.exports = { CONSULTA_RESUMENES, comprobarEstudiante, consultarResumenes, resumirCurso };
