const { test, after } = require('node:test');
const assert = require('node:assert/strict');
process.env.DATABASE_URL = 'postgresql://prueba:prueba@localhost:5432/prueba';
const pool = require('../src/config/database');
const { verificarCertificado } = require('../src/services/certificados');
const { ErrorReglaCurso } = require('../src/services/reglas-cursos');

const CODIGO = '7b604b92-7f81-4d56-b117-d2bc14dd1ab2';
const PUBLICO = {
  nombreCompleto: 'Persona ficticia', tituloCurso: 'Curso ficticio',
  lecciones: [{ titulo: 'Primera' }, { titulo: 'Segunda' }, { titulo: 'Tercera' }],
  folio: 'VT-2026-000007',
  fechaFinalizacionCurso: '2026-11-15T12:00:00.123789-06:00',
  fechaEmision: '2026-11-15T13:00:00.987654-06:00',
  duracionMinutos: 37
};

after(async () => { await pool.end(); });

function simular(t, opciones = {}) {
  const llamadas = [];
  t.mock.method(pool, 'connect', async () => assert.fail('La verificación no debe abrir transacciones'));
  t.mock.method(pool, 'query', async (sql, parametros) => {
    llamadas.push({ sql: sql.trim(), parametros });
    if (opciones.error) throw new Error('Detalle SQL privado');
    return { rows: structuredClone(opciones.filas ?? [PUBLICO]) };
  });
  return { llamadas };
}

const noEncontrado = (e) => e instanceof ErrorReglaCurso && e.estado === 404 && e.codigo === 'certificado_no_encontrado';

test('Verificar servicio: devuelve solo los siete campos públicos en orden de lecciones', async (t) => {
  const s = simular(t);
  const resultado = await verificarCertificado(CODIGO);
  assert.deepEqual(resultado, PUBLICO);
  assert.deepEqual(Object.keys(resultado).sort(),
    ['duracionMinutos', 'fechaEmision', 'fechaFinalizacionCurso', 'folio', 'lecciones', 'nombreCompleto', 'tituloCurso']);
  assert.equal(s.llamadas.length, 1);
});

test('Verificar servicio: certificado anterior devuelve duracionMinutos null', async (t) => {
  simular(t, { filas: [{ ...PUBLICO, duracionMinutos: null }] });
  const resultado = await verificarCertificado(CODIGO);
  assert.equal(resultado.duracionMinutos, null);
  assert.ok(Object.hasOwn(resultado, 'duracionMinutos'));
});

test('Verificar servicio: SQL usa parámetro uuid y no selecciona identificadores privados', async (t) => {
  const s = simular(t);
  await verificarCertificado(CODIGO);
  const { sql, parametros } = s.llamadas[0];
  assert.deepEqual(parametros, [CODIGO]);
  assert.match(sql, /WHERE codigo_verificacion = \$1::uuid/);
  const seleccion = sql.split('FROM')[0];
  assert.doesNotMatch(seleccion, /uid_estudiante|id_curso|id_certificado|codigo_verificacion|telefono/);
  assert.doesNotMatch(sql, /JOIN|usuarios|FOR SHARE|FOR UPDATE/);
});

test('Verificar servicio: filtra campos extra de la fila', async (t) => {
  simular(t, { filas: [{ ...PUBLICO, uid: 'uid-privado', idCurso: '10', idCertificado: '7', telefono: '+520000000000',
    codigoVerificacion: CODIGO, lecciones: PUBLICO.lecciones.map((l, i) => ({ ...l, idLeccion: String(i + 1), orden: i + 1 })) }] });
  const resultado = await verificarCertificado(CODIGO);
  assert.deepEqual(resultado, PUBLICO);
  assert.doesNotMatch(JSON.stringify(resultado), /uid-privado|idCurso|idCertificado|telefono|idLeccion|orden|codigoVerificacion/);
});

test('Verificar servicio: acepta mayúsculas y consulta en minúsculas', async (t) => {
  const s = simular(t);
  await verificarCertificado(CODIGO.toUpperCase());
  assert.deepEqual(s.llamadas[0].parametros, [CODIGO]);
});

for (const invalido of ['', ' ', CODIGO.replaceAll('-', ''), `{${CODIGO}}`, CODIGO.slice(1), `${CODIGO}0`,
  CODIGO.replace('7b', '7g'), `${CODIGO.slice(0, -1)}'`, "' OR '1'='1", 'códigoñ', ` ${CODIGO}`, null, undefined, 123]) {
  test(`Verificar servicio: código inválido ${JSON.stringify(invalido)} da 404 sin consultar`, async (t) => {
    const s = simular(t);
    await assert.rejects(verificarCertificado(invalido), noEncontrado);
    assert.equal(s.llamadas.length, 0);
  });
}

test('Verificar servicio: código inexistente da 404', async (t) => {
  simular(t, { filas: [] });
  await assert.rejects(verificarCertificado(CODIGO), noEncontrado);
});

test('Verificar servicio: filas duplicadas son inconsistencia', async (t) => {
  simular(t, { filas: [PUBLICO, PUBLICO] });
  await assert.rejects(verificarCertificado(CODIGO), TypeError);
});

for (const cambio of [{ lecciones: [] }, { lecciones: null }, { lecciones: [{ titulo: '' }] }, { lecciones: [null] },
  { tituloCurso: ' ' }, { nombreCompleto: '' }, { folio: '' }, { fechaEmision: 'no-fecha' },
  { fechaFinalizacionCurso: null }, { duracionMinutos: 0 }, { duracionMinutos: -1 }, { duracionMinutos: 1.5 },
  { duracionMinutos: '37' }, { duracionMinutos: undefined }]) {
  test(`Verificar servicio: fila inconsistente ${JSON.stringify(cambio)} lanza TypeError`, async (t) => {
    simular(t, { filas: [{ ...PUBLICO, ...cambio }] });
    await assert.rejects(verificarCertificado(CODIGO), TypeError);
  });
}

test('Verificar servicio: fallo SQL se propaga sin transacción', async (t) => {
  const s = simular(t, { error: true });
  await assert.rejects(verificarCertificado(CODIGO), /Detalle SQL privado/);
  assert.equal(s.llamadas.length, 1);
});
