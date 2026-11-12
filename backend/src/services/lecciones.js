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

const COLUMNAS_PROGRESO = `
  estado AS "estadoProgreso",
  id_ultimo_paso_completado::text AS "idUltimoPasoCompletado",
  fecha_finalizacion AS "fechaFinalizacion"
`;

function comprobarIdPaso(idPaso) {
  const maximo = '9223372036854775807';
  if (typeof idPaso !== 'string' || !/^[1-9][0-9]{0,18}$/.test(idPaso)
    || (idPaso.length === maximo.length && idPaso > maximo)) {
    throw new ErrorReglaCurso(400, 'El identificador del paso no es válido para esta lección', 'id_paso_invalido');
  }
}

async function rechazarLeccionNoDisponible(cliente, idLeccion) {
  const resultado = await cliente.query(`
    SELECT EXISTS (
      SELECT 1 FROM historial_cursos_retirados h
      JOIN cursos c ON c.id_curso = h.id_curso
      CROSS JOIN LATERAL jsonb_array_elements(h.lecciones) historica
      WHERE c.estado_publicacion = 'retirado'
        AND historica->>'idLeccion' = $1::text
    ) AS retirada
  `, [idLeccion]);
  if (resultado.rows[0]?.retirada === true) {
    throw new ErrorReglaCurso(404, 'Este curso fue retirado y sus lecciones ya no están disponibles', 'curso_retirado');
  }
  throw new ErrorReglaCurso(404, 'La lección no está disponible', 'leccion_no_encontrada');
}

async function guardarPasoLeccion(usuario, idLeccion, idPaso, { reloj = () => new Date() } = {}) {
  comprobarEstudiante(usuario);
  comprobarId(idLeccion);
  comprobarIdPaso(idPaso);
  if (typeof reloj !== 'function') throw new TypeError('El reloj debe ser una función');

  const cliente = await pool.connect();
  let enTransaccion = false;
  let errorConexion;
  try {
    await cliente.query('BEGIN');
    enTransaccion = true;

    // Orden compartido con futuras escrituras: curso, lección, progreso.
    // El bloqueo del curso serializa también el primer progreso, que aún no tiene fila.
    const cursos = await cliente.query(`
      SELECT c.id_curso::text AS "idCurso", c.estado_publicacion,
        c.fecha_cierre::text AS fecha_cierre
      FROM cursos c
      JOIN lecciones l ON l.id_curso = c.id_curso
      WHERE l.id_leccion = $1::bigint
      FOR UPDATE OF c
    `, [idLeccion]);
    if (cursos.rows.length === 0) await rechazarLeccionNoDisponible(cliente, idLeccion);
    const curso = cursos.rows[0];

    const lecciones = await cliente.query(`
      SELECT id_leccion::text AS "idLeccion"
      FROM lecciones
      WHERE id_leccion = $1::bigint AND id_curso = $2::bigint
      FOR UPDATE
    `, [idLeccion, curso.idCurso]);
    if (lecciones.rows.length === 0) await rechazarLeccionNoDisponible(cliente, idLeccion);

    const avances = await cliente.query(`
      SELECT EXISTS (
        SELECT 1 FROM progresos p
        JOIN lecciones l ON l.id_leccion = p.id_leccion
        WHERE p.uid_estudiante = $1 AND l.id_curso = $2::bigint
      ) AS "tieneAvance"
    `, [usuario.uid, curso.idCurso]);
    // No usar un instante capturado antes de esperar los bloqueos.
    validarAccesoLeccion(usuario, curso, {
      tieneAvance: avances.rows[0]?.tieneAvance,
      ahora: reloj()
    });

    const detallePasos = await cliente.query(`
      SELECT id_paso::text AS "idPaso", orden
      FROM pasos WHERE id_leccion = $1::bigint
      ORDER BY orden, id_paso
    `, [idLeccion]);
    const pasos = detallePasos.rows;
    if (pasos.length === 0) throw new TypeError('La lección publicada debe tener pasos');
    const indiceSolicitado = pasos.findIndex((paso) => paso.idPaso === idPaso);
    if (indiceSolicitado === -1) {
      throw new ErrorReglaCurso(400, 'El identificador del paso no es válido para esta lección', 'id_paso_invalido');
    }

    const progresos = await cliente.query(`
      SELECT ${COLUMNAS_PROGRESO}
      FROM progresos
      WHERE uid_estudiante = $1 AND id_leccion = $2::bigint
      FOR UPDATE
    `, [usuario.uid, idLeccion]);
    let fila = progresos.rows[0] || {};
    let progreso = obtenerProgreso(fila, pasos);

    if (indiceSolicitado > progreso.pasosCompletados) {
      throw new ErrorReglaCurso(409, 'Completa el paso anterior para continuar', 'paso_fuera_de_secuencia');
    }

    // Un paso anterior o repetido es un reintento sin escritura ni cambio de fechas.
    if (indiceSolicitado === progreso.pasosCompletados) {
      const completa = indiceSolicitado === pasos.length - 1;
      const estado = completa ? 'completada' : 'en_progreso';
      let guardado;
      if (progresos.rows.length === 0) {
        guardado = await cliente.query(`
          INSERT INTO progresos (
            uid_estudiante, id_leccion, estado,
            id_ultimo_paso_completado, fecha_finalizacion
          ) VALUES ($1, $2::bigint, $3, $4::bigint,
            CASE WHEN $5::boolean THEN clock_timestamp() ELSE NULL END)
          RETURNING ${COLUMNAS_PROGRESO}
        `, [usuario.uid, idLeccion, estado, idPaso, completa]);
      } else {
        guardado = await cliente.query(`
          UPDATE progresos
          SET estado = $3, id_ultimo_paso_completado = $4::bigint,
            fecha_finalizacion = CASE WHEN $5::boolean THEN clock_timestamp() ELSE NULL END
          WHERE uid_estudiante = $1 AND id_leccion = $2::bigint
          RETURNING ${COLUMNAS_PROGRESO}
        `, [usuario.uid, idLeccion, estado, idPaso, completa]);
      }
      if (guardado.rows.length !== 1) throw new TypeError('El guardado no devolvió un progreso único');
      fila = guardado.rows[0];
      progreso = obtenerProgreso(fila, pasos);
    }

    const resumen = await cliente.query(`
      SELECT count(*)::integer AS "totalLecciones",
        count(*) FILTER (WHERE p.estado = 'completada')::integer AS "leccionesCompletadas"
      FROM lecciones l
      LEFT JOIN progresos p ON p.id_leccion = l.id_leccion AND p.uid_estudiante = $1
      WHERE l.id_curso = $2::bigint
    `, [usuario.uid, curso.idCurso]);
    const totales = resumen.rows[0];
    if (!totales || !Number.isInteger(totales.totalLecciones) || totales.totalLecciones < 1
      || !Number.isInteger(totales.leccionesCompletadas) || totales.leccionesCompletadas < 0
      || totales.leccionesCompletadas > totales.totalLecciones) {
      throw new TypeError('El resumen del curso no es válido');
    }

    const respuesta = {
      idLeccion,
      ...progreso,
      leccionCompletada: progreso.estado === 'completada',
      cursoCompletado: totales.leccionesCompletadas === totales.totalLecciones
    };
    await cliente.query('COMMIT');
    enTransaccion = false;
    return respuesta;
  } catch (error) {
    if (enTransaccion) {
      try {
        await cliente.query('ROLLBACK');
      } catch (falloRollback) {
        errorConexion = falloRollback;
        console.error('No fue posible revertir la transacción de progreso');
      }
    } else {
      errorConexion = error;
    }
    throw error;
  } finally {
    if (errorConexion) cliente.release(errorConexion);
    else cliente.release();
  }
}

module.exports = { obtenerDetalleLeccion, guardarPasoLeccion };
