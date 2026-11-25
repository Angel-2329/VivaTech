const { test } = require('node:test');
const assert = require('node:assert/strict');
const migracion = require('../migrations/1793923200005_curso-editores');

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

test('Migración curso_editores: expone up y down dentro de transacción', () => {
  assert.equal(typeof migracion.up, 'function');
  assert.equal(typeof migracion.down, 'function');
  assert.equal(migracion.noTransaction, undefined);
});

test('Migración curso_editores: crea la tabla con las columnas acordadas', () => {
  const sql = obtenerSql('up');
  assert.match(sql, /CREATE TABLE curso_editores \(/);
  assert.match(sql, /id_curso BIGINT NOT NULL,/);
  assert.match(sql, /uid_maestro VARCHAR\(128\) NOT NULL,/);
  assert.match(sql, /otorgado_por VARCHAR\(128\) NOT NULL,/);
  assert.match(sql, /fecha_otorgamiento TIMESTAMPTZ NOT NULL DEFAULT now\(\),/);
  assert.match(sql, /PRIMARY KEY \(id_curso, uid_maestro\)/);
});

test('Migración curso_editores: llaves foráneas RESTRICT hacia cursos y usuarios, sin CASCADE', () => {
  const sql = obtenerSql('up');
  assert.match(sql, /FOREIGN KEY \(id_curso\)\s+REFERENCES cursos\(id_curso\)\s+ON DELETE RESTRICT/);
  assert.match(sql, /FOREIGN KEY \(uid_maestro\)\s+REFERENCES usuarios\(uid\)\s+ON DELETE RESTRICT/);
  assert.match(sql, /FOREIGN KEY \(otorgado_por\)\s+REFERENCES usuarios\(uid\)\s+ON DELETE RESTRICT/);
  assert.equal(sql.match(/ON DELETE RESTRICT/g).length, 3);
  assert.doesNotMatch(sql, /CASCADE|SET NULL/i);
});

test('Migración curso_editores: índice por maestro y sin tocar datos existentes', () => {
  const sql = obtenerSql('up');
  assert.match(sql, /CREATE INDEX idx_curso_editores_maestro\s+ON curso_editores \(uid_maestro\)/);
  assert.doesNotMatch(sql, /\b(UPDATE|INSERT|TRUNCATE|ALTER TABLE|DELETE FROM)\b/i);
});

test('Migración curso_editores: down borra solo la tabla, sin CASCADE', () => {
  const sql = obtenerSql('down');
  assert.match(sql, /DROP TABLE curso_editores;/);
  assert.doesNotMatch(sql, /CASCADE|IF EXISTS|\b(UPDATE|DELETE|TRUNCATE|ALTER)\b/i);
});
