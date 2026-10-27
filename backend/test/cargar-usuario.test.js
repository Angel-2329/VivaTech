const { test } = require('node:test');
const assert = require('node:assert/strict');

process.env.DATABASE_URL = 'postgresql://prueba:prueba@localhost:5432/prueba';

const pool = require('../src/config/database');
const cargarUsuario = require('../src/middlewares/cargar-usuario');

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

test('responde perfil_no_registrado si el UID no existe', async (t) => {
  t.mock.method(pool, 'query', async () => ({
    rowCount: 0,
    rows: []
  }));

  const req = { auth: { uid: 'uid-inexistente' } };
  const res = crearRespuesta();

  await cargarUsuario(req, res, () => {});

  assert.equal(res.estado, 404);
  assert.equal(res.cuerpo.codigo, 'perfil_no_registrado');
});

test('responde cuenta_desactivada si el usuario está inactivo', async (t) => {
  t.mock.method(pool, 'query', async () => ({
    rowCount: 1,
    rows: [{
      uid: 'uid-inactivo',
      nombre_completo: 'Persona de Prueba',
      nombre_apodo: null,
      rol: 'estudiante',
      activo: false
    }]
  }));

  const req = { auth: { uid: 'uid-inactivo' } };
  const res = crearRespuesta();

  await cargarUsuario(req, res, () => {});

  assert.equal(res.estado, 403);
  assert.equal(res.cuerpo.codigo, 'cuenta_desactivada');
});

test('carga el usuario activo y continúa', async (t) => {
  const usuario = {
    uid: 'uid-activo',
    nombre_completo: 'Persona de Prueba',
    nombre_apodo: null,
    rol: 'estudiante',
    activo: true
  };

  t.mock.method(pool, 'query', async () => ({
    rowCount: 1,
    rows: [usuario]
  }));

  const req = { auth: { uid: 'uid-activo' } };
  const res = crearRespuesta();
  let continuaciones = 0;

  await cargarUsuario(req, res, () => {
    continuaciones += 1;
  });

  assert.deepEqual(req.usuario, usuario);
  assert.equal(continuaciones, 1);
  assert.equal(res.cuerpo, undefined);
});

test('responde 503 ante un error de base de datos', async (t) => {
  t.mock.method(pool, 'query', async () => {
    throw new Error('Error interno de prueba');
  });

  t.mock.method(console, 'error', () => {});

  const req = { auth: { uid: 'uid-prueba' } };
  const res = crearRespuesta();

  await cargarUsuario(req, res, () => {});

  assert.equal(res.estado, 503);
  assert.equal(res.cuerpo.ok, false);
});