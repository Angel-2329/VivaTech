const { test } = require('node:test');
const assert = require('node:assert/strict');
const migracion = require('../migrations/1793923200006_cambios-telefono');

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

test('Migración cambios_telefono: expone up y down dentro de transacción', () => {
  assert.equal(typeof migracion.up, 'function');
  assert.equal(typeof migracion.down, 'function');
  assert.equal(migracion.noTransaction, undefined);
});

test('Migración cambios_telefono: crea la tabla con las columnas acordadas', () => {
  const sql = obtenerSql('up');
  assert.match(sql, /CREATE TABLE cambios_telefono \(/);
  assert.match(sql, /id_cambio BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,/);
  assert.match(sql, /uid_usuario VARCHAR\(128\) NOT NULL,/);
  assert.match(sql, /uid_administrador VARCHAR\(128\) NOT NULL,/);
  assert.match(sql, /ultimos4_anterior CHAR\(4\) NULL,/);
  assert.match(sql, /ultimos4_nuevo CHAR\(4\) NOT NULL,/);
  assert.match(sql, /fecha_cambio TIMESTAMPTZ NOT NULL DEFAULT now\(\),/);
});

test('Migración cambios_telefono: no tiene columnas para números completos', () => {
  const sql = obtenerSql('up');
  assert.doesNotMatch(sql, /\btelefono\b|phone/i);
  assert.equal(sql.match(/CHAR\(4\)/g).length, 2);
});

test('Migración cambios_telefono: CHECK de 4 dígitos en ambas columnas', () => {
  const sql = obtenerSql('up');
  assert.match(sql, /CHECK \(ultimos4_anterior ~ '\^\[0-9\]\{4\}\$'\)/);
  assert.match(sql, /CHECK \(ultimos4_nuevo ~ '\^\[0-9\]\{4\}\$'\)/);
});

test('Migración cambios_telefono: llaves foráneas RESTRICT hacia usuarios, sin CASCADE', () => {
  const sql = obtenerSql('up');
  assert.match(sql, /FOREIGN KEY \(uid_usuario\)\s+REFERENCES usuarios\(uid\)\s+ON DELETE RESTRICT/);
  assert.match(sql, /FOREIGN KEY \(uid_administrador\)\s+REFERENCES usuarios\(uid\)\s+ON DELETE RESTRICT/);
  assert.equal(sql.match(/ON DELETE RESTRICT/g).length, 2);
  assert.doesNotMatch(sql, /CASCADE|SET NULL/i);
});

test('Migración cambios_telefono: no toca datos existentes', () => {
  const sql = obtenerSql('up');
  assert.doesNotMatch(sql, /\b(UPDATE|INSERT|TRUNCATE|ALTER TABLE|DELETE FROM)\b/i);
});

test('Migración cambios_telefono: down borra solo la tabla, sin CASCADE', () => {
  const sql = obtenerSql('down');
  assert.match(sql, /DROP TABLE cambios_telefono;/);
  assert.doesNotMatch(sql, /CASCADE|IF EXISTS|\b(UPDATE|DELETE|TRUNCATE|ALTER)\b/i);
});
