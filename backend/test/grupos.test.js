const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

process.env.DATABASE_URL =
  'postgresql://prueba:prueba@localhost:5432/prueba';
process.env.FIREBASE_PROJECT_ID = 'demo-viva-tech-grupos';

const pool = require('../src/config/database');
const firebaseAuth = require('../src/config/firebase');
const app = require('../src/app');

let servidor;
let urlGrupos;

const operaciones = [
  { nombre: 'listar grupos', metodo: 'GET', ruta: '/' },
  {
    nombre: 'crear grupo', metodo: 'POST', ruta: '/',
    cuerpo: { nombre: 'Grupo de prueba' }
  },
  {
    nombre: 'renombrar grupo', metodo: 'PATCH', ruta: '/1',
    cuerpo: { nombre: 'Grupo renombrado' }
  },
  { nombre: 'eliminar grupo', metodo: 'DELETE', ruta: '/1' },
  { nombre: 'consultar detalle', metodo: 'GET', ruta: '/1' },
  {
    nombre: 'asignar estudiante', metodo: 'POST', ruta: '/1/estudiantes',
    cuerpo: { uid: 'uid-estudiante' }
  },
  {
    nombre: 'retirar estudiante', metodo: 'DELETE',
    ruta: '/1/estudiantes/uid-estudiante'
  },
  {
    nombre: 'asignar maestro', metodo: 'POST', ruta: '/1/maestros',
    cuerpo: { uid: 'uid-maestro' }, soloAdministrador: true
  },
  {
    nombre: 'retirar maestro', metodo: 'DELETE',
    ruta: '/1/maestros/uid-maestro', soloAdministrador: true
  }
];

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
      servidor.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }

  await pool.end();
});

async function solicitar(operacion, autenticado = true) {
  const headers = {};

  if (autenticado) headers.Authorization = 'Bearer token-prueba';
  if (operacion.cuerpo !== undefined) headers['Content-Type'] = 'application/json';

  return fetch(`${urlGrupos}${operacion.ruta}`, {
    method: operacion.metodo,
    headers,
    body: operacion.cuerpo === undefined
      ? undefined
      : JSON.stringify(operacion.cuerpo)
  });
}

function simularSolicitante(t, rol) {
  t.mock.method(firebaseAuth, 'verifyIdToken', async () => ({
    uid: 'uid-solicitante'
  }));

  const consulta = t.mock.method(pool, 'query', async (sql, valores) => {
    assert.match(sql, /WHERE uid = \$1/);
    assert.deepEqual(valores, ['uid-solicitante']);

    return {
      rowCount: 1,
      rows: [{
        uid: 'uid-solicitante',
        nombre_completo: 'Solicitante de Prueba',
        nombre_apodo: null,
        rol,
        activo: true
      }]
    };
  });

  const conexion = t.mock.method(pool, 'connect', async () => {
    throw new Error('No debería iniciarse una operación de grupos');
  });

  return { consulta, conexion };
}

async function comprobarRechazo(t, operacion, rol, estado, codigo) {
  const { consulta, conexion } = simularSolicitante(t, rol);
  const respuesta = await solicitar(operacion);
  const cuerpo = await respuesta.json();

  assert.equal(respuesta.status, estado);
  assert.equal(cuerpo.ok, false);
  assert.equal(cuerpo.codigo, codigo);
  assert.equal(typeof cuerpo.mensaje, 'string');
  assert.ok(cuerpo.mensaje.length > 0);
  assert.equal(consulta.mock.callCount(), 1);
  assert.equal(conexion.mock.callCount(), 0);
}

for (const operacion of operaciones) {
  test(`Grupos: ${operacion.nombre} sin token responde 401`, async (t) => {
    const consulta = t.mock.method(pool, 'query', async () => {
      throw new Error('No debería consultarse PostgreSQL');
    });
    const conexion = t.mock.method(pool, 'connect', async () => {
      throw new Error('No debería abrirse una conexión');
    });
    const verificacion = t.mock.method(firebaseAuth, 'verifyIdToken', async () => {
      throw new Error('No debería verificarse un token ausente');
    });

    const respuesta = await solicitar(operacion, false);
    const cuerpo = await respuesta.json();

    assert.equal(respuesta.status, 401);
    assert.equal(cuerpo.ok, false);
    assert.equal(consulta.mock.callCount(), 0);
    assert.equal(conexion.mock.callCount(), 0);
    assert.equal(verificacion.mock.callCount(), 0);
  });

  test(`Grupos: estudiante no puede ${operacion.nombre}`, async (t) => {
    await comprobarRechazo(
      t, operacion, 'estudiante', 403, 'rol_no_autorizado'
    );
  });
}

for (const operacion of operaciones.filter((item) => item.soloAdministrador)) {
  test(`Grupos: maestro no puede ${operacion.nombre}`, async (t) => {
    await comprobarRechazo(t, operacion, 'maestro', 403, 'rol_no_autorizado');
  });
}

for (const operacion of operaciones.filter((item) => item.ruta.startsWith('/1'))) {
  test(`Grupos: ${operacion.nombre} rechaza identificador cero`, async (t) => {
    await comprobarRechazo(
      t,
      { ...operacion, ruta: operacion.ruta.replace(/^\/1(?=\/|$)/, '/0') },
      'administrador',
      400,
      'id_grupo_invalido'
    );
  });
}

for (const idGrupo of ['-1', 'abc', '1.5', '9223372036854775808']) {
  test(`Grupos: rechaza identificador ${idGrupo}`, async (t) => {
    await comprobarRechazo(
      t,
      { metodo: 'DELETE', ruta: `/${idGrupo}` },
      'administrador',
      400,
      'id_grupo_invalido'
    );
  });
}

for (const escenario of [
  { nombre: 'cuerpo ausente', cuerpo: undefined, codigo: 'cuerpo_invalido' },
  { nombre: 'cuerpo como arreglo', cuerpo: [], codigo: 'cuerpo_invalido' },
  { nombre: 'nombre ausente', cuerpo: {} },
  { nombre: 'nombre vacío', cuerpo: { nombre: '' } },
  { nombre: 'nombre con espacios', cuerpo: { nombre: '   ' } },
  { nombre: 'nombre de 101 caracteres', cuerpo: { nombre: 'a'.repeat(101) } },
  { nombre: 'nombre numérico', cuerpo: { nombre: 123 } },
  { nombre: 'nombre nulo', cuerpo: { nombre: null } },
  { nombre: 'nombre como objeto', cuerpo: { nombre: {} } }
]) {
  test(`Grupos: creación rechaza ${escenario.nombre}`, async (t) => {
    await comprobarRechazo(
      t,
      { metodo: 'POST', ruta: '/', cuerpo: escenario.cuerpo },
      'administrador',
      400,
      escenario.codigo || 'nombre_grupo_invalido'
    );
  });
}

for (const participante of ['estudiantes', 'maestros']) {
  for (const escenario of [
    { nombre: 'UID ausente', cuerpo: {} },
    { nombre: 'UID vacío', cuerpo: { uid: '' } },
    { nombre: 'UID con espacios', cuerpo: { uid: '   ' } },
    { nombre: 'UID numérico', cuerpo: { uid: 123 } },
    { nombre: 'UID como objeto', cuerpo: { uid: {} } },
    { nombre: 'UID como arreglo', cuerpo: { uid: [] } },
    { nombre: 'UID de 129 caracteres', cuerpo: { uid: 'u'.repeat(129) } }
  ]) {
    test(`Grupos: asignar ${participante} rechaza ${escenario.nombre}`, async (t) => {
      await comprobarRechazo(
        t,
        { metodo: 'POST', ruta: `/1/${participante}`, cuerpo: escenario.cuerpo },
        'administrador',
        400,
        'uid_invalido'
      );
    });
  }

  for (const escenario of [
    { nombre: 'cuerpo ausente', cuerpo: undefined },
    { nombre: 'cuerpo como arreglo', cuerpo: [] }
  ]) {
    test(`Grupos: asignar ${participante} rechaza ${escenario.nombre}`, async (t) => {
      await comprobarRechazo(
        t,
        { metodo: 'POST', ruta: `/1/${participante}`, cuerpo: escenario.cuerpo },
        'administrador',
        400,
        'cuerpo_invalido'
      );
    });
  }
}
