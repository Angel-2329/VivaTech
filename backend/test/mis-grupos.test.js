const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

process.env.DATABASE_URL = 'postgresql://prueba:prueba@localhost:5432/prueba';
process.env.FIREBASE_PROJECT_ID = 'demo-viva-tech-mis-grupos';

const pool = require('../src/config/database');
const firebaseAuth = require('../src/config/firebase');
const app = require('../src/app');
const { agruparFilas, CONSULTA_MIS_GRUPOS } = require('../src/services/mis-grupos');

let servidor;
let base;
const UID = 'uid-estudiante-prueba';
const UID_OTRO = 'uid-otro-estudiante';

before(async () => {
  await new Promise((resolve, reject) => {
    servidor = app.listen(0, '127.0.0.1', resolve);
    servidor.once('error', reject);
  });
  base = `http://127.0.0.1:${servidor.address().port}/api/mis-grupos`;
});

after(async () => {
  if (servidor) {
    servidor.closeAllConnections();
    await new Promise((resolve, reject) => servidor.close((error) => error ? reject(error) : resolve()));
  }
  await pool.end();
});

const fila = (idGrupo, nombre, nombreMaestro = null, maestroActivo = nombreMaestro !== null, extra = {}) => ({
  idGrupo, nombre, nombreMaestro, maestroActivo, ...extra
});

function simular(t, opciones = {}) {
  const uidToken = opciones.uid || UID;
  const verificar = t.mock.method(firebaseAuth, 'verifyIdToken', async () => {
    if (opciones.errorToken) throw opciones.errorToken;
    return { uid: uidToken };
  });
  const consultasGrupos = [];
  const consulta = t.mock.method(pool, 'query', async (sql, parametros) => {
    assert.deepEqual(parametros, [uidToken]);
    if (/FROM usuarios[\s\S]*WHERE uid = \$1/.test(sql)) {
      const rows = opciones.sinPerfil ? [] : [{
        uid: uidToken, nombre_completo: 'Alumno Ficticio', nombre_apodo: null,
        rol: opciones.rol || 'estudiante', activo: opciones.activo !== false
      }];
      return { rowCount: rows.length, rows };
    }
    assert.match(sql, /FROM grupo_estudiantes/);
    consultasGrupos.push(sql);
    if (opciones.errorGrupos) throw opciones.errorGrupos;
    const origen = opciones.filas || [];
    const rows = typeof origen === 'function' ? origen(parametros[0]) : origen;
    return { rowCount: rows.length, rows };
  });
  t.mock.method(pool, 'connect', async () => assert.fail('No debe abrir transacción'));
  return { verificar, consulta, consultasGrupos };
}

function solicitar(authorization = 'Bearer token-prueba') {
  return fetch(base, { headers: authorization === null ? {} : { Authorization: authorization } });
}

async function listar(t, opciones = {}) {
  const simulacion = simular(t, opciones);
  const respuesta = await solicitar();
  assert.equal(respuesta.status, 200);
  assert.equal(respuesta.headers.get('cache-control'), 'no-store');
  return { cuerpo: await respuesta.json(), simulacion };
}

function sinUid(valor) {
  if (Array.isArray(valor)) return valor.every(sinUid);
  if (valor && typeof valor === 'object') {
    return Object.entries(valor).every(([clave, v]) => !/uid|telefono|phone|total|estudiantes/i.test(clave) && sinUid(v));
  }
  return true;
}

test('GET mis-grupos: varios grupos con la forma exacta del contrato', async (t) => {
  const { cuerpo, simulacion } = await listar(t, {
    filas: [
      fila('7', 'Grupo matutino', 'Maestra de Ejemplo'),
      fila('9', 'Grupo sabatino')
    ]
  });
  assert.deepEqual(cuerpo, [
    { idGrupo: '7', nombre: 'Grupo matutino', maestros: [{ nombreCompleto: 'Maestra de Ejemplo' }] },
    { idGrupo: '9', nombre: 'Grupo sabatino', maestros: [] }
  ]);
  assert.equal(simulacion.consultasGrupos.length, 1);
});

test('GET mis-grupos: varios maestros por grupo conservan el orden de la consulta', async (t) => {
  const { cuerpo } = await listar(t, {
    filas: [
      fila('3', 'alfa', 'Ana Ficticia'),
      fila('3', 'alfa', 'Beto Ficticio'),
      fila('1', 'Beta', 'Carla Ficticia')
    ]
  });
  assert.deepEqual(cuerpo, [
    { idGrupo: '3', nombre: 'alfa', maestros: [{ nombreCompleto: 'Ana Ficticia' }, { nombreCompleto: 'Beto Ficticio' }] },
    { idGrupo: '1', nombre: 'Beta', maestros: [{ nombreCompleto: 'Carla Ficticia' }] }
  ]);
});

test('GET mis-grupos: sin grupos responde []', async (t) => {
  const { cuerpo } = await listar(t, { filas: [] });
  assert.deepEqual(cuerpo, []);
});

test('GET mis-grupos: el maestro desactivado queda excluido', async (t) => {
  const { cuerpo } = await listar(t, {
    filas: [
      fila('7', 'Grupo matutino', 'Maestro Desactivado', false),
      fila('7', 'Grupo matutino', 'Maestra Activa', true)
    ]
  });
  assert.deepEqual(cuerpo, [
    { idGrupo: '7', nombre: 'Grupo matutino', maestros: [{ nombreCompleto: 'Maestra Activa' }] }
  ]);
});

test('GET mis-grupos: grupo cuyo único maestro está desactivado o sin maestros → maestros []', async (t) => {
  const { cuerpo } = await listar(t, {
    filas: [
      fila('7', 'Grupo matutino', 'Maestro Desactivado', false),
      fila('8', 'Grupo vespertino', null, null)
    ]
  });
  assert.deepEqual(cuerpo, [
    { idGrupo: '7', nombre: 'Grupo matutino', maestros: [] },
    { idGrupo: '8', nombre: 'Grupo vespertino', maestros: [] }
  ]);
});

test('GET mis-grupos: no expone uid, teléfono, totales ni otros estudiantes aunque la consulta los traiga', async (t) => {
  const { cuerpo } = await listar(t, {
    filas: [fila('7', 'Grupo matutino', 'Maestra de Ejemplo', true, {
      uid: 'uid-maestra', uidMaestro: 'uid-maestra', telefono: '+520000000000',
      totalEstudiantes: 12, estudiantes: [{ uid: UID_OTRO }]
    })]
  });
  assert.ok(sinUid(cuerpo));
  assert.deepEqual(Object.keys(cuerpo[0]), ['idGrupo', 'nombre', 'maestros']);
  assert.deepEqual(Object.keys(cuerpo[0].maestros[0]), ['nombreCompleto']);
  assert.ok(!JSON.stringify(cuerpo).includes('uid-'));
});

test('GET mis-grupos: idGrupo siempre como cadena', () => {
  assert.deepEqual(agruparFilas([fila(7, 'Grupo')]), [{ idGrupo: '7', nombre: 'Grupo', maestros: [] }]);
});

test('GET mis-grupos: la consulta filtra por el solicitante, solo maestros activos y define el orden', () => {
  assert.match(CONSULTA_MIS_GRUPOS, /WHERE ge\.uid_estudiante = \$1/);
  assert.match(CONSULTA_MIS_GRUPOS, /u\.activo = true/);
  assert.match(CONSULTA_MIS_GRUPOS, /u\.rol = 'maestro'/);
  assert.match(CONSULTA_MIS_GRUPOS, /ORDER BY lower\(g\.nombre\), g\.id_grupo, lower\(u\.nombre_completo\), u\.uid/);
});

test('GET mis-grupos: aislamiento entre estudiantes', async (t) => {
  const porUid = {
    [UID]: [fila('7', 'Grupo matutino', 'Maestra de Ejemplo')],
    [UID_OTRO]: [fila('9', 'Grupo sabatino')]
  };
  const propio = await listar(t, { filas: (uid) => porUid[uid] });
  assert.deepEqual(propio.cuerpo.map((g) => g.idGrupo), ['7']);
  t.mock.restoreAll();
  const otro = await listar(t, { uid: UID_OTRO, filas: (uid) => porUid[uid] });
  assert.deepEqual(otro.cuerpo.map((g) => g.idGrupo), ['9']);
});

for (const authorization of [null, 'Basic prueba', 'Bearer', 'Bearer uno,dos']) {
  test(`GET mis-grupos: 401 con autenticación mal formada ${authorization}`, async (t) => {
    const simulacion = simular(t);
    const respuesta = await solicitar(authorization);
    assert.equal(respuesta.status, 401);
    assert.equal((await respuesta.json()).ok, false);
    assert.equal(respuesta.headers.get('cache-control'), 'no-store');
    assert.equal(simulacion.verificar.mock.callCount(), 0);
    assert.equal(simulacion.consulta.mock.callCount(), 0);
  });
}

test('GET mis-grupos: 401 con token rechazado por Firebase', async (t) => {
  const simulacion = simular(t, { errorToken: Object.assign(new Error('Token de prueba'), { code: 'auth/id-token-expired' }) });
  const respuesta = await solicitar();
  assert.equal(respuesta.status, 401);
  assert.equal(respuesta.headers.get('cache-control'), 'no-store');
  assert.equal(simulacion.consulta.mock.callCount(), 0);
});

for (const rol of ['maestro', 'administrador']) {
  test(`GET mis-grupos: ${rol} recibe 403 rol_no_autorizado sin consultar grupos`, async (t) => {
    const simulacion = simular(t, { rol });
    const respuesta = await solicitar();
    assert.equal(respuesta.status, 403);
    assert.equal(respuesta.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await respuesta.json(), {
      ok: false, mensaje: 'No tienes permisos para realizar esta acción', codigo: 'rol_no_autorizado'
    });
    assert.equal(simulacion.consultasGrupos.length, 0);
  });
}

for (const [opciones, estado, codigo] of [
  [{ sinPerfil: true }, 404, 'perfil_no_registrado'],
  [{ activo: false }, 403, 'cuenta_desactivada']
]) {
  test(`GET mis-grupos: ${codigo} sin consultar grupos`, async (t) => {
    const simulacion = simular(t, opciones);
    const respuesta = await solicitar();
    assert.equal(respuesta.status, estado);
    assert.equal((await respuesta.json()).codigo, codigo);
    assert.equal(simulacion.consultasGrupos.length, 0);
  });
}

test('GET mis-grupos: 503 grupos_no_disponibles si falla la base', async (t) => {
  t.mock.method(console, 'error', () => {});
  simular(t, { errorGrupos: new Error('fallo simulado') });
  const respuesta = await solicitar();
  assert.equal(respuesta.status, 503);
  assert.equal(respuesta.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await respuesta.json(), {
    ok: false, mensaje: 'No fue posible consultar tus grupos. Intenta más tarde', codigo: 'grupos_no_disponibles'
  });
});
