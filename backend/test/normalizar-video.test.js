const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalizarVideo, normalizarRecursosVideo } = require('../src/services/normalizar-video');

const ID = 'abcDEF12345';
const entrada = (cambios = {}) => ({ tipo: 'video', plataforma: 'youtube', titulo: ' Video de ejemplo ', idVideo: ID, ...cambios });
const esError = (error) => error.estado === 400 && error.codigo === 'video_invalido';

for (const url of [
  `https://youtube.com/watch?v=${ID}`, `https://www.youtube.com/watch?v=${ID}&t=30`,
  `https://m.youtube.com/watch?v=${ID}`, `https://www.youtube.com/shorts/${ID}`,
  `https://youtube.com/embed/${ID}`, `https://youtu.be/${ID}?si=ejemplo`,
  `https://www.youtube-nocookie.com/embed/${ID}`, `https://www.youtube.com:443/watch?v=${ID}`,
  `https://www.youtube.com/embed/${ID}/#t=10`, ` https://youtu.be/${ID} `
]) {
  test(`Video: normaliza sin fetch ${url}`, (t) => {
    t.mock.method(globalThis, 'fetch', () => assert.fail('No debe visitar el enlace'));
    assert.deepEqual(normalizarVideo({ tipo: 'video', plataforma: 'youtube', titulo: ' Video de ejemplo ', url }), {
      tipo: 'video', plataforma: 'youtube', idVideo: ID, titulo: 'Video de ejemplo'
    });
  });
}

for (const url of [
  `http://www.youtube.com/watch?v=${ID}`, `https://www.youtube.com:444/watch?v=${ID}`,
  `https://usuario:clave@youtube.com/watch?v=${ID}`, `https://youtube.com.ejemplo.invalid/watch?v=${ID}`,
  `https://www.youtube.com@ejemplo.invalid/watch?v=${ID}`, `https://ejemplo.invalid/youtube.com/${ID}`,
  `https://www.youtube-nocookie.com/watch?v=${ID}`, `https://music.youtube.com/watch?v=${ID}`,
  `https://www.youtube.com/watch?v=${ID}&v=${ID}`, 'https://www.youtube.com/watch',
  'https://youtu.be/corto', `https://youtu.be/${ID}/otro`, `https://youtube.com/otro/${ID}`,
  `https://youtube.com/shorts/${ID}?v=${ID}`, `https://youtu.be/${ID}?v=${ID}`,
  '<iframe src="https://youtube.com/embed/abcDEF12345"></iframe>', 'javascript:alert(1)',
  `https://you\ntube.com/watch?v=${ID}`, null, 123, ''
]) {
  test(`Video: rechaza URL no permitida ${JSON.stringify(url)}`, () => {
    assert.throws(() => normalizarVideo({ tipo: 'video', plataforma: 'youtube', titulo: 'Ejemplo', url }), esError);
  });
}

for (const valor of [
  null, [], {}, entrada({ plataforma: 'otra' }), entrada({ tipo: 'iframe' }),
  entrada({ url: `https://youtu.be/${ID}` }), entrada({ idVideo: 'corto' }), entrada({ idVideo: 1 }),
  entrada({ idVideo: `${ID} ` }), entrada({ titulo: '' }), entrada({ titulo: null }),
  entrada({ titulo: '😀'.repeat(101) }), entrada({ iframe: '<iframe>' })
]) {
  test(`Video: recurso inválido ${JSON.stringify(valor)}`, () => assert.throws(() => normalizarVideo(valor), esError));
}

test('Video: acepta ID persistido, título Unicode máximo y no modifica el objeto', () => {
  const recurso = entrada({ titulo: ` ${'😀'.repeat(100)} ` });
  const antes = structuredClone(recurso);
  assert.equal(normalizarVideo(recurso).titulo, '😀'.repeat(100));
  assert.deepEqual(recurso, antes);
});

test('Video: exige exactamente url o idVideo, no ninguno', () => {
  assert.throws(() => normalizarVideo({ tipo: 'video', plataforma: 'youtube', titulo: 'Ejemplo' }), esError);
});

test('Video: un recurso de lectura se normaliza y conserva otros recursos', () => {
  const recursos = [{ tipo: 'aviso', texto: 'Ejemplo ficticio.' }, entrada()];
  const antes = structuredClone(recursos);
  const resultado = normalizarRecursosVideo(recursos, 'lectura');
  assert.equal(resultado[1].idVideo, ID);
  assert.equal(resultado[0].texto, 'Ejemplo ficticio.');
  assert.deepEqual(recursos, antes);
});

for (const tipo of ['opcion', 'toque', undefined]) {
  test(`Video: no se admite en actividad ${tipo}`, () => assert.throws(() => normalizarRecursosVideo([entrada()], tipo), esError));
}

test('Video: dos videos se rechazan aunque sean válidos', () => {
  assert.throws(() => normalizarRecursosVideo([entrada(), entrada()], 'lectura'), esError);
});
