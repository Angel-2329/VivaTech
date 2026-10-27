const { test } = require('node:test');
const assert = require('node:assert/strict');

const requiereRol = require('../src/middlewares/requiere-rol');

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

test('permite continuar con un rol autorizado', () => {
  const req = {
    usuario: {
      rol: 'maestro'
    }
  };
  const res = crearRespuesta();
  let continuaciones = 0;

  requiereRol('maestro', 'administrador')(req, res, () => {
    continuaciones += 1;
  });

  assert.equal(continuaciones, 1);
  assert.equal(res.cuerpo, undefined);
});

test('rechaza un rol no autorizado', () => {
  const req = {
    usuario: {
      rol: 'estudiante'
    }
  };
  const res = crearRespuesta();
  let continuaciones = 0;

  requiereRol('maestro', 'administrador')(req, res, () => {
    continuaciones += 1;
  });

  assert.equal(res.estado, 403);
  assert.deepEqual(res.cuerpo, {
    ok: false,
    mensaje: 'No tienes permisos para realizar esta acción',
    codigo: 'rol_no_autorizado'
  });
  assert.equal(continuaciones, 0);
});

test('rechaza la solicitud si no hay usuario cargado', () => {
  const req = {};
  const res = crearRespuesta();

  requiereRol('administrador')(req, res, () => {});

  assert.equal(res.estado, 403);
  assert.equal(res.cuerpo.codigo, 'rol_no_autorizado');
});