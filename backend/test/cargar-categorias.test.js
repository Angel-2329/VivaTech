const { test } = require('node:test');
const assert = require('node:assert/strict');
const { cargarCategorias } = require('../scripts/cargar-categorias');

const UID_ADMINISTRADOR = 'uid-administrador-prueba';
const BANCA = { nombre: 'Banca móvil', orden: 1 };
const PAGOS = { nombre: 'Pagos digitales', orden: 2 };

function inicio(filas = [{ rol: 'administrador', activo: true }]) {
  return [
    { sql: /^BEGIN$/ },
    {
      sql: /SELECT rol, activo[\s\S]*WHERE uid = \$1[\s\S]*FOR SHARE/,
      parametros: [UID_ADMINISTRADOR],
      filas
    }
  ];
}

function bloquearCategorias() {
  return { sql: /^LOCK TABLE categorias IN SHARE ROW EXCLUSIVE MODE$/ };
}

function consultarCategoria(categoria, filas = []) {
  return {
    sql: /SELECT nombre, orden[\s\S]*WHERE nombre = \$1 OR orden = \$2/,
    parametros: [categoria.nombre, categoria.orden],
    filas
  };
}

function insertarCategoria(categoria, error) {
  return {
    sql: /INSERT INTO categorias \(nombre, orden, creado_por\)[\s\S]*VALUES \(\$1, \$2, \$3\)/,
    parametros: [categoria.nombre, categoria.orden, UID_ADMINISTRADOR],
    error
  };
}

function simularPool(t, pasos) {
  let posicion = 0;
  const cliente = {
    query: t.mock.fn(async (sql, parametros) => {
      const paso = pasos[posicion++];
      assert.ok(paso, `Consulta inesperada: ${sql}`);
      assert.match(sql, paso.sql);
      assert.deepEqual(parametros, paso.parametros);
      if (paso.error) throw paso.error;
      const filas = paso.filas || [];
      return { rowCount: filas.length, rows: filas };
    }),
    release: t.mock.fn()
  };
  const pool = { connect: t.mock.fn(async () => cliente) };

  return { pool, cliente };
}

function comprobarFinal(simulacion, pasos, descartar = false) {
  assert.equal(simulacion.pool.connect.mock.callCount(), 1);
  assert.equal(simulacion.cliente.query.mock.callCount(), pasos.length);
  assert.equal(simulacion.cliente.release.mock.callCount(), 1);
  assert.deepEqual(
    simulacion.cliente.release.mock.calls[0].arguments,
    [descartar]
  );
}

for (const escenario of [
  { nombre: 'ausente', uid: undefined },
  { nombre: 'nulo', uid: null },
  { nombre: 'vacío', uid: '' },
  { nombre: 'solo espacios', uid: '   ' },
  { nombre: 'numérico', uid: 123 },
  { nombre: 'de 129 caracteres', uid: 'u'.repeat(129) }
]) {
  test(`Categorías: rechaza UID ${escenario.nombre} sin conectar`, async (t) => {
    const pool = {
      connect: t.mock.fn(async () => {
        throw new Error('No debería obtenerse una conexión');
      })
    };

    await assert.rejects(
      cargarCategorias(pool, escenario.uid),
      { message: 'Debes proporcionar un UID de administrador válido.' }
    );
    assert.equal(pool.connect.mock.callCount(), 0);
  });
}

for (const escenario of [
  { nombre: 'cuenta inexistente', filas: [] },
  { nombre: 'rol no administrador', filas: [{ rol: 'estudiante', activo: true }] },
  { nombre: 'administrador desactivado', filas: [{ rol: 'administrador', activo: false }] }
]) {
  test(`Categorías: revierte por ${escenario.nombre} antes de cargar`, async (t) => {
    const pasos = [...inicio(escenario.filas), { sql: /^ROLLBACK$/ }];
    const simulacion = simularPool(t, pasos);

    await assert.rejects(
      cargarCategorias(simulacion.pool, UID_ADMINISTRADOR),
      { message: 'El UID debe corresponder a un administrador activo registrado.' }
    );
    comprobarFinal(simulacion, pasos);
  });
}

test('Categorías: primera carga crea ambas y normaliza el UID', async (t) => {
  const pasos = [
    ...inicio(),
    bloquearCategorias(),
    consultarCategoria(BANCA),
    insertarCategoria(BANCA),
    consultarCategoria(PAGOS),
    insertarCategoria(PAGOS),
    { sql: /^COMMIT$/ }
  ];
  const simulacion = simularPool(t, pasos);

  assert.deepEqual(
    await cargarCategorias(simulacion.pool, `  ${UID_ADMINISTRADOR}  `),
    { creadas: 2, existentes: 0 }
  );
  comprobarFinal(simulacion, pasos);
});

test('Categorías: repetición conserva ambas sin INSERT ni UPDATE', async (t) => {
  const pasos = [
    ...inicio(),
    bloquearCategorias(),
    consultarCategoria(BANCA, [BANCA]),
    consultarCategoria(PAGOS, [PAGOS]),
    { sql: /^COMMIT$/ }
  ];
  const simulacion = simularPool(t, pasos);

  assert.deepEqual(
    await cargarCategorias(simulacion.pool, UID_ADMINISTRADOR),
    { creadas: 0, existentes: 2 }
  );
  comprobarFinal(simulacion, pasos);
});

for (const existente of [BANCA, PAGOS]) {
  test(`Categorías: carga parcial conserva ${existente.nombre} y crea la faltante`, async (t) => {
    const pasos = [...inicio(), bloquearCategorias()];

    for (const categoria of [BANCA, PAGOS]) {
      const coincide = categoria.nombre === existente.nombre;
      pasos.push(consultarCategoria(categoria, coincide ? [categoria] : []));
      if (!coincide) pasos.push(insertarCategoria(categoria));
    }
    pasos.push({ sql: /^COMMIT$/ });

    const simulacion = simularPool(t, pasos);
    assert.deepEqual(
      await cargarCategorias(simulacion.pool, UID_ADMINISTRADOR),
      { creadas: 1, existentes: 1 }
    );
    comprobarFinal(simulacion, pasos);
  });
}

for (const escenario of [
  { nombre: 'nombre existente con otro orden', filas: [{ nombre: BANCA.nombre, orden: 3 }] },
  { nombre: 'orden ocupado por otro nombre', filas: [{ nombre: 'Categoría distinta', orden: 1 }] },
  {
    nombre: 'nombre y orden repartidos entre dos registros',
    filas: [{ nombre: BANCA.nombre, orden: 3 }, { nombre: 'Categoría distinta', orden: 1 }]
  }
]) {
  test(`Categorías: revierte conflicto de ${escenario.nombre} sin sobrescribir`, async (t) => {
    const pasos = [
      ...inicio(),
      bloquearCategorias(),
      consultarCategoria(BANCA, escenario.filas),
      { sql: /^ROLLBACK$/ }
    ];
    const simulacion = simularPool(t, pasos);

    await assert.rejects(
      cargarCategorias(simulacion.pool, UID_ADMINISTRADOR),
      /Conflicto en la categoría "Banca móvil" o en el orden 1/
    );
    comprobarFinal(simulacion, pasos);
  });
}

test('Categorías: conflicto posterior solicita revertir una inserción previa', async (t) => {
  const pasos = [
    ...inicio(),
    bloquearCategorias(),
    consultarCategoria(BANCA),
    insertarCategoria(BANCA),
    consultarCategoria(PAGOS, [{ nombre: 'Nombre incompatible', orden: 2 }]),
    { sql: /^ROLLBACK$/ }
  ];
  const simulacion = simularPool(t, pasos);

  await assert.rejects(
    cargarCategorias(simulacion.pool, UID_ADMINISTRADOR),
    /Conflicto en la categoría "Pagos digitales" o en el orden 2/
  );
  comprobarFinal(simulacion, pasos);
});

test('Categorías: fallo de segunda inserción revierte y libera la conexión', async (t) => {
  const fallo = new Error('Fallo simulado de inserción');
  const pasos = [
    ...inicio(),
    bloquearCategorias(),
    consultarCategoria(BANCA),
    insertarCategoria(BANCA),
    consultarCategoria(PAGOS),
    insertarCategoria(PAGOS, fallo),
    { sql: /^ROLLBACK$/ }
  ];
  const simulacion = simularPool(t, pasos);

  await assert.rejects(
    cargarCategorias(simulacion.pool, UID_ADMINISTRADOR),
    (error) => error === fallo
  );
  comprobarFinal(simulacion, pasos);
});

test('Categorías: fallo de ROLLBACK descarta conexión y conserva el error original', async (t) => {
  const fallo = new Error('Fallo simulado de inserción');
  const pasos = [
    ...inicio(),
    bloquearCategorias(),
    consultarCategoria(BANCA),
    insertarCategoria(BANCA, fallo),
    { sql: /^ROLLBACK$/, error: new Error('Fallo simulado de reversión') }
  ];
  const simulacion = simularPool(t, pasos);

  await assert.rejects(
    cargarCategorias(simulacion.pool, UID_ADMINISTRADOR),
    (error) => error === fallo
  );
  comprobarFinal(simulacion, pasos, true);
});

test('Categorías: propaga fallo al obtener conexión', async (t) => {
  const fallo = new Error('Fallo simulado de conexión');
  const pool = { connect: t.mock.fn(async () => { throw fallo; }) };

  await assert.rejects(
    cargarCategorias(pool, UID_ADMINISTRADOR),
    (error) => error === fallo
  );
  assert.equal(pool.connect.mock.callCount(), 1);
});
