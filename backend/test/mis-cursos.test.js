const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

process.env.DATABASE_URL = 'postgresql://prueba:prueba@localhost:5432/prueba';
process.env.FIREBASE_PROJECT_ID = 'demo-viva-tech-mis-cursos';

const pool = require('../src/config/database');
const firebaseAuth = require('../src/config/firebase');
const app = require('../src/app');

let servidor;
let url;
const UID = 'uid-estudiante-prueba';

before(async () => {
  await new Promise((resolve, reject) => {
    servidor = app.listen(0, '127.0.0.1', resolve);
    servidor.once('error', reject);
  });
  url = `http://127.0.0.1:${servidor.address().port}/api/mis-cursos`;
});

after(async () => {
  if (servidor) {
    servidor.closeAllConnections();
    await new Promise((resolve, reject) => servidor.close((error) => error ? reject(error) : resolve()));
  }
  await pool.end();
});

function fila(cambios = {}) {
  return {
    idCategoria: '1', nombreCategoria: 'Banca móvil', idCurso: '10',
    titulo: 'Curso ficticio', descripcion: 'Descripción ficticia.',
    estado_publicacion: 'publicado', fecha_cierre: null,
    tieneAvance: false, tieneHistorial: false, completadoHistorico: null, certificado: null,
    lecciones: [{ idLeccion: '21', titulo: 'Lección ficticia', duracionEstimadaMinutos: 10, estado: 'pendiente' }],
    ...cambios
  };
}

function simular(t, opciones = {}) {
  const verificar = t.mock.method(firebaseAuth, 'verifyIdToken', async () => {
    if (opciones.errorToken) throw opciones.errorToken;
    return { uid: UID };
  });
  const consulta = t.mock.method(pool, 'query', async (sql, parametros) => {
    assert.deepEqual(parametros, [UID]);
    if (/FROM usuarios[\s\S]*WHERE uid = \$1/.test(sql)) {
      if (opciones.errorPerfil) throw opciones.errorPerfil;
      const rows = opciones.sinPerfil ? [] : [{
        uid: UID, nombre_completo: 'Alumno Ficticio', nombre_apodo: null,
        rol: opciones.rol || 'estudiante', activo: opciones.activo !== false
      }];
      return { rowCount: rows.length, rows };
    }
    if (opciones.errorCatalogo) throw opciones.errorCatalogo;
    const rows = opciones.filas || [];
    return { rowCount: rows.length, rows };
  });
  const conexion = t.mock.method(pool, 'connect', async () => assert.fail('No debe abrir transacción'));
  return { verificar, consulta, conexion };
}

function solicitar(sufijo = '', authorization = 'Bearer token-prueba') {
  return fetch(`${url}${sufijo}`, { headers: authorization === null ? {} : { Authorization: authorization } });
}

for (const authorization of [null, 'Basic prueba', 'Bearer', 'Bearer uno,dos']) {
  test(`GET mis cursos: rechaza autenticación mal formada ${authorization}`, async (t) => {
    const simulacion = simular(t);
    const respuesta = await solicitar('', authorization);
    assert.equal(respuesta.status, 401);
    assert.equal((await respuesta.json()).ok, false);
    assert.equal(respuesta.headers.get('cache-control'), 'no-store');
    assert.equal(simulacion.verificar.mock.callCount(), 0);
    assert.equal(simulacion.consulta.mock.callCount(), 0);
  });
}

for (const code of ['auth/invalid-id-token', 'auth/id-token-expired']) {
  test(`GET mis cursos: token rechazado por Firebase ${code} no consulta perfil`, async (t) => {
    const simulacion = simular(t, { errorToken: Object.assign(new Error('Token de prueba'), { code }) });
    const respuesta = await solicitar();
    assert.equal(respuesta.status, 401);
    assert.equal(simulacion.verificar.mock.callCount(), 1);
    assert.equal(simulacion.consulta.mock.callCount(), 0);
  });
}

for (const rol of ['maestro', 'administrador']) {
  test(`GET mis cursos: ${rol} recibe 403 antes de consultar el catálogo`, async (t) => {
    const simulacion = simular(t, { rol });
    const respuesta = await solicitar();
    assert.equal(respuesta.status, 403);
    assert.equal((await respuesta.json()).codigo, 'rol_no_autorizado');
    assert.equal(simulacion.consulta.mock.callCount(), 1);
  });
}

test('GET mis cursos: cuenta desactivada recibe 403 antes del catálogo', async (t) => {
  const simulacion = simular(t, { activo: false });
  const respuesta = await solicitar();
  assert.equal(respuesta.status, 403);
  assert.equal((await respuesta.json()).codigo, 'cuenta_desactivada');
  assert.equal(simulacion.consulta.mock.callCount(), 1);
});

test('GET mis cursos: perfil inexistente conserva 404 perfil_no_registrado', async (t) => {
  const simulacion = simular(t, { sinPerfil: true });
  const respuesta = await solicitar();
  assert.equal(respuesta.status, 404);
  assert.equal((await respuesta.json()).codigo, 'perfil_no_registrado');
  assert.equal(simulacion.consulta.mock.callCount(), 1);
});

test('GET mis cursos: estudiante activo recibe arreglo vacío y respuesta no almacenable', async (t) => {
  const simulacion = simular(t);
  const respuesta = await solicitar();
  assert.equal(respuesta.status, 200);
  assert.equal(respuesta.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await respuesta.json(), []);
  assert.equal(simulacion.consulta.mock.callCount(), 2);
  assert.equal(simulacion.conexion.mock.callCount(), 0);
});

test('GET mis cursos: respuesta real HTTP conserva contrato directo, IDs y estado', async (t) => {
  simular(t, { filas: [fila()] });
  const respuesta = await solicitar();
  assert.equal(respuesta.status, 200);
  const cuerpo = await respuesta.json();
  assert.deepEqual(cuerpo, [{
    idCategoria: '1', nombre: 'Banca móvil', cursos: [{
      idCurso: '10', titulo: 'Curso ficticio', descripcion: 'Descripción ficticia.',
      estadoCurso: 'disponible', fechaCierre: null, cursoCompletado: false, certificado: null,
      lecciones: [{ idLeccion: '21', titulo: 'Lección ficticia', duracionEstimadaMinutos: 10, estado: 'pendiente' }]
    }]
  }]);
});

test('GET mis cursos: UID y reloj enviados en query no reemplazan identidad ni fecha del servidor', async (t) => {
  const simulacion = simular(t, { filas: [fila({ fecha_cierre: '2000-01-01' })] });
  const respuesta = await solicitar('?uid=otro-alumno&ahora=1990-01-01');
  assert.equal(respuesta.status, 200);
  assert.deepEqual(await respuesta.json(), []);
  for (const llamada of simulacion.consulta.mock.calls) assert.deepEqual(llamada.arguments[1], [UID]);
});

test('GET mis cursos: cerrado aparece solo con avance y retirado solo con historial', async (t) => {
  simular(t, { filas: [
    fila({ idCurso: '10', fecha_cierre: '2000-01-01' }),
    fila({ idCurso: '11', fecha_cierre: '2000-01-01', tieneAvance: true }),
    fila({ idCurso: '12', estado_publicacion: 'retirado' }),
    fila({ idCurso: '13', estado_publicacion: 'retirado', tieneHistorial: true, completadoHistorico: true })
  ] });
  const cuerpo = await (await solicitar()).json();
  assert.deepEqual(cuerpo[0].cursos.map((curso) => curso.idCurso), ['11', '13']);
  assert.equal(cuerpo[0].cursos[0].estadoCurso, 'cerrado');
  assert.equal(cuerpo[0].cursos[1].estadoCurso, 'retirado');
  assert.equal(cuerpo[0].cursos[1].cursoCompletado, true);
  assert.deepEqual(cuerpo[0].cursos[1].lecciones, []);
});

test('GET mis cursos: fallo del catálogo devuelve 503 sin SQL ni errores internos', async (t) => {
  const detalle = 'SELECT información privada de PostgreSQL';
  const simulacion = simular(t, { errorCatalogo: new Error(detalle) });
  const registro = t.mock.method(console, 'error', () => {});
  const respuesta = await solicitar();
  assert.equal(respuesta.status, 503);
  assert.deepEqual(await respuesta.json(), {
    ok: false,
    mensaje: 'No fue posible consultar tus cursos. Intenta más tarde',
    codigo: 'mis_cursos_no_disponible'
  });
  assert.equal(simulacion.consulta.mock.callCount(), 2);
  assert.equal(registro.mock.callCount(), 1);
  assert.equal(JSON.stringify(registro.mock.calls[0].arguments).includes(detalle), false);
});

test('GET mis cursos: fallo de perfil conserva la respuesta existente y no ejecuta catálogo', async (t) => {
  const simulacion = simular(t, { errorPerfil: new Error('Fallo de perfil simulado') });
  t.mock.method(console, 'error', () => {});
  const respuesta = await solicitar();
  assert.equal(respuesta.status, 503);
  assert.equal((await respuesta.json()).ok, false);
  assert.equal(simulacion.consulta.mock.callCount(), 1);
});

test('GET mis cursos: fallo de infraestructura Firebase no consulta PostgreSQL', async (t) => {
  const simulacion = simular(t, { errorToken: Object.assign(new Error('Fallo simulado'), { code: 'app/network-error' }) });
  t.mock.method(console, 'error', () => {});
  const respuesta = await solicitar();
  assert.equal(respuesta.status, 503);
  assert.equal((await respuesta.json()).ok, false);
  assert.equal(simulacion.consulta.mock.callCount(), 0);
});
