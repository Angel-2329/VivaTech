const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
process.env.DATABASE_URL = 'postgresql://prueba:prueba@localhost:5432/prueba';
process.env.FIREBASE_PROJECT_ID = 'demo-viva-tech-certificados';
const pool = require('../src/config/database');
const firebaseAuth = require('../src/config/firebase');
const app = require('../src/app');

const UID = 'alumno-certificados-http';
const FECHA = '2026-11-15T12:00:00.123789-06:00';
const CERTIFICADO = { idCertificado: '7', idCurso: '10', folio: 'VT-2026-000007',
  codigoVerificacion: '7b604b92-7f81-4d56-b117-d2bc14dd1ab2', nombreCompleto: 'Persona ficticia',
  tituloCurso: 'Curso ficticio', lecciones: [{ titulo: 'Lección ficticia' }],
  fechaFinalizacionCurso: FECHA, fechaEmision: '2026-11-15T13:00:00.987654-06:00', duracionMinutos: 8 };
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
  const perfil = { uid: UID, rol: opciones.rol || 'estudiante', activo: opciones.activo !== false,
    nombre_completo: 'Persona ficticia' };
  let certificado = opciones.existente ? structuredClone(CERTIFICADO) : null;
  const llamadas = [];
  const verificar = t.mock.method(firebaseAuth, 'verifyIdToken', async () => {
    if (opciones.errorToken) throw opciones.errorToken;
    return { uid: UID };
  });
  t.mock.method(pool, 'query', async (sql, parametros) => {
    assert.match(sql, /FROM usuarios/);
    assert.deepEqual(parametros, [UID]);
    if (opciones.errorPerfil) throw new Error('Detalle privado de perfil');
    return { rows: opciones.sinPerfil ? [] : [perfil], rowCount: opciones.sinPerfil ? 0 : 1 };
  });
  const cliente = {
    async query(sql, parametros) {
      const q = sql.trim();
      llamadas.push({ sql: q, parametros });
      if (opciones.fallar?.test(q)) throw new Error('Detalle privado SQL');
      if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(q)) return { rows: [] };
      if (/FROM usuarios/.test(q)) {
        return { rows: [opciones.perfilTx || perfil] };
      }
      if (/FROM cursos WHERE/.test(q)) {
        assert.deepEqual(parametros, ['10']);
        return { rows: opciones.sinCurso ? [] : [{ idCurso: '10', titulo: 'Curso ficticio', estado_publicacion: opciones.estado || 'publicado' }] };
      }
      if (/FROM certificados/.test(q)) {
        assert.equal(parametros[0], UID);
        return { rows: parametros.length === 1 ? (opciones.lista || []) : (certificado ? [certificado] : []) };
      }
      if (/FROM historial_cursos_retirados/.test(q)) {
        assert.deepEqual(parametros, [UID, '10']);
        return { rows: opciones.historial ? [opciones.historial] : [] };
      }
      if (/FROM lecciones l/.test(q)) {
        assert.deepEqual(parametros, [UID, '10']);
        return { rows: opciones.vacio ? [] : [{ idLeccion: '21', titulo: 'Lección ficticia', orden: 1, duracionEstimadaMinutos: 8,
          estado: opciones.incompleto ? 'en_progreso' : 'completada', ultimoCompletado: '103',
          ultimoPaso: '103', totalPasos: 3, fechaFinalizacion: FECHA }] };
      }
      if (/max\(p.fecha_finalizacion\)/.test(q)) return { rows: [{ fechaFinalizacionCurso: FECHA }] };
      if (/^INSERT INTO certificados/.test(q)) {
        assert.deepEqual(parametros, [UID, '10', 'Persona ficticia', 'Curso ficticio', JSON.stringify(CERTIFICADO.lecciones), FECHA, 8]);
        certificado = structuredClone(CERTIFICADO);
        return { rows: [certificado], rowCount: 1 };
      }
      assert.fail(`Consulta inesperada: ${q}`);
    },
    release: t.mock.fn()
  };
  const conectar = t.mock.method(pool, 'connect', async () => cliente);
  return { llamadas, cliente, conectar, verificar };
}

function solicitar({ ruta = '/api/cursos/10/certificado', metodo = 'POST', token = 'Bearer token-prueba', cuerpo, crudo } = {}) {
  return fetch(`${origen}${ruta}`, {
    method: metodo,
    headers: { ...(token === null ? {} : { Authorization: token }),
      ...((cuerpo !== undefined || crudo !== undefined) ? { 'Content-Type': 'application/json' } : {}) },
    body: crudo !== undefined ? crudo : cuerpo === undefined ? undefined : JSON.stringify(cuerpo)
  });
}

async function comprobarError(respuesta, estado, codigo) {
  assert.equal(respuesta.status, estado);
  assert.equal(respuesta.headers.get('cache-control'), 'no-store');
  const cuerpo = await respuesta.json();
  assert.equal(cuerpo.ok, false);
  if (codigo) assert.equal(cuerpo.codigo, codigo);
  assert.equal(typeof cuerpo.mensaje, 'string');
  assert.doesNotMatch(JSON.stringify(cuerpo), /Detalle privado|SELECT|postgresql:\/\//);
}

test('Certificados HTTP: POST sin cuerpo crea 201 y conserva contrato privado', async (t) => {
  simular(t);
  const respuesta = await solicitar();
  assert.equal(respuesta.status, 201);
  assert.equal(respuesta.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await respuesta.json(), CERTIFICADO);
});

test('Certificados HTTP: POST repetido devuelve 200 y la misma instantánea', async (t) => {
  const s = simular(t, { existente: true });
  const respuesta = await solicitar({ cuerpo: {} });
  assert.equal(respuesta.status, 200);
  assert.deepEqual(await respuesta.json(), CERTIFICADO);
  assert.equal(s.llamadas.some(({ sql }) => /^INSERT|^UPDATE/.test(sql)), false);
});

for (const opciones of [{ incompleto: true }, { vacio: true }, { estado: 'retirado' }]) {
  test(`Certificados HTTP: curso incompleto ${JSON.stringify(opciones)}`, async (t) => {
    simular(t, opciones);
    await comprobarError(await solicitar(), 409, 'curso_incompleto');
  });
}

for (const lista of [[], [CERTIFICADO]]) {
  test(`Certificados HTTP: GET propio devuelve ${lista.length} elementos`, async (t) => {
    simular(t, { lista });
    const respuesta = await solicitar({ ruta: '/api/mis-certificados', metodo: 'GET' });
    assert.equal(respuesta.status, 200);
    assert.equal(respuesta.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await respuesta.json(), lista);
  });
}

for (const operacion of [{}, { ruta: '/api/mis-certificados', metodo: 'GET' }]) {
  for (const token of [null, 'Basic token', 'Bearer uno dos']) {
    test(`Certificados HTTP: autenticación requerida ${operacion.metodo || 'POST'} ${String(token)}`, async (t) => {
      const s = simular(t);
      await comprobarError(await solicitar({ ...operacion, token }), 401);
      assert.equal(s.conectar.mock.callCount(), 0);
    });
  }
  for (const [opciones, estado, codigo] of [
    [{ errorToken: { code: 'auth/id-token-expired' } }, 401, undefined],
    [{ rol: 'maestro' }, 403, 'rol_no_autorizado'],
    [{ rol: 'administrador' }, 403, 'rol_no_autorizado'],
    [{ activo: false }, 403, 'cuenta_desactivada'],
    [{ sinPerfil: true }, 404, 'perfil_no_registrado']
  ]) {
    test(`Certificados HTTP: permisos ${operacion.metodo || 'POST'} ${JSON.stringify(opciones)}`, async (t) => {
      const s = simular(t, opciones);
      await comprobarError(await solicitar(operacion), estado, codigo);
      assert.equal(s.conectar.mock.callCount(), 0);
    });
  }
}

for (const cuerpo of [{ uid: 'otro' }, { cursoCompletado: true }, { idCurso: '11' }]) {
  test(`Certificados HTTP: no confía en campos del cliente ${JSON.stringify(cuerpo)}`, async (t) => {
    const s = simular(t);
    await comprobarError(await solicitar({ cuerpo }), 400, 'campos_invalidos');
    assert.equal(s.conectar.mock.callCount(), 0);
  });
}

test('Certificados HTTP: cuerpo de arreglo no es válido', async (t) => {
  simular(t);
  await comprobarError(await solicitar({ cuerpo: [] }), 400, 'cuerpo_invalido');
});

test('Certificados HTTP: JSON malformado se rechaza sin consultar certificados', async (t) => {
  const s = simular(t);
  await comprobarError(await solicitar({ crudo: '{' }), 400);
  assert.equal(s.conectar.mock.callCount(), 0);
});

for (const id of ['0', '01', '-1', '1.2', '9223372036854775808']) {
  test(`Certificados HTTP: rechaza ID ${id}`, async (t) => {
    const s = simular(t);
    await comprobarError(await solicitar({ ruta: `/api/cursos/${id}/certificado` }), 400, 'id_curso_invalido');
    assert.equal(s.conectar.mock.callCount(), 0);
  });
}

test('Certificados HTTP: curso ausente devuelve 404', async (t) => {
  simular(t, { sinCurso: true });
  await comprobarError(await solicitar(), 404, 'curso_no_encontrado');
});

test('Certificados HTTP: revalida el estado de cuenta en la transacción', async (t) => {
  simular(t, { perfilTx: { uid: UID, rol: 'estudiante', activo: false } });
  await comprobarError(await solicitar(), 403, 'cuenta_desactivada');
});

test('Certificados HTTP: error SQL no expone detalles privados', async (t) => {
  const s = simular(t, { fallar: /^INSERT INTO certificados/ });
  await comprobarError(await solicitar(), 503, 'emision_certificado_no_disponible');
  assert.equal(s.llamadas.at(-1).sql, 'ROLLBACK');
  assert.equal(s.cliente.release.mock.callCount(), 1);
});

test('Certificados HTTP: fallo de listado devuelve 503 sin datos privados', async (t) => {
  simular(t, { fallar: /FROM certificados/ });
  await comprobarError(await solicitar({ ruta: '/api/mis-certificados', metodo: 'GET' }), 503, 'certificados_no_disponibles');
});
