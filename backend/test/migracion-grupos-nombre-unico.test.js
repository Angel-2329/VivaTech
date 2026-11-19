const { test } = require('node:test');
const assert = require('node:assert/strict');
const migracion = require('../migrations/1793923200002_grupos-nombre-unico');

const REGLA = "lower(translate(btrim(regexp_replace(nombre, '[[:space:]\\u00a0]+', ' ', 'g')), 'ÁÉÍÓÚÜÑáéíóúü', 'AEIOUUñaeiouu'))";

function obtenerSql(direccion) {
  const sentencias = [];
  migracion[direccion]({ sql: (sql) => sentencias.push(sql) });
  assert.equal(sentencias.length, 1);
  return sentencias[0];
}

test('Migración grupos: índice único sobre la expresión exacta de la regla', () => {
  const sql = obtenerSql('up');
  assert.ok(
    sql.includes(`CREATE UNIQUE INDEX uq_grupos_nombre_normalizado\n      ON grupos ((${REGLA}));`),
    'El índice debe usar exactamente la regla decidida'
  );
});

test('Migración grupos: la regla incluye el espacio duro, conserva ñ ≠ n y no usa unaccent', () => {
  const sql = obtenerSql('up');
  assert.ok(sql.includes("'[[:space:]\\u00a0]+'"));
  assert.equal(sql.includes('\u00a0'), false);
  assert.ok(sql.includes("'ÁÉÍÓÚÜÑáéíóúü', 'AEIOUUñaeiouu'"));
  assert.doesNotMatch(sql, /unaccent/i);
});

test('Migración grupos: bloquea y verifica duplicados antes de crear el índice', () => {
  const sql = obtenerSql('up');
  const bloqueo = sql.indexOf('LOCK TABLE grupos IN SHARE MODE');
  const verificacion = sql.indexOf('HAVING count(*) > 1');
  const indice = sql.indexOf('CREATE UNIQUE INDEX');
  assert.ok(bloqueo >= 0 && bloqueo < verificacion && verificacion < indice);
  assert.ok(sql.includes(`GROUP BY ${REGLA}`), 'La verificación debe usar la misma regla que el índice');
  assert.match(sql, /RAISE EXCEPTION[\s\S]*No se renombró ni eliminó ningún grupo[\s\S]*ERRCODE = 'P0001'/);
});

test('Migración grupos: no modifica datos ni otras tablas', () => {
  for (const direccion of ['up', 'down']) {
    assert.doesNotMatch(
      obtenerSql(direccion),
      /\b(?:INSERT INTO|DELETE FROM|UPDATE\s+\w+\s+SET|TRUNCATE|CASCADE|ALTER TABLE|DROP TABLE)\b/i
    );
  }
});

test('Migración grupos: down solo elimina el índice', () => {
  assert.match(obtenerSql('down'), /^\s*DROP INDEX uq_grupos_nombre_normalizado;\s*$/);
});
