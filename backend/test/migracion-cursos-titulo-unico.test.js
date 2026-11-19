const { test } = require('node:test');
const assert = require('node:assert/strict');
const migracion = require('../migrations/1793923200003_cursos-titulo-unico');
const migracionGrupos = require('../migrations/1793923200002_grupos-nombre-unico');

const REGLA = "lower(translate(btrim(regexp_replace(titulo, '[[:space:]\\u00a0]+', ' ', 'g')), 'ÁÉÍÓÚÜÑáéíóúü', 'AEIOUUñaeiouu'))";

function obtenerSql(modulo, direccion) {
  const sentencias = [];
  modulo[direccion]({ sql: (sql) => sentencias.push(sql) });
  assert.equal(sentencias.length, 1);
  return sentencias[0];
}

const up = () => obtenerSql(migracion, 'up');

test('Migración cursos: índice único parcial por categoría sobre la expresión exacta de la regla', () => {
  assert.ok(
    up().includes(
      `CREATE UNIQUE INDEX uq_cursos_titulo_normalizado\n      ON cursos (id_categoria, (${REGLA}))\n      WHERE estado_publicacion <> 'retirado';`
    ),
    'El índice debe ser por categoría, usar la regla decidida y excluir solo a los retirados'
  );
});

test('Migración cursos: misma regla que la de grupos (#231), aplicada a titulo', () => {
  const grupos = obtenerSql(migracionGrupos, 'up');
  assert.ok(grupos.includes(REGLA.replace('regexp_replace(titulo', 'regexp_replace(nombre')));
});

test('Migración cursos: incluye el espacio duro, conserva ñ ≠ n y no usa unaccent', () => {
  const sql = up();
  assert.ok(sql.includes("'[[:space:]\\u00a0]+'"));
  assert.equal(sql.includes(' '), false);
  assert.ok(sql.includes("'ÁÉÍÓÚÜÑáéíóúü', 'AEIOUUñaeiouu'"));
  assert.doesNotMatch(sql, /unaccent/i);
});

test('Migración cursos: los borradores cuentan; solo se excluyen los retirados', () => {
  const sql = up();
  assert.doesNotMatch(sql, /borrador/);
  assert.equal(sql.match(/estado_publicacion <> 'retirado'/g).length, 2);
});

test('Migración cursos: bloquea y verifica duplicados (misma regla y filtro) antes de crear el índice', () => {
  const sql = up();
  const bloqueo = sql.indexOf('LOCK TABLE cursos IN SHARE MODE');
  const verificacion = sql.indexOf('HAVING count(*) > 1');
  const indice = sql.indexOf('CREATE UNIQUE INDEX');
  assert.ok(bloqueo >= 0 && bloqueo < verificacion && verificacion < indice);
  assert.ok(
    sql.includes(`WHERE estado_publicacion <> 'retirado'\n        GROUP BY id_categoria, ${REGLA}`),
    'La verificación debe usar la misma regla y el mismo filtro que el índice'
  );
  assert.match(sql, /RAISE EXCEPTION[\s\S]*No se renombró ni eliminó ningún curso[\s\S]*ERRCODE = 'P0001'/);
});

test('Migración cursos: no modifica datos ni otras tablas', () => {
  for (const direccion of ['up', 'down']) {
    assert.doesNotMatch(
      obtenerSql(migracion, direccion),
      /\b(?:INSERT INTO|DELETE FROM|UPDATE\s+\w+\s+SET|TRUNCATE|CASCADE|ALTER TABLE|DROP TABLE)\b/i
    );
  }
});

test('Migración cursos: down solo elimina el índice', () => {
  assert.match(obtenerSql(migracion, 'down'), /^\s*DROP INDEX uq_cursos_titulo_normalizado;\s*$/);
});
