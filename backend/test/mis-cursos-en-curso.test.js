const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

process.env.DATABASE_URL = 'postgresql://prueba:prueba@localhost:5432/prueba';
process.env.FIREBASE_PROJECT_ID = 'demo-viva-tech-mis-cursos-en-curso';

const pool = require('../src/config/database');
const firebaseAuth = require('../src/config/firebase');
const app = require('../src/app');

let servidor;
let base;
const UID = 'uid-estudiante-prueba';
const UID_OTRO = 'uid-otro-estudiante';
const AHORA = new Date('2026-11-17T20:00:00.000Z');

before(async () => {
  await new Promise((resolve, reject) => {
    servidor = app.listen(0, '127.0.0.1', resolve);
    servidor.once('error', reject);
  });
  base = `http://127.0.0.1:${servidor.address().port}/api/mis-cursos`;
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

const enCurso = (idCurso, fechaUltimaActividad, cambios = {}) => fila({
  idCurso, tieneAvance: true, fechaUltimaActividad,
  lecciones: [leccion('21', 'completada'), leccion('22', 'en_progreso')],
  ...cambios
});

const historialProgreso = (orden, estado, fechaActualizacion) => ({
  idLeccion: String(20 + orden), tituloCurso: 'Curso ficticio', titulo: `Lección ${orden}`, orden,
  origen: 'progreso', estado, totalPasos: 3, pasosCompletados: estado === 'completada' ? 3 : 1,
  idUltimoPasoCompletado: '1', fechaInicio: '2026-11-01T10:00:00.000Z', fechaActualizacion,
  fechaFinalizacion: estado === 'completada' ? fechaActualizacion : null
});

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
  return fetch(`${base}/en-curso${sufijo}`, {
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
  test(`GET mis-cursos/en-curso: 401 con autenticación mal formada ${authorization}`, async (t) => {
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
  test(`GET mis-cursos/en-curso: 401 con token rechazado por Firebase ${code}`, async (t) => {
    const simulacion = simular(t, { errorToken: Object.assign(new Error('Token de prueba'), { code }) });
    const respuesta = await solicitar();
    assert.equal(respuesta.status, 401);
    assert.equal(respuesta.headers.get('cache-control'), 'no-store');
    assert.equal(simulacion.consulta.mock.callCount(), 0);
  });
}

for (const rol of ['maestro', 'administrador']) {
  test(`GET mis-cursos/en-curso: ${rol} recibe 403 rol_no_autorizado sin consultar cursos`, async (t) => {
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
  test(`GET mis-cursos/en-curso: ${codigo} sin consultar cursos`, async (t) => {
    const simulacion = simular(t, opciones);
    const respuesta = await solicitar();
    assert.equal(respuesta.status, estado);
    assert.equal(respuesta.headers.get('cache-control'), 'no-store');
    assert.equal((await respuesta.json()).codigo, codigo);
    assert.equal(simulacion.catalogos.length, 0);
  });
}

test('GET mis-cursos/en-curso: sin cursos en curso responde [] con no-store y sin transacción', async (t) => {
  const simulacion = simular(t);
  const respuesta = await solicitar();
  assert.equal(respuesta.status, 200);
  assert.equal(respuesta.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await respuesta.json(), []);
  assert.equal(simulacion.catalogos.length, 1);
  assert.equal(simulacion.conexion.mock.callCount(), 0);
});

test('GET mis-cursos/en-curso: respuesta idéntica en forma al ejemplo del contrato (D1 sobre B)', async (t) => {
  const cuerpo = await listar(t, [fila({
    idCategoria: '2', nombreCategoria: 'Banca móvil', ordenCategoria: 2,
    idCurso: '4', titulo: 'Uso seguro de la aplicación del banco',
    descripcion: 'Practica con una aplicación bancaria ficticia.',
    fecha_cierre: '2026-11-30', tieneAvance: true,
    fechaUltimaActividad: '2026-11-17T18:20:00.000Z',
    fechaFinalizacionCurso: '2026-11-17T18:10:00.000Z',
    lecciones: [
      leccion('21', 'completada', { titulo: 'Abrir la aplicación de forma segura', duracionEstimadaMinutos: 10 }),
      leccion('22', 'completada', { titulo: 'Consultar tu saldo y movimientos', duracionEstimadaMinutos: 12 }),
      leccion('23', 'pendiente', { titulo: 'Reconocer mensajes falsos del banco', duracionEstimadaMinutos: 15 })
    ]
  })]);

  const esperado = [{
    idCurso: '4',
    titulo: 'Uso seguro de la aplicación del banco',
    descripcion: 'Practica con una aplicación bancaria ficticia.',
    categoria: { idCategoria: '2', nombre: 'Banca móvil', orden: 2 },
    estado: 'en_curso',
    leccionesCompletadas: 2,
    totalLecciones: 3,
    duracionTotalMinutos: 37,
    fechaCierre: '2026-11-30',
    cerrado: false,
    retirado: false,
    siguienteLeccion: { idLeccion: '23', titulo: 'Reconocer mensajes falsos del banco' },
    fechaUltimaActividad: '2026-11-17T18:20:00.000Z',
    fechaFinalizacion: null,
    certificado: null,
    lecciones: [
      { idLeccion: '21', titulo: 'Abrir la aplicación de forma segura', duracionEstimadaMinutos: 10, estado: 'completada' },
      { idLeccion: '22', titulo: 'Consultar tu saldo y movimientos', duracionEstimadaMinutos: 12, estado: 'completada' },
      { idLeccion: '23', titulo: 'Reconocer mensajes falsos del banco', duracionEstimadaMinutos: 15, estado: 'pendiente' }
    ]
  }];
  assert.deepEqual(cuerpo, esperado);
  assert.deepEqual(Object.keys(cuerpo[0]), Object.keys(esperado[0]));
  assert.deepEqual(Object.keys(cuerpo[0].categoria), ['idCategoria', 'nombre', 'orden']);
  assert.deepEqual(Object.keys(cuerpo[0].siguienteLeccion), ['idLeccion', 'titulo']);
  for (const l of cuerpo[0].lecciones) {
    assert.deepEqual(Object.keys(l), ['idLeccion', 'titulo', 'duracionEstimadaMinutos', 'estado']);
  }
});

test('GET mis-cursos/en-curso: queda fuera el retirado incompleto y todo lo que no está en curso', async (t) => {
  const cuerpo = await listar(t, [
    enCurso('10', '2026-11-05T10:00:00.000Z'),
    fila({
      idCurso: '11', estado_publicacion: 'retirado', lecciones: [],
      tieneHistorial: true, completadoHistorico: false,
      leccionesHistorial: [
        historialProgreso(1, 'completada', '2026-11-16T10:00:00.000Z'),
        historialProgreso(2, 'en_progreso', '2026-11-16T11:00:00.000Z')
      ]
    }),
    fila({
      idCurso: '12', estado_publicacion: 'retirado', lecciones: [],
      tieneHistorial: true, completadoHistorico: true,
      fechaFinalizacionHistorica: '2026-11-09T12:00:00.000Z',
      leccionesHistorial: [historialProgreso(1, 'completada', '2026-11-09T12:00:00.000Z')]
    }),
    fila({ idCurso: '13', estado_publicacion: 'retirado', lecciones: [] }),
    fila({ idCurso: '14' }),
    fila({
      idCurso: '15', tieneAvance: true, fechaUltimaActividad: '2026-11-06T10:00:00.000Z',
      fechaFinalizacionCurso: '2026-11-06T10:00:00.000Z',
      lecciones: [leccion('21', 'completada'), leccion('22', 'completada')]
    }),
    fila({ idCurso: '16', fecha_cierre: '2026-11-10' }),
    fila({ idCurso: '17', estado_publicacion: 'borrador' })
  ]);
  assert.deepEqual(cuerpo.map((c) => c.idCurso), ['10']);
  assert.equal(cuerpo.some((c) => c.retirado), false);
});

test('GET mis-cursos/en-curso: el cerrado con avance aparece con cerrado true', async (t) => {
  const cuerpo = await listar(t, [
    enCurso('20', '2026-11-08T10:00:00.000Z', { fecha_cierre: '2026-11-10' }),
    enCurso('21', '2026-11-07T10:00:00.000Z', { fecha_cierre: '2026-11-30' })
  ]);
  assert.deepEqual(cuerpo.map((c) => [c.idCurso, c.cerrado, c.retirado, c.fechaCierre]), [
    ['20', true, false, '2026-11-10'],
    ['21', false, false, '2026-11-30']
  ]);
  assert.deepEqual(cuerpo[0].siguienteLeccion, { idLeccion: '22', titulo: 'Lección 22' });
  assert.equal(cuerpo[0].lecciones.length, 2);
});

test('GET mis-cursos/en-curso: el día de cierre en Ciudad de México todavía no lo cierra', async (t) => {
  const cuerpo = await listar(t, [enCurso('30', '2026-11-17T18:00:00.000Z', { fecha_cierre: '2026-11-17' })]);
  assert.equal(cuerpo[0].cerrado, false);
});

test('GET mis-cursos/en-curso: orden por fechaUltimaActividad descendente y luego idCurso descendente', async (t) => {
  const cuerpo = await listar(t, [
    enCurso('9', '2026-11-05T10:00:00.000Z'),
    enCurso('10', '2026-11-05T10:00:00.000Z', { idCategoria: '2', nombreCategoria: 'Otra', ordenCategoria: 2 }),
    enCurso('3', '2026-11-08T10:00:00.000Z', { fecha_cierre: '2026-11-10' }),
    enCurso('100', '2026-11-01T10:00:00.000Z')
  ]);
  assert.deepEqual(cuerpo.map((c) => c.idCurso), ['3', '10', '9', '100']);
});

test('GET mis-cursos/en-curso: la consulta solo usa el uid del token aunque la URL traiga otro', async (t) => {
  const simulacion = simular(t);
  const respuesta = await solicitar('?uid=otro-alumno&ahora=1990-01-01');
  assert.equal(respuesta.status, 200);
  for (const llamada of simulacion.consulta.mock.calls) assert.deepEqual(llamada.arguments[1], [UID]);
  const sql = simulacion.catalogos[0];
  assert.equal((sql.match(/uid_estudiante = \$1/g) || []).length, 4);
  assert.equal(/\$2/.test(sql), false);
});

test('GET mis-cursos/en-curso: dos estudiantes ven solo su propio avance', async (t) => {
  const porUid = (uid) => uid === UID
    ? [enCurso('10', '2026-11-08T10:00:00.000Z')]
    : [fila({ idCurso: '10' })];
  const propio = await listar(t, porUid, { uid: UID });
  t.mock.restoreAll();
  t.mock.timers.reset();
  const ajeno = await listar(t, porUid, { uid: UID_OTRO });
  assert.deepEqual(propio.map((c) => c.idCurso), ['10']);
  assert.equal(propio[0].leccionesCompletadas, 1);
  assert.deepEqual(ajeno, []);
  assert.equal(JSON.stringify(propio).includes(UID), false);
});

test('GET mis-cursos/en-curso: fallo del catálogo devuelve 503 sin SQL ni detalles internos', async (t) => {
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

test('GET mis-cursos/en-curso: datos inconsistentes devuelven 503', async (t) => {
  simular(t, { filas: [fila({ tieneAvance: true, lecciones: [leccion('21', 'otro')] })] });
  t.mock.method(console, 'error', () => {});
  const respuesta = await solicitar();
  assert.equal(respuesta.status, 503);
  assert.equal((await respuesta.json()).codigo, 'mis_cursos_no_disponible');
});

test('GET mis-cursos: la ruta vieja (22.5) ya no existe y responde 404 sin consultar', async (t) => {
  const { verificar, consulta } = simular(t, { filas: [{ ...enCurso('10', '2026-11-08T10:00:00.000Z') }] });
  const respuesta = await fetch(base, { headers: { Authorization: 'Bearer token-prueba' } });
  assert.equal(respuesta.status, 404);
  assert.equal(verificar.mock.callCount(), 0);
  assert.equal(consulta.mock.callCount(), 0);
});
