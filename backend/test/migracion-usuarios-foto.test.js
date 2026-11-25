const { test } = require('node:test');
const assert = require('node:assert/strict');
const migracion = require('../migrations/1793923200007_usuarios-foto');

function obtenerSql(direccion) {
  const sentencias = [];
  migracion[direccion]({
    sql(sentencia) {
      assert.equal(typeof sentencia, 'string');
      sentencias.push(sentencia);
    }
  });
  assert.equal(sentencias.length, 1);
  return sentencias[0];
}

test('Migración usuarios foto: expone up y down dentro de transacción', () => {
  assert.equal(typeof migracion.up, 'function');
  assert.equal(typeof migracion.down, 'function');
  assert.equal(migracion.noTransaction, undefined);
});

test('Migración usuarios foto: agrega las dos columnas acordadas como NULL', () => {
  const sql = obtenerSql('up');
  assert.match(sql, /ALTER TABLE usuarios/);
  assert.match(sql, /ADD COLUMN foto_archivo TEXT NULL,/);
  assert.match(sql, /ADD COLUMN foto_actualizada TIMESTAMPTZ NULL;/);
  assert.equal(sql.match(/ADD COLUMN/g).length, 2);
});

test('Migración usuarios foto: up no toca datos ni pone valores por omisión', () => {
  const sql = obtenerSql('up');
  assert.doesNotMatch(sql, /\b(UPDATE|INSERT|TRUNCATE|DELETE FROM|DEFAULT|NOT NULL)\b/i);
});

test('Migración usuarios foto: down borra solo las dos columnas, sin CASCADE', () => {
  const sql = obtenerSql('down');
  assert.match(sql, /DROP COLUMN foto_actualizada,/);
  assert.match(sql, /DROP COLUMN foto_archivo;/);
  assert.equal(sql.match(/DROP COLUMN/g).length, 2);
  assert.doesNotMatch(sql, /CASCADE|IF EXISTS|DROP TABLE|\b(UPDATE|DELETE|TRUNCATE)\b/i);
});
