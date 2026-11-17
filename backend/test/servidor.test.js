const { test } = require('node:test');
const assert = require('node:assert/strict');

const { obtenerHost } = require('../src/config/servidor');

test('usa API_HOST cuando está definido', () => {
  assert.equal(obtenerHost({ API_HOST: '0.0.0.0', NODE_ENV: 'production' }), '0.0.0.0');
});

test('en producción sin API_HOST escucha solo en 127.0.0.1', () => {
  assert.equal(obtenerHost({ NODE_ENV: 'production' }), '127.0.0.1');
});

test('en desarrollo sin API_HOST conserva el comportamiento por omisión', () => {
  assert.equal(obtenerHost({}), undefined);
  assert.equal(obtenerHost({ NODE_ENV: 'development' }), undefined);
});

test('API_HOST vacío o con espacios se ignora', () => {
  assert.equal(obtenerHost({ API_HOST: '   ', NODE_ENV: 'production' }), '127.0.0.1');
  assert.equal(obtenerHost({ API_HOST: '' }), undefined);
});
