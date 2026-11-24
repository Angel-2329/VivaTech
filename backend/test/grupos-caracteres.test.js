const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

process.env.DATABASE_URL =
  'postgresql://prueba:prueba@localhost:5432/prueba';
process.env.FIREBASE_PROJECT_ID = 'demo-viva-tech-grupos-caracteres';

const pool = require('../src/config/database');
const firebaseAuth = require('../src/config/firebase');
const app = require('../src/app');

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

const ERROR_CARACTERES = {
  ok: false,
  mensaje: 'Usa solo letras, números, espacios y los signos - _ . , ( ) #.',
  codigo: 'nombre_grupo_invalido'
};

const MENSAJE_LONGITUD = 'El nombre del grupo debe tener entre 1 y 100 caracteres';

const paso = {
  begin: { sql: /^BEGIN$/ },
  commit: { sql: /^COMMIT$/ },
  solicitante: {
    sql: /FROM usuarios[\s\S]*FOR SHARE/,
    parametros: ['uid-solicitante'],
    filas: [{ uid: 'uid-solicitante', rol: 'administrador', activo: true }]
  },
  insertar: (nombre) => ({
    sql: /INSERT INTO grupos \(nombre, creado_por\)/,
    parametros: [nombre, 'uid-solicitante'],
    filas: [{ idGrupo: '7' }]
  }),
  bloquear: {
    sql: /FROM grupos[\s\S]*FOR UPDATE/, parametros: ['7'], filas: [{ id_grupo: '7' }]
  },
  actualizar: (nombre) => ({
    sql: /^UPDATE grupos SET nombre = \$1 WHERE id_grupo = \$2$/, parametros: [nombre, '7']
  }),
  consultar: (nombre) => ({
    sql: /g\.id_grupo::text AS "idGrupo"[\s\S]*WHERE g\.id_grupo = \$1/,
    parametros: ['7'],
    filas: [{ idGrupo: '7', nombre, totalEstudiantes: 0, maestros: [] }]
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
      const filas = actual.filas || [];
      return { rows: filas, rowCount: filas.length };
    }),
    release: t.mock.fn()
  };
}

function simularSolicitante(t, clientes = []) {
  t.mock.method(firebaseAuth, 'verifyIdToken', async () => ({ uid: 'uid-solicitante' }));
  t.mock.method(pool, 'query', async () => ({
    rowCount: 1,
    rows: [{
      uid: 'uid-solicitante', nombre_completo: 'Solicitante de Prueba',
      nombre_apodo: null, rol: 'administrador', activo: true
    }]
  }));

  const cola = [...clientes];
  return t.mock.method(pool, 'connect', async () => {
    const cliente = cola.shift();
    assert.ok(cliente, 'No debería abrirse una operación de grupos');
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

const INVALIDOS = [
  'Grupo 😀',
  'Grupo@1',
  'Grupo/1',
  '<script>alert(1)</script>',
  'Grupo’s',
  "Grupo's",
  'Grupo ç',
  '---',
  '#()',
  '. , _'
];

for (const [metodo, ruta] of [['POST', '/'], ['PATCH', '/7']]) {
  for (const nombre of INVALIDOS) {
    test(`P3 grupos ${metodo} rechaza ${JSON.stringify(nombre)} sin tocar la base`, async (t) => {
      const conexion = simularSolicitante(t);

      const { estado, cuerpo } = await solicitar(metodo, ruta, { nombre });

      assert.equal(estado, 400);
      assert.deepEqual(cuerpo, ERROR_CARACTERES);
      assert.equal(conexion.mock.callCount(), 0);
    });
  }

  test(`P3 grupos ${metodo}: longitud antes que caracteres`, async (t) => {
    const conexion = simularSolicitante(t);

    const { estado, cuerpo } = await solicitar(metodo, ruta, { nombre: `${'a'.repeat(100)}😀` });

    assert.equal(estado, 400);
    assert.equal(cuerpo.codigo, 'nombre_grupo_invalido');
    assert.equal(cuerpo.mensaje, MENSAJE_LONGITUD);
    assert.equal(conexion.mock.callCount(), 0);
  });
}

for (const [entrada, guardado] of [
  ['Grupo 1-A (turno #2), mañana_b.', 'Grupo 1-A (turno #2), mañana_b.'],
  ['  Grupo   Ñandú  ', 'Grupo Ñandú'],
  ['Ñandú', 'Ñandú'],
  ['1', '1']
]) {
  test(`P3 grupos POST guarda normalizado ${JSON.stringify(entrada)}`, async (t) => {
    const pasos = [
      paso.begin, paso.solicitante, paso.insertar(guardado),
      paso.consultar(guardado), paso.commit
    ];
    const cliente = crearCliente(t, pasos);
    simularSolicitante(t, [cliente]);

    const { estado, cuerpo } = await solicitar('POST', '/', { nombre: entrada });

    assert.equal(estado, 201);
    assert.equal(cuerpo.nombre, guardado);
    assert.equal(cliente.query.mock.callCount(), pasos.length);
  });

  test(`P3 grupos PATCH guarda normalizado ${JSON.stringify(entrada)}`, async (t) => {
    const pasos = [
      paso.begin, paso.solicitante, paso.bloquear, paso.actualizar(guardado),
      paso.consultar(guardado), paso.commit
    ];
    const cliente = crearCliente(t, pasos);
    simularSolicitante(t, [cliente]);

    const { estado, cuerpo } = await solicitar('PATCH', '/7', { nombre: entrada });

    assert.equal(estado, 200);
    assert.equal(cuerpo.nombre, guardado);
    assert.equal(cliente.query.mock.callCount(), pasos.length);
  });
}
