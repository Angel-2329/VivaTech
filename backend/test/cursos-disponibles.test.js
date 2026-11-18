const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

process.env.DATABASE_URL = 'postgresql://prueba:prueba@localhost:5432/prueba';
process.env.FIREBASE_PROJECT_ID = 'demo-viva-tech-cursos-disponibles';

const pool = require('../src/config/database');
const firebaseAuth = require('../src/config/firebase');
const app = require('../src/app');

let servidor;
let url;
const UID = 'uid-estudiante-prueba';
const UID_OTRO = 'uid-otro-estudiante';

before(async () => {
  await new Promise((resolve, reject) => {
    servidor = app.listen(0, '127.0.0.1', resolve);
    servidor.once('error', reject);
  });
  url = `http://127.0.0.1:${servidor.address().port}/api/cursos-disponibles`;
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
  return fetch(`${url}${sufijo}`, { headers: authorization === null ? {} : { Authorization: authorization } });
}

async function cursos(t, filas, opciones = {}) {
  simular(t, { ...opciones, filas });
  const respuesta = await solicitar();
  assert.equal(respuesta.status, 200);
  assert.equal(respuesta.headers.get('cache-control'), 'no-store');
  return respuesta.json();
}


for (const authorization of [null, 'Basic prueba', 'Bearer', 'Bearer uno,dos']) {
  test(`GET cursos disponibles: 401 con autenticación mal formada ${authorization}`, async (t) => {
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
  test(`GET cursos disponibles: 401 con token rechazado por Firebase ${code}`, async (t) => {
    const simulacion = simular(t, { errorToken: Object.assign(new Error('Token de prueba'), { code }) });
    const respuesta = await solicitar();
    assert.equal(respuesta.status, 401);
    assert.equal(respuesta.headers.get('cache-control'), 'no-store');
    assert.equal(simulacion.verificar.mock.callCount(), 1);
    assert.equal(simulacion.consulta.mock.callCount(), 0);
  });
}

for (const rol of ['maestro', 'administrador']) {
  test(`GET cursos disponibles: ${rol} recibe 403 rol_no_autorizado sin consultar el catálogo`, async (t) => {
    const simulacion = simular(t, { rol });
    const respuesta = await solicitar();
    assert.equal(respuesta.status, 403);
    assert.equal(respuesta.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await respuesta.json(), {
      ok: false, mensaje: 'No tienes permisos para realizar esta acción', codigo: 'rol_no_autorizado'
    });
    assert.equal(simulacion.consulta.mock.callCount(), 1);
    assert.equal(simulacion.catalogos.length, 0);
  });
}

test('GET cursos disponibles: cuenta desactivada recibe 403 cuenta_desactivada', async (t) => {
  const simulacion = simular(t, { activo: false });
  const respuesta = await solicitar();
  assert.equal(respuesta.status, 403);
  assert.equal((await respuesta.json()).codigo, 'cuenta_desactivada');
  assert.equal(simulacion.catalogos.length, 0);
});

test('GET cursos disponibles: perfil inexistente recibe 404 perfil_no_registrado', async (t) => {
  const simulacion = simular(t, { sinPerfil: true });
  const respuesta = await solicitar();
  assert.equal(respuesta.status, 404);
  assert.equal((await respuesta.json()).codigo, 'perfil_no_registrado');
  assert.equal(simulacion.catalogos.length, 0);
});


test('GET cursos disponibles: sin cursos visibles responde [] con no-store', async (t) => {
  const simulacion = simular(t);
  const respuesta = await solicitar();
  assert.equal(respuesta.status, 200);
  assert.equal(respuesta.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await respuesta.json(), []);
  assert.equal(simulacion.catalogos.length, 1);
  assert.equal(simulacion.conexion.mock.callCount(), 0);
});

test('GET cursos disponibles: respuesta idéntica en forma al ejemplo del contrato (C y B)', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-17T20:00:00.000Z') });
  const cuerpo = await cursos(t, [fila({
    idCategoria: '2', nombreCategoria: 'Banca móvil', ordenCategoria: 2,
    idCurso: '4', titulo: 'Uso seguro de la aplicación del banco',
    descripcion: 'Practica con una aplicación bancaria ficticia.',
    fecha_cierre: '2026-11-30', tieneAvance: true,
    fechaUltimaActividad: '2026-11-17T18:20:00.000Z',
    fechaFinalizacionCurso: '2026-11-17T18:10:00.000Z',
    lecciones: [
      leccion('21', 'completada', { duracionEstimadaMinutos: 12 }),
      leccion('22', 'completada', { duracionEstimadaMinutos: 12 }),
      leccion('23', 'pendiente', { titulo: 'Reconocer mensajes falsos del banco', duracionEstimadaMinutos: 13 })
    ]
  })]);
  const esperado = [{
    idCategoria: '2', nombre: 'Banca móvil', orden: 2,
    cursos: [{
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
      certificado: null
    }]
  }];
  assert.deepEqual(cuerpo, esperado);
  assert.deepEqual(Object.keys(cuerpo[0]), Object.keys(esperado[0]));
  assert.deepEqual(Object.keys(cuerpo[0].cursos[0]), Object.keys(esperado[0].cursos[0]));
  assert.equal(Object.hasOwn(cuerpo[0].cursos[0], 'lecciones'), false);
});

test('GET cursos disponibles: certificado con idCertificado, folio y codigoVerificacion', async (t) => {
  const certificado = {
    idCertificado: '5', folio: 'VT-2026-000005', codigoVerificacion: '3f1c2e4a-0b6d-4c8e-9a7f-1d2e3c4b5a69'
  };
  const cuerpo = await cursos(t, [fila({
    tieneAvance: true, fechaUltimaActividad: '2026-11-17T18:20:00.000Z',
    fechaFinalizacionCurso: '2026-11-17T18:10:00.000Z', certificado,
    lecciones: [leccion('21', 'completada'), leccion('22', 'completada')]
  })]);
  assert.deepEqual(cuerpo[0].cursos[0].certificado, certificado);
  assert.deepEqual(Object.keys(cuerpo[0].cursos[0].certificado), ['idCertificado', 'folio', 'codigoVerificacion']);
});


test('GET cursos disponibles: no aparecen borradores, retirados ni cerrados sin avance', async (t) => {
  const cuerpo = await cursos(t, [
    fila({ idCurso: '10', estado_publicacion: 'borrador' }),
    fila({
      idCurso: '11', estado_publicacion: 'retirado', tieneHistorial: true, completadoHistorico: true,
      leccionesHistorial: [{ titulo: 'Lección', orden: 1, estado: 'completada', origen: 'certificado', tituloCurso: 'Curso' }],
      fechaFinalizacionHistorica: '2026-11-10T10:00:00.000Z', lecciones: [],
      certificado: { idCertificado: '9', folio: 'VT-2026-000009', codigoVerificacion: 'uuid-ficticio' }
    }),
    fila({ idCurso: '12', estado_publicacion: 'retirado', tieneHistorial: false, lecciones: [] }),
    fila({ idCurso: '13', fecha_cierre: '2000-01-01', tieneAvance: false }),
    fila({ idCurso: '14' })
  ]);
  assert.deepEqual(cuerpo.map((c) => c.cursos.map((curso) => curso.idCurso)), [['14']]);
});

test('GET cursos disponibles: cerrado con avance aparece con cerrado true (en curso y terminado)', async (t) => {
  const cuerpo = await cursos(t, [
    fila({
      idCurso: '20', fecha_cierre: '2000-01-01', tieneAvance: true,
      fechaUltimaActividad: '2026-11-01T10:00:00.000Z',
      lecciones: [leccion('21', 'completada'), leccion('22', 'en_progreso')]
    }),
    fila({
      idCurso: '30', fecha_cierre: '2000-01-01', tieneAvance: true,
      fechaUltimaActividad: '2026-11-02T10:00:00.000Z', fechaFinalizacionCurso: '2026-11-02T09:00:00.000Z',
      lecciones: [leccion('31', 'completada'), leccion('32', 'completada')]
    })
  ]);
  const [enCurso, terminado] = cuerpo[0].cursos;
  assert.equal(enCurso.idCurso, '20');
  assert.equal(enCurso.estado, 'en_curso');
  assert.equal(enCurso.cerrado, true);
  assert.equal(enCurso.fechaCierre, '2000-01-01');
  assert.deepEqual(enCurso.siguienteLeccion, { idLeccion: '22', titulo: 'Lección 22' });
  assert.equal(terminado.idCurso, '30');
  assert.equal(terminado.estado, 'terminado');
  assert.equal(terminado.cerrado, true);
  assert.equal(terminado.siguienteLeccion, null);
});

test('GET cursos disponibles: disponible aparece con cualquier estado; fecha de cierre futura no lo cierra', async (t) => {
  const cuerpo = await cursos(t, [
    fila({ idCurso: '40', fecha_cierre: '2999-12-31' }),
    fila({
      idCurso: '41', tieneAvance: true, fechaUltimaActividad: '2026-11-03T10:00:00.000Z',
      lecciones: [leccion('42', 'en_progreso'), leccion('43')]
    }),
    fila({
      idCurso: '44', tieneAvance: true, fechaUltimaActividad: '2026-11-04T10:00:00.000Z',
      fechaFinalizacionCurso: '2026-11-04T09:30:00.000Z',
      lecciones: [leccion('45', 'completada')]
    })
  ]);
  const resumenes = cuerpo[0].cursos;
  assert.deepEqual(resumenes.map((c) => [c.idCurso, c.estado, c.cerrado]), [
    ['40', 'sin_empezar', false], ['41', 'en_curso', false], ['44', 'terminado', false]
  ]);
  assert.equal(resumenes[0].fechaCierre, '2999-12-31');
});


test('GET cursos disponibles: estados, contadores y fechas se calculan bien', async (t) => {
  const cuerpo = await cursos(t, [
    fila({
      idCurso: '50', fechaUltimaActividad: null,
      lecciones: [leccion('51', 'pendiente', { duracionEstimadaMinutos: 5 }), leccion('52', 'pendiente', { duracionEstimadaMinutos: 7 })]
    }),
    fila({
      idCurso: '60', tieneAvance: true, fechaUltimaActividad: '2026-11-05T10:00:00.000Z',
      fechaFinalizacionCurso: '2026-11-05T09:00:00.000Z',
      lecciones: [leccion('61', 'completada'), leccion('62', 'en_progreso'), leccion('63')]
    }),
    fila({
      idCurso: '70', tieneAvance: true, fechaUltimaActividad: '2026-11-06T10:00:00.000Z',
      fechaFinalizacionCurso: '2026-11-06T09:45:00.000Z',
      lecciones: [leccion('71', 'completada'), leccion('72', 'completada')]
    })
  ]);
  const [sinEmpezar, enCurso, terminado] = cuerpo[0].cursos;
  assert.deepEqual(
    [sinEmpezar.estado, sinEmpezar.leccionesCompletadas, sinEmpezar.totalLecciones, sinEmpezar.duracionTotalMinutos],
    ['sin_empezar', 0, 2, 12]
  );
  assert.deepEqual(sinEmpezar.siguienteLeccion, { idLeccion: '51', titulo: 'Lección 51' });
  assert.equal(sinEmpezar.fechaUltimaActividad, null);
  assert.equal(sinEmpezar.fechaFinalizacion, null);

  assert.deepEqual([enCurso.estado, enCurso.leccionesCompletadas, enCurso.totalLecciones], ['en_curso', 1, 3]);
  assert.equal(enCurso.fechaUltimaActividad, '2026-11-05T10:00:00.000Z');
  assert.equal(enCurso.fechaFinalizacion, null);

  assert.deepEqual([terminado.estado, terminado.leccionesCompletadas, terminado.totalLecciones], ['terminado', 2, 2]);
  assert.equal(terminado.siguienteLeccion, null);
  assert.equal(terminado.fechaUltimaActividad, '2026-11-06T10:00:00.000Z');
  assert.equal(terminado.fechaFinalizacion, '2026-11-06T09:45:00.000Z');
  for (const resumen of cuerpo[0].cursos) assert.equal(resumen.retirado, false);
});

test('GET cursos disponibles: siguienteLeccion correcta con navegación libre', async (t) => {
  const cuerpo = await cursos(t, [
    fila({ idCurso: '80', tieneAvance: true, fechaUltimaActividad: '2026-11-07T10:00:00.000Z',
      lecciones: [leccion('81', 'completada'), leccion('82'), leccion('83', 'en_progreso')] }),
    fila({ idCurso: '84', tieneAvance: true, fechaUltimaActividad: '2026-11-07T10:00:00.000Z',
      lecciones: [leccion('85', 'completada'), leccion('86'), leccion('87', 'completada')] }),
    fila({ idCurso: '88', tieneAvance: true, fechaUltimaActividad: '2026-11-07T10:00:00.000Z',
      lecciones: [leccion('89'), leccion('90', 'completada'), leccion('91')] }),
    fila({ idCurso: '92', tieneAvance: true, fechaUltimaActividad: '2026-11-07T10:00:00.000Z',
      lecciones: [leccion('93', 'en_progreso'), leccion('94', 'en_progreso'), leccion('95')] })
  ]);
  assert.deepEqual(cuerpo[0].cursos.map((c) => c.siguienteLeccion.idLeccion), ['83', '86', '89', '93']);
});


test('GET cursos disponibles: conserva el orden de categorías y cursos y omite categorías vacías', async (t) => {
  const simulacion = simular(t, { filas: [
    fila({ idCategoria: '7', nombreCategoria: 'Primera', ordenCategoria: 1, idCurso: '100' }),
    fila({ idCategoria: '7', nombreCategoria: 'Primera', ordenCategoria: 1, idCurso: '101' }),
    fila({ idCategoria: '3', nombreCategoria: 'Solo borrador', ordenCategoria: 2, idCurso: '102', estado_publicacion: 'borrador' }),
    fila({ idCategoria: '4', nombreCategoria: 'Solo cerrado sin avance', ordenCategoria: 3, idCurso: '103', fecha_cierre: '2000-01-01' }),
    fila({ idCategoria: '5', nombreCategoria: 'Tercera', ordenCategoria: 4, idCurso: '104' })
  ] });
  const cuerpo = await (await solicitar()).json();
  assert.deepEqual(cuerpo.map((c) => [c.idCategoria, c.nombre, c.orden]), [['7', 'Primera', 1], ['5', 'Tercera', 4]]);
  assert.deepEqual(cuerpo.map((c) => c.cursos.map((curso) => curso.idCurso)), [['100', '101'], ['104']]);
  assert.match(simulacion.catalogos[0], /ORDER BY ca\.orden, ca\.id_categoria, c\.orden, c\.id_curso\s*$/);
  assert.match(simulacion.catalogos[0], /ORDER BY l\.orden, l\.id_leccion/);
});


test('GET cursos disponibles: la consulta filtra progreso, historial y certificados por el solicitante', async (t) => {
  const simulacion = simular(t);
  await solicitar('?uid=otro-alumno&ahora=1990-01-01');
  const sql = simulacion.catalogos[0];
  for (const llamada of simulacion.consulta.mock.calls) assert.deepEqual(llamada.arguments[1], [UID]);
  assert.match(sql, /LEFT JOIN historial_cursos_retirados h\s+ON h\.id_curso = c\.id_curso AND h\.uid_estudiante = \$1/);
  assert.match(sql, /LEFT JOIN certificados cert\s+ON cert\.id_curso = c\.id_curso AND cert\.uid_estudiante = \$1/);
  assert.match(sql, /WHERE l\.id_curso = c\.id_curso\s+AND p\.uid_estudiante = \$1/);
  assert.match(sql, /LEFT JOIN progresos p\s+ON p\.id_leccion = l\.id_leccion AND p\.uid_estudiante = \$1/);
  assert.equal((sql.match(/uid_estudiante = \$1/g) || []).length, 4);
  assert.equal(/\$2/.test(sql), false);
});

test('GET cursos disponibles: dos estudiantes ven solo su propio avance en el mismo curso', async (t) => {
  const porUid = (uid) => uid === UID
    ? [fila({ tieneAvance: true, fechaUltimaActividad: '2026-11-08T10:00:00.000Z',
      lecciones: [leccion('21', 'completada'), leccion('22', 'en_progreso')],
      certificado: null })]
    : [fila()];
  const propio = await cursos(t, porUid, { uid: UID });
  t.mock.restoreAll();
  const ajeno = await cursos(t, porUid, { uid: UID_OTRO });
  assert.equal(propio[0].cursos[0].estado, 'en_curso');
  assert.equal(propio[0].cursos[0].leccionesCompletadas, 1);
  assert.equal(ajeno[0].cursos[0].estado, 'sin_empezar');
  assert.equal(ajeno[0].cursos[0].leccionesCompletadas, 0);
  assert.equal(ajeno[0].cursos[0].fechaUltimaActividad, null);
  assert.equal(JSON.stringify(ajeno).includes(UID), false);
  assert.equal(JSON.stringify(propio).includes(UID), false);
});


test('GET cursos disponibles: fallo del catálogo devuelve 503 sin SQL ni detalles internos', async (t) => {
  const detalle = 'SELECT información privada de PostgreSQL';
  simular(t, { errorCatalogo: new Error(detalle) });
  const registro = t.mock.method(console, 'error', () => {});
  const respuesta = await solicitar();
  assert.equal(respuesta.status, 503);
  assert.equal(respuesta.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await respuesta.json(), {
    ok: false,
    mensaje: 'No fue posible consultar los cursos disponibles. Intenta más tarde',
    codigo: 'cursos_disponibles_no_disponible'
  });
  assert.equal(registro.mock.callCount(), 1);
  assert.equal(JSON.stringify(registro.mock.calls[0].arguments).includes(detalle), false);
});

for (const [nombre, cambios] of [
  ['curso terminado sin fecha de finalización', { tieneAvance: true, lecciones: [leccion('21', 'completada')], fechaFinalizacionCurso: null }],
  ['estado de lección desconocido', { lecciones: [leccion('21', 'otro')] }],
  ['indicador de avance ausente', { tieneAvance: null }]
]) {
  test(`GET cursos disponibles: datos inconsistentes (${nombre}) devuelven 503`, async (t) => {
    simular(t, { filas: [fila(cambios)] });
    t.mock.method(console, 'error', () => {});
    const respuesta = await solicitar();
    assert.equal(respuesta.status, 503);
    assert.equal((await respuesta.json()).codigo, 'cursos_disponibles_no_disponible');
  });
}

test('GET cursos disponibles: fallo de Firebase no consulta PostgreSQL', async (t) => {
  const simulacion = simular(t, { errorToken: Object.assign(new Error('Fallo simulado'), { code: 'app/network-error' }) });
  t.mock.method(console, 'error', () => {});
  const respuesta = await solicitar();
  assert.equal(respuesta.status, 503);
  assert.equal(simulacion.consulta.mock.callCount(), 0);
});
