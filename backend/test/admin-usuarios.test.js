const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

process.env.DATABASE_URL =
  'postgresql://prueba:prueba@localhost:5432/prueba';
process.env.FIREBASE_PROJECT_ID = 'demo-viva-tech-admin-usuarios';

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

test('GET admin usuarios rechaza una solicitud sin token', async (t) => {
  const consulta = t.mock.method(pool, 'query', async () => {
    throw new Error('No debería consultarse PostgreSQL');
  });

  const respuesta = await fetch(urlUsuarios);
  const cuerpo = await respuesta.json();

  assert.equal(respuesta.status, 401);
  assert.equal(cuerpo.ok, false);
  assert.equal(consulta.mock.callCount(), 0);
});

for (const rol of ['estudiante', 'maestro']) {
  test(`GET admin usuarios rechaza al ${rol}`, async (t) => {
    simularIdentidad(t);

    const consulta = t.mock.method(pool, 'query', async () => ({
      rowCount: 1,
      rows: [crearSolicitante(rol)]
    }));

    const respuesta = await fetch(urlUsuarios, {
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
}

test('GET admin usuarios permite consultar al administrador', async (t) => {
  simularIdentidad(t);

  const cuentas = [
    {
      uid: 'uid-estudiante',
      nombreCompleto: 'Persona de Prueba Estudiante',
      apodo: null,
      rol: 'estudiante',
      activo: true
    },
    {
      uid: 'uid-maestro',
      nombreCompleto: 'Persona de Prueba Maestro',
      apodo: null,
      rol: 'maestro',
      activo: false
    },
    {
      uid: 'uid-administrador',
      nombreCompleto: 'Persona de Prueba Administrador',
      apodo: null,
      rol: 'administrador',
      activo: true
    }
  ];

  const consulta = t.mock.method(pool, 'query', async (sql) => {
    if (/WHERE uid = \$1/.test(sql)) {
      return {
        rowCount: 1,
        rows: [crearSolicitante('administrador')]
      };
    }

    return {
      rowCount: cuentas.length,
      rows: cuentas
    };
  });

  const parametros = new URLSearchParams({
    buscar: '  Persona  ',
    limite: '10',
    desplazamiento: '0'
  });

  const respuesta = await fetch(
    `${urlUsuarios}?${parametros}`,
    {
      headers: {
        Authorization: 'Bearer token-prueba'
      }
    }
  );

  const cuerpo = await respuesta.json();

  assert.equal(respuesta.status, 200);
  assert.deepEqual(cuerpo, cuentas);
  assert.equal(consulta.mock.callCount(), 2);

  const [sql, valores] = consulta.mock.calls[1].arguments;

  assert.deepEqual(valores, ['Persona', 10, 0]);
  assert.match(sql, /ORDER BY lower\(nombre_completo\), uid/);
  assert.match(sql, /LIMIT \$2 OFFSET \$3/);

  assert.doesNotMatch(sql, /\bactivo\s*=\s*true\b/i);
  assert.doesNotMatch(sql, /\brol\s*=/i);
});

test('GET admin usuarios rechaza al administrador desactivado', async (t) => {
  simularIdentidad(t);

  const consulta = t.mock.method(pool, 'query', async () => ({
    rowCount: 1,
    rows: [crearSolicitante('administrador', false)]
  }));

  const respuesta = await fetch(urlUsuarios, {
    headers: {
      Authorization: 'Bearer token-prueba'
    }
  });

  const cuerpo = await respuesta.json();

  assert.equal(respuesta.status, 403);
  assert.equal(cuerpo.codigo, 'cuenta_desactivada');
  assert.equal(consulta.mock.callCount(), 1);
});

function impedirTransaccion(t) {
  return t.mock.method(pool, 'connect', async () => {
    throw new Error('No debería abrirse una transacción');
  });
}

async function enviarCambio(
  operacion,
  {
    uid = 'uid-destino',
    datos = operacion.datosValidos,
    conToken = true
  } = {}
) {
  const headers = {
    'Content-Type': 'application/json'
  };

  if (conToken) {
    headers.Authorization = 'Bearer token-prueba';
  }

  return fetch(`${urlUsuarios}/${uid}/${operacion.campo}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(datos)
  });
}

for (const operacion of [
  {
    campo: 'rol',
    datosValidos: { rol: 'maestro' },
    datosInvalidos: { rol: 'superusuario' },
    codigoInvalido: 'rol_invalido'
  },
  {
    campo: 'activo',
    datosValidos: { activo: false },
    datosInvalidos: { activo: 'false' },
    codigoInvalido: 'activo_invalido'
  }
]) {
  test(
    `PATCH admin ${operacion.campo} rechaza una solicitud sin token`,
    async (t) => {
      const consulta = t.mock.method(pool, 'query', async () => {
        throw new Error('No debería consultarse PostgreSQL');
      });

      const conexion = impedirTransaccion(t);

      const respuesta = await enviarCambio(operacion, {
        conToken: false
      });

      const cuerpo = await respuesta.json();

      assert.equal(respuesta.status, 401);
      assert.equal(cuerpo.ok, false);
      assert.equal(consulta.mock.callCount(), 0);
      assert.equal(conexion.mock.callCount(), 0);
    }
  );

  for (const rol of ['estudiante', 'maestro']) {
    test(
      `PATCH admin ${operacion.campo} rechaza al ${rol}`,
      async (t) => {
        simularIdentidad(t);

        const consulta = t.mock.method(pool, 'query', async () => ({
          rowCount: 1,
          rows: [crearSolicitante(rol)]
        }));

        const conexion = impedirTransaccion(t);
        const respuesta = await enviarCambio(operacion);
        const cuerpo = await respuesta.json();

        assert.equal(respuesta.status, 403);
        assert.equal(cuerpo.codigo, 'rol_no_autorizado');
        assert.equal(consulta.mock.callCount(), 1);
        assert.equal(conexion.mock.callCount(), 0);
      }
    );
  }

  test(
    `PATCH admin ${operacion.campo} rechaza un valor inválido`,
    async (t) => {
      simularIdentidad(t);

      const consulta = t.mock.method(pool, 'query', async () => ({
        rowCount: 1,
        rows: [crearSolicitante('administrador')]
      }));

      const conexion = impedirTransaccion(t);

      const respuesta = await enviarCambio(operacion, {
        datos: operacion.datosInvalidos
      });

      const cuerpo = await respuesta.json();

      assert.equal(respuesta.status, 400);
      assert.equal(cuerpo.codigo, operacion.codigoInvalido);
      assert.equal(consulta.mock.callCount(), 1);
      assert.equal(conexion.mock.callCount(), 0);
    }
  );

  test(
    `PATCH admin ${operacion.campo} impide modificarse a sí mismo`,
    async (t) => {
      simularIdentidad(t);

      const consulta = t.mock.method(pool, 'query', async () => ({
        rowCount: 1,
        rows: [crearSolicitante('administrador')]
      }));

      const conexion = impedirTransaccion(t);

      const respuesta = await enviarCambio(operacion, {
        uid: 'uid-solicitante'
      });

      const cuerpo = await respuesta.json();

      assert.equal(respuesta.status, 403);
      assert.equal(
        cuerpo.codigo,
        'modificacion_propia_no_permitida'
      );
      assert.equal(consulta.mock.callCount(), 1);
      assert.equal(conexion.mock.callCount(), 0);
    }
  );
}

function crearDestinatario(activo = true) {
  return {
    uid: 'uid-destino',
    nombreCompleto: 'Destinatario de Prueba',
    apodo: null,
    rol: 'estudiante',
    activo
  };
}

function prepararCambioAdministrativo(
  t,
  {
    destinatario = crearDestinatario(),
    tieneGrupos = false
  } = {}
) {
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

      if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(comando)) {
        return { rowCount: 0, rows: [] };
      }

      if (/FOR UPDATE/.test(sql)) {
        const filas = destinatario
          ? [administrador, destinatario]
          : [administrador];

        return {
          rowCount: filas.length,
          rows: filas
        };
      }

      if (/SELECT EXISTS/.test(sql)) {
        return {
          rowCount: 1,
          rows: [{ tieneGrupos }]
        };
      }

      if (/^\s*UPDATE usuarios/.test(sql)) {
        if (!destinatario) {
          throw new Error('No debería actualizarse una cuenta inexistente');
        }

        if (/SET rol = \$1/.test(sql)) {
          return {
            rowCount: 1,
            rows: [{
              ...destinatario,
              rol: parametros[0]
            }]
          };
        }

        if (/SET activo = \$1/.test(sql)) {
          return {
            rowCount: 1,
            rows: [{
              ...destinatario,
              activo: parametros[0]
            }]
          };
        }
      }

      throw new Error('Consulta inesperada en la transacción');
    }),

    release: t.mock.fn()
  };

  const conexion = t.mock.method(
    pool,
    'connect',
    async () => cliente
  );

  return { cliente, consulta, conexion };
}

for (const caso of [
  {
    nombre: 'cambia el rol',
    campo: 'rol',
    datosValidos: { rol: 'maestro' },
    destinatario: crearDestinatario(),
    valorEsperado: 'maestro'
  },
  {
    nombre: 'desactiva una cuenta',
    campo: 'activo',
    datosValidos: { activo: false },
    destinatario: crearDestinatario(true),
    valorEsperado: false
  },
  {
    nombre: 'reactiva una cuenta',
    campo: 'activo',
    datosValidos: { activo: true },
    destinatario: crearDestinatario(false),
    valorEsperado: true
  }
]) {
  test(`PATCH admin ${caso.nombre} y confirma la transacción`, async (t) => {
    simularIdentidad(t);

    const {
      cliente,
      consulta,
      conexion
    } = prepararCambioAdministrativo(t, {
      destinatario: caso.destinatario
    });

    const respuesta = await enviarCambio(caso);
    const cuerpo = await respuesta.json();

    assert.equal(respuesta.status, 200);

    assert.deepEqual(cuerpo, {
      ...caso.destinatario,
      [caso.campo]: caso.valorEsperado
    });

    assert.equal(consulta.mock.callCount(), 1);
    assert.equal(conexion.mock.callCount(), 1);

    const llamadas = cliente.query.mock.calls;
    const comandos = llamadas.map(
      (llamada) => llamada.arguments[0].trim()
    );

    assert.equal(comandos[0], 'BEGIN');

    assert.match(
      llamadas[1].arguments[0],
      /ORDER BY uid\s+FOR UPDATE/
    );

    assert.deepEqual(
      llamadas[1].arguments[1],
      ['uid-solicitante', 'uid-destino']
    );

    const actualizaciones = llamadas.filter(
      (llamada) => /^\s*UPDATE usuarios/.test(
        llamada.arguments[0]
      )
    );

    assert.equal(actualizaciones.length, 1);

    assert.deepEqual(
      actualizaciones[0].arguments[1],
      [caso.valorEsperado, 'uid-destino']
    );

    const consultasGrupos = llamadas.filter(
      (llamada) => /SELECT EXISTS/.test(
        llamada.arguments[0]
      )
    );

    if (caso.campo === 'rol') {
      assert.equal(consultasGrupos.length, 1);

      assert.match(
        consultasGrupos[0].arguments[0],
        /FROM grupo_estudiantes/
      );

      assert.match(
        consultasGrupos[0].arguments[0],
        /FROM grupo_maestros/
      );

      assert.deepEqual(
        consultasGrupos[0].arguments[1],
        ['uid-destino']
      );
    } else {
      assert.equal(consultasGrupos.length, 0);
    }

    assert.equal(comandos.at(-1), 'COMMIT');
    assert.equal(comandos.includes('ROLLBACK'), false);

    assert.equal(cliente.release.mock.callCount(), 1);
    assert.equal(
      cliente.release.mock.calls[0].arguments[0],
      undefined
    );
  });
}

test('PATCH rol responde 409 y revierte si hay participación en grupos', async (t) => {
  simularIdentidad(t);

  const { cliente, conexion } = prepararCambioAdministrativo(t, {
    tieneGrupos: true
  });

  const respuesta = await enviarCambio({
    campo: 'rol',
    datosValidos: { rol: 'maestro' }
  });

  const cuerpo = await respuesta.json();

  assert.equal(respuesta.status, 409);
  assert.equal(cuerpo.codigo, 'usuario_en_grupos');
  assert.equal(conexion.mock.callCount(), 1);

  const comandos = cliente.query.mock.calls.map(
    (llamada) => llamada.arguments[0].trim()
  );

  assert.equal(comandos[0], 'BEGIN');
  assert.equal(comandos.at(-1), 'ROLLBACK');
  assert.equal(comandos.includes('COMMIT'), false);

  assert.equal(
    comandos.some((sql) => /^UPDATE usuarios/.test(sql)),
    false
  );

  assert.equal(cliente.release.mock.callCount(), 1);
  assert.equal(
    cliente.release.mock.calls[0].arguments[0],
    undefined
  );
});

function verificarReversionSinActualizar(cliente) {
  const comandos = cliente.query.mock.calls.map(
    (llamada) => llamada.arguments[0].trim()
  );

  assert.equal(comandos[0], 'BEGIN');
  assert.equal(comandos.at(-1), 'ROLLBACK');
  assert.equal(comandos.includes('COMMIT'), false);

  assert.equal(
    comandos.some((sql) => /^UPDATE usuarios/.test(sql)),
    false
  );

  assert.equal(cliente.release.mock.callCount(), 1);
  assert.equal(
    cliente.release.mock.calls[0].arguments[0],
    undefined
  );
}

for (const operacion of [
  {
    campo: 'rol',
    datosValidos: { rol: 'maestro' }
  },
  {
    campo: 'activo',
    datosValidos: { activo: false }
  }
]) {
  test(
    `PATCH admin ${operacion.campo} revierte si el destinatario no existe`,
    async (t) => {
      simularIdentidad(t);

      const { cliente } = prepararCambioAdministrativo(t, {
        destinatario: null
      });

      const respuesta = await enviarCambio(operacion);
      const cuerpo = await respuesta.json();

      assert.equal(respuesta.status, 404);
      assert.equal(cuerpo.codigo, 'usuario_no_encontrado');

      verificarReversionSinActualizar(cliente);
    }
  );

  for (const caso of [
    {
      nombre: 'perdió el rol de administrador',
      rol: 'maestro',
      activo: true,
      codigo: 'rol_no_autorizado'
    },
    {
      nombre: 'fue desactivado',
      rol: 'administrador',
      activo: false,
      codigo: 'cuenta_desactivada'
    }
  ]) {
    test(
      `PATCH admin ${operacion.campo} rechaza al solicitante que ${caso.nombre}`,
      async (t) => {
        simularIdentidad(t);

        // El middleware consulta un administrador activo.
        const { cliente, consulta } =
          prepararCambioAdministrativo(t);

        const consultaOriginal = cliente.query;

        // La lectura bloqueada dentro de la transacción
        // encuentra que sus permisos ya cambiaron.
        t.mock.method(cliente, 'query', async (sql, parametros) => {
          if (/FOR UPDATE/.test(sql)) {
            return {
              rowCount: 2,
              rows: [
                {
                  uid: 'uid-solicitante',
                  nombreCompleto: 'Administrador de Prueba',
                  apodo: null,
                  rol: caso.rol,
                  activo: caso.activo
                },
                crearDestinatario()
              ]
            };
          }

          return consultaOriginal(sql, parametros);
        });

        const respuesta = await enviarCambio(operacion);
        const cuerpo = await respuesta.json();

        assert.equal(respuesta.status, 403);
        assert.equal(cuerpo.codigo, caso.codigo);
        assert.equal(consulta.mock.callCount(), 1);

        verificarReversionSinActualizar(cliente);
      }
    );
  }
}

function prepararFalloActualizacion(
  t,
  { fallarRollback = false } = {}
) {
  const { cliente } = prepararCambioAdministrativo(t);

  const errorActualizacion =
    new Error('Detalle interno sensible de actualización');

  const errorRollback =
    new Error('Detalle interno sensible de reversión');

  const consultaOriginal = cliente.query;

  t.mock.method(cliente, 'query', async (sql, parametros) => {
    const comando = sql.trim();

    if (/^UPDATE usuarios/.test(comando)) {
      throw errorActualizacion;
    }

    if (comando === 'ROLLBACK' && fallarRollback) {
      throw errorRollback;
    }

    return consultaOriginal(sql, parametros);
  });

  t.mock.method(console, 'error', () => {});

  return { cliente, errorRollback };
}

for (const operacion of [
  {
    campo: 'rol',
    datosValidos: { rol: 'maestro' }
  },
  {
    campo: 'activo',
    datosValidos: { activo: false }
  }
]) {
  test(
    `PATCH admin ${operacion.campo} revierte cuando falla el UPDATE`,
    async (t) => {
      simularIdentidad(t);

      const { cliente } = prepararFalloActualizacion(t);

      const respuesta = await enviarCambio(operacion);
      const cuerpo = await respuesta.json();

      assert.equal(respuesta.status, 503);
      assert.deepEqual(cuerpo, {
        ok: false,
        mensaje: 'No fue posible actualizar la cuenta'
      });

      const comandos = cliente.query.mock.calls.map(
        (llamada) => llamada.arguments[0].trim()
      );

      assert.equal(comandos[0], 'BEGIN');
      assert.equal(
        comandos.filter((sql) => /^UPDATE usuarios/.test(sql)).length,
        1
      );
      assert.equal(comandos.at(-1), 'ROLLBACK');
      assert.equal(comandos.includes('COMMIT'), false);

      assert.equal(cliente.release.mock.callCount(), 1);
      assert.equal(
        cliente.release.mock.calls[0].arguments[0],
        undefined
      );
    }
  );
}

test('PATCH admin descarta la conexión cuando también falla el ROLLBACK', async (t) => {
  simularIdentidad(t);

  const {
    cliente,
    errorRollback
  } = prepararFalloActualizacion(t, {
    fallarRollback: true
  });

  const respuesta = await enviarCambio({
    campo: 'rol',
    datosValidos: { rol: 'maestro' }
  });

  const cuerpo = await respuesta.json();

  assert.equal(respuesta.status, 503);
  assert.deepEqual(cuerpo, {
    ok: false,
    mensaje: 'No fue posible actualizar la cuenta'
  });

  const comandos = cliente.query.mock.calls.map(
    (llamada) => llamada.arguments[0].trim()
  );

  assert.equal(comandos.at(-1), 'ROLLBACK');
  assert.equal(comandos.includes('COMMIT'), false);

  assert.equal(cliente.release.mock.callCount(), 1);

  // El error se entrega al pool para descartar la conexión.
  assert.strictEqual(
    cliente.release.mock.calls[0].arguments[0],
    errorRollback
  );
});

test('PATCH admin responde 503 si no puede obtener una conexión', async (t) => {
  simularIdentidad(t);

  t.mock.method(pool, 'query', async () => ({
    rowCount: 1,
    rows: [crearSolicitante('administrador')]
  }));

  const conexion = t.mock.method(pool, 'connect', async () => {
    throw new Error('Detalle interno sensible de conexión');
  });

  t.mock.method(console, 'error', () => {});

  const respuesta = await enviarCambio({
    campo: 'activo',
    datosValidos: { activo: false }
  });

  const cuerpo = await respuesta.json();

  assert.equal(respuesta.status, 503);
  assert.deepEqual(cuerpo, {
    ok: false,
    mensaje: 'No fue posible actualizar la cuenta'
  });

  assert.equal(conexion.mock.callCount(), 1);
});