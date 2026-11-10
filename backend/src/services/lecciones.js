const pool = require('../config/database');
const { ErrorReglaCurso, validarAccesoLeccion } = require('./reglas-cursos');

const CONSULTA_DETALLE = `
  WITH detalle AS (
    SELECT
      l.id_leccion::text AS "idLeccion",
      c.id_curso::text AS "idCurso",
      c.titulo AS "tituloCurso",
      l.titulo, l.objetivo,
      l.duracion_estimada_minutos AS "duracionEstimadaMinutos",
      c.estado_publicacion AS "estadoPublicacion",
      c.fecha_cierre::text AS "fechaCierre",
      EXISTS (
        SELECT 1 FROM progresos avance
        JOIN lecciones iniciada ON iniciada.id_leccion = avance.id_leccion
        WHERE iniciada.id_curso = c.id_curso AND avance.uid_estudiante = $2
      ) AS "tieneAvance",
      p.estado AS "estadoProgreso",
      p.id_ultimo_paso_completado::text AS "idUltimoPasoCompletado",
      p.fecha_finalizacion AS "fechaFinalizacion",
      (
        SELECT json_build_object('idLeccion', siguiente.id_leccion::text, 'titulo', siguiente.titulo)
        FROM lecciones siguiente
        WHERE siguiente.id_curso = c.id_curso
          AND (siguiente.orden, siguiente.id_leccion) > (l.orden, l.id_leccion)
        ORDER BY siguiente.orden, siguiente.id_leccion
        LIMIT 1
      ) AS "siguienteLeccion",
      COALESCE((
        SELECT json_agg(json_build_object(
          'idPaso', paso.id_paso::text,
          'orden', paso.orden,
          'instruccion', paso.instruccion,
          'recursos', paso.recursos,
          'actividad', paso.actividad
        ) ORDER BY paso.orden, paso.id_paso)
        FROM pasos paso WHERE paso.id_leccion = l.id_leccion
      ), '[]'::json) AS pasos
    FROM lecciones l
    JOIN cursos c ON c.id_curso = l.id_curso
    LEFT JOIN progresos p ON p.id_leccion = l.id_leccion AND p.uid_estudiante = $2
    WHERE l.id_leccion = $1::bigint
  )
  SELECT
    (SELECT row_to_json(detalle) FROM detalle) AS leccion,
    EXISTS (
      SELECT 1 FROM historial_cursos_retirados h
      JOIN cursos retirado ON retirado.id_curso = h.id_curso
      CROSS JOIN LATERAL jsonb_array_elements(h.lecciones) historica
      WHERE NOT EXISTS (SELECT 1 FROM detalle)
        AND retirado.estado_publicacion = 'retirado'
        AND historica->>'idLeccion' = $1::text
    ) AS "leccionRetirada"
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

function comprobarId(idLeccion) {
  const maximo = '9223372036854775807';
  if (typeof idLeccion !== 'string' || !/^[1-9][0-9]{0,18}$/.test(idLeccion)
    || (idLeccion.length === maximo.length && idLeccion > maximo)) {
    throw new ErrorReglaCurso(400, 'El identificador de la lección no es válido', 'id_leccion_invalido');
  }
}

function obtenerProgreso(fila, pasos) {
  const estado = fila.estadoProgreso ?? 'pendiente';
  const ultimo = fila.idUltimoPasoCompletado ?? null;
  const fecha = fila.fechaFinalizacion ?? null;
  const indice = ultimo === null ? -1 : pasos.findIndex((paso) => paso.idPaso === ultimo);
  if (!['pendiente', 'en_progreso', 'completada'].includes(estado)
    || (ultimo !== null && indice === -1)) {
    throw new TypeError('El progreso almacenado no corresponde a los pasos de la lección');
  }

  if ((estado === 'pendiente' && ultimo !== null)
    || (estado !== 'completada' && fecha !== null)
    || (estado === 'en_progreso' && indice === pasos.length - 1)) {
    throw new TypeError('El progreso almacenado tiene un estado inconsistente');
  }

  let fechaFinalizacion = null;
  if (estado === 'completada') {
    if (indice !== pasos.length - 1 || fecha === null) {
      throw new TypeError('La lección completada debe conservar el último paso y su fecha');
    }
    const instante = fecha instanceof Date ? fecha : new Date(fecha);
    if (Number.isNaN(instante.getTime())) {
      throw new TypeError('La fecha de finalización almacenada no es válida');
    }
    fechaFinalizacion = instante.toISOString();
  }

  return {
    estado,
    idUltimoPasoCompletado: ultimo,
    idPasoParaContinuar: estado === 'completada' ? null : pasos[indice + 1].idPaso,
    pasosCompletados: indice + 1,
    totalPasos: pasos.length,
    fechaFinalizacion
  };
}

async function obtenerDetalleLeccion(usuario, idLeccion, { ahora = new Date() } = {}) {
  comprobarEstudiante(usuario);
  comprobarId(idLeccion);
  const resultado = await pool.query(CONSULTA_DETALLE, [idLeccion, usuario.uid]);
  const registro = resultado.rows[0];
  if (!registro || typeof registro.leccionRetirada !== 'boolean') {
    throw new TypeError('La consulta de detalle no devolvió el resultado esperado');
  }
  const fila = registro.leccion;
  if (!fila) {
    if (registro.leccionRetirada) {
      throw new ErrorReglaCurso(404, 'Este curso fue retirado y sus lecciones ya no están disponibles', 'curso_retirado');
    }
    throw new ErrorReglaCurso(404, 'La lección no está disponible', 'leccion_no_encontrada');
  }

  validarAccesoLeccion(usuario, {
    estado_publicacion: fila.estadoPublicacion,
    fecha_cierre: fila.fechaCierre
  }, { tieneAvance: fila.tieneAvance, ahora });

  if (!Array.isArray(fila.pasos) || fila.pasos.length === 0) {
    throw new TypeError('La lección publicada debe tener pasos');
  }
  const pasos = fila.pasos.map((paso) => {
    if (!Array.isArray(paso.recursos) || !paso.actividad
      || typeof paso.actividad !== 'object' || Array.isArray(paso.actividad)) {
      throw new TypeError('El paso almacenado debe contener recursos y actividad válidos');
    }
    return {
      idPaso: paso.idPaso,
      orden: paso.orden,
      instruccion: paso.instruccion,
      recursos: paso.recursos,
      actividad: paso.actividad
    };
  });

  return {
    idLeccion: fila.idLeccion,
    idCurso: fila.idCurso,
    tituloCurso: fila.tituloCurso,
    titulo: fila.titulo,
    objetivo: fila.objetivo,
    duracionEstimadaMinutos: fila.duracionEstimadaMinutos,
    progreso: obtenerProgreso(fila, pasos),
    siguienteLeccion: fila.siguienteLeccion === null ? null : {
      idLeccion: fila.siguienteLeccion.idLeccion,
      titulo: fila.siguienteLeccion.titulo
    },
    pasos
  };
}

module.exports = { obtenerDetalleLeccion };
