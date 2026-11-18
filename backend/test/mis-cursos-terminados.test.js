const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

process.env.DATABASE_URL = 'postgresql://prueba:prueba@localhost:5432/prueba';
process.env.FIREBASE_PROJECT_ID = 'demo-viva-tech-mis-cursos-terminados';

const pool = require('../src/config/database');
const firebaseAuth = require('../src/config/firebase');
const app = require('../src/app');
const { CONSULTA_RESUMENES } = require('../src/services/resumen-curso');

let servidor;
let raiz;
const UID = 'uid-estudiante-prueba';
const UID_OTRO = 'uid-otro-estudiante';
const AHORA = new Date('2026-11-17T20:00:00.000Z');
const CERTIFICADO = {
  idCertificado: '5', folio: 'VT-2026-000005', codigoVerificacion: '3f1c2e4a-0b6d-4c8e-9a7f-1d2e3c4b5a69'
};

before(async () => {
  await new Promise((resolve, reject) => {
    servidor = app.listen(0, '127.0.0.1', resolve);
    servidor.once('error', reject);
  });
  raiz = `http://127.0.0.1:${servidor.address().port}/api`;
});

after(async () => {
  if (servidor) {
    servidor.closeAllConnections();
    await new Promise((resolve, reject) => servidor.close((error) => error ? reject(error) : resolve()));
  }
  await pool.end();
});

const leccion = (idLeccion, estado = 'pendiente', cambios = {}) => ({
  idLeccion, titulo: `Lección ${idLeccion}`, duracionEstimadaMinutos: 10, estado, ...cambios
});

function fila(cambios = {}) {
  return {
    idCategoria: '1', nombreCategoria: 'Categoría ficticia', ordenCategoria: 1,
    idCurso: '10', titulo: 'Curso ficticio', descripcion: 'Descripción ficticia.',
    estado_publicacion: 'publicado', fecha_cierre: null,
    tieneAvance: false, fechaUltimaActividad: null, fechaFinalizacionCurso: null,
    tieneHistorial: false, leccionesHistorial: null, completadoHistorico: null,
    fechaFinalizacionHistorica: null, certificado: null,
    lecciones: [leccion('21'), leccion('22')],
    ...cambios
  };
}

const terminado = (idCurso, fechaFinalizacionCurso, cambios = {}) => fila({
  idCurso, tieneAvance: true, fechaUltimaActividad: fechaFinalizacionCurso, fechaFinalizacionCurso,
  lecciones: [leccion('21', 'completada'), leccion('22', 'completada')],
  ...cambios
});

const historialProgreso = (orden, estado, fechaActualizacion) => ({
  idLeccion: String(20 + orden), tituloCurso: 'Curso ficticio', titulo: `Lección ${orden}`, orden,
  origen: 'progreso', estado, totalPasos: 3, pasosCompletados: estado === 'completada' ? 3 : 1,
  idUltimoPasoCompletado: '1', fechaInicio: '2026-11-01T10:00:00.000Z', fechaActualizacion,
  fechaFinalizacion: estado === 'completada' ? fechaActualizacion : null
});

function retirado(idCurso, cambios = {}) {
  return fila({
    idCurso, estado_publicacion: 'retirado', fecha_cierre: '2026-11-30', lecciones: [],
    tieneHistorial: true, completadoHistorico: true,
    fechaFinalizacionHistorica: '2026-11-09T12:00:00.000Z',
    leccionesHistorial: [
      historialProgreso(1, 'completada', '2026-11-08T12:00:00.000Z'),
      historialProgreso(2, 'completada', '2026-11-09T12:00:00.000Z')
    ],
    ...cambios
  });
}

function simular(t, opciones = {}) {
  const uidToken = opciones.uid || UID;
  const verificar = t.mock.method(firebaseAuth, 'verifyIdToken', async () => {
    if (opciones.errorToken) throw opciones.errorToken;
    return { uid: uidToken };
  });
  const catalogos = [];
  const consulta = t.mock.method(pool, 'query', async (sql, parametros) => {
    assert.deepEqual(parametros, [uidToken]);
    if (/FROM usuarios[\s\S]*WHERE uid = \$1/.test(sql)) {
      if (opciones.errorPerfil) throw opciones.errorPerfil;
      const rows = opciones.sinPerfil ? [] : [{
        uid: uidToken, nombre_completo: 'Alumno Ficticio', nombre_apodo: null,
        rol: opciones.rol || 'estudiante', activo: opciones.activo !== false
      }];
      return { rowCount: rows.length, rows };
    }
    catalogos.push(sql);
    if (opciones.errorCatalogo) throw opciones.errorCatalogo;
    const origen = opciones.filas || [];
    const rows = typeof origen === 'function' ? origen(parametros[0]) : origen;
    return { rowCount: rows.length, rows };
  });
  const conexion = t.mock.method(pool, 'connect', async () => assert.fail('No debe abrir transacción'));
  return { verificar, consulta, conexion, catalogos };
}

function solicitar(sufijo = '', authorization = 'Bearer token-prueba') {
  return fetch(`${raiz}/mis-cursos/terminados${sufijo}`, {
    headers: authorization === null ? {} : { Authorization: authorization }
  });
}

async function listar(t, filas, opciones = {}) {
  t.mock.timers.enable({ apis: ['Date'], now: AHORA });
  simular(t, { ...opciones, filas });
  const respuesta = await solicitar();
  assert.equal(respuesta.status, 200);
  assert.equal(respuesta.headers.get('cache-control'), 'no-store');
  return respuesta.json();
}

for (const authorization of [null, 'Basic prueba', 'Bearer', 'Bearer uno,dos']) {
  test(`GET mis-cursos/terminados: 401 con autenticación mal formada ${authorization}`, async (t) => {
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
  test(`GET mis-cursos/terminados: 401 con token rechazado por Firebase ${code}`, async (t) => {
    const simulacion = simular(t, { errorToken: Object.assign(new Error('Token de prueba'), { code }) });
    const respuesta = await solicitar();
    assert.equal(respuesta.status, 401);
    assert.equal(respuesta.headers.get('cache-control'), 'no-store');
    assert.equal(simulacion.consulta.mock.callCount(), 0);
  });
}

for (const rol of ['maestro', 'administrador']) {
  test(`GET mis-cursos/terminados: ${rol} recibe 403 rol_no_autorizado sin consultar cursos`, async (t) => {
    const simulacion = simular(t, { rol });
    const respuesta = await solicitar();
    assert.equal(respuesta.status, 403);
    assert.equal(respuesta.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await respuesta.json(), {
      ok: false, mensaje: 'No tienes permisos para realizar esta acción', codigo: 'rol_no_autorizado'
    });
    assert.equal(simulacion.catalogos.length, 0);
  });
}

for (const [opciones, estado, codigo] of [
  [{ activo: false }, 403, 'cuenta_desactivada'],
  [{ sinPerfil: true }, 404, 'perfil_no_registrado']
]) {
  test(`GET mis-cursos/terminados: ${codigo} sin consultar cursos`, async (t) => {
    const simulacion = simular(t, opciones);
    const respuesta = await solicitar();
    assert.equal(respuesta.status, estado);
    assert.equal(respuesta.headers.get('cache-control'), 'no-store');
    assert.equal((await respuesta.json()).codigo, codigo);
    assert.equal(simulacion.catalogos.length, 0);
  });
}

test('GET mis-cursos/terminados: sin cursos terminados responde [] con no-store y sin transacción', async (t) => {
  const simulacion = simular(t);
  const respuesta = await solicitar();
  assert.equal(respuesta.status, 200);
  assert.equal(respuesta.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await respuesta.json(), []);
  assert.equal(simulacion.conexion.mock.callCount(), 0);
});

test('GET mis-cursos/terminados: publicado terminado con la forma de B más lecciones completadas', async (t) => {
  const cuerpo = await listar(t, [terminado('4', '2026-11-17T18:10:00.000Z', {
    idCategoria: '2', nombreCategoria: 'Banca móvil', ordenCategoria: 2,
    titulo: 'Uso seguro de la aplicación del banco',
    descripcion: 'Practica con una aplicación bancaria ficticia.',
    fecha_cierre: '2026-11-30', fechaUltimaActividad: '2026-11-17T18:20:00.000Z',
    certificado: CERTIFICADO,
    lecciones: [
      leccion('21', 'completada', { duracionEstimadaMinutos: 10 }),
      leccion('22', 'completada', { duracionEstimadaMinutos: 12 }),
      leccion('23', 'completada', { duracionEstimadaMinutos: 15 })
    ]
  })]);
  const esperado = [{
    idCurso: '4',
    titulo: 'Uso seguro de la aplicación del banco',
    descripcion: 'Practica con una aplicación bancaria ficticia.',
    categoria: { idCategoria: '2', nombre: 'Banca móvil', orden: 2 },
    estado: 'terminado',
    leccionesCompletadas: 3,
    totalLecciones: 3,
    duracionTotalMinutos: 37,
    fechaCierre: '2026-11-30',
    cerrado: false,
    retirado: false,
    siguienteLeccion: null,
    fechaUltimaActividad: '2026-11-17T18:20:00.000Z',
    fechaFinalizacion: '2026-11-17T18:10:00.000Z',
    certificado: CERTIFICADO,
    lecciones: [
      { idLeccion: '21', titulo: 'Lección 21', duracionEstimadaMinutos: 10, estado: 'completada' },
      { idLeccion: '22', titulo: 'Lección 22', duracionEstimadaMinutos: 12, estado: 'completada' },
      { idLeccion: '23', titulo: 'Lección 23', duracionEstimadaMinutos: 15, estado: 'completada' }
    ]
  }];
  assert.deepEqual(cuerpo, esperado);
  assert.deepEqual(Object.keys(cuerpo[0]), Object.keys(esperado[0]));
  assert.deepEqual(Object.keys(cuerpo[0].certificado), ['idCertificado', 'folio', 'codigoVerificacion']);
});

test('GET mis-cursos/terminados: retirado completo con certificado', async (t) => {
  const cuerpo = await listar(t, [retirado('40', { certificado: CERTIFICADO })]);
  assert.equal(cuerpo.length, 1);
  assert.deepEqual(cuerpo[0], {
    idCurso: '40',
    titulo: 'Curso ficticio',
    descripcion: 'Descripción ficticia.',
    categoria: { idCategoria: '1', nombre: 'Categoría ficticia', orden: 1 },
    estado: 'terminado',
    leccionesCompletadas: 2,
    totalLecciones: 2,
    duracionTotalMinutos: null,
    fechaCierre: null,
    cerrado: false,
    retirado: true,
    siguienteLeccion: null,
    fechaUltimaActividad: '2026-11-09T12:00:00.000Z',
    fechaFinalizacion: '2026-11-09T12:00:00.000Z',
    certificado: CERTIFICADO,
    lecciones: []
  });
});

test('GET mis-cursos/terminados: retirado completo sin certificado (puede obtenerlo después)', async (t) => {
  const cuerpo = await listar(t, [retirado('41')]);
  assert.equal(cuerpo.length, 1);
  assert.equal(cuerpo[0].retirado, true);
  assert.equal(cuerpo[0].estado, 'terminado');
  assert.equal(cuerpo[0].certificado, null);
  assert.deepEqual(cuerpo[0].lecciones, []);
  assert.equal(cuerpo[0].fechaFinalizacion, '2026-11-09T12:00:00.000Z');
});

test('GET mis-cursos/terminados: quedan fuera en curso, sin empezar, retirado incompleto y retirado sin historial', async (t) => {
  const cuerpo = await listar(t, [
    terminado('10', '2026-11-05T10:00:00.000Z'),
    fila({
      idCurso: '11', tieneAvance: true, fechaUltimaActividad: '2026-11-06T10:00:00.000Z',
      lecciones: [leccion('21', 'completada'), leccion('22', 'en_progreso')]
    }),
    fila({ idCurso: '12' }),
    retirado('13', {
      completadoHistorico: false, fechaFinalizacionHistorica: null,
      leccionesHistorial: [historialProgreso(1, 'en_progreso', '2026-11-08T12:00:00.000Z')]
    }),
    fila({ idCurso: '14', estado_publicacion: 'retirado', lecciones: [] }),
    fila({ idCurso: '15', estado_publicacion: 'borrador' })
  ]);
  assert.deepEqual(cuerpo.map((c) => c.idCurso), ['10']);
});

test('GET mis-cursos/terminados: un cerrado terminado aparece con cerrado true y sus lecciones', async (t) => {
  const cuerpo = await listar(t, [terminado('20', '2026-11-05T10:00:00.000Z', { fecha_cierre: '2026-11-10' })]);
  assert.equal(cuerpo[0].cerrado, true);
  assert.equal(cuerpo[0].retirado, false);
  assert.ok(cuerpo[0].lecciones.length > 0);
  assert.ok(cuerpo[0].lecciones.every((l) => l.estado === 'completada'));
});

test('GET mis-cursos/terminados: orden por fechaFinalizacion descendente y luego idCurso descendente', async (t) => {
  const cuerpo = await listar(t, [
    terminado('9', '2026-11-05T10:00:00.000Z'),
    terminado('10', '2026-11-05T10:00:00.000Z', { idCategoria: '2', nombreCategoria: 'Otra', ordenCategoria: 2 }),
    retirado('3', { fechaFinalizacionHistorica: '2026-11-09T12:00:00.000Z' }),
    terminado('100', '2026-11-01T10:00:00.000Z')
  ]);
  assert.deepEqual(cuerpo.map((c) => c.idCurso), ['3', '10', '9', '100']);
});

test('fechaFinalizacion de D2 sale de la misma regla que fechaFinalizacionCurso del certificado', async (t) => {
  const certificados = fs.readFileSync(path.join(__dirname, '../src/services/certificados.js'), 'utf8');
  const regla = 'to_jsonb(max(p.fecha_finalizacion)) AS "fechaFinalizacionCurso"';
  assert.ok(certificados.includes(`SELECT ${regla}`));
  assert.ok(certificados.includes('to_jsonb(fecha_finalizacion_curso) AS "fechaFinalizacionCurso"'));
  assert.ok(CONSULTA_RESUMENES.includes(regla));
  assert.ok(CONSULTA_RESUMENES.includes('to_jsonb(h.fecha_finalizacion_curso) AS "fechaFinalizacionHistorica"'));

  const simulacion = simular(t, {
    filas: [
      terminado('10', '2026-11-05T10:00:00.000Z', { fechaUltimaActividad: '2026-11-07T10:00:00.000Z' }),
      retirado('11', { fechaFinalizacionHistorica: '2026-11-03T09:00:00.000Z' })
    ]
  });
  t.mock.timers.enable({ apis: ['Date'], now: AHORA });
  const cuerpo = await (await solicitar()).json();
  assert.equal(simulacion.catalogos[0], CONSULTA_RESUMENES);
  assert.equal(cuerpo.find((c) => c.idCurso === '10').fechaFinalizacion, '2026-11-05T10:00:00.000Z');
  assert.equal(cuerpo.find((c) => c.idCurso === '11').fechaFinalizacion, '2026-11-03T09:00:00.000Z');
});

test('GET mis-cursos/terminados: el repaso (PUT sobre una lección completada) no cambia nada', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: AHORA });
  let progreso = {
    estadoProgreso: 'completada', idUltimoPasoCompletado: '103',
    fechaFinalizacion: '2026-11-08T18:00:00.000Z', fechaActualizacion: '2026-11-08T18:00:00.000Z'
  };
  const filaDesdeEstado = () => fila({
    idCurso: '10', tieneAvance: true,
    fechaUltimaActividad: progreso.fechaActualizacion,
    fechaFinalizacionCurso: progreso.fechaFinalizacion,
    certificado: CERTIFICADO,
    lecciones: [leccion('21', progreso.estadoProgreso)]
  });
  const escrituras = [];
  const sqlTransaccion = [];
  t.mock.method(firebaseAuth, 'verifyIdToken', async () => ({ uid: UID }));
  t.mock.method(pool, 'query', async (sql, parametros) => {
    assert.deepEqual(parametros, [UID]);
    if (/FROM usuarios[\s\S]*WHERE uid = \$1/.test(sql)) {
      return { rowCount: 1, rows: [{ uid: UID, nombre_completo: 'Alumno Ficticio', nombre_apodo: null, rol: 'estudiante', activo: true }] };
    }
    assert.equal(sql, CONSULTA_RESUMENES);
    return { rowCount: 1, rows: [filaDesdeEstado()] };
  });
  const cliente = {
    async query(sql, parametros) {
      const texto = sql.trim();
      sqlTransaccion.push(texto);
      if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(texto)) return { rows: [] };
      if (/FOR UPDATE OF c/.test(texto)) return { rows: [{ idCurso: '10', estado_publicacion: 'publicado', fecha_cierre: null }] };
      if (/FROM lecciones[\s\S]*FOR UPDATE/.test(texto)) return { rows: [{ idLeccion: '21' }] };
      if (/AS "tieneAvance"/.test(texto)) return { rows: [{ tieneAvance: true }] };
      if (/FROM pasos/.test(texto)) return { rows: [1, 2, 3].map((orden) => ({ idPaso: String(100 + orden), orden })) };
      if (/FROM progresos[\s\S]*FOR UPDATE/.test(texto)) {
        assert.deepEqual(parametros, [UID, '21']);
        return { rows: [{ ...progreso }] };
      }
      if (/^(INSERT INTO|UPDATE|DELETE FROM)/.test(texto)) {
        escrituras.push(texto);
        progreso = { ...progreso, fechaActualizacion: AHORA.toISOString() };
        return { rows: [progreso] };
      }
      if (/AS "totalLecciones"/.test(texto)) return { rows: [{ totalLecciones: 1, leccionesCompletadas: 1 }] };
      assert.fail(`Consulta no prevista: ${texto}`);
    },
    release: t.mock.fn()
  };
  t.mock.method(pool, 'connect', async () => cliente);

  const antes = await (await solicitar()).json();
  const repaso = await fetch(`${raiz}/lecciones/21/progreso`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token-prueba' },
    body: JSON.stringify({ idPaso: '101' })
  });
  assert.equal(repaso.status, 200);
  assert.equal((await repaso.json()).fechaFinalizacion, '2026-11-08T18:00:00.000Z');
  const despues = await (await solicitar()).json();

  assert.deepEqual(escrituras, []);
  assert.equal(sqlTransaccion.some((sql) => /certificados/.test(sql)), false);
  assert.deepEqual(despues, antes);
  assert.equal(despues[0].estado, 'terminado');
  assert.equal(despues[0].fechaFinalizacion, '2026-11-08T18:00:00.000Z');
  assert.equal(despues[0].fechaUltimaActividad, '2026-11-08T18:00:00.000Z');
  assert.deepEqual(despues[0].certificado, CERTIFICADO);
});

test('GET mis-cursos/terminados: la consulta solo usa el uid del token aunque la URL traiga otro', async (t) => {
  const simulacion = simular(t);
  const respuesta = await solicitar('?uid=otro-alumno&ahora=1990-01-01');
  assert.equal(respuesta.status, 200);
  for (const llamada of simulacion.consulta.mock.calls) assert.deepEqual(llamada.arguments[1], [UID]);
  assert.equal((simulacion.catalogos[0].match(/uid_estudiante = \$1/g) || []).length, 4);
  assert.equal(/\$2/.test(simulacion.catalogos[0]), false);
});

test('GET mis-cursos/terminados: dos estudiantes ven solo sus propios cursos y certificados', async (t) => {
  const porUid = (uid) => uid === UID
    ? [terminado('10', '2026-11-05T10:00:00.000Z', { certificado: CERTIFICADO }), retirado('11')]
    : [fila({ idCurso: '10' }), fila({ idCurso: '11', estado_publicacion: 'retirado', lecciones: [] })];
  const propio = await listar(t, porUid, { uid: UID });
  t.mock.restoreAll();
  t.mock.timers.reset();
  const ajeno = await listar(t, porUid, { uid: UID_OTRO });
  assert.deepEqual(propio.map((c) => c.idCurso), ['11', '10']);
  assert.deepEqual(ajeno, []);
  assert.equal(JSON.stringify(propio).includes(UID), false);
});

test('GET mis-cursos/terminados: fallo del catálogo devuelve 503 sin SQL ni detalles internos', async (t) => {
  const detalle = 'SELECT información privada de PostgreSQL';
  simular(t, { errorCatalogo: new Error(detalle) });
  const registro = t.mock.method(console, 'error', () => {});
  const respuesta = await solicitar();
  assert.equal(respuesta.status, 503);
  assert.equal(respuesta.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await respuesta.json(), {
    ok: false,
    mensaje: 'No fue posible consultar tus cursos. Intenta más tarde',
    codigo: 'mis_cursos_no_disponible'
  });
  assert.equal(JSON.stringify(registro.mock.calls).includes(detalle), false);
});

test('GET mis-cursos/terminados: terminado sin fecha de finalización es inconsistente y devuelve 503', async (t) => {
  simular(t, { filas: [terminado('10', null)] });
  t.mock.method(console, 'error', () => {});
  const respuesta = await solicitar();
  assert.equal(respuesta.status, 503);
  assert.equal((await respuesta.json()).codigo, 'mis_cursos_no_disponible');
});
