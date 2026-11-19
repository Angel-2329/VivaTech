const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

process.env.DATABASE_URL =
  'postgresql://prueba:prueba@localhost:5432/prueba';
process.env.FIREBASE_PROJECT_ID = 'demo-viva-tech-grupos-duplicados';

const pool = require('../src/config/database');
const firebaseAuth = require('../src/config/firebase');
const app = require('../src/app');
const {
  ErrorOperacionGrupo,
  crearGrupo,
  renombrarGrupo
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

const RESPUESTA_409 = {
  ok: false,
  mensaje: 'Ya existe un grupo con ese nombre.',
  codigo: 'grupo_duplicado'
};

function errorIndice(constraint = 'uq_grupos_nombre_normalizado') {
  const error = new Error('duplicate key value violates unique constraint');
  error.code = '23505';
  error.constraint = constraint;
  return error;
}

function usuario(rol = 'maestro') {
  return { uid: 'uid-solicitante', rol, activo: true };
}

function grupo(nombre) {
  return { idGrupo: '7', nombre, totalEstudiantes: 0, maestros: [] };
}

const paso = {
  begin: { sql: /^BEGIN$/ },
  commit: { sql: /^COMMIT$/ },
  rollback: { sql: /^ROLLBACK$/ },
  solicitante: (rol) => ({
    sql: /FROM usuarios[\s\S]*FOR SHARE/, parametros: ['uid-solicitante'], filas: [usuario(rol)]
  }),
  insertar: (nombre, error) => ({
    sql: /INSERT INTO grupos \(nombre, creado_por\)/,
    parametros: [nombre, 'uid-solicitante'],
    filas: [{ idGrupo: '7' }],
    error
  }),
  autoasignar: {
    sql: /INSERT INTO grupo_maestros/, parametros: ['7', 'uid-solicitante']
  },
  bloquear: (existe = true) => ({
    sql: /FROM grupos[\s\S]*FOR UPDATE/, parametros: ['7'], filas: existe ? [{ id_grupo: '7' }] : []
  }),
  asignacion: (existe = true) => ({
    sql: /FROM grupo_maestros[\s\S]*FOR SHARE/, parametros: ['7', 'uid-solicitante'], filas: existe ? [{ id_grupo: '7' }] : []
  }),
  actualizar: (nombre, error) => ({
    sql: /^UPDATE grupos SET nombre = \$1 WHERE id_grupo = \$2$/, parametros: [nombre, '7'], error
  }),
  consultar: (nombre) => ({
    sql: /g\.id_grupo::text AS "idGrupo"[\s\S]*WHERE g\.id_grupo = \$1/, parametros: ['7'], filas: [grupo(nombre)]
  })
};

function crearCliente(t, pasos) {
  let posicion = 0;
  return {
    query: t.mock.fn(async (sql, parametros) => {
      const actual = pasos[posicion++];
      assert.ok(actual, `Consulta inesperada: ${sql}`);
      assert.match(sql, actual.sql);
      assert.deepEqual(parametros, actual.parametros);
      if (actual.error) throw actual.error;
      const filas = actual.filas || [];
      return { rows: filas, rowCount: filas.length };
    }),
    release: t.mock.fn()
  };
}

function comprobarCliente(cliente, pasos) {
  assert.equal(cliente.query.mock.callCount(), pasos.length);
  assert.equal(cliente.release.mock.callCount(), 1);
  assert.deepEqual(cliente.release.mock.calls[0].arguments, [undefined]);
}

function errorDuplicado(error) {
  assert.ok(error instanceof ErrorOperacionGrupo);
  assert.equal(error.estado, 409);
  assert.equal(error.codigo, 'grupo_duplicado');
  assert.equal(error.message, RESPUESTA_409.mensaje);
  return true;
}


test('Duplicados servicio: crear con nombre existente → 409 y revierte sin autoasignar', async (t) => {
  const pasos = [paso.begin, paso.solicitante('maestro'), paso.insertar('Grupo A', errorIndice()), paso.rollback];
  const cliente = crearCliente(t, pasos);
  t.mock.method(pool, 'connect', async () => cliente);

  await assert.rejects(crearGrupo('uid-solicitante', 'Grupo A'), errorDuplicado);
  comprobarCliente(cliente, pasos);
});

test('Duplicados servicio: renombrar a un nombre ocupado → 409 y revierte', async (t) => {
  const pasos = [
    paso.begin, paso.solicitante('maestro'), paso.bloquear(), paso.asignacion(),
    paso.actualizar('Grupo B', errorIndice()), paso.rollback
  ];
  const cliente = crearCliente(t, pasos);
  t.mock.method(pool, 'connect', async () => cliente);

  await assert.rejects(renombrarGrupo('uid-solicitante', '7', 'Grupo B'), errorDuplicado);
  comprobarCliente(cliente, pasos);
});

test('Duplicados servicio: renombrar grupo ajeno responde 404 antes de mirar el nombre', async (t) => {
  const pasos = [paso.begin, paso.solicitante('maestro'), paso.bloquear(), paso.asignacion(false), paso.rollback];
  const cliente = crearCliente(t, pasos);
  t.mock.method(pool, 'connect', async () => cliente);

  await assert.rejects(renombrarGrupo('uid-solicitante', '7', 'Grupo B'), (error) => {
    assert.equal(error.codigo, 'grupo_no_encontrado');
    return true;
  });
  comprobarCliente(cliente, pasos);
});

test('Duplicados servicio: renombrar al mismo nombre no falla (la fila no choca consigo misma)', async (t) => {
  const pasos = [
    paso.begin, paso.solicitante('administrador'), paso.bloquear(),
    paso.actualizar('Grupo A'), paso.consultar('Grupo A'), paso.commit
  ];
  const cliente = crearCliente(t, pasos);
  t.mock.method(pool, 'connect', async () => cliente);

  assert.deepEqual(await renombrarGrupo('uid-solicitante', '7', 'Grupo A'), grupo('Grupo A'));
  comprobarCliente(cliente, pasos);
});

for (const [accion, pasosConError] of [
  ['crear', (e) => [paso.begin, paso.solicitante('administrador'), paso.insertar('Grupo A', e), paso.rollback]],
  ['renombrar', (e) => [paso.begin, paso.solicitante('administrador'), paso.bloquear(), paso.actualizar('Grupo A', e), paso.rollback]]
]) {
  for (const [nombre, error] of [
    ['otra restricción única', errorIndice('pk_grupos')],
    ['un error técnico', new Error('Fallo simulado')]
  ]) {
    test(`Duplicados servicio: al ${accion}, ${nombre} no se convierte en 409`, async (t) => {
      const pasos = pasosConError(error);
      const cliente = crearCliente(t, pasos);
      t.mock.method(pool, 'connect', async () => cliente);

      const operacion = accion === 'crear'
        ? crearGrupo('uid-solicitante', 'Grupo A')
        : renombrarGrupo('uid-solicitante', '7', 'Grupo A');

      await assert.rejects(operacion, (recibido) => recibido === error);
      comprobarCliente(cliente, pasos);
    });
  }
}


function simularSolicitante(t, rol, clientes) {
  t.mock.method(firebaseAuth, 'verifyIdToken', async () => ({ uid: 'uid-solicitante' }));
  t.mock.method(pool, 'query', async () => ({
    rowCount: 1,
    rows: [{
      uid: 'uid-solicitante', nombre_completo: 'Solicitante de Prueba',
      nombre_apodo: null, rol, activo: true
    }]
  }));

  const cola = [...clientes];
  return t.mock.method(pool, 'connect', async () => {
    const cliente = cola.shift();
    assert.ok(cliente, 'Conexión inesperada');
    return cliente;
  });
}

async function solicitar(metodo, ruta, cuerpo) {
  const respuesta = await fetch(`${urlGrupos}${ruta}`, {
    method: metodo,
    headers: { Authorization: 'Bearer token-prueba', 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo)
  });
  return { estado: respuesta.status, cuerpo: await respuesta.json() };
}

test('Duplicados ruta: «José», «jose » y «JOSE» chocan → 201, 409, 409', async (t) => {
  const pasosPrimero = [paso.begin, paso.solicitante('maestro'), paso.insertar('José'), paso.autoasignar, paso.consultar('José'), paso.commit];
  const pasosSegundo = [paso.begin, paso.solicitante('maestro'), paso.insertar('jose', errorIndice()), paso.rollback];
  const pasosTercero = [paso.begin, paso.solicitante('maestro'), paso.insertar('JOSE', errorIndice()), paso.rollback];
  const clientes = [crearCliente(t, pasosPrimero), crearCliente(t, pasosSegundo), crearCliente(t, pasosTercero)];
  simularSolicitante(t, 'maestro', clientes);

  assert.equal((await solicitar('POST', '/', { nombre: 'José' })).estado, 201);

  for (const nombre of ['jose ', 'JOSE']) {
    const { estado, cuerpo } = await solicitar('POST', '/', { nombre });
    assert.equal(estado, 409);
    assert.deepEqual(cuerpo, RESPUESTA_409);
  }

  comprobarCliente(clientes[0], pasosPrimero);
  comprobarCliente(clientes[1], pasosSegundo);
  comprobarCliente(clientes[2], pasosTercero);
});

test('Duplicados ruta: renombrar a un nombre ocupado → 409 grupo_duplicado', async (t) => {
  const pasos = [paso.begin, paso.solicitante('administrador'), paso.bloquear(), paso.actualizar('Grupo B', errorIndice()), paso.rollback];
  const cliente = crearCliente(t, pasos);
  simularSolicitante(t, 'administrador', [cliente]);

  const { estado, cuerpo } = await solicitar('PATCH', '/7', { nombre: '  Grupo B  ' });
  assert.equal(estado, 409);
  assert.deepEqual(cuerpo, RESPUESTA_409);
  comprobarCliente(cliente, pasos);
});

test('Duplicados ruta: renombrar al mismo nombre responde 200', async (t) => {
  const pasos = [paso.begin, paso.solicitante('administrador'), paso.bloquear(), paso.actualizar('Grupo A'), paso.consultar('Grupo A'), paso.commit];
  const cliente = crearCliente(t, pasos);
  simularSolicitante(t, 'administrador', [cliente]);

  const { estado, cuerpo } = await solicitar('PATCH', '/7', { nombre: 'Grupo A' });
  assert.equal(estado, 200);
  assert.deepEqual(cuerpo, grupo('Grupo A'));
});

test('Duplicados ruta: dos altas simultáneas con el mismo nombre dejan solo una', async (t) => {
  const pasosGanador = [paso.begin, paso.solicitante('administrador'), paso.insertar('Grupo A'), paso.consultar('Grupo A'), paso.commit];
  const pasosPerdedor = [paso.begin, paso.solicitante('administrador'), paso.insertar('Grupo A', errorIndice()), paso.rollback];
  const ganador = crearCliente(t, pasosGanador);
  const perdedor = crearCliente(t, pasosPerdedor);
  const conexion = simularSolicitante(t, 'administrador', [ganador, perdedor]);

  const resultados = await Promise.all([
    solicitar('POST', '/', { nombre: 'Grupo A' }),
    solicitar('POST', '/', { nombre: 'Grupo A' })
  ]);

  assert.equal(conexion.mock.callCount(), 2);
  assert.deepEqual(resultados.map((r) => r.estado).sort(), [201, 409]);
  assert.deepEqual(resultados.find((r) => r.estado === 409).cuerpo, RESPUESTA_409);
  comprobarCliente(ganador, pasosGanador);
  comprobarCliente(perdedor, pasosPerdedor);
  assert.equal(perdedor.query.mock.calls.some(({ arguments: [sql] }) => /^COMMIT$/.test(sql)), false);
});
