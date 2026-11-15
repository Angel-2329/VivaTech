const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

process.env.DATABASE_URL = 'postgresql://prueba:prueba@localhost:5432/prueba';
process.env.FIREBASE_PROJECT_ID = 'demo-viva-tech-progreso';
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

function simular(t, opciones = {}) {
  const consultas = [];
  const verificar = t.mock.method(firebaseAuth, 'verifyIdToken', async () => {
    if (opciones.errorToken) throw opciones.errorToken;
    return { uid: UID };
  });
  const perfil = t.mock.method(pool, 'query', async (sql, parametros) => {
    assert.match(sql, /FROM usuarios/);
    assert.deepEqual(parametros, [UID]);
    if (opciones.errorPerfil) throw opciones.errorPerfil;
    const rows = opciones.sinPerfil ? [] : [{ uid: UID, rol: opciones.rol || 'estudiante', activo: opciones.activo !== false }];
    return { rowCount: rows.length, rows };
  });
  let progreso = opciones.progreso || null;
  const cliente = {
    async query(sql, parametros) {
      const texto = sql.trim();
      consultas.push(texto);
      if (opciones.errorDetalle && /FOR UPDATE OF c/.test(texto)) throw opciones.errorDetalle;
      if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(texto)) return { rows: [] };
      if (/FOR UPDATE OF c/.test(texto)) {
        assert.deepEqual(parametros, ['21']);
        return { rows: opciones.sinCurso ? [] : [{ idCurso: '10', estado_publicacion: opciones.estado || 'publicado', fecha_cierre: opciones.cierre || null }] };
      }
      if (/AS retirada/.test(texto)) return { rows: [{ retirada: opciones.retirada === true }] };
      if (/FROM lecciones[\s\S]*FOR UPDATE/.test(texto)) return { rows: [{ idLeccion: '21' }] };
      if (/AS "tieneAvance"/.test(texto)) {
        assert.deepEqual(parametros, [UID, '10']);
        return { rows: [{ tieneAvance: opciones.avance ?? Boolean(progreso) }] };
      }
      if (/FROM pasos/.test(texto)) return { rows: [1, 2, 3].map((orden) => ({ idPaso: String(100 + orden), orden })) };
      if (/FROM progresos[\s\S]*FOR UPDATE/.test(texto)) {
        assert.deepEqual(parametros, [UID, '21']);
        return { rows: progreso ? [progreso] : [] };
      }
      if (/^(INSERT INTO|UPDATE) progresos/.test(texto)) {
        assert.equal(parametros[0], UID);
        progreso = { estadoProgreso: parametros[2], idUltimoPasoCompletado: parametros[3], fechaFinalizacion: parametros[4] ? '2026-11-10T10:00:00.000Z' : null };
        return { rows: [progreso] };
      }
      if (/AS "totalLecciones"/.test(texto)) {
        assert.deepEqual(parametros, [UID, '10']);
        return { rows: [{ totalLecciones: 1, leccionesCompletadas: progreso?.estadoProgreso === 'completada' ? 1 : 0 }] };
      }
      assert.fail(`Consulta no prevista: ${texto}`);
    },
    release: t.mock.fn()
  };
  const conectar = t.mock.method(pool, 'connect', async () => {
    if (opciones.errorConexion) throw opciones.errorConexion;
    return cliente;
  });
  return { consultas, verificar, perfil, conectar, cliente };
}

function solicitar({ id = '21', cuerpo = { idPaso: '101' }, token = 'Bearer token-prueba', query = '' } = {}) {
  return fetch(`${url}/${id}/progreso${query}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...(token === null ? {} : { Authorization: token }) },
    body: JSON.stringify(cuerpo)
  });
}

async function comprobarError(respuesta, estado, codigo) {
  assert.equal(respuesta.status, estado);
  assert.equal(respuesta.headers.get('cache-control'), 'no-store');
  const cuerpo = await respuesta.json();
  assert.equal(cuerpo.ok, false);
  if (codigo) assert.equal(cuerpo.codigo, codigo);
  return cuerpo;
}

for (const token of [null, 'Basic prueba', 'Bearer', 'Bearer uno,dos']) {
  test(`PUT progreso: autenticación mal formada ${token}`, async (t) => {
    const s = simular(t);
    await comprobarError(await solicitar({ token }), 401);
    assert.equal(s.verificar.mock.callCount(), 0);
    assert.equal(s.perfil.mock.callCount(), 0);
    assert.equal(s.conectar.mock.callCount(), 0);
  });
}

for (const code of ['auth/invalid-id-token', 'auth/id-token-expired']) {
  test(`PUT progreso: token Firebase rechazado ${code}`, async (t) => {
    const s = simular(t, { errorToken: Object.assign(new Error('Token ficticio'), { code }) });
    await comprobarError(await solicitar(), 401);
    assert.equal(s.conectar.mock.callCount(), 0);
  });
}

for (const [opciones, estado, codigo] of [
  [{ sinPerfil: true }, 404, 'perfil_no_registrado'],
  [{ activo: false }, 403, 'cuenta_desactivada'],
  [{ rol: 'maestro' }, 403, 'rol_no_autorizado'],
  [{ rol: 'administrador' }, 403, 'rol_no_autorizado']
]) {
  test(`PUT progreso: perfil o rol ${JSON.stringify(opciones)}`, async (t) => {
    const s = simular(t, opciones);
    await comprobarError(await solicitar(), estado, codigo);
    assert.equal(s.conectar.mock.callCount(), 0);
  });
}

for (const cuerpo of [null, 'texto']) {
  test(`PUT progreso: parser estricto rechaza ${JSON.stringify(cuerpo)} sin consultar dependencias`, async (t) => {
    const s = simular(t);
    await comprobarError(await solicitar({ cuerpo }), 400, 'json_invalido');
    assert.equal(s.verificar.mock.callCount(), 0);
    assert.equal(s.perfil.mock.callCount(), 0);
    assert.equal(s.conectar.mock.callCount(), 0);
  });
}

test('PUT progreso: JSON mal formado conserva no-store y no consulta dependencias', async (t) => {
  const s = simular(t);
  const respuesta = await fetch(`${url}/21/progreso`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer token-prueba'
    },
    body: '{"idPaso":'
  });
  await comprobarError(respuesta, 400, 'json_invalido');
  assert.equal(s.verificar.mock.callCount(), 0);
  assert.equal(s.perfil.mock.callCount(), 0);
  assert.equal(s.conectar.mock.callCount(), 0);
});

for (const [cuerpo, codigo] of [
  [[], 'cuerpo_invalido'],
  [{}, 'id_paso_invalido'], [{ idPaso: 101 }, 'id_paso_invalido'],
  [{ idPaso: '0' }, 'id_paso_invalido'], [{ idPaso: '9223372036854775808' }, 'id_paso_invalido'],
  [{ idPaso: '101', uid: 'otro-alumno' }, 'campos_invalidos'],
  [{ idPaso: '101', rol: 'administrador' }, 'campos_invalidos'],
  [{ idPaso: '101', estado: 'completada' }, 'campos_invalidos']
]) {
  test(`PUT progreso: cuerpo inválido ${JSON.stringify(cuerpo)}`, async (t) => {
    const s = simular(t);
    await comprobarError(await solicitar({ cuerpo }), 400, codigo);
    assert.equal(s.conectar.mock.callCount(), 0);
  });
}

for (const id of ['0', '01', '-1', 'abc', '9223372036854775808']) {
  test(`PUT progreso: idLeccion inválido ${id}`, async (t) => {
    const s = simular(t);
    await comprobarError(await solicitar({ id }), 400, 'id_leccion_invalido');
    assert.equal(s.conectar.mock.callCount(), 0);
  });
}

test('PUT progreso: contrato de éxito se devuelve después del commit', async (t) => {
  const s = simular(t);
  const respuesta = await solicitar();
  assert.equal(respuesta.status, 200);
  assert.equal(respuesta.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await respuesta.json(), {
    idLeccion: '21', estado: 'en_progreso', idUltimoPasoCompletado: '101',
    idPasoParaContinuar: '102', pasosCompletados: 1, totalPasos: 3,
    fechaFinalizacion: null, leccionCompletada: false, cursoCompletado: false
  });
  assert.equal(s.consultas.at(-1), 'COMMIT');
  assert.equal(s.cliente.release.mock.callCount(), 1);
});

for (const [opciones, cuerpo, estado, codigo] of [
  [{}, { idPaso: '999' }, 400, 'id_paso_invalido'],
  [{}, { idPaso: '103' }, 409, 'paso_fuera_de_secuencia'],
  [{ sinCurso: true }, { idPaso: '101' }, 404, 'leccion_no_encontrada'],
  [{ sinCurso: true, retirada: true }, { idPaso: '101' }, 404, 'curso_retirado'],
  [{ estado: 'borrador' }, { idPaso: '101' }, 404, 'leccion_no_encontrada'],
  [{ estado: 'retirado' }, { idPaso: '101' }, 404, 'curso_retirado'],
  [{ cierre: '2000-01-01' }, { idPaso: '101' }, 409, 'curso_cerrado']
]) {
  test(`PUT progreso: regla funcional ${JSON.stringify(opciones)} ${codigo}`, async (t) => {
    const s = simular(t, opciones);
    await comprobarError(await solicitar({ cuerpo }), estado, codigo);
    assert.equal(s.consultas.at(-1), 'ROLLBACK');
    assert.equal(s.cliente.release.mock.callCount(), 1);
  });
}

test('PUT progreso: cerrado con avance propio en otra lección permite guardar', async (t) => {
  simular(t, { cierre: '2000-01-01', avance: true });
  const respuesta = await solicitar();
  assert.equal(respuesta.status, 200);
  assert.equal((await respuesta.json()).pasosCompletados, 1);
});

test('PUT progreso: último paso completa lección y curso sin certificado', async (t) => {
  const s = simular(t, { progreso: { estadoProgreso: 'en_progreso', idUltimoPasoCompletado: '102', fechaFinalizacion: null } });
  const respuesta = await solicitar({ cuerpo: { idPaso: '103' } });
  assert.equal(respuesta.status, 200);
  const cuerpo = await respuesta.json();
  assert.equal(cuerpo.leccionCompletada, true);
  assert.equal(cuerpo.cursoCompletado, true);
  assert.equal(cuerpo.idPasoParaContinuar, null);
  assert.equal(cuerpo.fechaFinalizacion, '2026-11-10T10:00:00.000Z');
  assert.equal(Object.hasOwn(cuerpo, 'certificado'), false);
  assert.equal(s.consultas.some((sql) => /certificados/.test(sql)), false);
});

test('PUT progreso: repetición de completada no escribe ni cambia su finalización', async (t) => {
  const s = simular(t, { progreso: { estadoProgreso: 'completada', idUltimoPasoCompletado: '103', fechaFinalizacion: '2026-11-08T18:00:00.000Z' } });
  const respuesta = await solicitar();
  assert.equal(respuesta.status, 200);
  assert.equal((await respuesta.json()).fechaFinalizacion, '2026-11-08T18:00:00.000Z');
  assert.equal(s.consultas.some((sql) => /^(INSERT INTO|UPDATE) progresos/.test(sql)), false);
});

test('PUT progreso: query no sustituye UID ni reloj del servidor', async (t) => {
  const s = simular(t, { cierre: '2000-01-01' });
  await comprobarError(await solicitar({ query: '?uid=otro-alumno&ahora=1990-01-01' }), 409, 'curso_cerrado');
  assert.equal(s.consultas.some((sql) => /^(INSERT INTO|UPDATE) progresos/.test(sql)), false);
});

for (const opciones of [
  { errorDetalle: new Error('SELECT informacion privada') },
  { errorConexion: new Error('Credenciales privadas') },
  { errorPerfil: new Error('Error de perfil') },
  { errorToken: Object.assign(new Error('Error Firebase'), { code: 'app/network-error' }) }
]) {
  test(`PUT progreso: indisponibilidad ${Object.keys(opciones)[0]} sin filtrar detalles`, async (t) => {
    simular(t, opciones);
    const registro = t.mock.method(console, 'error', () => {});
    const respuesta = await solicitar();
    const cuerpo = await comprobarError(respuesta, 503);
    assert.equal(JSON.stringify(cuerpo).includes('privada'), false);
    assert.equal(JSON.stringify(registro.mock.calls).includes('SELECT informacion privada'), false);
    if (opciones.errorConexion || opciones.errorDetalle) assert.equal(cuerpo.codigo, 'progreso_no_disponible');
  });
}
