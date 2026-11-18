const { test } = require('node:test');
const assert = require('node:assert/strict');
const migracion = require('../migrations/1793923200001_registro-contenido-inicial');

function obtenerSql(direccion) {
  const sentencias = [];
  migracion[direccion]({ sql: (sql) => sentencias.push(sql) });
  assert.equal(sentencias.length, 1);
  return sentencias[0];
}

test('Registro de carga: identidad independiente de título, categoría y orden', () => {
  const sql = obtenerSql('up');
  assert.match(sql, /CREATE TABLE cargas_contenido_inicial/);
  assert.match(sql, /clave VARCHAR\(80\) PRIMARY KEY/);
  assert.match(sql, /CHECK \(clave ~ '\^\[a-z0-9_-\]\{1,80\}\$'\)/);
  assert.match(sql, /fecha_carga TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP/);
});

test('Registro de carga: conserva marca cuando el curso se elimina físicamente', () => {
  const sql = obtenerSql('up');
  assert.match(sql, /id_curso BIGINT UNIQUE\s*,/);
  assert.doesNotMatch(sql, /id_curso BIGINT[^,]*NOT NULL/);
  assert.match(sql, /FOREIGN KEY \(id_curso\)\s+REFERENCES cursos\(id_curso\)\s+ON DELETE SET NULL/);
});

test('Registro de carga: up no cambia claves existentes ni escribe datos educativos', () => {
  const sql = obtenerSql('up');
  assert.doesNotMatch(sql, /\b(?:ALTER TABLE|INSERT INTO|DELETE FROM|UPDATE|TRUNCATE|CASCADE)\b/i);
});

test('Registro de carga: down bloquea antes de comprobar y eliminar', () => {
  const sql = obtenerSql('down');
  const bloqueo = sql.indexOf('LOCK TABLE cargas_contenido_inicial IN ACCESS EXCLUSIVE MODE');
  const consulta = sql.indexOf('IF EXISTS');
  const borrado = sql.indexOf('DROP TABLE cargas_contenido_inicial');
  assert.ok(bloqueo >= 0 && bloqueo < consulta && consulta < borrado);
  assert.match(sql, /IF EXISTS \(SELECT 1 FROM cargas_contenido_inicial\) THEN/);
  assert.match(sql, /RAISE EXCEPTION[\s\S]*ERRCODE = 'P0001'/);
});

test('Registro de carga: down no permite perder marcas cuyo id_curso ya sea null', () => {
  const sql = obtenerSql('down');
  const guarda = sql.slice(0, sql.indexOf('DROP TABLE'));
  assert.doesNotMatch(guarda, /WHERE\s+id_curso\s+IS NOT NULL/i);
  assert.doesNotMatch(sql, /\b(?:DELETE FROM|UPDATE|TRUNCATE|CASCADE)\b/i);
  assert.match(sql, /DROP TABLE cargas_contenido_inicial\s*;/);
});
