const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

process.env.DATABASE_URL =
  'postgresql://prueba:prueba@localhost:5432/prueba';
process.env.FIREBASE_PROJECT_ID = 'demo-viva-tech-estudiantes';

const pool = require('../src/config/database');
const firebaseAuth = require('../src/config/firebase');
const app = require('../src/app');

let servidor;
let urlEstudiantes;

before(async () => {
  await new Promise((resolve, reject) => {
    servidor = app.listen(0, '127.0.0.1', resolve);
    servidor.once('error', reject);
  });

  urlEstudiantes =
    `http://127.0.0.1:${servidor.address().port}/api/estudiantes`;
});

after(async () => {
  if (servidor) {
    await new Promise((resolve, reject) => {
      servidor.close((error) => {
        if (error) reject(error);
        else resolve();
      });

      servidor.closeAllConnections();
    });
  }

  await pool.end();
});

function simularIdentidad(t) {
  t.mock.method(firebaseAuth, 'verifyIdToken', async () => ({
    uid: 'uid-solicitante'
  }));
}

function crearSolicitante(rol) {
  return {
    uid: 'uid-solicitante',
    nombre_completo: 'Solicitante de Prueba',
    nombre_apodo: null,
    rol,
    activo: true
  };
}

test('GET estudiantes rechaza una solicitud sin token', async (t) => {
  const consulta = t.mock.method(pool, 'query', async () => {
    throw new Error('No debería consultarse PostgreSQL');
  });

  const respuesta = await fetch(urlEstudiantes);
  const cuerpo = await respuesta.json();

  assert.equal(respuesta.status, 401);
  assert.equal(cuerpo.ok, false);
  assert.equal(consulta.mock.callCount(), 0);
});

test('GET estudiantes rechaza al estudiante antes de validar parámetros', async (t) => {
  simularIdentidad(t);

  const consulta = t.mock.method(pool, 'query', async () => ({
    rowCount: 1,
    rows: [crearSolicitante('estudiante')]
  }));

  const respuesta = await fetch(`${urlEstudiantes}?limite=0`, {
    headers: {
      Authorization: 'Bearer token-prueba'
    }
  });

  const cuerpo = await respuesta.json();

  assert.equal(respuesta.status, 403);
  assert.deepEqual(cuerpo, {
    ok: false,
    mensaje: 'No tienes permisos para realizar esta acción',
    codigo: 'rol_no_autorizado'
  });

  assert.equal(consulta.mock.callCount(), 1);
  assert.deepEqual(
    consulta.mock.calls[0].arguments[1],
    ['uid-solicitante']
  );
});

for (const rol of ['maestro', 'administrador']) {
  test(`GET estudiantes permite consultar al ${rol}`, async (t) => {
    simularIdentidad(t);

    const estudiantes = [{
      uid: 'uid-estudiante',
      nombreCompleto: 'Rosa de Prueba',
      apodo: null
    }];

    const consulta = t.mock.method(pool, 'query', async (sql) => {
      if (/WHERE uid = \$1/.test(sql)) {
        return {
          rowCount: 1,
          rows: [crearSolicitante(rol)]
        };
      }

      return {
        rowCount: estudiantes.length,
        rows: estudiantes
      };
    });

    const parametros = new URLSearchParams({
      buscar: '  Rosa  ',
      limite: '10',
      desplazamiento: '0'
    });

    const respuesta = await fetch(
      `${urlEstudiantes}?${parametros}`,
      {
        headers: {
          Authorization: 'Bearer token-prueba'
        }
      }
    );

    const cuerpo = await respuesta.json();

    assert.equal(respuesta.status, 200);
    assert.deepEqual(cuerpo, estudiantes);
    assert.equal(consulta.mock.callCount(), 2);

    const [sql, valores] = consulta.mock.calls[1].arguments;

    assert.deepEqual(valores, ['Rosa', 10, 0]);
    assert.match(sql, /WHERE rol = 'estudiante'/);
    assert.match(sql, /AND activo = true/);
    assert.match(
      sql,
      /ORDER BY lower\(nombre_completo\), uid/
    );
    assert.match(sql, /LIMIT \$2 OFFSET \$3/);
  });
}

for (const caso of [
  {
    nombre: 'límite cero',
    query: 'limite=0',
    codigo: 'paginacion_invalida'
  },
  {
    nombre: 'límite superior al máximo',
    query: 'limite=101',
    codigo: 'paginacion_invalida'
  },
  {
    nombre: 'límite no numérico',
    query: 'limite=abc',
    codigo: 'paginacion_invalida'
  },
  {
    nombre: 'desplazamiento negativo',
    query: 'desplazamiento=-1',
    codigo: 'paginacion_invalida'
  },
  {
    nombre: 'búsqueda demasiado larga',
    query: `buscar=${'a'.repeat(101)}`,
    codigo: 'buscar_invalido'
  },
  {
    nombre: 'búsqueda repetida como arreglo',
    query: 'buscar=uno&buscar=dos',
    codigo: 'buscar_invalido'
  }
]) {
  test(`GET estudiantes rechaza ${caso.nombre}`, async (t) => {
    simularIdentidad(t);

    const consulta = t.mock.method(pool, 'query', async (sql) => {
      if (!/WHERE uid = \$1/.test(sql)) {
        throw new Error('No debería consultarse el listado');
      }

      return {
        rowCount: 1,
        rows: [crearSolicitante('maestro')]
      };
    });

    const respuesta = await fetch(
      `${urlEstudiantes}?${caso.query}`,
      {
        headers: {
          Authorization: 'Bearer token-prueba'
        }
      }
    );

    const cuerpo = await respuesta.json();

    assert.equal(respuesta.status, 400);
    assert.equal(cuerpo.ok, false);
    assert.equal(cuerpo.codigo, caso.codigo);
    assert.equal(consulta.mock.callCount(), 1);
  });
}

test('GET estudiantes utiliza la paginación predeterminada', async (t) => {
  simularIdentidad(t);

  const consulta = t.mock.method(pool, 'query', async (sql) => {
    if (/WHERE uid = \$1/.test(sql)) {
      return {
        rowCount: 1,
        rows: [crearSolicitante('administrador')]
      };
    }

    return {
      rowCount: 0,
      rows: []
    };
  });

  const respuesta = await fetch(urlEstudiantes, {
    headers: {
      Authorization: 'Bearer token-prueba'
    }
  });

  assert.equal(respuesta.status, 200);
  assert.deepEqual(await respuesta.json(), []);
  assert.equal(consulta.mock.callCount(), 2);
  assert.deepEqual(
    consulta.mock.calls[1].arguments[1],
    ['', 50, 0]
  );
});

test('GET estudiantes rechaza al maestro desactivado', async (t) => {
  simularIdentidad(t);

  const consulta = t.mock.method(pool, 'query', async () => ({
    rowCount: 1,
    rows: [{
      ...crearSolicitante('maestro'),
      activo: false
    }]
  }));

  const respuesta = await fetch(urlEstudiantes, {
    headers: {
      Authorization: 'Bearer token-prueba'
    }
  });

  const cuerpo = await respuesta.json();

  assert.equal(respuesta.status, 403);
  assert.equal(cuerpo.codigo, 'cuenta_desactivada');

  assert.equal(consulta.mock.callCount(), 1);
});