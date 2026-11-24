const { test } = require('node:test');
const assert = require('node:assert/strict');
const migracion = require('../migrations/1793923200004_certificados-duracion');

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

test('Migración duración: expone up y down dentro de transacción', () => {
  assert.equal(typeof migracion.up, 'function');
  assert.equal(typeof migracion.down, 'function');
  assert.equal(migracion.noTransaction, undefined);
});

test('Migración duración: agrega columna entera opcional sin valor predeterminado', () => {
  const sql = obtenerSql('up');
  assert.match(sql, /ALTER TABLE certificados\s+ADD COLUMN duracion_minutos INTEGER\s*;/);
  assert.doesNotMatch(sql, /duracion_minutos INTEGER\s+(?:NOT NULL|DEFAULT)/);
});

test('Migración duración: la restricción admite null o valores positivos', () => {
  assert.match(obtenerSql('up'),
    /ADD CONSTRAINT chk_certificados_duracion\s+CHECK \(duracion_minutos IS NULL OR duracion_minutos > 0\)/);
});

test('Migración duración: up no modifica filas existentes', () => {
  assert.doesNotMatch(obtenerSql('up'), /\b(UPDATE|DELETE|INSERT|TRUNCATE)\b/i);
});

test('Migración duración: down borra solo la restricción y la columna, sin CASCADE', () => {
  const sql = obtenerSql('down');
  assert.match(sql, /DROP CONSTRAINT chk_certificados_duracion/);
  assert.match(sql, /DROP COLUMN duracion_minutos/);
  assert.doesNotMatch(sql, /CASCADE|DROP TABLE|\b(UPDATE|DELETE|TRUNCATE)\b/i);
});
