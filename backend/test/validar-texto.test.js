const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizarTexto,
  normalizarNombrePersona,
  contarCaracteres,
  esNombreGrupoValido,
  esNombrePersonaValido
} = require('../src/services/validar-texto');

for (const [entrada, esperado] of [
  ['  Grupo   A  ', 'Grupo A'],
  ['Grupo  A', 'Grupo A'],
  ['Grupo\tA\nB', 'Grupo A B'],
  ['José', 'José'],
  ['Ñandú', 'Ñandú'],
  ['   ', '']
]) {
  test(`Texto: normaliza ${JSON.stringify(entrada)}`, () => {
    assert.equal(normalizarTexto(entrada), esperado);
  });
}

test('Texto: el nombre de persona convierte el apóstrofo tipográfico', () => {
  assert.equal(normalizarNombrePersona('  O’Connor  '), "O'Connor");
});

test('Texto: el nombre de grupo conserva el apóstrofo tipográfico (y luego no es válido)', () => {
  assert.equal(normalizarTexto('Grupo’s'), 'Grupo’s');
  assert.equal(esNombreGrupoValido(normalizarTexto('Grupo’s')), false);
});

test('Texto: cuenta caracteres y no unidades UTF-16', () => {
  assert.equal(contarCaracteres('😀'), 1);
  assert.equal(contarCaracteres('José'), 4);
});

for (const nombre of [
  'Grupo A',
  'Grupo 1',
  '1',
  'a',
  'Ñandú',
  'Grupo 1-A (turno #2), mañana_b.',
  'ÁÉÍÓÚÜÑáéíóúüñ'
]) {
  test(`Grupo: acepta ${JSON.stringify(nombre)}`, () => {
    assert.equal(esNombreGrupoValido(nombre), true);
  });
}

for (const nombre of [
  'Grupo 😀',
  'Grupo@1',
  'Grupo/1',
  '<script>',
  'Grupo’s',
  "Grupo's",
  'Grupo ç',
  'Grupo ß',
  '---',
  '#()',
  '. , _',
  ''
]) {
  test(`Grupo: rechaza ${JSON.stringify(nombre)}`, () => {
    assert.equal(esNombreGrupoValido(nombre), false);
  });
}

for (const nombre of [
  'Ana',
  'José Ñúñez',
  "O'Connor",
  'Ana-María',
  'María del Carmen',
  'Ü'
]) {
  test(`Persona: acepta ${JSON.stringify(nombre)}`, () => {
    assert.equal(esNombrePersonaValido(nombre), true);
  });
}

for (const nombre of [
  'Ana 😀',
  'Juan123',
  'Ana@Gómez',
  'Ana.',
  'Ana_B',
  'Ana (B)',
  '<b>Ana</b>',
  '---',
  "'''",
  "- '",
  ''
]) {
  test(`Persona: rechaza ${JSON.stringify(nombre)}`, () => {
    assert.equal(esNombrePersonaValido(nombre), false);
  });
}
