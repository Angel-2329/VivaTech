const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

process.env.DATABASE_URL = 'postgresql://prueba:prueba@localhost:5432/prueba';

const pool = require('../src/config/database');
const { ErrorReglaCurso } = require('../src/services/reglas-cursos');
const {
  CONSULTA_RESUMENES, comprobarEstudiante, consultarResumenes, resumirCurso
} = require('../src/services/resumen-curso');
const { obtenerCursosDisponibles } = require('../src/services/cursos-disponibles');

const AHORA = new Date('2026-11-17T20:00:00.000Z');
const ESTUDIANTE = { uid: 'uid-estudiante', rol: 'estudiante', activo: true };

const leccion = (idLeccion, estado = 'pendiente', cambios = {}) => ({
  idLeccion, titulo: `Lección ${idLeccion}`, duracionEstimadaMinutos: 10, estado, ...cambios
});

function fila(cambios = {}) {
  return {
    idCategoria: '1', nombreCategoria: 'Categoría', ordenCategoria: 1,
    idCurso: '10', titulo: 'Curso', descripcion: 'Descripción.',
    estado_publicacion: 'publicado', fecha_cierre: null,
    tieneAvance: false, fechaUltimaActividad: null, fechaFinalizacionCurso: null,
    tieneHistorial: false, leccionesHistorial: null, completadoHistorico: null,
    fechaFinalizacionHistorica: null, certificado: null,
    lecciones: [leccion('21'), leccion('22')],
    ...cambios
  };
}

const historialProgreso = (orden, estado, fechaActualizacion) => ({
  idLeccion: String(20 + orden), tituloCurso: 'Curso', titulo: `Lección ${orden}`, orden,
  origen: 'progreso', estado, totalPasos: 3, pasosCompletados: estado === 'completada' ? 3 : 1,
  idUltimoPasoCompletado: '1', fechaInicio: '2026-11-01T10:00:00.000Z', fechaActualizacion,
  fechaFinalizacion: estado === 'completada' ? fechaActualizacion : null
});

function retirado(cambios = {}) {
  return fila({
    estado_publicacion: 'retirado', fecha_cierre: '2000-01-01', lecciones: [],
    tieneHistorial: true, completadoHistorico: true,
    fechaFinalizacionHistorica: '2026-11-09T12:00:00.000Z',
    leccionesHistorial: [
      historialProgreso(1, 'completada', '2026-11-08T12:00:00.000Z'),
      historialProgreso(2, 'completada', '2026-11-09T12:00:00.000Z')
    ],
    ...cambios
  });
}


test('resumirCurso: publicado sin lecciones queda sin empezar y sin siguiente lección', () => {
  const resumen = resumirCurso(fila({ lecciones: [] }), { ahora: AHORA });
  assert.equal(resumen.estado, 'sin_empezar');
  assert.equal(resumen.totalLecciones, 0);
  assert.equal(resumen.duracionTotalMinutos, 0);
  assert.equal(resumen.siguienteLeccion, null);
});

test('resumirCurso: publicado con fecha de cierre pasada queda cerrado', () => {
  const resumen = resumirCurso(fila({ fecha_cierre: '2026-11-16' }), { ahora: AHORA });
  assert.equal(resumen.cerrado, true);
  assert.equal(resumen.fechaCierre, '2026-11-16');
  assert.equal(resumirCurso(fila({ fecha_cierre: '2026-11-17' }), { ahora: AHORA }).cerrado, false);
});

test('resumirCurso: sin empezar ignora una fecha de actividad recibida', () => {
  const resumen = resumirCurso(fila({ fechaUltimaActividad: '2026-11-01T10:00:00.000Z' }), { ahora: AHORA });
  assert.equal(resumen.fechaUltimaActividad, null);
});

test('resumirCurso: fechaFinalizacion solo en terminado y tomada de la regla del certificado', () => {
  const enCurso = resumirCurso(fila({
    fechaUltimaActividad: '2026-11-02T10:00:00.000Z', fechaFinalizacionCurso: '2026-11-02T09:00:00.000Z',
    lecciones: [leccion('21', 'completada'), leccion('22')]
  }), { ahora: AHORA });
  assert.equal(enCurso.fechaFinalizacion, null);
  const terminado = resumirCurso(fila({
    fechaUltimaActividad: '2026-11-03T10:00:00.000Z', fechaFinalizacionCurso: '2026-11-03T09:00:00.123456-06:00',
    lecciones: [leccion('21', 'completada'), leccion('22', 'completada')]
  }), { ahora: AHORA });
  assert.equal(terminado.fechaFinalizacion, '2026-11-03T09:00:00.123456-06:00');
});

for (const [nombre, cambios] of [
  ['terminado sin fecha', { lecciones: [leccion('21', 'completada')] }],
  ['lecciones no es arreglo', { lecciones: null }],
  ['duración no entera', { lecciones: [leccion('21', 'pendiente', { duracionEstimadaMinutos: '10' })] }],
  ['fecha de actividad inválida', { fechaUltimaActividad: 'ayer', lecciones: [leccion('21', 'en_progreso')] }],
  ['certificado incompleto', { certificado: { idCertificado: '1', folio: 'VT-2026-000001' } }],
  ['orden de categoría ausente', { ordenCategoria: null }],
  ['borrador', { estado_publicacion: 'borrador' }]
]) {
  test(`resumirCurso: rechaza datos inconsistentes (${nombre})`, () => {
    assert.throws(() => resumirCurso(fila(cambios), { ahora: AHORA }), TypeError);
  });
}


test('resumirCurso: retirado completo con certificado usa el historial', () => {
  const certificado = { idCertificado: '5', folio: 'VT-2026-000005', codigoVerificacion: 'uuid-ficticio' };
  const resumen = resumirCurso(retirado({ certificado }), { ahora: AHORA });
  assert.deepEqual(resumen, {
    idCurso: '10', titulo: 'Curso', descripcion: 'Descripción.',
    categoria: { idCategoria: '1', nombre: 'Categoría', orden: 1 },
    estado: 'terminado', leccionesCompletadas: 2, totalLecciones: 2,
    duracionTotalMinutos: null, fechaCierre: null, cerrado: false, retirado: true,
    siguienteLeccion: null, fechaUltimaActividad: '2026-11-09T12:00:00.000Z',
    fechaFinalizacion: '2026-11-09T12:00:00.000Z', certificado
  });
});

test('resumirCurso: retirado completo sin certificado y con lecciones de origen certificado', () => {
  const resumen = resumirCurso(retirado({
    leccionesHistorial: [
      { tituloCurso: 'Curso', titulo: 'Lección 1', orden: 1, origen: 'certificado', estado: 'completada' },
      { tituloCurso: 'Curso', titulo: 'Lección 2', orden: 2, origen: 'certificado', estado: 'completada' }
    ]
  }), { ahora: AHORA });
  assert.equal(resumen.estado, 'terminado');
  assert.equal(resumen.certificado, null);
  assert.equal(resumen.fechaUltimaActividad, null);
  assert.equal(resumen.fechaFinalizacion, '2026-11-09T12:00:00.000Z');
});

test('resumirCurso: retirado incompleto queda en curso sin fecha de finalización', () => {
  const resumen = resumirCurso(retirado({
    completadoHistorico: false, fechaFinalizacionHistorica: null,
    leccionesHistorial: [
      historialProgreso(1, 'completada', '2026-11-05T12:00:00.000Z'),
      historialProgreso(2, 'en_progreso', '2026-11-06T12:00:00.000Z'),
      { ...historialProgreso(3, 'pendiente', null), fechaInicio: null }
    ]
  }), { ahora: AHORA });
  assert.deepEqual(
    [resumen.estado, resumen.leccionesCompletadas, resumen.totalLecciones, resumen.fechaFinalizacion],
    ['en_curso', 1, 3, null]
  );
  assert.equal(resumen.fechaUltimaActividad, '2026-11-06T12:00:00.000Z');
  assert.equal(resumen.siguienteLeccion, null);
});

for (const [nombre, cambios] of [
  ['sin historial', { tieneHistorial: false, leccionesHistorial: null, completadoHistorico: null }],
  ['historial vacío', { leccionesHistorial: [] }],
  ['completo sin fecha', { fechaFinalizacionHistorica: null }],
  ['estado de lección inválido', { leccionesHistorial: [{ titulo: 'L', orden: 1, estado: 'otro' }] }]
]) {
  test(`resumirCurso: retirado inconsistente (${nombre}) lanza error`, () => {
    assert.throws(() => resumirCurso(retirado(cambios), { ahora: AHORA }), TypeError);
  });
}


test('fechaFinalizacion usa la misma regla que la emisión de certificados', () => {
  const certificados = fs.readFileSync(path.join(__dirname, '../src/services/certificados.js'), 'utf8');
  const regla = 'to_jsonb(max(p.fecha_finalizacion)) AS "fechaFinalizacionCurso"';
  assert.ok(certificados.includes(`SELECT ${regla}`));
  assert.ok(CONSULTA_RESUMENES.includes(regla));
  assert.match(certificados, /FROM progresos p JOIN lecciones l ON l\.id_leccion = p\.id_leccion\s+WHERE p\.uid_estudiante = \$1 AND l\.id_curso = \$2::bigint/);
  assert.match(CONSULTA_RESUMENES, /FROM progresos p\s+JOIN lecciones l ON l\.id_leccion = p\.id_leccion\s+WHERE l\.id_curso = c\.id_curso\s+AND p\.uid_estudiante = \$1/);
  assert.ok(certificados.includes('to_jsonb(fecha_finalizacion_curso) AS "fechaFinalizacionCurso"'));
  assert.ok(CONSULTA_RESUMENES.includes('to_jsonb(h.fecha_finalizacion_curso) AS "fechaFinalizacionHistorica"'));
});


for (const [nombre, usuario, estado, codigo] of [
  ['sin perfil', null, 404, 'perfil_no_registrado'],
  ['desactivado', { ...ESTUDIANTE, activo: false }, 403, 'cuenta_desactivada'],
  ['maestro', { ...ESTUDIANTE, rol: 'maestro' }, 403, 'rol_no_autorizado'],
  ['uid vacío', { ...ESTUDIANTE, uid: ' ' }, 403, 'rol_no_autorizado']
]) {
  test(`comprobarEstudiante: ${nombre}`, () => {
    assert.throws(() => comprobarEstudiante(usuario), (error) => error instanceof ErrorReglaCurso
      && error.estado === estado && error.codigo === codigo);
  });
}

test('consultarResumenes: envía solo el uid del solicitante', async (t) => {
  const consulta = t.mock.method(pool, 'query', async () => ({ rows: [fila()] }));
  const filas = await consultarResumenes('uid-x');
  assert.equal(filas.length, 1);
  assert.equal(consulta.mock.calls[0].arguments[0], CONSULTA_RESUMENES);
  assert.deepEqual(consulta.mock.calls[0].arguments[1], ['uid-x']);
});

test('obtenerCursosDisponibles: rechaza otro rol sin consultar', async (t) => {
  const consulta = t.mock.method(pool, 'query', async () => assert.fail('No debe consultar'));
  await assert.rejects(obtenerCursosDisponibles({ ...ESTUDIANTE, rol: 'administrador' }),
    (error) => error.codigo === 'rol_no_autorizado');
  assert.equal(consulta.mock.callCount(), 0);
});

test('obtenerCursosDisponibles: usa el reloj recibido para decidir el cierre', async (t) => {
  t.mock.method(pool, 'query', async () => ({ rows: [fila({ fecha_cierre: '2026-11-16' })] }));
  assert.deepEqual(await obtenerCursosDisponibles(ESTUDIANTE, { ahora: AHORA }), []);
  const visibles = await obtenerCursosDisponibles(ESTUDIANTE, { ahora: new Date('2026-11-16T12:00:00.000Z') });
  assert.equal(visibles[0].cursos[0].cerrado, false);
});
