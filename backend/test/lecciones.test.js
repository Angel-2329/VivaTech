const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

process.env.DATABASE_URL = 'postgresql://prueba:prueba@localhost:5432/prueba';
process.env.FIREBASE_PROJECT_ID = 'demo-viva-tech-lecciones';

const pool = require('../src/config/database');
const firebaseAuth = require('../src/config/firebase');
const app = require('../src/app');

const UID = 'uid-estudiante-prueba';
let servidor;
let url;

before(async () => {
  await new Promise((resolve, reject) => {
    servidor = app.listen(0, '127.0.0.1', resolve);
    servidor.once('error', reject);
  });
  url = `http://127.0.0.1:${servidor.address().port}/api/lecciones`;
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
    idLeccion: '21', idCurso: '10', tituloCurso: 'Curso ficticio',
    titulo: 'Lección ficticia', objetivo: 'Practicar sin datos reales.',
    duracionEstimadaMinutos: 3, estadoPublicacion: 'publicado', fechaCierre: null,
    tieneAvance: false, estadoProgreso: null,
    idUltimoPasoCompletado: null, fechaFinalizacion: null,
    siguienteLeccion: null,
    pasos: [{ idPaso: '101', orden: 1, instruccion: 'Lee el ejemplo.', recursos: [], actividad: { tipo: 'lectura' } }],
    ...cambios
  };
}

function simular(t, opciones = {}) {
  const verificar = t.mock.method(firebaseAuth, 'verifyIdToken', async () => {
    if (opciones.errorToken) throw opciones.errorToken;
    return { uid: UID };
  });
  const consulta = t.mock.method(pool, 'query', async (sql, parametros) => {
    if (/FROM usuarios[\s\S]*WHERE uid = \$1/.test(sql)) {
      assert.deepEqual(parametros, [UID]);
      if (opciones.errorPerfil) throw opciones.errorPerfil;
      const rows = opciones.sinPerfil ? [] : [{
        uid: UID, nombre_completo: 'Alumno ficticio', nombre_apodo: null,
        rol: opciones.rol || 'estudiante', activo: opciones.activo !== false
      }];
      return { rowCount: rows.length, rows };
    }
    assert.deepEqual(parametros, [opciones.id || '21', UID]);
    if (opciones.errorDetalle) throw opciones.errorDetalle;
    return { rows: [{
      leccion: Object.hasOwn(opciones, 'leccion') ? opciones.leccion : fila(),
      leccionRetirada: opciones.retirada === true
    }] };
  });
  t.mock.method(pool, 'connect', async () => assert.fail('No debe abrir una transacción'));
  return { verificar, consulta };
}

function solicitar(sufijo = '/21', authorization = 'Bearer token-prueba') {
  return fetch(`${url}${sufijo}`, { headers: authorization === null ? {} : { Authorization: authorization } });
}

for (const authorization of [null, 'Basic prueba', 'Bearer', 'Bearer uno,dos']) {
  test(`GET lección: autenticación mal formada ${authorization}`, async (t) => {
    const simulacion = simular(t);
    const respuesta = await solicitar('/21', authorization);
    assert.equal(respuesta.status, 401);
    assert.equal(respuesta.headers.get('cache-control'), 'no-store');
    assert.equal((await respuesta.json()).ok, false);
    assert.equal(simulacion.verificar.mock.callCount(), 0);
    assert.equal(simulacion.consulta.mock.callCount(), 0);
  });
}

for (const code of ['auth/invalid-id-token', 'auth/id-token-expired']) {
  test(`GET lección: Firebase rechaza token ${code}`, async (t) => {
    const simulacion = simular(t, { errorToken: Object.assign(new Error('Token ficticio'), { code }) });
    const respuesta = await solicitar();
    assert.equal(respuesta.status, 401);
    assert.equal(respuesta.headers.get('cache-control'), 'no-store');
    assert.equal(simulacion.consulta.mock.callCount(), 0);
  });
}

for (const [opciones, estado, codigo] of [
  [{ sinPerfil: true }, 404, 'perfil_no_registrado'],
  [{ activo: false }, 403, 'cuenta_desactivada'],
  [{ rol: 'maestro' }, 403, 'rol_no_autorizado'],
  [{ rol: 'administrador' }, 403, 'rol_no_autorizado']
]) {
  test(`GET lección: perfil o permiso ${JSON.stringify(opciones)}`, async (t) => {
    const simulacion = simular(t, opciones);
    const respuesta = await solicitar();
    assert.equal(respuesta.status, estado);
    assert.equal(respuesta.headers.get('cache-control'), 'no-store');
    assert.equal((await respuesta.json()).codigo, codigo);
    assert.equal(simulacion.consulta.mock.callCount(), 1);
  });
}

for (const id of ['0', '-1', '01', 'abc', '1.5', '9223372036854775808']) {
  test(`GET lección: ID inválido ${id} no consulta detalle`, async (t) => {
    const simulacion = simular(t);
    const respuesta = await solicitar(`/${id}`);
    assert.equal(respuesta.status, 400);
    assert.equal(respuesta.headers.get('cache-control'), 'no-store');
    assert.equal((await respuesta.json()).codigo, 'id_leccion_invalido');
    assert.equal(simulacion.consulta.mock.callCount(), 1);
  });
}

test('GET lección: éxito devuelve contrato directo y no almacenable', async (t) => {
  const simulacion = simular(t);
  const respuesta = await solicitar();
  assert.equal(respuesta.status, 200);
  assert.equal(respuesta.headers.get('cache-control'), 'no-store');
  const cuerpo = await respuesta.json();
  assert.deepEqual(cuerpo, {
    idLeccion: '21', idCurso: '10', tituloCurso: 'Curso ficticio',
    titulo: 'Lección ficticia', objetivo: 'Practicar sin datos reales.',
    duracionEstimadaMinutos: 3,
    progreso: {
      estado: 'pendiente', idUltimoPasoCompletado: null,
      idPasoParaContinuar: '101', pasosCompletados: 0,
      totalPasos: 1, fechaFinalizacion: null
    },
    siguienteLeccion: null, pasos: fila().pasos
  });
  assert.equal(simulacion.consulta.mock.callCount(), 2);
});

test('GET lección: BIGINT máximo se conserva como cadena', async (t) => {
  const id = '9223372036854775807';
  simular(t, { id, leccion: fila({ idLeccion: id }) });
  const respuesta = await solicitar(`/${id}`);
  assert.equal(respuesta.status, 200);
  assert.equal((await respuesta.json()).idLeccion, id);
});

for (const [opciones, estado, codigo] of [
  [{ leccion: null }, 404, 'leccion_no_encontrada'],
  [{ leccion: null, retirada: true }, 404, 'curso_retirado'],
  [{ leccion: fila({ estadoPublicacion: 'borrador' }) }, 404, 'leccion_no_encontrada'],
  [{ leccion: fila({ estadoPublicacion: 'retirado' }) }, 404, 'curso_retirado'],
  [{ leccion: fila({ fechaCierre: '2000-01-01' }) }, 409, 'curso_cerrado']
]) {
  test(`GET lección: acceso educativo ${estado} ${codigo}`, async (t) => {
    simular(t, opciones);
    const respuesta = await solicitar();
    assert.equal(respuesta.status, estado);
    assert.equal(respuesta.headers.get('cache-control'), 'no-store');
    const cuerpo = await respuesta.json();
    assert.equal(cuerpo.ok, false);
    assert.equal(cuerpo.codigo, codigo);
    assert.equal(Object.hasOwn(cuerpo, 'pasos'), false);
  });
}

test('GET lección: cerrado con avance en el curso permite lección pendiente', async (t) => {
  simular(t, { leccion: fila({ fechaCierre: '2000-01-01', tieneAvance: true }) });
  const respuesta = await solicitar();
  assert.equal(respuesta.status, 200);
  assert.equal((await respuesta.json()).progreso.estado, 'pendiente');
});

test('GET lección: completada conserva fecha y no ofrece paso pendiente', async (t) => {
  const fecha = '2026-11-08T18:30:00.000Z';
  simular(t, { leccion: fila({
    tieneAvance: true, estadoProgreso: 'completada',
    idUltimoPasoCompletado: '101', fechaFinalizacion: fecha
  }) });
  const respuesta = await solicitar();
  assert.equal(respuesta.status, 200);
  const { progreso } = await respuesta.json();
  assert.equal(progreso.idPasoParaContinuar, null);
  assert.equal(progreso.fechaFinalizacion, fecha);
  assert.equal(progreso.pasosCompletados, 1);
});

test('GET lección: query no reemplaza identidad ni reloj y no crea avance', async (t) => {
  const simulacion = simular(t, { leccion: fila({ fechaCierre: '2000-01-01' }) });
  const respuesta = await solicitar('/21?uid=otro-alumno&ahora=1990-01-01');
  assert.equal(respuesta.status, 409);
  assert.equal((await respuesta.json()).codigo, 'curso_cerrado');
  const [sql, parametros] = simulacion.consulta.mock.calls[1].arguments;
  assert.deepEqual(parametros, ['21', UID]);
  assert.doesNotMatch(sql, /\b(?:INSERT|UPDATE|DELETE)\b/);
});

test('GET lección: fallo SQL devuelve 503 sin exponer información interna', async (t) => {
  const detalle = 'SELECT datos privados de PostgreSQL';
  simular(t, { errorDetalle: new Error(detalle) });
  const registro = t.mock.method(console, 'error', () => {});
  const respuesta = await solicitar();
  assert.equal(respuesta.status, 503);
  assert.equal(respuesta.headers.get('cache-control'), 'no-store');
  const cuerpo = await respuesta.json();
  assert.deepEqual(cuerpo, {
    ok: false, mensaje: 'No fue posible consultar la lección. Intenta más tarde',
    codigo: 'leccion_no_disponible'
  });
  assert.equal(JSON.stringify(registro.mock.calls[0].arguments).includes(detalle), false);
});

test('GET lección: datos inconsistentes devuelven 503, no éxito vacío', async (t) => {
  simular(t, { leccion: fila({ pasos: [] }) });
  t.mock.method(console, 'error', () => {});
  const respuesta = await solicitar();
  assert.equal(respuesta.status, 503);
  assert.equal((await respuesta.json()).codigo, 'leccion_no_disponible');
});

test('GET lección: error de perfil conserva respuesta y evita consultar detalle', async (t) => {
  const simulacion = simular(t, { errorPerfil: new Error('Fallo simulado') });
  t.mock.method(console, 'error', () => {});
  const respuesta = await solicitar();
  assert.equal(respuesta.status, 503);
  assert.equal((await respuesta.json()).ok, false);
  assert.equal(simulacion.consulta.mock.callCount(), 1);
});

test('GET lección: error de infraestructura Firebase no consulta PostgreSQL', async (t) => {
  const simulacion = simular(t, { errorToken: Object.assign(new Error('Fallo simulado'), { code: 'app/network-error' }) });
  t.mock.method(console, 'error', () => {});
  const respuesta = await solicitar();
  assert.equal(respuesta.status, 503);
  assert.equal(simulacion.consulta.mock.callCount(), 0);
});
