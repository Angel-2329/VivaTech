const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const manejarJsonInvalido =
  require('../src/middlewares/manejar-json-invalido');

process.env.DATABASE_URL =
  'postgresql://prueba:prueba@localhost:5432/prueba';
process.env.FIREBASE_PROJECT_ID = 'demo-viva-tech-perfil';

const pool = require('../src/config/database');
const firebaseAuth = require('../src/config/firebase');
const perfilRouter = require('../src/routes/perfil');

let servidor;
let urlPerfil;

before(async () => {
  const app = express();

  app.use(express.json());
  app.use('/api/perfil', perfilRouter);
  app.use(manejarJsonInvalido);

  await new Promise((resolve, reject) => {
    servidor = app.listen(0, '127.0.0.1', resolve);
    servidor.once('error', reject);
  });

  urlPerfil =
    `http://127.0.0.1:${servidor.address().port}/api/perfil`;
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
    uid: 'uid-perfil-prueba'
  }));
}

function impedirConsulta(t) {
  return t.mock.method(pool, 'query', async () => {
    throw new Error('No debería consultarse PostgreSQL');
  });
}

test('POST perfil rechaza una solicitud sin token', async (t) => {
  const consulta = impedirConsulta(t);

  const respuesta = await fetch(urlPerfil, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      nombreCompleto: 'Persona de Prueba'
    })
  });

  const cuerpo = await respuesta.json();

  assert.equal(respuesta.status, 401);
  assert.equal(cuerpo.ok, false);
  assert.equal(consulta.mock.callCount(), 0);
});

test('POST perfil rechaza un cuerpo ausente', async (t) => {
  simularIdentidad(t);
  const consulta = impedirConsulta(t);

  const respuesta = await fetch(urlPerfil, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer token-prueba'
    }
  });

  const cuerpo = await respuesta.json();

  assert.equal(respuesta.status, 400);
  assert.equal(cuerpo.codigo, 'cuerpo_invalido');
  assert.equal(consulta.mock.callCount(), 0);
});

test('POST perfil rechaza un nombre vacío', async (t) => {
  simularIdentidad(t);
  const consulta = impedirConsulta(t);

  const respuesta = await fetch(urlPerfil, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer token-prueba',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      nombreCompleto: '   '
    })
  });

  const cuerpo = await respuesta.json();

  assert.equal(respuesta.status, 400);
  assert.equal(cuerpo.codigo, 'nombre_completo_invalido');
  assert.equal(consulta.mock.callCount(), 0);
});

for (const apodo of [123, {}, [], 'a'.repeat(31)]) {
  test(
    `POST perfil rechaza el apodo inválido ${JSON.stringify(apodo)}`,
    async (t) => {
      simularIdentidad(t);
      const consulta = impedirConsulta(t);

      const respuesta = await fetch(urlPerfil, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer token-prueba',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          nombreCompleto: 'Persona de Prueba',
          apodo
        })
      });

      const cuerpo = await respuesta.json();

      assert.equal(respuesta.status, 400);
      assert.equal(cuerpo.codigo, 'apodo_invalido');
      assert.equal(consulta.mock.callCount(), 0);
    }
  );
}

test('POST perfil crea un estudiante y normaliza sus datos', async (t) => {
  simularIdentidad(t);

  const consulta = t.mock.method(pool, 'query', async () => ({
    rowCount: 1,
    rows: [{
      uid: 'uid-perfil-prueba',
      nombre_completo: 'Persona de Prueba',
      nombre_apodo: null,
      rol: 'estudiante'
    }]
  }));

  const respuesta = await fetch(urlPerfil, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer token-prueba',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      uid: 'uid-ajeno',
      nombreCompleto: '  Persona de Prueba  ',
      apodo: '   ',
      rol: 'administrador',
      activo: false
    })
  });

  const cuerpo = await respuesta.json();

  assert.equal(respuesta.status, 201);
  assert.deepEqual(cuerpo, {
    uid: 'uid-perfil-prueba',
    nombreCompleto: 'Persona de Prueba',
    apodo: null,
    rol: 'estudiante'
  });

  assert.equal(consulta.mock.callCount(), 1);

  const [sql, parametros] = consulta.mock.calls[0].arguments;

  assert.match(
    sql,
    /INSERT INTO usuarios\s*\(uid,\s*nombre_completo,\s*nombre_apodo\)/
  );

  assert.deepEqual(parametros, [
    'uid-perfil-prueba',
    'Persona de Prueba',
    null
  ]);
});

test('POST perfil responde 409 si el perfil ya existe', async (t) => {
  simularIdentidad(t);

  t.mock.method(pool, 'query', async () => {
    throw Object.assign(new Error('Duplicado de prueba'), {
      code: '23505'
    });
  });

  const respuesta = await fetch(urlPerfil, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer token-prueba',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      nombreCompleto: 'Persona de Prueba'
    })
  });

  const cuerpo = await respuesta.json();

  assert.equal(respuesta.status, 409);
  assert.deepEqual(cuerpo, {
    ok: false,
    mensaje: 'El perfil ya existe',
    codigo: 'perfil_existente'
  });
});

test('GET perfil devuelve el perfil autenticado en camelCase', async (t) => {
  simularIdentidad(t);

  const consulta = t.mock.method(pool, 'query', async () => ({
    rowCount: 1,
    rows: [{
      uid: 'uid-perfil-prueba',
      nombre_completo: 'Persona de Prueba',
      nombre_apodo: 'Persona',
      rol: 'estudiante',
      activo: true
    }]
  }));

  const respuesta = await fetch(urlPerfil, {
    headers: {
      Authorization: 'Bearer token-prueba'
    }
  });

  const cuerpo = await respuesta.json();

  assert.equal(respuesta.status, 200);
  assert.deepEqual(cuerpo, {
    uid: 'uid-perfil-prueba',
    nombreCompleto: 'Persona de Prueba',
    apodo: 'Persona',
    rol: 'estudiante'
  });

  assert.equal(consulta.mock.callCount(), 1);
  assert.deepEqual(
    consulta.mock.calls[0].arguments[1],
    ['uid-perfil-prueba']
  );
});

test('GET perfil responde 404 cuando no está registrado', async (t) => {
  simularIdentidad(t);

  t.mock.method(pool, 'query', async () => ({
    rowCount: 0,
    rows: []
  }));

  const respuesta = await fetch(urlPerfil, {
    headers: {
      Authorization: 'Bearer token-prueba'
    }
  });

  const cuerpo = await respuesta.json();

  assert.equal(respuesta.status, 404);
  assert.equal(cuerpo.ok, false);
  assert.equal(cuerpo.codigo, 'perfil_no_registrado');
});

test('GET perfil responde 403 para una cuenta desactivada', async (t) => {
  simularIdentidad(t);

  t.mock.method(pool, 'query', async () => ({
    rowCount: 1,
    rows: [{
      uid: 'uid-perfil-prueba',
      nombre_completo: 'Persona de Prueba',
      nombre_apodo: null,
      rol: 'estudiante',
      activo: false
    }]
  }));

  const respuesta = await fetch(urlPerfil, {
    headers: {
      Authorization: 'Bearer token-prueba'
    }
  });

  const cuerpo = await respuesta.json();

  assert.equal(respuesta.status, 403);
  assert.equal(cuerpo.ok, false);
  assert.equal(cuerpo.codigo, 'cuenta_desactivada');
});

for (const caso of [
  {
    nombre: 'actualiza únicamente el nombre',
    entrada: {
      nombreCompleto: '  Nombre Actualizado  ',
      rol: 'administrador',
      uid: 'uid-ajeno',
      activo: false
    },
    parametros: [
      true,
      'Nombre Actualizado',
      false,
      null,
      'uid-perfil-prueba'
    ],
    nombreFinal: 'Nombre Actualizado',
    apodoFinal: 'Apodo Original'
  },
  {
    nombre: 'actualiza únicamente el apodo',
    entrada: {
      apodo: '  Nuevo Apodo  '
    },
    parametros: [
      false,
      null,
      true,
      'Nuevo Apodo',
      'uid-perfil-prueba'
    ],
    nombreFinal: 'Persona de Prueba',
    apodoFinal: 'Nuevo Apodo'
  },
  {
    nombre: 'elimina el apodo con null',
    entrada: {
      apodo: null
    },
    parametros: [
      false,
      null,
      true,
      null,
      'uid-perfil-prueba'
    ],
    nombreFinal: 'Persona de Prueba',
    apodoFinal: null
  }
]) {
  test(`PATCH perfil ${caso.nombre}`, async (t) => {
    simularIdentidad(t);

    const usuario = {
      uid: 'uid-perfil-prueba',
      nombre_completo: 'Persona de Prueba',
      nombre_apodo: 'Apodo Original',
      rol: 'estudiante',
      activo: true
    };

    const consulta = t.mock.method(pool, 'query', async (sql) => {
      if (/^\s*SELECT\b/i.test(sql)) {
        return {
          rowCount: 1,
          rows: [usuario]
        };
      }

      if (/^\s*UPDATE\b/i.test(sql)) {
        return {
          rowCount: 1,
          rows: [{
            ...usuario,
            nombre_completo: caso.nombreFinal,
            nombre_apodo: caso.apodoFinal
          }]
        };
      }

      throw new Error('Consulta inesperada');
    });

    const respuesta = await fetch(urlPerfil, {
      method: 'PATCH',
      headers: {
        Authorization: 'Bearer token-prueba',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(caso.entrada)
    });

    const cuerpo = await respuesta.json();

    assert.equal(respuesta.status, 200);
    assert.deepEqual(cuerpo, {
      uid: 'uid-perfil-prueba',
      nombreCompleto: caso.nombreFinal,
      apodo: caso.apodoFinal,
      rol: 'estudiante'
    });

    assert.equal(consulta.mock.callCount(), 2);

    const [sql, parametros] = consulta.mock.calls[1].arguments;

    assert.deepEqual(parametros, caso.parametros);

    assert.match(
      sql,
      /nombre_completo\s*=\s*CASE\s+WHEN\s+\$1::boolean\s+THEN\s+\$2::varchar\s+ELSE\s+nombre_completo\s+END/i
    );

    assert.match(
      sql,
      /nombre_apodo\s*=\s*CASE\s+WHEN\s+\$3::boolean\s+THEN\s+\$4::varchar\s+ELSE\s+nombre_apodo\s+END/i
    );

    assert.match(sql, /WHERE\s+uid\s*=\s*\$5/i);
    assert.match(sql, /AND\s+activo\s*=\s*true/i);

    assert.doesNotMatch(sql, /\bSET\s+rol\s*=/i);
    assert.doesNotMatch(sql, /,\s*rol\s*=/i);
    assert.doesNotMatch(sql, /\bSET\s+activo\s*=/i);
    assert.doesNotMatch(sql, /,\s*activo\s*=/i);
  });
}

for (const caso of [
  {
    nombre: 'rechaza un objeto vacío',
    entrada: {},
    codigo: 'sin_campos_actualizables'
  },
  {
    nombre: 'rechaza una solicitud con únicamente rol',
    entrada: { rol: 'administrador' },
    codigo: 'sin_campos_actualizables'
  },
  {
    nombre: 'rechaza un nombre nulo',
    entrada: { nombreCompleto: null },
    codigo: 'nombre_completo_invalido'
  },
  {
    nombre: 'rechaza un apodo numérico',
    entrada: { apodo: 123 },
    codigo: 'apodo_invalido'
  },
  {
    nombre: 'rechaza un apodo demasiado largo',
    entrada: { apodo: 'a'.repeat(31) },
    codigo: 'apodo_invalido'
  }
]) {
  test(`PATCH perfil ${caso.nombre}`, async (t) => {
    simularIdentidad(t);

    const consulta = t.mock.method(pool, 'query', async (sql) => {
      if (!/^\s*SELECT\b/i.test(sql)) {
        throw new Error('No debería ejecutarse una actualización');
      }

      return {
        rowCount: 1,
        rows: [{
          uid: 'uid-perfil-prueba',
          nombre_completo: 'Persona de Prueba',
          nombre_apodo: null,
          rol: 'estudiante',
          activo: true
        }]
      };
    });

    const respuesta = await fetch(urlPerfil, {
      method: 'PATCH',
      headers: {
        Authorization: 'Bearer token-prueba',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(caso.entrada)
    });

    const cuerpo = await respuesta.json();

    assert.equal(respuesta.status, 400);
    assert.equal(cuerpo.ok, false);
    assert.equal(cuerpo.codigo, caso.codigo);

    assert.equal(consulta.mock.callCount(), 1);
    assert.match(
      consulta.mock.calls[0].arguments[0],
      /^\s*SELECT\b/i
    );
  });
}

test('POST perfil responde JSON ante un cuerpo mal formado', async (t) => {
  const consulta = impedirConsulta(t);

  const verificarToken = t.mock.method(
    firebaseAuth,
    'verifyIdToken',
    async () => {
      throw new Error('No debería verificarse el token');
    }
  );

  const respuesta = await fetch(urlPerfil, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer token-prueba',
      'Content-Type': 'application/json'
    },
    body: '{"nombreCompleto":'
  });

  assert.equal(respuesta.status, 400);
  assert.match(
    respuesta.headers.get('content-type') || '',
    /application\/json/i
  );

  const cuerpo = await respuesta.json();

  assert.deepEqual(cuerpo, {
    ok: false,
    mensaje: 'El cuerpo de la solicitud no contiene un JSON válido',
    codigo: 'json_invalido'
  });

  assert.equal(verificarToken.mock.callCount(), 0);
  assert.equal(consulta.mock.callCount(), 0);
});