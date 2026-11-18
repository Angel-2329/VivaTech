const pool = require('../config/database');
const { ErrorReglaCurso } = require('./reglas-cursos');

const MAXIMO_ID = '9223372036854775807';
const esId = (valor) => typeof valor === 'string' && /^[1-9][0-9]{0,18}$/.test(valor)
  && (valor.length < MAXIMO_ID.length || valor <= MAXIMO_ID);
const esTexto = (valor) => typeof valor === 'string' && valor.trim().length > 0;
const esInstante = (valor) => typeof valor === 'string' && Number.isFinite(Date.parse(valor));

const COLUMNAS = `
  id_certificado::text AS "idCertificado", id_curso::text AS "idCurso",
  folio, codigo_verificacion::text AS "codigoVerificacion",
  nombre_en_certificado AS "nombreCompleto",
  titulo_curso_en_certificado AS "tituloCurso",
  lecciones_en_certificado AS lecciones,
  to_jsonb(fecha_finalizacion_curso) AS "fechaFinalizacionCurso",
  to_jsonb(fecha_emision) AS "fechaEmision"
`;

function comprobarEstudiante(usuario) {
  if (!usuario) throw new ErrorReglaCurso(404, 'El perfil todavía no está registrado', 'perfil_no_registrado');
  if (usuario.activo !== true) throw new ErrorReglaCurso(403, 'La cuenta está desactivada', 'cuenta_desactivada');
  if (usuario.rol !== 'estudiante' || !esTexto(usuario.uid) || usuario.uid.length > 128) {
    throw new ErrorReglaCurso(403, 'No tienes permisos para realizar esta acción', 'rol_no_autorizado');
  }
}

function incompleto() {
  return new ErrorReglaCurso(409, 'Primero termina todas las lecciones del curso', 'curso_incompleto');
}

function exigirHistorial(condicion) {
  if (!condicion) {
    throw new ErrorReglaCurso(409, 'La evidencia de finalización del curso requiere revisión', 'historial_inconsistente');
  }
}

function recursoCertificado(fila) {
  if (!fila || !esId(fila.idCertificado) || !esId(fila.idCurso)
    || !esTexto(fila.folio) || !esTexto(fila.codigoVerificacion)
    || !esTexto(fila.nombreCompleto) || !esTexto(fila.tituloCurso)
    || !Array.isArray(fila.lecciones) || fila.lecciones.length === 0
    || fila.lecciones.some((leccion) => !leccion || !esTexto(leccion.titulo))
    || !esInstante(fila.fechaFinalizacionCurso) || !esInstante(fila.fechaEmision)) {
    throw new TypeError('El certificado almacenado es inconsistente');
  }
  return {
    idCertificado: fila.idCertificado, idCurso: fila.idCurso,
    folio: fila.folio, codigoVerificacion: fila.codigoVerificacion,
    nombreCompleto: fila.nombreCompleto, tituloCurso: fila.tituloCurso,
    lecciones: fila.lecciones.map(({ titulo }) => ({ titulo })),
    fechaFinalizacionCurso: fila.fechaFinalizacionCurso, fechaEmision: fila.fechaEmision
  };
}

async function conEstudiante(usuario, operacion) {
  comprobarEstudiante(usuario);
  const cliente = await pool.connect();
  let transaccion = false;
  let errorConexion;
  try {
    await cliente.query('BEGIN');
    transaccion = true;
    const { rows } = await cliente.query(`
      SELECT uid, rol, activo, nombre_completo
      FROM usuarios WHERE uid = $1 FOR SHARE
    `, [usuario.uid]);
    comprobarEstudiante(rows[0]);
    if (rows.length !== 1 || rows[0].uid !== usuario.uid) throw new TypeError('Perfil inesperado');
    const respuesta = await operacion(cliente, rows[0]);
    await cliente.query('COMMIT');
    transaccion = false;
    return respuesta;
  } catch (error) {
    if (transaccion) {
      try { await cliente.query('ROLLBACK'); } catch (fallo) {
        errorConexion = fallo;
        console.error('No fue posible revertir la operación de certificados');
      }
    } else errorConexion = error;
    throw error;
  } finally {
    if (errorConexion) cliente.release(errorConexion);
    else cliente.release();
  }
}

async function evidenciaPublicada(cliente, uid, curso) {
  const { rows: lecciones } = await cliente.query(`
    SELECT l.id_leccion::text AS "idLeccion", l.titulo, l.orden,
      p.estado, p.id_ultimo_paso_completado::text AS "ultimoCompletado",
      to_jsonb(p.fecha_finalizacion) AS "fechaFinalizacion",
      (SELECT count(*)::integer FROM pasos pa WHERE pa.id_leccion = l.id_leccion) AS "totalPasos",
      (SELECT pa.id_paso::text FROM pasos pa WHERE pa.id_leccion = l.id_leccion
       ORDER BY pa.orden DESC, pa.id_paso DESC LIMIT 1) AS "ultimoPaso"
    FROM lecciones l
    LEFT JOIN progresos p ON p.id_leccion = l.id_leccion AND p.uid_estudiante = $1
    WHERE l.id_curso = $2::bigint ORDER BY l.orden, l.id_leccion
  `, [uid, curso.idCurso]);
  if (!lecciones.length || lecciones.some((leccion) => leccion.estado !== 'completada')) throw incompleto();
  for (const leccion of lecciones) {
    exigirHistorial(esId(leccion.idLeccion) && esTexto(leccion.titulo)
      && Number.isInteger(leccion.totalPasos) && leccion.totalPasos > 0
      && esId(leccion.ultimoPaso) && leccion.ultimoCompletado === leccion.ultimoPaso
      && esInstante(leccion.fechaFinalizacion));
  }
  const { rows: maximos } = await cliente.query(`
    SELECT to_jsonb(max(p.fecha_finalizacion)) AS "fechaFinalizacionCurso"
    FROM progresos p JOIN lecciones l ON l.id_leccion = p.id_leccion
    WHERE p.uid_estudiante = $1 AND l.id_curso = $2::bigint
  `, [uid, curso.idCurso]);
  const fecha = maximos[0]?.fechaFinalizacionCurso;
  exigirHistorial(esInstante(fecha) && esTexto(curso.titulo));
  return { tituloCurso: curso.titulo, lecciones: lecciones.map(({ titulo }) => ({ titulo })), fecha };
}

async function evidenciaRetirada(cliente, uid, idCurso) {
  const { rows } = await cliente.query(`
    SELECT lecciones, curso_completado AS "cursoCompletado",
      to_jsonb(fecha_finalizacion_curso) AS "fechaFinalizacionCurso"
    FROM historial_cursos_retirados WHERE uid_estudiante = $1 AND id_curso = $2::bigint
  `, [uid, idCurso]);
  if (!rows.length || rows[0].cursoCompletado === false) throw incompleto();
  const historial = rows[0];
  exigirHistorial(rows.length === 1 && historial.cursoCompletado === true
    && esInstante(historial.fechaFinalizacionCurso) && Array.isArray(historial.lecciones)
    && historial.lecciones.length >= 1 && historial.lecciones.length <= 10);
  const ordenes = new Set();
  const ids = new Set();
  let tituloCurso;
  for (const leccion of historial.lecciones) {
    exigirHistorial(leccion && esTexto(leccion.titulo) && esTexto(leccion.tituloCurso)
      && Number.isInteger(leccion.orden) && leccion.orden > 0 && !ordenes.has(leccion.orden)
      && leccion.estado === 'completada' && ['progreso', 'certificado'].includes(leccion.origen));
    ordenes.add(leccion.orden);
    tituloCurso ??= leccion.tituloCurso;
    exigirHistorial(leccion.tituloCurso === tituloCurso);
    if (Object.hasOwn(leccion, 'idLeccion')) {
      exigirHistorial(esId(leccion.idLeccion) && !ids.has(leccion.idLeccion));
      ids.add(leccion.idLeccion);
    }
    if (leccion.origen === 'progreso') {
      exigirHistorial(esId(leccion.idLeccion) && Number.isInteger(leccion.totalPasos)
        && leccion.totalPasos > 0 && leccion.pasosCompletados === leccion.totalPasos
        && esId(leccion.idUltimoPasoCompletado) && esInstante(leccion.fechaFinalizacion));
    }
  }
  return {
    tituloCurso,
    lecciones: [...historial.lecciones].sort((a, b) => a.orden - b.orden).map(({ titulo }) => ({ titulo })),
    fecha: historial.fechaFinalizacionCurso
  };
}

async function emitirCertificado(usuario, idCurso) {
  comprobarEstudiante(usuario);
  if (!esId(idCurso)) throw new ErrorReglaCurso(400, 'El identificador del curso no es válido', 'id_curso_invalido');
  return conEstudiante(usuario, async (cliente, estudiante) => {
    const { rows: cursos } = await cliente.query(`
      SELECT id_curso::text AS "idCurso", titulo, estado_publicacion
      FROM cursos WHERE id_curso = $1::bigint FOR UPDATE
    `, [idCurso]);
    if (!cursos.length) throw new ErrorReglaCurso(404, 'El curso no está disponible', 'curso_no_encontrado');
    if (cursos.length !== 1 || cursos[0].idCurso !== idCurso) throw new TypeError('Curso inesperado');
    const { rows: existentes } = await cliente.query(`
      SELECT ${COLUMNAS} FROM certificados WHERE uid_estudiante = $1 AND id_curso = $2::bigint
    `, [estudiante.uid, idCurso]);
    if (existentes.length > 1) throw new TypeError('Certificado duplicado');
    if (existentes.length) return { creado: false, certificado: recursoCertificado(existentes[0]) };
    const curso = cursos[0];
    let evidencia;
    if (curso.estado_publicacion === 'publicado') evidencia = await evidenciaPublicada(cliente, estudiante.uid, curso);
    else if (curso.estado_publicacion === 'retirado') evidencia = await evidenciaRetirada(cliente, estudiante.uid, idCurso);
    else if (curso.estado_publicacion === 'borrador') {
      throw new ErrorReglaCurso(404, 'El curso no está disponible', 'curso_no_encontrado');
    } else throw new TypeError('Estado del curso inesperado');
    if (!esTexto(estudiante.nombre_completo) || Array.from(estudiante.nombre_completo).length > 100) {
      throw new TypeError('El perfil no contiene un nombre válido');
    }
    const { rows: emitidos, rowCount } = await cliente.query(`
      INSERT INTO certificados (uid_estudiante, id_curso, nombre_en_certificado,
        titulo_curso_en_certificado, lecciones_en_certificado, fecha_finalizacion_curso, fecha_emision)
      VALUES ($1, $2::bigint, $3, $4, $5::jsonb, $6::timestamptz, clock_timestamp())
      RETURNING ${COLUMNAS}
    `, [estudiante.uid, idCurso, estudiante.nombre_completo, evidencia.tituloCurso,
      JSON.stringify(evidencia.lecciones), evidencia.fecha]);
    if (rowCount !== 1 || emitidos.length !== 1) throw new TypeError('La emisión no devolvió un certificado único');
    return { creado: true, certificado: recursoCertificado(emitidos[0]) };
  });
}

async function listarMisCertificados(usuario) {
  return conEstudiante(usuario, async (cliente, estudiante) => {
    const { rows } = await cliente.query(`
      SELECT ${COLUMNAS} FROM certificados WHERE uid_estudiante = $1
      ORDER BY fecha_emision DESC, id_certificado DESC
    `, [estudiante.uid]);
    return rows.map(recursoCertificado);
  });
}

const UUID_CANONICO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function noEncontrado() {
  return new ErrorReglaCurso(404, 'No encontramos un certificado con ese código', 'certificado_no_encontrado');
}

function recursoPublico(fila) {
  if (!fila || !esTexto(fila.folio) || !esTexto(fila.nombreCompleto) || !esTexto(fila.tituloCurso)
    || !Array.isArray(fila.lecciones) || fila.lecciones.length === 0
    || fila.lecciones.some((leccion) => !leccion || !esTexto(leccion.titulo))
    || !esInstante(fila.fechaFinalizacionCurso) || !esInstante(fila.fechaEmision)) {
    throw new TypeError('El certificado almacenado es inconsistente');
  }
  return {
    nombreCompleto: fila.nombreCompleto, tituloCurso: fila.tituloCurso,
    lecciones: fila.lecciones.map(({ titulo }) => ({ titulo })),
    folio: fila.folio,
    fechaFinalizacionCurso: fila.fechaFinalizacionCurso, fechaEmision: fila.fechaEmision
  };
}

async function verificarCertificado(codigo) {
  if (typeof codigo !== 'string' || !UUID_CANONICO.test(codigo)) throw noEncontrado();
  const { rows } = await pool.query(`
    SELECT folio, nombre_en_certificado AS "nombreCompleto",
      titulo_curso_en_certificado AS "tituloCurso",
      lecciones_en_certificado AS lecciones,
      to_jsonb(fecha_finalizacion_curso) AS "fechaFinalizacionCurso",
      to_jsonb(fecha_emision) AS "fechaEmision"
    FROM certificados WHERE codigo_verificacion = $1::uuid
  `, [codigo.toLowerCase()]);
  if (!rows.length) throw noEncontrado();
  if (rows.length !== 1) throw new TypeError('Código de verificación duplicado');
  return recursoPublico(rows[0]);
}

module.exports = { emitirCertificado, listarMisCertificados, verificarCertificado };
