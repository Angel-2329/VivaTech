const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

process.env.DATABASE_URL =
  'postgresql://prueba:prueba@localhost:5432/prueba';
process.env.FIREBASE_PROJECT_ID = 'demo-viva-tech-grupos-retiro';

const pool = require('../src/config/database');
const firebaseAuth = require('../src/config/firebase');
const app = require('../src/app');
const {
  ErrorOperacionGrupo,
  retirarTodosEstudiantes,
  retirarEstudiantesSeleccionados
} = require('../src/services/grupos');

let servidor;
let urlGrupos;

before(async () => {
  await new Promise((resolve, reject) => {
    servidor = app.listen(0, '127.0.0.1', resolve);
    servidor.once('error', reject);
  });

  urlGrupos = `http://127.0.0.1:${servidor.address().port}/api/grupos`;
});

after(async () => {
  if (servidor) {
    servidor.closeAllConnections();
    await new Promise((resolve, reject) => {
      servidor.close((error) => (error ? reject(error) : resolve()));
    });
  }

  await pool.end();
});

const administrador = { uid: 'uid-solicitante', rol: 'administrador', activo: true };
const maestro = { ...administrador, rol: 'maestro' };

function uids(cantidad, prefijo = 'uid-estudiante') {
  return Array.from({ length: cantidad }, (_, i) => `${prefijo}-${i + 1}`);
}


function inicio(usuario = administrador, { grupoExiste = true, asignado = true } = {}) {
  const pasos = [
    { sql: /^BEGIN$/ },
    {
      sql: /FROM usuarios[\s\S]*WHERE uid = \$1[\s\S]*FOR SHARE/,
      parametros: [usuario.uid],
      filas: [usuario]
    }
  ];

  if (usuario.activo && ['maestro', 'administrador'].includes(usuario.rol)) {
    pasos.push({
      sql: /FROM grupos[\s\S]*WHERE id_grupo = \$1[\s\S]*FOR UPDATE/,
      parametros: ['7'],
      filas: grupoExiste ? [{ id_grupo: '7' }] : []
    });

    if (grupoExiste && usuario.rol === 'maestro') {
      pasos.push({
        sql: /FROM grupo_maestros[\s\S]*uid_maestro = \$2[\s\S]*FOR SHARE/,
        parametros: ['7', usuario.uid],
        filas: asignado ? [{ id_grupo: '7' }] : []
      });
    }
  }

  return pasos;
}

function borrarTodos(borrados, error) {
  return {
    sql: /^\s*DELETE FROM grupo_estudiantes\s+WHERE id_grupo = \$1\s+RETURNING uid_estudiante\s*$/,
    parametros: ['7'],
    filas: borrados.map((uid) => ({ uid_estudiante: uid })),
    error
  };
}

function borrarSeleccion(solicitados, borrados, error) {
  return {
    sql: /^\s*DELETE FROM grupo_estudiantes\s+WHERE id_grupo = \$1 AND uid_estudiante = ANY\(\$2::text\[\]\)\s+RETURNING uid_estudiante\s*$/,
    parametros: ['7', solicitados],
    filas: borrados.map((uid) => ({ uid_estudiante: uid })),
    error
  };
}

function simularCliente(t, pasos) {
  const cliente = crearCliente(t, pasos);
  const conexion = t.mock.method(pool, 'connect', async () => cliente);

  return { cliente, conexion };
}

function crearCliente(t, pasos) {
  let posicion = 0;
  return {
    query: t.mock.fn(async (sql, parametros) => {
      const paso = pasos[posicion++];
      assert.ok(paso, `Consulta inesperada: ${sql}`);
      assert.match(sql, paso.sql);
      assert.deepEqual(parametros, paso.parametros);
      if (paso.error) throw paso.error;
      const filas = paso.filas || [];
      return { rows: filas, rowCount: filas.length };
    }),
    release: t.mock.fn()
  };
}

function comprobarFinal(simulacion, pasos, errorAlRevertir) {
  assert.equal(simulacion.conexion.mock.callCount(), 1);
  assert.equal(simulacion.cliente.query.mock.callCount(), pasos.length);
  assert.equal(simulacion.cliente.release.mock.callCount(), 1);
  assert.deepEqual(simulacion.cliente.release.mock.calls[0].arguments, [errorAlRevertir]);
}

function comprobarSoloAsignacionesDelGrupo(simulacion) {
  const escrituras = simulacion.cliente.query.mock.calls
    .map((llamada) => llamada.arguments)
    .filter(([sql]) => /^\s*(INSERT|UPDATE|DELETE|TRUNCATE|DROP|ALTER)\b/i.test(sql));

  for (const { arguments: [sql] } of simulacion.cliente.query.mock.calls) {
    assert.doesNotMatch(sql.replace(/FOR (UPDATE|SHARE)/g, ''), /\b(INSERT|UPDATE|TRUNCATE|CASCADE)\b/i);
  }

  for (const [sql, parametros] of escrituras) {
    assert.match(sql, /^\s*DELETE FROM grupo_estudiantes\s+WHERE id_grupo = \$1\b/);
    assert.equal(parametros[0], '7');
    assert.doesNotMatch(sql, /CASCADE|grupo_maestros|usuarios|progresos|certificados|historial|\bgrupos\b|activo/i);
  }

  return escrituras.length;
}

function errorEsperado(estado, codigo) {
  return (error) => {
    assert.ok(error instanceof ErrorOperacionGrupo);
    assert.equal(error.estado, estado);
    assert.equal(error.codigo, codigo);
    return true;
  };
}


for (const usuario of [administrador, maestro]) {
  test(`E1 servicio: ${usuario.rol} retira a todos y confirma`, async (t) => {
    const pasos = [
      ...inicio(usuario),
      borrarTodos(['uid-a', 'uid-b', 'uid-c']),
      { sql: /^COMMIT$/ }
    ];
    const simulacion = simularCliente(t, pasos);

    assert.deepEqual(await retirarTodosEstudiantes(usuario.uid, '7'), { retirados: 3 });
    assert.equal(comprobarSoloAsignacionesDelGrupo(simulacion), 1);
    comprobarFinal(simulacion, pasos);
  });
}

test('E1 servicio: grupo vacío responde 0 (repetir es seguro)', async (t) => {
  const pasos = [...inicio(), borrarTodos([]), { sql: /^COMMIT$/ }];
  const simulacion = simularCliente(t, pasos);

  assert.deepEqual(await retirarTodosEstudiantes(administrador.uid, '7'), { retirados: 0 });
  comprobarFinal(simulacion, pasos);
});

test('E1 servicio: más de 100 estudiantes se retiran en una sola operación', async (t) => {
  const pasos = [...inicio(), borrarTodos(uids(150)), { sql: /^COMMIT$/ }];
  const simulacion = simularCliente(t, pasos);

  assert.deepEqual(await retirarTodosEstudiantes(administrador.uid, '7'), { retirados: 150 });
  comprobarFinal(simulacion, pasos);
});

for (const escenario of [
  { nombre: 'maestro de otro grupo', usuario: maestro, opciones: { asignado: false } },
  { nombre: 'grupo inexistente', usuario: administrador, opciones: { grupoExiste: false } }
]) {
  for (const [ruta, accion] of [
    ['E1', (u) => retirarTodosEstudiantes(u, '7')],
    ['E2', (u) => retirarEstudiantesSeleccionados(u, '7', ['uid-a'])]
  ]) {
    test(`${ruta} servicio: ${escenario.nombre} → 404 sin retirar a nadie`, async (t) => {
      const pasos = [...inicio(escenario.usuario, escenario.opciones), { sql: /^ROLLBACK$/ }];
      const simulacion = simularCliente(t, pasos);

      await assert.rejects(accion(escenario.usuario.uid), errorEsperado(404, 'grupo_no_encontrado'));
      assert.equal(comprobarSoloAsignacionesDelGrupo(simulacion), 0);
      comprobarFinal(simulacion, pasos);
    });
  }
}

for (const escenario of [
  { nombre: 'solicitante desactivado', usuario: { ...maestro, activo: false }, codigo: 'cuenta_desactivada' },
  { nombre: 'solicitante estudiante', usuario: { ...maestro, rol: 'estudiante' }, codigo: 'rol_no_autorizado' }
]) {
  for (const [ruta, accion] of [
    ['E1', (u) => retirarTodosEstudiantes(u, '7')],
    ['E2', (u) => retirarEstudiantesSeleccionados(u, '7', ['uid-a'])]
  ]) {
    test(`${ruta} servicio: ${escenario.nombre} → 403 sin retirar a nadie`, async (t) => {
      const pasos = [...inicio(escenario.usuario), { sql: /^ROLLBACK$/ }];
      const simulacion = simularCliente(t, pasos);

      await assert.rejects(accion(escenario.usuario.uid), errorEsperado(403, escenario.codigo));
      assert.equal(comprobarSoloAsignacionesDelGrupo(simulacion), 0);
      comprobarFinal(simulacion, pasos);
    });
  }
}

for (const [ruta, accion, borrar] of [
  ['E1', () => retirarTodosEstudiantes(administrador.uid, '7'), (e) => borrarTodos([], e)],
  ['E2', () => retirarEstudiantesSeleccionados(administrador.uid, '7', ['uid-a', 'uid-b']),
    (e) => borrarSeleccion(['uid-a', 'uid-b'], [], e)]
]) {
  test(`${ruta} servicio: fallo forzado revierte y no retira a nadie`, async (t) => {
    const fallo = new Error('Fallo simulado de borrado');
    const pasos = [...inicio(), borrar(fallo), { sql: /^ROLLBACK$/ }];
    const simulacion = simularCliente(t, pasos);

    await assert.rejects(accion(), (error) => error === fallo);
    assert.equal(simulacion.cliente.query.mock.calls.some(({ arguments: [sql] }) => /^COMMIT$/.test(sql)), false);
    comprobarFinal(simulacion, pasos);
  });

  test(`${ruta} servicio: fallo al revertir descarta la conexión`, async (t) => {
    const fallo = new Error('Fallo simulado de borrado');
    const falloRollback = new Error('Fallo simulado de reversión');
    const pasos = [...inicio(), borrar(fallo), { sql: /^ROLLBACK$/, error: falloRollback }];
    const simulacion = simularCliente(t, pasos);

    await assert.rejects(accion(), (error) => error === fallo);
    comprobarFinal(simulacion, pasos, falloRollback);
  });
}


test('E2 servicio: separa retirados y noEstaban en el orden de llegada', async (t) => {
  const solicitados = ['uid-estudiante-1', 'uid-estudiante-2', 'uid-estudiante-3'];
  const pasos = [
    ...inicio(maestro),
    borrarSeleccion(solicitados, ['uid-estudiante-3', 'uid-estudiante-1']),
    { sql: /^COMMIT$/ }
  ];
  const simulacion = simularCliente(t, pasos);

  assert.deepEqual(
    await retirarEstudiantesSeleccionados(maestro.uid, '7', solicitados),
    { retirados: ['uid-estudiante-1', 'uid-estudiante-3'], noEstaban: ['uid-estudiante-2'] }
  );
  assert.equal(comprobarSoloAsignacionesDelGrupo(simulacion), 1);
  comprobarFinal(simulacion, pasos);
});

test('E2 servicio: nadie estaba → 200 con retirados vacío', async (t) => {
  const pasos = [...inicio(), borrarSeleccion(['uid-x', 'uid-y'], []), { sql: /^COMMIT$/ }];
  const simulacion = simularCliente(t, pasos);

  assert.deepEqual(
    await retirarEstudiantesSeleccionados(administrador.uid, '7', ['uid-x', 'uid-y']),
    { retirados: [], noEstaban: ['uid-x', 'uid-y'] }
  );
  comprobarFinal(simulacion, pasos);
});

test('E2 servicio: uids repetidos se toman una sola vez', async (t) => {
  const pasos = [...inicio(), borrarSeleccion(['uid-b', 'uid-a'], ['uid-a']), { sql: /^COMMIT$/ }];
  const simulacion = simularCliente(t, pasos);

  assert.deepEqual(
    await retirarEstudiantesSeleccionados(administrador.uid, '7', ['uid-b', 'uid-a', 'uid-b', 'uid-a']),
    { retirados: ['uid-a'], noEstaban: ['uid-b'] }
  );
  comprobarFinal(simulacion, pasos);
});

test('E2 servicio: un estudiante desactivado se retira (el borrado no filtra por activo)', async (t) => {
  const pasos = [...inicio(), borrarSeleccion(['uid-desactivado'], ['uid-desactivado']), { sql: /^COMMIT$/ }];
  const simulacion = simularCliente(t, pasos);

  assert.deepEqual(
    await retirarEstudiantesSeleccionados(administrador.uid, '7', ['uid-desactivado']),
    { retirados: ['uid-desactivado'], noEstaban: [] }
  );
  comprobarSoloAsignacionesDelGrupo(simulacion);
  comprobarFinal(simulacion, pasos);
});

test('E2 servicio: 100 uids en una sola operación', async (t) => {
  const solicitados = uids(100);
  const pasos = [...inicio(), borrarSeleccion(solicitados, solicitados.slice(0, 60)), { sql: /^COMMIT$/ }];
  const simulacion = simularCliente(t, pasos);

  const resultado = await retirarEstudiantesSeleccionados(administrador.uid, '7', solicitados);
  assert.deepEqual(resultado.retirados, solicitados.slice(0, 60));
  assert.deepEqual(resultado.noEstaban, solicitados.slice(60));
  comprobarFinal(simulacion, pasos);
});


function simularSolicitante(t, rol, cliente) {
  t.mock.method(firebaseAuth, 'verifyIdToken', async () => ({ uid: 'uid-solicitante' }));

  const consulta = t.mock.method(pool, 'query', async (sql, valores) => {
    assert.match(sql, /WHERE uid = \$1/);
    assert.deepEqual(valores, ['uid-solicitante']);
    return {
      rowCount: 1,
      rows: [{
        uid: 'uid-solicitante', nombre_completo: 'Solicitante de Prueba',
        nombre_apodo: null, rol, activo: true
      }]
    };
  });

  const conexion = t.mock.method(pool, 'connect', async () => {
    if (cliente) return cliente;
    throw new Error('No debería iniciarse una operación de grupos');
  });

  return { consulta, conexion };
}

async function solicitar(metodo, ruta, { cuerpo, crudo, autenticado = true } = {}) {
  const headers = {};
  if (autenticado) headers.Authorization = 'Bearer token-prueba';
  if (cuerpo !== undefined || crudo !== undefined) headers['Content-Type'] = 'application/json';

  const respuesta = await fetch(`${urlGrupos}${ruta}`, {
    method: metodo,
    headers,
    body: crudo !== undefined ? crudo : cuerpo === undefined ? undefined : JSON.stringify(cuerpo)
  });

  return { respuesta, cuerpo: await respuesta.json() };
}

const rutas = [
  { nombre: 'E1 retirar a todos', metodo: 'DELETE', ruta: '/1/estudiantes' },
  { nombre: 'E2 retirar seleccionados', metodo: 'POST', ruta: '/1/estudiantes/retiros', cuerpo: { uids: ['uid-a'] } }
];

for (const r of rutas) {
  test(`${r.nombre}: sin token responde 401 sin consultar la base`, async (t) => {
    const consulta = t.mock.method(pool, 'query', async () => { throw new Error('No debería consultarse'); });
    const conexion = t.mock.method(pool, 'connect', async () => { throw new Error('No debería conectarse'); });

    const { respuesta, cuerpo } = await solicitar(r.metodo, r.ruta, { cuerpo: r.cuerpo, autenticado: false });
    assert.equal(respuesta.status, 401);
    assert.equal(cuerpo.ok, false);
    assert.equal(consulta.mock.callCount(), 0);
    assert.equal(conexion.mock.callCount(), 0);
  });

  test(`${r.nombre}: estudiante recibe 403 rol_no_autorizado`, async (t) => {
    const { conexion } = simularSolicitante(t, 'estudiante');
    const { respuesta, cuerpo } = await solicitar(r.metodo, r.ruta, { cuerpo: r.cuerpo });
    assert.equal(respuesta.status, 403);
    assert.equal(cuerpo.codigo, 'rol_no_autorizado');
    assert.equal(conexion.mock.callCount(), 0);
  });

  for (const idGrupo of ['0', 'abc', '9223372036854775808']) {
    test(`${r.nombre}: idGrupo ${idGrupo} → 400 id_grupo_invalido`, async (t) => {
      const { conexion } = simularSolicitante(t, 'administrador');
      const { respuesta, cuerpo } = await solicitar(r.metodo, r.ruta.replace(/^\/1/, `/${idGrupo}`), { cuerpo: r.cuerpo });
      assert.equal(respuesta.status, 400);
      assert.equal(cuerpo.codigo, 'id_grupo_invalido');
      assert.equal(conexion.mock.callCount(), 0);
    });
  }
}

test('E1 ruta: 200 { retirados } con el número real', async (t) => {
  const pasos = [
    { sql: /^BEGIN$/ },
    { sql: /FOR SHARE/, parametros: ['uid-solicitante'], filas: [administrador] },
    { sql: /FOR UPDATE/, parametros: ['1'], filas: [{ id_grupo: '1' }] },
    { ...borrarTodos(['uid-a', 'uid-b']), parametros: ['1'] },
    { sql: /^COMMIT$/ }
  ];
  const cliente = crearCliente(t, pasos);
  simularSolicitante(t, 'administrador', cliente);

  const { respuesta, cuerpo } = await solicitar('DELETE', '/1/estudiantes');
  assert.equal(respuesta.status, 200);
  assert.deepEqual(cuerpo, { retirados: 2 });
});

test('E1 ruta: maestro ajeno → 404 grupo_no_encontrado', async (t) => {
  const pasos = [
    { sql: /^BEGIN$/ },
    { sql: /FOR SHARE/, parametros: ['uid-solicitante'], filas: [maestro] },
    { sql: /FOR UPDATE/, parametros: ['1'], filas: [{ id_grupo: '1' }] },
    { sql: /FROM grupo_maestros/, parametros: ['1', 'uid-solicitante'], filas: [] },
    { sql: /^ROLLBACK$/ }
  ];
  const cliente = crearCliente(t, pasos);
  simularSolicitante(t, 'maestro', cliente);

  const { respuesta, cuerpo } = await solicitar('DELETE', '/1/estudiantes');
  assert.equal(respuesta.status, 404);
  assert.deepEqual(cuerpo, { ok: false, mensaje: 'El grupo no está disponible', codigo: 'grupo_no_encontrado' });
});

test('E1 ruta: «/estudiantes/» (uid vacío) no retira a todos → 400', async (t) => {
  const { conexion } = simularSolicitante(t, 'administrador');
  const { respuesta, cuerpo } = await solicitar('DELETE', '/1/estudiantes/');
  assert.equal(respuesta.status, 400);
  assert.equal(cuerpo.codigo, 'uid_invalido');
  assert.equal(conexion.mock.callCount(), 0);
});

test('E1 ruta: fallo de la base → 503 propio', async (t) => {
  const pasos = [
    { sql: /^BEGIN$/ },
    { sql: /FOR SHARE/, parametros: ['uid-solicitante'], filas: [administrador] },
    { sql: /FOR UPDATE/, parametros: ['1'], filas: [{ id_grupo: '1' }] },
    { ...borrarTodos([], new Error('Fallo simulado')), parametros: ['1'] },
    { sql: /^ROLLBACK$/ }
  ];
  const cliente = crearCliente(t, pasos);
  simularSolicitante(t, 'administrador', cliente);
  t.mock.method(console, 'error', () => {});

  const { respuesta, cuerpo } = await solicitar('DELETE', '/1/estudiantes');
  assert.equal(respuesta.status, 503);
  assert.equal(cuerpo.codigo, 'operacion_grupos_no_disponible');
});

test('E2 ruta: 200 con retirados y noEstaban, uids repetidos una vez', async (t) => {
  const pasos = [
    { sql: /^BEGIN$/ },
    { sql: /FOR SHARE/, parametros: ['uid-solicitante'], filas: [administrador] },
    { sql: /FOR UPDATE/, parametros: ['1'], filas: [{ id_grupo: '1' }] },
    { ...borrarSeleccion(['uid-estudiante-1', 'uid-estudiante-2', 'uid-estudiante-3'], ['uid-estudiante-1', 'uid-estudiante-3']), parametros: ['1', ['uid-estudiante-1', 'uid-estudiante-2', 'uid-estudiante-3']] },
    { sql: /^COMMIT$/ }
  ];
  const cliente = crearCliente(t, pasos);
  simularSolicitante(t, 'administrador', cliente);

  const { respuesta, cuerpo } = await solicitar('POST', '/1/estudiantes/retiros', {
    cuerpo: { uids: ['uid-estudiante-1', 'uid-estudiante-2', 'uid-estudiante-1', 'uid-estudiante-3'] }
  });
  assert.equal(respuesta.status, 200);
  assert.deepEqual(cuerpo, { retirados: ['uid-estudiante-1', 'uid-estudiante-3'], noEstaban: ['uid-estudiante-2'] });
});

for (const cantidad of [1, 100]) {
  test(`E2 ruta: ${cantidad} uid(s) se aceptan`, async (t) => {
    const lista = uids(cantidad);
    const pasos = [
      { sql: /^BEGIN$/ },
      { sql: /FOR SHARE/, parametros: ['uid-solicitante'], filas: [administrador] },
      { sql: /FOR UPDATE/, parametros: ['1'], filas: [{ id_grupo: '1' }] },
      { ...borrarSeleccion(lista, lista), parametros: ['1', lista] },
      { sql: /^COMMIT$/ }
    ];
    const cliente = crearCliente(t, pasos);
    simularSolicitante(t, 'administrador', cliente);

    const { respuesta, cuerpo } = await solicitar('POST', '/1/estudiantes/retiros', { cuerpo: { uids: lista } });
    assert.equal(respuesta.status, 200);
    assert.deepEqual(cuerpo, { retirados: lista, noEstaban: [] });
  });
}

for (const escenario of [
  { nombre: 'cuerpo ausente', cuerpo: undefined },
  { nombre: 'cuerpo como arreglo', cuerpo: [] },
  { nombre: 'falta el campo uids', cuerpo: {} },
  { nombre: 'uids no es arreglo', cuerpo: { uids: 'uid-a' } },
  { nombre: 'uids nulo', cuerpo: { uids: null } },
  { nombre: '0 uids', cuerpo: { uids: [] } },
  { nombre: '101 uids', cuerpo: { uids: uids(101) } },
  { nombre: '101 uids aunque haya repetidos', cuerpo: { uids: [...uids(100), 'uid-estudiante-1'] } },
  { nombre: 'un elemento numérico', cuerpo: { uids: ['uid-a', 5] } },
  { nombre: 'un elemento nulo', cuerpo: { uids: ['uid-a', null] } },
  { nombre: 'un elemento objeto', cuerpo: { uids: [{}] } },
  { nombre: 'un elemento vacío', cuerpo: { uids: ['uid-a', ''] } },
  { nombre: 'un elemento solo con espacios', cuerpo: { uids: ['   '] } },
  { nombre: 'un elemento de 129 caracteres', cuerpo: { uids: ['u'.repeat(129)] } }
]) {
  test(`E2 ruta: ${escenario.nombre} → 400 seleccion_invalida`, async (t) => {
    const { conexion } = simularSolicitante(t, 'administrador');
    const { respuesta, cuerpo } = await solicitar('POST', '/1/estudiantes/retiros', { cuerpo: escenario.cuerpo });
    assert.equal(respuesta.status, 400);
    assert.equal(cuerpo.ok, false);
    assert.equal(cuerpo.codigo, 'seleccion_invalida');
    assert.equal(conexion.mock.callCount(), 0);
  });
}

test('E2 ruta: un uid de 128 caracteres es válido', async (t) => {
  const largo = 'u'.repeat(128);
  const pasos = [
    { sql: /^BEGIN$/ },
    { sql: /FOR SHARE/, parametros: ['uid-solicitante'], filas: [administrador] },
    { sql: /FOR UPDATE/, parametros: ['1'], filas: [{ id_grupo: '1' }] },
    { ...borrarSeleccion([largo], []), parametros: ['1', [largo]] },
    { sql: /^COMMIT$/ }
  ];
  const cliente = crearCliente(t, pasos);
  simularSolicitante(t, 'administrador', cliente);

  const { respuesta, cuerpo } = await solicitar('POST', '/1/estudiantes/retiros', { cuerpo: { uids: [largo] } });
  assert.equal(respuesta.status, 200);
  assert.deepEqual(cuerpo, { retirados: [], noEstaban: [largo] });
});

test('Regresión: DELETE /api/grupos/:id sigue respondiendo 409 grupo_con_participantes', async (t) => {
  const pasos = [
    { sql: /^BEGIN$/ },
    { sql: /FOR SHARE/, parametros: ['uid-solicitante'], filas: [administrador] },
    { sql: /FOR UPDATE/, parametros: ['1'], filas: [{ id_grupo: '1' }] },
    { sql: /SELECT EXISTS[\s\S]*FROM grupo_estudiantes WHERE id_grupo = \$1/, parametros: ['1'], filas: [{ tieneEstudiantes: true }] },
    { sql: /^ROLLBACK$/ }
  ];
  const cliente = crearCliente(t, pasos);
  simularSolicitante(t, 'administrador', cliente);

  const { respuesta, cuerpo } = await solicitar('DELETE', '/1?retirarEstudiantes=true');
  assert.equal(respuesta.status, 409);
  assert.equal(cuerpo.codigo, 'grupo_con_participantes');
  assert.equal(cliente.query.mock.calls.length, pasos.length);
  assert.equal(cliente.query.mock.calls.some(({ arguments: [sql] }) => /DELETE FROM grupo_estudiantes/.test(sql)), false);
});
