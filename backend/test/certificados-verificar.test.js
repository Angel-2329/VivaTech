const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
process.env.DATABASE_URL = 'postgresql://prueba:prueba@localhost:5432/prueba';
process.env.FIREBASE_PROJECT_ID = 'demo-viva-tech-verificar';
const pool = require('../src/config/database');
const firebaseAuth = require('../src/config/firebase');
const app = require('../src/app');

const CODIGO = '7b604b92-7f81-4d56-b117-d2bc14dd1ab2';
const PUBLICO = {
  nombreCompleto: 'Persona ficticia', tituloCurso: 'Curso ficticio',
  lecciones: [{ titulo: 'Lección ficticia' }], folio: 'VT-2026-000007',
  fechaFinalizacionCurso: '2026-11-15T12:00:00.123789-06:00',
  fechaEmision: '2026-11-15T13:00:00.987654-06:00',
  duracionMinutos: 37
};
let servidor;
let origen;

before(async () => {
  await new Promise((resolve, reject) => {
    servidor = app.listen(0, '127.0.0.1', resolve);
    servidor.once('error', reject);
  });
  origen = `http://127.0.0.1:${servidor.address().port}`;
});
after(async () => {
  if (servidor) {
    servidor.closeAllConnections();
    await new Promise((resolve, reject) => servidor.close((e) => e ? reject(e) : resolve()));
  }
  await pool.end();
});

function simular(t, opciones = {}) {
  const verificar = t.mock.method(firebaseAuth, 'verifyIdToken', async () => ({ uid: 'uid-privado' }));
  t.mock.method(pool, 'connect', async () => assert.fail('No se esperaba conexión transaccional'));
  const consulta = t.mock.method(pool, 'query', async (sql) => {
    assert.match(sql, /FROM certificados WHERE codigo_verificacion = \$1::uuid/);
    if (opciones.error) throw new Error('Detalle privado SQL');
    return { rows: opciones.vacio ? [] : [{ ...PUBLICO, uid: 'uid-privado', idCurso: '10', idCertificado: '7' }] };
  });
  return { verificar, consulta };
}

function solicitar({ codigo = CODIGO, ruta, metodo = 'GET', token = null } = {}) {
  return fetch(`${origen}${ruta ?? `/api/certificados/verificar/${encodeURIComponent(codigo)}`}`, {
    method: metodo, headers: token === null ? {} : { Authorization: token }
  });
}

async function comprobarError(respuesta, estado, codigo) {
  assert.equal(respuesta.status, estado);
  assert.equal(respuesta.headers.get('cache-control'), 'no-store');
  const cuerpo = await respuesta.json();
  assert.deepEqual(Object.keys(cuerpo).sort(), ['codigo', 'mensaje', 'ok']);
  assert.equal(cuerpo.ok, false);
  assert.equal(cuerpo.codigo, codigo);
  assert.equal(typeof cuerpo.mensaje, 'string');
  assert.doesNotMatch(JSON.stringify(cuerpo), /Detalle privado|SELECT|postgresql:\/\/|uid-privado/);
  return cuerpo;
}

test('Verificar HTTP: público sin token devuelve 200 con contrato mínimo y no-store', async (t) => {
  const s = simular(t);
  const respuesta = await solicitar();
  assert.equal(respuesta.status, 200);
  assert.equal(respuesta.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await respuesta.json(), PUBLICO);
  assert.equal(s.verificar.mock.callCount(), 0);
  assert.deepEqual(s.consulta.mock.calls[0].arguments[1], [CODIGO]);
});

test('Verificar HTTP: ignora Authorization inválido sin llamar a Firebase', async (t) => {
  const s = simular(t);
  const respuesta = await solicitar({ token: 'Bearer token-falso' });
  assert.equal(respuesta.status, 200);
  assert.deepEqual(await respuesta.json(), PUBLICO);
  assert.equal(s.verificar.mock.callCount(), 0);
});

test('Verificar HTTP: inválido e inexistente devuelven el mismo 404', async (t) => {
  const s = simular(t, { vacio: true });
  const inexistente = await comprobarError(await solicitar(), 404, 'certificado_no_encontrado');
  const invalido = await comprobarError(await solicitar({ codigo: 'no-es-uuid' }), 404, 'certificado_no_encontrado');
  assert.deepEqual(invalido, inexistente);
  assert.equal(s.consulta.mock.callCount(), 1);
});

for (const codigo of [CODIGO.replaceAll('-', ''), `{${CODIGO}}`, "' OR '1'='1", 'código']) {
  test(`Verificar HTTP: formato ${JSON.stringify(codigo)} da 404 sin consultar`, async (t) => {
    const s = simular(t);
    await comprobarError(await solicitar({ codigo }), 404, 'certificado_no_encontrado');
    assert.equal(s.consulta.mock.callCount(), 0);
  });
}

test('Verificar HTTP: error SQL devuelve 503 sin detalles', async (t) => {
  simular(t, { error: true });
  t.mock.method(console, 'error', () => {});
  await comprobarError(await solicitar(), 503, 'verificacion_no_disponible');
});

for (const metodo of ['POST', 'PUT', 'PATCH', 'DELETE']) {
  test(`Verificar HTTP: ${metodo} no está permitido`, async (t) => {
    const s = simular(t);
    const respuesta = await solicitar({ metodo });
    assert.equal(respuesta.status, 404);
    assert.equal(s.consulta.mock.callCount(), 0);
  });
}

for (const ruta of ['/api/certificados', '/api/certificados/verificar', `/api/certificados/${CODIGO}`]) {
  test(`Verificar HTTP: ruta no pública ${ruta} no responde datos`, async (t) => {
    const s = simular(t);
    const respuesta = await solicitar({ ruta });
    assert.equal(respuesta.status, 404);
    assert.equal(s.consulta.mock.callCount(), 0);
  });
}

for (const [metodo, ruta] of [['GET', '/api/mis-certificados'], ['POST', '/api/cursos/10/certificado']]) {
  test(`Verificar HTTP: regresión ${metodo} ${ruta} sigue exigiendo token`, async (t) => {
    const s = simular(t);
    const respuesta = await solicitar({ metodo, ruta });
    assert.equal(respuesta.status, 401);
    assert.equal(s.verificar.mock.callCount(), 0);
    assert.equal(s.consulta.mock.callCount(), 0);
  });
}
