const { isDeepStrictEqual } = require('node:util');
const pool = require('../config/database');
const { ErrorReglaCurso, validarAccionAutor } = require('./reglas-cursos');
const { tienePermisoEditor } = require('./permisos-curso');

const MAXIMO_ID = '9223372036854775807';
const esId = (id) => typeof id === 'string' && /^[1-9][0-9]{0,18}$/.test(id)
  && (id.length < MAXIMO_ID.length || id <= MAXIMO_ID);
const esObjeto = (valor) => valor !== null && typeof valor === 'object' && !Array.isArray(valor);
const esTexto = (valor) => typeof valor === 'string' && valor.trim().length > 0;
const esUid = (uid) => esTexto(uid) && uid.length <= 128;
const esInstante = (valor) => typeof valor === 'string' && Number.isFinite(Date.parse(valor));

function comprobarEditor(usuario) {
  if (!usuario) throw new ErrorReglaCurso(404, 'El perfil todavía no está registrado', 'perfil_no_registrado');
  if (usuario.activo !== true) throw new ErrorReglaCurso(403, 'La cuenta está desactivada', 'cuenta_desactivada');
  if (!esUid(usuario.uid) || !['maestro', 'administrador'].includes(usuario.rol)) {
    throw new ErrorReglaCurso(403, 'No tienes permisos para realizar esta acción', 'rol_no_autorizado');
  }
}

function inconsistente() {
  return new ErrorReglaCurso(409, 'No se puede retirar el curso porque su evidencia histórica requiere revisión', 'historial_inconsistente');
}

function exigir(condicion) {
  if (!condicion) throw inconsistente();
}

const sinDuracion = (lecciones) => lecciones.map(({ duracionEstimadaMinutos: _duracion, ...resto }) => resto);

function comprobarHistorial(historial) {
  exigir(esUid(historial.uid));
  exigir(Array.isArray(historial.lecciones) && historial.lecciones.length >= 1 && historial.lecciones.length <= 10);
  exigir(typeof historial.cursoCompletado === 'boolean');
  exigir(historial.cursoCompletado ? esInstante(historial.fechaFinalizacionCurso) : historial.fechaFinalizacionCurso === null);
  const ids = new Set();
  const ordenes = new Set();
  for (const leccion of historial.lecciones) {
    exigir(esObjeto(leccion) && esTexto(leccion.titulo));
    exigir(Number.isInteger(leccion.orden) && leccion.orden > 0 && !ordenes.has(leccion.orden));
    ordenes.add(leccion.orden);
    if (Object.hasOwn(leccion, 'idLeccion')) {
      exigir(esId(leccion.idLeccion) && !ids.has(leccion.idLeccion));
      ids.add(leccion.idLeccion);
    }
    if (Object.hasOwn(leccion, 'estado')) {
      exigir(['pendiente', 'en_progreso', 'completada'].includes(leccion.estado));
      if (historial.cursoCompletado) exigir(leccion.estado === 'completada');
    }
  }
}

function desdeProgreso(uid, curso, lecciones, pasos, progresos, fechaMaxima) {
  exigir(esTexto(curso.titulo) && lecciones.length >= 1 && lecciones.length <= 10);
  const propios = new Map();
  for (const progreso of progresos) {
    exigir(!propios.has(progreso.idLeccion));
    propios.set(progreso.idLeccion, progreso);
  }
  const instantanea = lecciones.map((leccion) => {
    exigir(esId(leccion.idLeccion) && esTexto(leccion.titulo));
    const pasosLeccion = pasos.filter((p) => p.idLeccion === leccion.idLeccion);
    const progreso = propios.get(leccion.idLeccion);
    if (!progreso) return {
      idLeccion: leccion.idLeccion, tituloCurso: curso.titulo, titulo: leccion.titulo, orden: leccion.orden,
      duracionEstimadaMinutos: leccion.duracionEstimadaMinutos,
      origen: 'progreso', estado: 'pendiente', totalPasos: pasosLeccion.length,
      pasosCompletados: 0, idUltimoPasoCompletado: null,
      fechaInicio: null, fechaActualizacion: null, fechaFinalizacion: null
    };
    exigir(['en_progreso', 'completada'].includes(progreso.estado));
    exigir(esInstante(progreso.fechaInicio) && esInstante(progreso.fechaActualizacion));
    const indice = progreso.idUltimoPasoCompletado === null ? -1
      : pasosLeccion.findIndex((p) => p.idPaso === progreso.idUltimoPasoCompletado);
    exigir(progreso.idUltimoPasoCompletado === null || indice >= 0);
    if (progreso.estado === 'completada') {
      exigir(pasosLeccion.length > 0 && indice === pasosLeccion.length - 1 && esInstante(progreso.fechaFinalizacion));
    } else exigir(progreso.fechaFinalizacion === null);
    return {
      idLeccion: leccion.idLeccion, tituloCurso: curso.titulo, titulo: leccion.titulo, orden: leccion.orden,
      duracionEstimadaMinutos: leccion.duracionEstimadaMinutos,
      origen: 'progreso', estado: progreso.estado, totalPasos: pasosLeccion.length,
      pasosCompletados: indice + 1, idUltimoPasoCompletado: progreso.idUltimoPasoCompletado,
      fechaInicio: progreso.fechaInicio, fechaActualizacion: progreso.fechaActualizacion,
      fechaFinalizacion: progreso.fechaFinalizacion
    };
  });
  exigir([...propios.keys()].every((id) => lecciones.some((l) => l.idLeccion === id)));
  const completo = instantanea.every((l) => l.estado === 'completada');
  if (completo) exigir(esInstante(fechaMaxima));
  const historial = { uid, lecciones: instantanea, cursoCompletado: completo,
    fechaFinalizacionCurso: completo ? fechaMaxima : null };
  comprobarHistorial(historial);
  return historial;
}

function desdeCertificado(certificado) {
  exigir(esUid(certificado.uid) && esTexto(certificado.tituloCurso) && esInstante(certificado.fechaFinalizacionCurso));
  exigir(Array.isArray(certificado.lecciones) && certificado.lecciones.length >= 1 && certificado.lecciones.length <= 10);
  const historial = {
    uid: certificado.uid, cursoCompletado: true, fechaFinalizacionCurso: certificado.fechaFinalizacionCurso,
    lecciones: certificado.lecciones.map((leccion, indice) => {
      exigir(esObjeto(leccion) && esTexto(leccion.titulo));
      const conservada = { tituloCurso: certificado.tituloCurso, titulo: leccion.titulo,
        orden: indice + 1, origen: 'certificado', estado: 'completada' };
      if (Object.hasOwn(leccion, 'idLeccion')) {
        exigir(esId(leccion.idLeccion));
        conservada.idLeccion = leccion.idLeccion;
      }
      return conservada;
    })
  };
  comprobarHistorial(historial);
  return historial;
}

function planificarHistoriales(curso, lecciones, pasos, progresos, anteriores, certificados, maximos) {
  const pendientes = new Map();
  const existentes = new Map();
  for (const historial of anteriores) {
    comprobarHistorial(historial);
    exigir(!existentes.has(historial.uid));
    existentes.set(historial.uid, historial);
  }
  const porAlumno = new Map();
  for (const progreso of progresos) {
    exigir(esUid(progreso.uid));
    if (!porAlumno.has(progreso.uid)) porAlumno.set(progreso.uid, []);
    porAlumno.get(progreso.uid).push(progreso);
  }
  const fechasMaximas = new Map();
  for (const fila of maximos) {
    exigir(esUid(fila.uid) && !fechasMaximas.has(fila.uid));
    fechasMaximas.set(fila.uid, fila.fechaFinalizacionCurso);
  }
  for (const [uid, filas] of porAlumno) {
    const nuevo = desdeProgreso(uid, curso, lecciones, pasos, filas, fechasMaximas.get(uid));
    const anterior = existentes.get(uid);
    if (anterior) {
      exigir(isDeepStrictEqual(sinDuracion(anterior.lecciones), sinDuracion(nuevo.lecciones))
        && anterior.cursoCompletado === nuevo.cursoCompletado
        && anterior.fechaFinalizacionCurso === nuevo.fechaFinalizacionCurso);
    } else pendientes.set(uid, nuevo);
  }
  const certificadosVistos = new Set();
  for (const certificado of certificados) {
    exigir(!certificadosVistos.has(certificado.uid));
    certificadosVistos.add(certificado.uid);
    const acreditado = desdeCertificado(certificado);
    const conservado = existentes.get(certificado.uid) || pendientes.get(certificado.uid);
    if (conservado) {
      exigir(conservado.cursoCompletado && conservado.fechaFinalizacionCurso === acreditado.fechaFinalizacionCurso);
    } else pendientes.set(certificado.uid, acreditado);
  }
  return [...pendientes.values()];
}

function comprobarEscritura(resultado, cantidad) {
  if (resultado.rowCount !== cantidad) throw new TypeError('La escritura no afectó la cantidad de registros prevista');
}

async function borrarOperativos(cliente, idCurso, lecciones, pasos, progresos) {
  if (progresos.length) {
    comprobarEscritura(await cliente.query(`
      DELETE FROM progresos WHERE id_leccion IN (
        SELECT id_leccion FROM lecciones WHERE id_curso = $1::bigint
      )
    `, [idCurso]), progresos.length);
  }
  if (pasos.length) {
    comprobarEscritura(await cliente.query(`
      DELETE FROM pasos WHERE id_leccion IN (
        SELECT id_leccion FROM lecciones WHERE id_curso = $1::bigint
      )
    `, [idCurso]), pasos.length);
  }
  if (lecciones.length) {
    comprobarEscritura(await cliente.query('DELETE FROM lecciones WHERE id_curso = $1::bigint', [idCurso]), lecciones.length);
  }
}

async function eliminarEnConexion(cliente, editor, idCurso) {
  const { rows: cursos } = await cliente.query(`
    SELECT id_curso::text AS "idCurso", titulo, estado_publicacion, creado_por
    FROM cursos WHERE id_curso = $1::bigint FOR UPDATE
  `, [idCurso]);
  if (cursos.length > 1) throw new TypeError('El identificador devolvió más de un curso');
  const curso = cursos[0];
  const retirado = { idCurso, estadoPublicacion: 'retirado', resultado: 'retirado' };
  const esEditor = await tienePermisoEditor(cliente, editor, curso);
  validarAccionAutor(editor, curso, { esEditor });
  if (curso.idCurso !== idCurso) throw new TypeError('El curso no corresponde al identificador solicitado');
  if (curso.estado_publicacion === 'retirado') return retirado;

  const { rows: lecciones } = await cliente.query(`
    SELECT id_leccion::text AS "idLeccion", titulo, orden,
      duracion_estimada_minutos AS "duracionEstimadaMinutos"
    FROM lecciones WHERE id_curso = $1::bigint
    ORDER BY orden, id_leccion FOR UPDATE
  `, [idCurso]);
  const { rows: pasos } = await cliente.query(`
    SELECT p.id_paso::text AS "idPaso", p.id_leccion::text AS "idLeccion", p.orden
    FROM pasos p JOIN lecciones l ON l.id_leccion = p.id_leccion
    WHERE l.id_curso = $1::bigint
    ORDER BY p.id_leccion, p.orden, p.id_paso FOR UPDATE OF p
  `, [idCurso]);
  const { rows: progresos } = await cliente.query(`
    SELECT p.uid_estudiante AS uid, p.id_leccion::text AS "idLeccion", p.estado,
      p.id_ultimo_paso_completado::text AS "idUltimoPasoCompletado",
      to_jsonb(p.fecha_inicio) AS "fechaInicio",
      to_jsonb(p.fecha_actualizacion) AS "fechaActualizacion",
      to_jsonb(p.fecha_finalizacion) AS "fechaFinalizacion"
    FROM progresos p JOIN lecciones l ON l.id_leccion = p.id_leccion
    WHERE l.id_curso = $1::bigint
    ORDER BY p.uid_estudiante, p.id_leccion FOR UPDATE OF p
  `, [idCurso]);
  const { rows: anteriores } = await cliente.query(`
    SELECT uid_estudiante AS uid, lecciones, curso_completado AS "cursoCompletado",
      to_jsonb(fecha_finalizacion_curso) AS "fechaFinalizacionCurso"
    FROM historial_cursos_retirados WHERE id_curso = $1::bigint
    ORDER BY uid_estudiante FOR UPDATE
  `, [idCurso]);
  const { rows: certificados } = await cliente.query(`
    SELECT uid_estudiante AS uid, titulo_curso_en_certificado AS "tituloCurso",
      lecciones_en_certificado AS lecciones,
      to_jsonb(fecha_finalizacion_curso) AS "fechaFinalizacionCurso"
    FROM certificados WHERE id_curso = $1::bigint
    ORDER BY uid_estudiante FOR UPDATE
  `, [idCurso]);

  if (!progresos.length && !anteriores.length && !certificados.length) {
    await borrarOperativos(cliente, idCurso, lecciones, pasos, progresos);
    await cliente.query('DELETE FROM curso_editores WHERE id_curso = $1::bigint', [idCurso]);
    comprobarEscritura(await cliente.query('DELETE FROM cursos WHERE id_curso = $1::bigint', [idCurso]), 1);
    return null;
  }

  let maximos = [];
  if (progresos.length) {
    ({ rows: maximos } = await cliente.query(`
      SELECT p.uid_estudiante AS uid,
        to_jsonb(max(p.fecha_finalizacion)) AS "fechaFinalizacionCurso"
      FROM progresos p JOIN lecciones l ON l.id_leccion = p.id_leccion
      WHERE l.id_curso = $1::bigint
      GROUP BY p.uid_estudiante ORDER BY p.uid_estudiante
    `, [idCurso]));
  }
  const nuevos = planificarHistoriales(curso, lecciones, pasos, progresos, anteriores, certificados, maximos);
  const { rows: [instante] } = await cliente.query('SELECT to_jsonb(clock_timestamp()) AS "fechaRetiro"');
  if (!esInstante(instante?.fechaRetiro)) throw new TypeError('La fecha de retiro debe proceder de PostgreSQL');
  for (const historial of nuevos) {
    comprobarEscritura(await cliente.query(`
      INSERT INTO historial_cursos_retirados (uid_estudiante, id_curso, lecciones,
        curso_completado, fecha_finalizacion_curso, fecha_retiro)
      VALUES ($1, $2::bigint, $3::jsonb, $4::boolean, $5::timestamptz, $6::timestamptz)
    `, [historial.uid, idCurso, JSON.stringify(historial.lecciones), historial.cursoCompletado,
      historial.fechaFinalizacionCurso, instante.fechaRetiro]), 1);
  }
  await borrarOperativos(cliente, idCurso, lecciones, pasos, progresos);
  comprobarEscritura(await cliente.query(`
    UPDATE cursos SET estado_publicacion = 'retirado'
    WHERE id_curso = $1::bigint AND estado_publicacion IN ('borrador', 'publicado')
  `, [idCurso]), 1);
  return retirado;
}

async function eliminarCurso(usuario, idCurso) {
  comprobarEditor(usuario);
  if (!esId(idCurso)) throw new ErrorReglaCurso(400, 'El identificador del curso no es válido', 'id_curso_invalido');
  const cliente = await pool.connect();
  let transaccion = false;
  let errorConexion;
  try {
    await cliente.query('BEGIN');
    transaccion = true;
    const { rows: perfiles } = await cliente.query(
      'SELECT uid, rol, activo FROM usuarios WHERE uid = $1 FOR SHARE', [usuario.uid]);
    const editor = perfiles[0];
    comprobarEditor(editor);
    if (editor.uid !== usuario.uid) throw new TypeError('El perfil no corresponde al solicitante');
    const respuesta = await eliminarEnConexion(cliente, editor, idCurso);
    await cliente.query('SET CONSTRAINTS ALL IMMEDIATE');
    await cliente.query('COMMIT');
    transaccion = false;
    return respuesta;
  } catch (error) {
    if (transaccion) {
      try { await cliente.query('ROLLBACK'); } catch (fallo) {
        errorConexion = fallo;
        console.error('No fue posible revertir la eliminación o retiro del curso');
      }
    } else errorConexion = error;
    throw error;
  } finally {
    if (errorConexion) cliente.release(errorConexion);
    else cliente.release();
  }
}

module.exports = { eliminarCurso };
