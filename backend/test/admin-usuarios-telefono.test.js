const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

process.env.DATABASE_URL =
  'postgresql://prueba:prueba@localhost:5432/prueba';
process.env.FIREBASE_PROJECT_ID = 'demo-viva-tech-admin-telefono';

const pool = require('../src/config/database');
const firebaseAuth = require('../src/config/firebase');
const app = require('../src/app');

let servidor;
let urlUsuarios;

before(async () => {
  await new Promise((resolve, reject) => {
    servidor = app.listen(0, '127.0.0.1', resolve);
    servidor.once('error', reject);
  });

  urlUsuarios =
    `http://127.0.0.1:${servidor.address().port}/api/admin/usuarios`;
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

const TELEFONO_ANTERIOR = '+529510001234';
const TELEFONO_NUEVO = '+529519995678';

function simularIdentidad(t) {
  t.mock.method(firebaseAuth, 'verifyIdToken', async () => ({
    uid: 'uid-solicitante'
  }));
}

function crearSolicitante(rol, activo = true) {
  return {
    uid: 'uid-solicitante',
    nombre_completo: 'Solicitante de Prueba',
    nombre_apodo: null,
    rol,
    activo
  };
}

function errorFirebase(codigo) {
  const error = new Error('Error simulado de Firebase');
  error.code = codigo;
  return error;
}

function impedirTransaccion(t) {
  return t.mock.method(pool, 'connect', async () => {
    throw new Error('No debería abrirse una transacción');
  });
}

function impedirFirebase(t) {
  return {
    getUser: t.mock.method(firebaseAuth, 'getUser', async () => {
      throw new Error('No debería consultarse Firebase');
    }),
    updateUser: t.mock.method(firebaseAuth, 'updateUser', async () => {
      throw new Error('No debería actualizarse Firebase');
    })
  };
}

async function enviarTelefono({
  uid = 'uid-destino',
  datos = { telefono: TELEFONO_NUEVO },
  conToken = true,
  cuerpoCrudo
} = {}) {
  const headers = { 'Content-Type': 'application/json' };

  if (conToken) {
    headers.Authorization = 'Bearer token-prueba';
  }

  return fetch(`${urlUsuarios}/${uid}/telefono`, {
    method: 'PATCH',
    headers,
    body: cuerpoCrudo ?? JSON.stringify(datos)
  });
}

function prepararTransaccion(
  t,
  {
    destinatario = {
      uid: 'uid-destino',
      nombreCompleto: 'Destinatario de Prueba',
      apodo: null,
      rol: 'estudiante',
      activo: true
    },
    telefonoActual = TELEFONO_ANTERIOR,
    errorGetUser,
    errorUpdateUser,
    errorInsert,
    errorCommit
  } = {}
) {
  const eventos = [];

  const consulta = t.mock.method(pool, 'query', async () => ({
    rowCount: 1,
    rows: [crearSolicitante('administrador')]
  }));

  const administrador = {
    uid: 'uid-solicitante',
    nombreCompleto: 'Administrador de Prueba',
    apodo: null,
    rol: 'administrador',
    activo: true
  };

  const cliente = {
    query: t.mock.fn(async (sql, parametros) => {
      const comando = sql.trim();

      if (['BEGIN', 'ROLLBACK'].includes(comando)) {
        eventos.push(comando);
        return { rowCount: 0, rows: [] };
      }

      if (comando === 'COMMIT') {
        eventos.push(comando);

        if (errorCommit) {
          throw errorCommit;
        }

        return { rowCount: 0, rows: [] };
      }

      if (/FOR UPDATE/.test(sql)) {
        eventos.push('SELECT');
        const filas = destinatario
          ? [administrador, destinatario]
          : [administrador];
        return { rowCount: filas.length, rows: filas };
      }

      if (/INSERT INTO cambios_telefono/.test(sql)) {
        eventos.push('INSERT');

        if (errorInsert) {
          throw errorInsert;
        }

        return { rowCount: 1, rows: [] };
      }

      throw new Error('Consulta inesperada en la transacción');
    }),
    release: t.mock.fn()
  };

  const conexion = t.mock.method(pool, 'connect', async () => cliente);

  const getUser = t.mock.method(firebaseAuth, 'getUser', async (uid) => {
    eventos.push('getUser');

    if (errorGetUser) {
      throw errorGetUser;
    }

    return telefonoActual === null
      ? { uid }
      : { uid, phoneNumber: telefonoActual };
  });

  const updateUser = t.mock.method(
    firebaseAuth,
    'updateUser',
    async (uid, cambios) => {
      eventos.push('updateUser');

      if (errorUpdateUser) {
        throw errorUpdateUser;
      }

      return { uid, phoneNumber: cambios.phoneNumber };
    }
  );

  return {
    eventos,
    cliente,
    consulta,
    conexion,
    getUser,
    updateUser
  };
}

function obtenerInsert(cliente) {
  return cliente.query.mock.calls.find((llamada) =>
    /INSERT INTO cambios_telefono/.test(llamada.arguments[0])
  );
}

test('PATCH teléfono rechaza una solicitud sin token', async (t) => {
  const consulta = t.mock.method(pool, 'query', async () => {
    throw new Error('No debería consultarse PostgreSQL');
  });
  const conexion = impedirTransaccion(t);
  const firebase = impedirFirebase(t);

  const respuesta = await enviarTelefono({ conToken: false });
  const cuerpo = await respuesta.json();

  assert.equal(respuesta.status, 401);
  assert.equal(cuerpo.ok, false);
  assert.equal(consulta.mock.callCount(), 0);
  assert.equal(conexion.mock.callCount(), 0);
  assert.equal(firebase.getUser.mock.callCount(), 0);
  assert.equal(firebase.updateUser.mock.callCount(), 0);
});

for (const rol of ['estudiante', 'maestro']) {
  test(`PATCH teléfono rechaza al ${rol} con 403`, async (t) => {
    simularIdentidad(t);

    const consulta = t.mock.method(pool, 'query', async () => ({
      rowCount: 1,
      rows: [crearSolicitante(rol)]
    }));
    const conexion = impedirTransaccion(t);
    const firebase = impedirFirebase(t);

    const respuesta = await enviarTelefono();
    const cuerpo = await respuesta.json();

    assert.equal(respuesta.status, 403);
    assert.deepEqual(cuerpo, {
      ok: false,
      mensaje: 'No tienes permisos para realizar esta acción',
      codigo: 'rol_no_autorizado'
    });
    assert.equal(consulta.mock.callCount(), 1);
    assert.equal(conexion.mock.callCount(), 0);
    assert.equal(firebase.getUser.mock.callCount(), 0);
    assert.equal(firebase.updateUser.mock.callCount(), 0);
  });
}

test('PATCH teléfono rechaza al administrador desactivado', async (t) => {
  simularIdentidad(t);

  t.mock.method(pool, 'query', async () => ({
    rowCount: 1,
    rows: [crearSolicitante('administrador', false)]
  }));
  const conexion = impedirTransaccion(t);
  const firebase = impedirFirebase(t);

  const respuesta = await enviarTelefono();
  const cuerpo = await respuesta.json();

  assert.equal(respuesta.status, 403);
  assert.equal(cuerpo.codigo, 'cuenta_desactivada');
  assert.equal(conexion.mock.callCount(), 0);
  assert.equal(firebase.updateUser.mock.callCount(), 0);
});

for (const [descripcion, datos] of [
  ['sin campo telefono', {}],
  ['telefono null', { telefono: null }],
  ['telefono numérico', { telefono: 529511234567 }],
  ['cadena vacía', { telefono: '' }],
  ['sin +52', { telefono: '9511234567' }],
  ['52 sin signo +', { telefono: '529511234567' }],
  ['otra lada de país', { telefono: '+539511234567' }],
  ['+1 de otro país', { telefono: '+19511234567' }],
  ['9 dígitos', { telefono: '+52951123456' }],
  ['11 dígitos', { telefono: '+5295112345678' }],
  ['con espacios', { telefono: '+52 951 123 4567' }],
  ['con guiones', { telefono: '+52-951-123-4567' }],
  ['espacio al inicio', { telefono: ' +529511234567' }],
  ['espacio al final', { telefono: '+529511234567 ' }],
  ['con letra', { telefono: '+52951123456a' }],
  ['dígitos no ASCII', { telefono: '+52٩٥١١٢٣٤٥٦٧' }],
  ['salto de línea al final', { telefono: '+529511234567\n' }],
  ['arreglo', { telefono: ['+529511234567'] }]
]) {
  test(`PATCH teléfono responde 400 telefono_invalido: ${descripcion}`, async (t) => {
    simularIdentidad(t);

    t.mock.method(pool, 'query', async () => ({
      rowCount: 1,
      rows: [crearSolicitante('administrador')]
    }));
    const conexion = impedirTransaccion(t);
    const firebase = impedirFirebase(t);

    const respuesta = await enviarTelefono({ datos });
    const cuerpo = await respuesta.json();

    assert.equal(respuesta.status, 400);
    assert.deepEqual(cuerpo, {
      ok: false,
      mensaje: 'El teléfono debe tener +52 seguido de 10 dígitos',
      codigo: 'telefono_invalido'
    });
    assert.equal(respuesta.headers.get('cache-control'), 'no-store');
    assert.equal(conexion.mock.callCount(), 0);
    assert.equal(firebase.getUser.mock.callCount(), 0);
    assert.equal(firebase.updateUser.mock.callCount(), 0);
  });
}

test('PATCH teléfono responde 400 cuerpo_invalido con un arreglo', async (t) => {
  simularIdentidad(t);

  t.mock.method(pool, 'query', async () => ({
    rowCount: 1,
    rows: [crearSolicitante('administrador')]
  }));
  const conexion = impedirTransaccion(t);
  impedirFirebase(t);

  const respuesta = await enviarTelefono({ datos: [TELEFONO_NUEVO] });
  const cuerpo = await respuesta.json();

  assert.equal(respuesta.status, 400);
  assert.equal(cuerpo.codigo, 'cuerpo_invalido');
  assert.equal(conexion.mock.callCount(), 0);
});

test('PATCH teléfono responde 400 uid_invalido con un uid de más de 128', async (t) => {
  simularIdentidad(t);

  t.mock.method(pool, 'query', async () => ({
    rowCount: 1,
    rows: [crearSolicitante('administrador')]
  }));
  const conexion = impedirTransaccion(t);
  impedirFirebase(t);

  const respuesta = await enviarTelefono({ uid: 'a'.repeat(129) });
  const cuerpo = await respuesta.json();

  assert.equal(respuesta.status, 400);
  assert.equal(cuerpo.codigo, 'uid_invalido');
  assert.equal(conexion.mock.callCount(), 0);
});

test('PATCH teléfono impide al administrador cambiar su propio teléfono', async (t) => {
  simularIdentidad(t);

  t.mock.method(pool, 'query', async () => ({
    rowCount: 1,
    rows: [crearSolicitante('administrador')]
  }));
  const conexion = impedirTransaccion(t);
  const firebase = impedirFirebase(t);

  const respuesta = await enviarTelefono({ uid: 'uid-solicitante' });
  const cuerpo = await respuesta.json();

  assert.equal(respuesta.status, 403);
  assert.deepEqual(cuerpo, {
    ok: false,
    mensaje: 'No puedes cambiar tu propio teléfono desde esta operación',
    codigo: 'cambio_propio_no_permitido'
  });
  assert.equal(conexion.mock.callCount(), 0);
  assert.equal(firebase.getUser.mock.callCount(), 0);
  assert.equal(firebase.updateUser.mock.callCount(), 0);
});

test('PATCH teléfono valida el formato antes del cambio propio', async (t) => {
  simularIdentidad(t);

  t.mock.method(pool, 'query', async () => ({
    rowCount: 1,
    rows: [crearSolicitante('administrador')]
  }));
  impedirTransaccion(t);
  impedirFirebase(t);

  const respuesta = await enviarTelefono({
    uid: 'uid-solicitante',
    datos: { telefono: '123' }
  });
  const cuerpo = await respuesta.json();

  assert.equal(respuesta.status, 400);
  assert.equal(cuerpo.codigo, 'telefono_invalido');
});

test('PATCH teléfono cambia el número, registra los últimos 4 dígitos y conserva el UID', async (t) => {
  simularIdentidad(t);

  const {
    eventos,
    cliente,
    getUser,
    updateUser
  } = prepararTransaccion(t);

  const respuesta = await enviarTelefono();
  const cuerpo = await respuesta.json();

  assert.equal(respuesta.status, 200);
  assert.deepEqual(cuerpo, { uid: 'uid-destino', telefono: TELEFONO_NUEVO });
  assert.equal(respuesta.headers.get('cache-control'), 'no-store');

  assert.deepEqual(eventos, [
    'BEGIN',
    'SELECT',
    'getUser',
    'INSERT',
    'updateUser',
    'COMMIT'
  ]);

  assert.deepEqual(getUser.mock.calls[0].arguments, ['uid-destino']);
  assert.equal(updateUser.mock.callCount(), 1);
  assert.deepEqual(updateUser.mock.calls[0].arguments, [
    'uid-destino',
    { phoneNumber: TELEFONO_NUEVO }
  ]);

  const insert = obtenerInsert(cliente);
  assert.deepEqual(insert.arguments[1], [
    'uid-destino',
    'uid-solicitante',
    '1234',
    '5678'
  ]);

  const parametros = JSON.stringify(insert.arguments[1]);
  assert.doesNotMatch(parametros, /\+52|9510001234|9519995678/);
  assert.equal(cliente.release.mock.callCount(), 1);
});

test('PATCH teléfono registra null como anterior si la cuenta no tenía teléfono', async (t) => {
  simularIdentidad(t);

  const { cliente, eventos } = prepararTransaccion(t, {
    telefonoActual: null
  });

  const respuesta = await enviarTelefono();

  assert.equal(respuesta.status, 200);
  assert.deepEqual(obtenerInsert(cliente).arguments[1], [
    'uid-destino',
    'uid-solicitante',
    null,
    '5678'
  ]);
  assert.equal(eventos.at(-1), 'COMMIT');
});

test('PATCH teléfono se permite sobre una cuenta desactivada', async (t) => {
  simularIdentidad(t);

  const { eventos } = prepararTransaccion(t, {
    destinatario: {
      uid: 'uid-destino',
      nombreCompleto: 'Destinatario de Prueba',
      apodo: null,
      rol: 'maestro',
      activo: false
    }
  });

  const respuesta = await enviarTelefono();

  assert.equal(respuesta.status, 200);
  assert.ok(eventos.includes('updateUser'));
  assert.equal(eventos.at(-1), 'COMMIT');
});

test('PATCH teléfono responde 404 si la cuenta no existe en PostgreSQL', async (t) => {
  simularIdentidad(t);

  const { eventos, getUser, updateUser } = prepararTransaccion(t, {
    destinatario: null
  });

  const respuesta = await enviarTelefono();
  const cuerpo = await respuesta.json();

  assert.equal(respuesta.status, 404);
  assert.equal(cuerpo.codigo, 'usuario_no_encontrado');
  assert.deepEqual(eventos, ['BEGIN', 'SELECT', 'ROLLBACK']);
  assert.equal(getUser.mock.callCount(), 0);
  assert.equal(updateUser.mock.callCount(), 0);
});

test('PATCH teléfono responde 404 si la cuenta no existe en Firebase', async (t) => {
  simularIdentidad(t);

  const { eventos, updateUser } = prepararTransaccion(t, {
    errorGetUser: errorFirebase('auth/user-not-found')
  });

  const respuesta = await enviarTelefono();
  const cuerpo = await respuesta.json();

  assert.equal(respuesta.status, 404);
  assert.deepEqual(cuerpo, {
    ok: false,
    mensaje: 'No existe la cuenta solicitada',
    codigo: 'usuario_no_encontrado'
  });
  assert.deepEqual(eventos, ['BEGIN', 'SELECT', 'getUser', 'ROLLBACK']);
  assert.equal(updateUser.mock.callCount(), 0);
});

test('PATCH teléfono responde 503 si Firebase falla al consultar la cuenta', async (t) => {
  simularIdentidad(t);

  const { eventos, updateUser } = prepararTransaccion(t, {
    errorGetUser: errorFirebase('app/network-error')
  });

  const respuesta = await enviarTelefono();
  const cuerpo = await respuesta.json();

  assert.equal(respuesta.status, 503);
  assert.deepEqual(cuerpo, {
    ok: false,
    mensaje: 'No se pudo cambiar el teléfono. Intenta de nuevo más tarde.',
    codigo: 'identidad_no_disponible'
  });
  assert.deepEqual(eventos, ['BEGIN', 'SELECT', 'getUser', 'ROLLBACK']);
  assert.equal(updateUser.mock.callCount(), 0);
});

test('PATCH teléfono responde 400 telefono_sin_cambios sin registrar ni llamar a updateUser', async (t) => {
  simularIdentidad(t);

  const { eventos, updateUser } = prepararTransaccion(t, {
    telefonoActual: TELEFONO_NUEVO
  });

  const respuesta = await enviarTelefono();
  const cuerpo = await respuesta.json();

  assert.equal(respuesta.status, 400);
  assert.equal(cuerpo.codigo, 'telefono_sin_cambios');
  assert.deepEqual(eventos, ['BEGIN', 'SELECT', 'getUser', 'ROLLBACK']);
  assert.equal(updateUser.mock.callCount(), 0);
});

test('PATCH teléfono responde 409 telefono_en_uso y no deja fila', async (t) => {
  simularIdentidad(t);

  const { eventos } = prepararTransaccion(t, {
    errorUpdateUser: errorFirebase('auth/phone-number-already-exists')
  });

  const respuesta = await enviarTelefono();
  const cuerpo = await respuesta.json();

  assert.equal(respuesta.status, 409);
  assert.deepEqual(cuerpo, {
    ok: false,
    mensaje: 'Ese número ya pertenece a otra cuenta.',
    codigo: 'telefono_en_uso'
  });
  assert.deepEqual(eventos, [
    'BEGIN',
    'SELECT',
    'getUser',
    'INSERT',
    'updateUser',
    'ROLLBACK'
  ]);
  assert.ok(!eventos.includes('COMMIT'));
});

test('PATCH teléfono responde 404 si la cuenta desaparece de Firebase al actualizar', async (t) => {
  simularIdentidad(t);

  const { eventos } = prepararTransaccion(t, {
    errorUpdateUser: errorFirebase('auth/user-not-found')
  });

  const respuesta = await enviarTelefono();
  const cuerpo = await respuesta.json();

  assert.equal(respuesta.status, 404);
  assert.equal(cuerpo.codigo, 'usuario_no_encontrado');
  assert.equal(eventos.at(-1), 'ROLLBACK');
});

for (const codigo of ['auth/internal-error', 'auth/invalid-phone-number', undefined]) {
  test(`PATCH teléfono responde 503 identidad_no_disponible si updateUser falla (${codigo})`, async (t) => {
    simularIdentidad(t);

    const { eventos } = prepararTransaccion(t, {
      errorUpdateUser: errorFirebase(codigo)
    });

    const respuesta = await enviarTelefono();
    const cuerpo = await respuesta.json();

    assert.equal(respuesta.status, 503);
    assert.equal(cuerpo.codigo, 'identidad_no_disponible');
    assert.equal(eventos.at(-1), 'ROLLBACK');
    assert.ok(!eventos.includes('COMMIT'));
  });
}

test('PATCH teléfono no llama a Firebase si falla el INSERT del registro', async (t) => {
  simularIdentidad(t);
  t.mock.method(console, 'error', () => {});

  const { eventos, updateUser } = prepararTransaccion(t, {
    errorInsert: new Error('Fallo simulado del INSERT')
  });

  const respuesta = await enviarTelefono();
  const cuerpo = await respuesta.json();

  assert.equal(respuesta.status, 503);
  assert.equal(cuerpo.ok, false);
  assert.equal(cuerpo.codigo, undefined);
  assert.deepEqual(eventos, [
    'BEGIN',
    'SELECT',
    'getUser',
    'INSERT',
    'ROLLBACK'
  ]);
  assert.equal(updateUser.mock.callCount(), 0);
});

test('PATCH teléfono responde 503 y deja aviso en el log si falla el COMMIT después de Firebase', async (t) => {
  simularIdentidad(t);
  const log = t.mock.method(console, 'error', () => {});

  const { eventos } = prepararTransaccion(t, {
    errorCommit: new Error('Fallo simulado del COMMIT')
  });

  const respuesta = await enviarTelefono();
  const cuerpo = await respuesta.json();

  assert.equal(respuesta.status, 503);
  assert.equal(cuerpo.codigo, undefined);
  assert.deepEqual(eventos, [
    'BEGIN',
    'SELECT',
    'getUser',
    'INSERT',
    'updateUser',
    'COMMIT',
    'ROLLBACK'
  ]);

  const mensajes = log.mock.calls.map((llamada) => llamada.arguments.join(' '));
  assert.ok(mensajes.some((mensaje) =>
    /uid-destino/.test(mensaje) && /no se guardó el registro/.test(mensaje)
  ));
  assert.ok(mensajes.every((mensaje) =>
    !/9510001234|9519995678|1234|5678/.test(mensaje)
  ));
});

test('PATCH teléfono no deja aviso de registro perdido si Firebase no cambió', async (t) => {
  simularIdentidad(t);
  const log = t.mock.method(console, 'error', () => {});

  prepararTransaccion(t, {
    errorUpdateUser: errorFirebase('auth/internal-error')
  });

  await enviarTelefono();

  const mensajes = log.mock.calls.map((llamada) => llamada.arguments.join(' '));
  assert.ok(mensajes.every((mensaje) => !/no se guardó el registro/.test(mensaje)));
});

test('PATCH teléfono responde 503 si no puede obtener una conexión', async (t) => {
  simularIdentidad(t);
  t.mock.method(console, 'error', () => {});

  t.mock.method(pool, 'query', async () => ({
    rowCount: 1,
    rows: [crearSolicitante('administrador')]
  }));
  t.mock.method(pool, 'connect', async () => {
    throw new Error('Sin conexión simulada');
  });
  const firebase = impedirFirebase(t);

  const respuesta = await enviarTelefono();
  const cuerpo = await respuesta.json();

  assert.equal(respuesta.status, 503);
  assert.equal(cuerpo.ok, false);
  assert.equal(firebase.updateUser.mock.callCount(), 0);
});

test('PATCH teléfono no expone el número anterior en ninguna respuesta', async (t) => {
  simularIdentidad(t);

  prepararTransaccion(t, {
    errorUpdateUser: errorFirebase('auth/phone-number-already-exists')
  });

  const respuesta = await enviarTelefono();
  const texto = await respuesta.text();

  assert.doesNotMatch(texto, /9510001234/);
});
