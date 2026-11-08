const { test } = require('node:test');
const assert = require('node:assert/strict');
const migracion = require('../migrations/1793923200000_cursos-cierre-historial');

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

test('Migración cursos: expone up y down sin ejecutar conexiones al importarla', () => {
  assert.equal(typeof migracion.up, 'function');
  assert.equal(typeof migracion.down, 'function');
  assert.equal(migracion.noTransaction, undefined);
});

test('Migración cursos: añade una fecha civil opcional sin valor predeterminado', () => {
  const sql = obtenerSql('up');
  assert.match(sql, /ALTER TABLE cursos\s+ADD COLUMN fecha_cierre DATE\s*;/);
  assert.doesNotMatch(sql, /fecha_cierre DATE\s+(?:NOT NULL|DEFAULT)/);
});

test('Migración cursos: sustituye la restricción de publicación conservando los estados anteriores', () => {
  const sql = obtenerSql('up');
  assert.match(sql, /DROP CONSTRAINT chk_cursos_estado/);
  assert.match(sql, /ADD CONSTRAINT chk_cursos_estado\s+CHECK \(estado_publicacion IN \('borrador', 'publicado', 'retirado'\)\)/);
  assert.doesNotMatch(sql, /estado_publicacion IN \([^)]*'cerrado'/);
});

test('Migración cursos: no impone una fecha mínima dependiente del paso del tiempo', () => {
  const sql = obtenerSql('up');
  assert.doesNotMatch(sql, /CHECK\s*\([^;]*fecha_cierre/i);
  assert.doesNotMatch(sql, /CURRENT_DATE|America\/Mexico_City|AT TIME ZONE/);
});

test('Migración historial: una instantánea por alumno y curso con campos requeridos', () => {
  const sql = obtenerSql('up');
  assert.match(sql, /CREATE TABLE historial_cursos_retirados/);
  assert.match(sql, /uid_estudiante VARCHAR\(128\) NOT NULL/);
  assert.match(sql, /id_curso BIGINT NOT NULL/);
  assert.match(sql, /lecciones JSONB NOT NULL/);
  assert.match(sql, /curso_completado BOOLEAN NOT NULL/);
  assert.match(sql, /PRIMARY KEY \(uid_estudiante, id_curso\)/);
});

test('Migración historial: protege usuarios y cursos mediante referencias RESTRICT', () => {
  const sql = obtenerSql('up');
  assert.match(sql, /FOREIGN KEY \(uid_estudiante\)\s+REFERENCES usuarios\(uid\)\s+ON DELETE RESTRICT/);
  assert.match(sql, /FOREIGN KEY \(id_curso\)\s+REFERENCES cursos\(id_curso\)\s+ON DELETE RESTRICT/);
  assert.doesNotMatch(sql, /REFERENCES (?:lecciones|pasos)\b/);
  assert.doesNotMatch(sql, /\bCASCADE\b/);
});

test('Migración historial: define arreglo de una a diez lecciones y protege la evaluación de longitud', () => {
  const sql = obtenerSql('up');
  assert.match(sql, /CONSTRAINT chk_historial_cursos_retirados_lecciones/);
  assert.match(sql, /CASE\s+WHEN jsonb_typeof\(lecciones\) = 'array'\s+THEN jsonb_array_length\(lecciones\) BETWEEN 1 AND 10\s+ELSE false\s+END/);
});

test('Migración historial: exige coherencia entre finalización y estado completado', () => {
  const sql = obtenerSql('up');
  assert.match(sql, /fecha_finalizacion_curso TIMESTAMPTZ\s*,/);
  assert.match(sql, /curso_completado AND fecha_finalizacion_curso IS NOT NULL/);
  assert.match(sql, /NOT curso_completado AND fecha_finalizacion_curso IS NULL/);
});

test('Migración historial: conserva instante de retiro y limita finalización a ese instante', () => {
  const sql = obtenerSql('up');
  assert.match(sql, /fecha_retiro TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP/);
  assert.match(sql, /fecha_finalizacion_curso IS NULL\s+OR fecha_finalizacion_curso <= fecha_retiro/);
});

test('Migración historial: indexa la consulta por curso además de la clave por alumno', () => {
  const sql = obtenerSql('up');
  assert.match(sql, /CREATE INDEX idx_historial_cursos_retirados_curso\s+ON historial_cursos_retirados \(id_curso\)/);
});

test('Migración up: solo prepara estructura, no mueve ni elimina contenido existente', () => {
  const sql = obtenerSql('up');
  assert.doesNotMatch(sql, /\b(?:INSERT INTO|UPDATE|DELETE FROM|TRUNCATE|DROP TABLE|DROP COLUMN)\b/i);
  assert.doesNotMatch(sql, /ALTER TABLE (?:usuarios|lecciones|pasos|progresos|certificados)\b/);
  assert.doesNotMatch(sql, /\bBEGIN\s*;|\bCOMMIT\s*;/);
});

test('Migración down: bloquea las tablas antes de inspeccionar datos o eliminar estructura', () => {
  const sql = obtenerSql('down');
  const bloqueo = sql.indexOf('LOCK TABLE cursos, historial_cursos_retirados IN ACCESS EXCLUSIVE MODE');
  const inspeccion = sql.indexOf('IF EXISTS');
  const borrado = sql.indexOf('DROP TABLE historial_cursos_retirados');
  assert.ok(bloqueo >= 0 && bloqueo < inspeccion && inspeccion < borrado);
});

test('Migración down: incluye guardas de historial, retirados y fechas antes de cualquier DROP', () => {
  const sql = obtenerSql('down');
  const finGuarda = sql.indexOf('$reversion$;', sql.indexOf('DO $reversion$'));
  assert.ok(finGuarda > 0);
  const guarda = sql.slice(0, finGuarda);
  assert.match(guarda, /EXISTS \(SELECT 1 FROM historial_cursos_retirados\)/);
  assert.match(guarda, /estado_publicacion = 'retirado'/);
  assert.match(guarda, /fecha_cierre IS NOT NULL/);
  assert.match(guarda, /RAISE EXCEPTION/);
  assert.match(guarda, /ERRCODE = 'P0001'/);
  assert.doesNotMatch(guarda, /\bDROP\b/);
  assert.ok(sql.indexOf('DROP TABLE') > finGuarda);
  assert.ok(sql.indexOf('DROP COLUMN') > finGuarda);
});

test('Migración down: restaura la restricción original y quita solo la estructura nueva', () => {
  const sql = obtenerSql('down');
  assert.match(sql, /DROP TABLE historial_cursos_retirados\s*;/);
  assert.match(sql, /ADD CONSTRAINT chk_cursos_estado\s+CHECK \(estado_publicacion IN \('borrador', 'publicado'\)\)/);
  assert.match(sql, /ALTER TABLE cursos\s+DROP COLUMN fecha_cierre\s*;/);
  assert.doesNotMatch(sql, /\bCASCADE\b|\bDELETE FROM\b|\bUPDATE\b|\bTRUNCATE\b/);
  assert.doesNotMatch(sql, /DROP TABLE (?:usuarios|cursos|lecciones|pasos|progresos|certificados)\s*;/);
});
