const { test } = require('node:test');
const assert = require('node:assert/strict');

process.env.FIREBASE_PROJECT_ID = 'demo-viva-tech-unit';

const firebaseAuth = require('../src/config/firebase');
const verificarTokenFirebase = require('../src/middlewares/verificar-token-firebase');

function crearSolicitud(authorization) {
  return {
    get(nombre) {
      return nombre.toLowerCase() === 'authorization'
        ? authorization
        : undefined;
    }
  };
}

function crearRespuesta() {
  return {
    estado: 200,
    cuerpo: undefined,
    status(estado) {
      this.estado = estado;
      return this;
    },
    json(cuerpo) {
      this.cuerpo = cuerpo;
      return this;
    }
  };
}

for (const [nombre, authorization] of [
  ['sin encabezado', undefined],
  ['con esquema incorrecto', 'Basic prueba'],
  ['sin valor del token', 'Bearer '],
  ['con varios valores', 'Bearer uno,dos']
]) {
  test(`rechaza una solicitud ${nombre}`, async (t) => {
    const verificar = t.mock.method(
      firebaseAuth,
      'verifyIdToken',
      async () => {
        throw new Error('No debería invocarse');
      }
    );

    const req = crearSolicitud(authorization);
    const res = crearRespuesta();
    let continuaciones = 0;

    await verificarTokenFirebase(req, res, () => {
      continuaciones += 1;
    });

    assert.equal(res.estado, 401);
    assert.equal(res.cuerpo.ok, false);
    assert.equal(
      res.cuerpo.mensaje,
      'Se requiere un token de autenticación válido'
    );
    assert.equal(verificar.mock.callCount(), 0);
    assert.equal(continuaciones, 0);
    assert.equal(req.auth, undefined);
  });
}

for (const codigo of [
  'auth/argument-error',
  'auth/invalid-argument',
  'auth/invalid-id-token',
  'auth/id-token-expired'
]) {
  test(`rechaza el error ${codigo}`, async (t) => {
    const verificar = t.mock.method(
      firebaseAuth,
      'verifyIdToken',
      async () => {
        throw Object.assign(new Error('Rechazo de prueba'), {
          code: codigo
        });
      }
    );

    const req = crearSolicitud('Bearer token-de-prueba');
    const res = crearRespuesta();
    let continuaciones = 0;

    await verificarTokenFirebase(req, res, () => {
      continuaciones += 1;
    });

    assert.equal(res.estado, 401);
    assert.equal(res.cuerpo.ok, false);
    assert.equal(
      res.cuerpo.mensaje,
      'El token de autenticación no es válido o ha caducado'
    );
    assert.equal(verificar.mock.callCount(), 1);
    assert.deepEqual(
      verificar.mock.calls[0].arguments,
      ['token-de-prueba']
    );
    assert.equal(continuaciones, 0);
    assert.equal(req.auth, undefined);
  });
}

test('continúa con la identidad devuelta por el verificador', async (t) => {
  const identidad = {
    uid: 'uid-unitario',
    aud: 'demo-viva-tech-unit'
  };

  const verificar = t.mock.method(
    firebaseAuth,
    'verifyIdToken',
    async () => identidad
  );

  const req = crearSolicitud('Bearer token-de-prueba');
  const res = crearRespuesta();
  let continuaciones = 0;

  await verificarTokenFirebase(req, res, () => {
    continuaciones += 1;
  });

  assert.equal(verificar.mock.callCount(), 1);
  assert.deepEqual(
    verificar.mock.calls[0].arguments,
    ['token-de-prueba']
  );
  assert.strictEqual(req.auth, identidad);
  assert.equal(continuaciones, 1);
  assert.equal(res.cuerpo, undefined);
});

test('responde 503 ante un fallo de infraestructura sin filtrar detalles', async (t) => {
  t.mock.method(firebaseAuth, 'verifyIdToken', async () => {
    throw Object.assign(
      new Error('Detalle interno sensible de prueba'),
      { code: 'app/network-error' }
    );
  });

  const registro = t.mock.method(console, 'error', () => {});

  const req = crearSolicitud('Bearer token-de-prueba');
  const res = crearRespuesta();
  let continuaciones = 0;

  await verificarTokenFirebase(req, res, () => {
    continuaciones += 1;
  });

  assert.equal(res.estado, 503);
  assert.deepEqual(res.cuerpo, {
    ok: false,
    mensaje: 'No fue posible verificar la sesión. Intenta más tarde'
  });
  assert.equal(continuaciones, 0);
  assert.equal(req.auth, undefined);
  assert.equal(registro.mock.callCount(), 1);
  assert.deepEqual(registro.mock.calls[0].arguments, [
    'No fue posible verificar la autenticación con Firebase'
  ]);
});