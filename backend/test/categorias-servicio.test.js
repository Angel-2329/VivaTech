const { test, after } = require('node:test');
const assert = require('node:assert/strict');

process.env.DATABASE_URL = 'postgresql://prueba:prueba@localhost:5432/prueba';
const pool = require('../src/config/database');
const {
  crearCategoria, renombrarCategoria, reordenarCategorias, eliminarCategoria
} = require('../src/services/categorias');
const { ErrorReglaCurso } = require('../src/services/reglas-cursos');

const ADMIN = { uid: 'uid-admin-prueba', rol: 'administrador', activo: true };
const FILAS = [
  { idCategoria: '1', nombre: 'Banca móvil', orden: 1 },
  { idCategoria: '2', nombre: 'Pagos digitales', orden: 2 },
  { idCategoria: '3', nombre: 'Comunicación', orden: 3 }
];

after(async () => { await pool.end(); });

function paso(sql, parametros, rows = [], error) {
  return { sql, parametros, rows, error };
}

function simular(t, operaciones = [], opciones = {}) {
  const cola = [...operaciones];
  const llamadas = [];
  const cliente = {
    async query(sql, parametros) {
      const texto = sql.trim();
      llamadas.push({ sql: texto, parametros });
      if (opciones.fallar?.test(texto)) throw opciones.error || new Error('Fallo SQL simulado');
      if (texto === 'ROLLBACK') {
        if (opciones.errorRollback) throw opciones.errorRollback;
        return { rows: [] };
      }
      if (['BEGIN', 'COMMIT', 'LOCK TABLE categorias IN SHARE ROW EXCLUSIVE MODE',
        'SET CONSTRAINTS uq_categorias_orden IMMEDIATE'].includes(texto)) return { rows: [] };
      if (/^SELECT uid, rol, activo FROM usuarios/.test(texto)) {
        assert.match(texto, /FOR SHARE$/);
        assert.deepEqual(parametros, [ADMIN.uid]);
        const perfil = Object.hasOwn(opciones, 'perfil') ? opciones.perfil : ADMIN;
        return { rows: perfil ? [perfil] : [] };
      }
      const esperado = cola.shift();
      assert.ok(esperado, `Consulta no prevista: ${texto}`);
      if (typeof esperado.sql === 'string') assert.equal(texto, esperado.sql);
      else assert.match(texto, esperado.sql);
      assert.deepEqual(parametros, esperado.parametros);
      if (esperado.error) throw esperado.error;
      return { rows: esperado.rows };
    },
    release: t.mock.fn()
  };
  const conectar = t.mock.method(pool, 'connect', async () => {
    if (opciones.errorConexion) throw opciones.errorConexion;
    return cliente;
  });
  t.mock.method(pool, 'query', async () => assert.fail('Debe usar la conexión transaccional'));
  return { cliente, conectar, llamadas, cola };
}

function cerrar(simulacion, final = 'COMMIT') {
  assert.equal(simulacion.llamadas[0].sql, 'BEGIN');
  assert.equal(simulacion.llamadas.at(-1).sql, final);
  assert.equal(simulacion.cliente.release.mock.callCount(), 1);
  assert.equal(simulacion.cola.length, 0);
  if (final === 'COMMIT') {
    assert.equal(simulacion.llamadas.at(-2).sql, 'SET CONSTRAINTS uq_categorias_orden IMMEDIATE');
  }
}

function errorEsperado(estado, codigo) {
  return (error) => error instanceof ErrorReglaCurso && error.estado === estado && error.codigo === codigo;
}

function seleccionar(id, fila = FILAS.find((categoria) => categoria.idCategoria === id)) {
  return paso(/SELECT .*FROM categorias WHERE id_categoria = \$1::bigint FOR UPDATE/s, [id], fila ? [fila] : []);
}

test('Categorías servicio: crear aplica trim, toma autoría verificada y agrega al final', async (t) => {
  const nuevo = { idCategoria: '4', nombre: 'Nueva categoría', orden: 4, creado_por: 'no-exponer' };
  const s = simular(t, [
    paso(/SELECT COALESCE\(max\(orden\), 0\)/, undefined, [{ ultimoOrden: 3 }]),
    paso(/^INSERT INTO categorias/, ['Nueva categoría', ADMIN.uid, 4], [nuevo])
  ]);
  assert.deepEqual(await crearCategoria(ADMIN, '  Nueva categoría  '), {
    idCategoria: '4', nombre: 'Nueva categoría', orden: 4
  });
  const indicePerfil = s.llamadas.findIndex(({ sql }) => /FROM usuarios/.test(sql));
  const indiceBloqueo = s.llamadas.findIndex(({ sql }) => /^LOCK TABLE/.test(sql));
  const indiceMaximo = s.llamadas.findIndex(({ sql }) => /max\(orden\)/.test(sql));
  assert.ok(indicePerfil < indiceBloqueo && indiceBloqueo < indiceMaximo);
  cerrar(s);
});

test('Categorías servicio: primera categoría usa orden 1 y bloqueo aunque no haya filas', async (t) => {
  const s = simular(t, [
    paso(/max\(orden\)/, undefined, [{ ultimoOrden: 0 }]),
    paso(/^INSERT INTO categorias/, ['Primera', ADMIN.uid, 1], [{ idCategoria: '1', nombre: 'Primera', orden: 1 }])
  ]);
  assert.equal((await crearCategoria(ADMIN, 'Primera')).orden, 1);
  assert.ok(s.llamadas.some(({ sql }) => sql === 'LOCK TABLE categorias IN SHARE ROW EXCLUSIVE MODE'));
  cerrar(s);
});

test('Categorías servicio: límite de 60 mide puntos Unicode, no unidades UTF-16', async (t) => {
  const nombre = '😀'.repeat(60);
  const s = simular(t, [
    paso(/max\(orden\)/, undefined, [{ ultimoOrden: 0 }]),
    paso(/^INSERT INTO categorias/, [nombre, ADMIN.uid, 1], [{ idCategoria: '1', nombre, orden: 1 }])
  ]);
  assert.equal((await crearCategoria(ADMIN, nombre)).nombre, nombre);
  cerrar(s);
});

test('Categorías servicio: nombre literal no se interpola ni normaliza por mayúsculas o acentos', async (t) => {
  const nombre = "ÁREA O'Connor; SELECT ejemplo";
  const s = simular(t, [
    paso(/max\(orden\)/, undefined, [{ ultimoOrden: 3 }]),
    paso(/^INSERT INTO categorias/, [nombre, ADMIN.uid, 4], [{ idCategoria: '4', nombre, orden: 4 }])
  ]);
  assert.equal((await crearCategoria(ADMIN, nombre)).nombre, nombre);
  const insercion = s.llamadas.find(({ sql }) => /^INSERT/.test(sql));
  assert.equal(insercion.sql.includes(nombre), false);
  cerrar(s);
});

test('Categorías servicio: renombrar mantiene ID y orden', async (t) => {
  const s = simular(t, [seleccionar('2'),
    paso(/^UPDATE categorias SET nombre/, ['Pagos seguros', '2'], [{ idCategoria: '2', nombre: 'Pagos seguros', orden: 2 }])]);
  assert.deepEqual(await renombrarCategoria(ADMIN, '2', ' Pagos seguros '), {
    idCategoria: '2', nombre: 'Pagos seguros', orden: 2
  });
  cerrar(s);
});

test('Categorías servicio: renombrar con el mismo nombre no escribe ni altera fechas', async (t) => {
  const s = simular(t, [seleccionar('2')]);
  assert.deepEqual(await renombrarCategoria(ADMIN, '2', ' Pagos digitales '), FILAS[1]);
  assert.equal(s.llamadas.some(({ sql }) => /^UPDATE/.test(sql)), false);
  cerrar(s);
});

for (const id of ['9007199254740993', '9223372036854775807']) {
  test(`Categorías servicio: BIGINT ${id} permanece como cadena`, async (t) => {
    const categoria = { idCategoria: id, nombre: 'Ejemplo', orden: 1 };
    const s = simular(t, [seleccionar(id, categoria)]);
    assert.equal((await renombrarCategoria(ADMIN, id, 'Ejemplo')).idCategoria, id);
    cerrar(s);
  });
}

test('Categorías servicio: reordenar exige lista completa y devuelve solo ID/posición', async (t) => {
  const ids = ['3', '1', '2'];
  const finales = ids.map((idCategoria, indice) => ({
    ...FILAS.find((fila) => fila.idCategoria === idCategoria), orden: indice + 1
  }));
  const s = simular(t, [
    paso(/FROM categorias ORDER BY orden, id_categoria FOR UPDATE$/, undefined, FILAS),
    paso(/^UPDATE categorias AS c/, [ids]),
    paso(/FROM categorias ORDER BY orden, id_categoria$/, undefined, finales)
  ]);
  assert.deepEqual(await reordenarCategorias(ADMIN, ids), [
    { idCategoria: '3', orden: 1 }, { idCategoria: '1', orden: 2 }, { idCategoria: '2', orden: 3 }
  ]);
  const actualizacion = s.llamadas.find(({ sql }) => /^UPDATE/.test(sql));
  assert.match(actualizacion.sql, /unnest\(\$1::bigint\[\]\) WITH ORDINALITY/);
  assert.match(actualizacion.sql, /c\.orden <> nueva\.posicion::integer/);
  cerrar(s);
});

test('Categorías servicio: lista vacía válida solo si no existen categorías', async (t) => {
  const s = simular(t, [
    paso(/FROM categorias ORDER BY orden, id_categoria FOR UPDATE$/, undefined, []),
    paso(/^UPDATE categorias AS c/, [[]]),
    paso(/FROM categorias ORDER BY orden, id_categoria$/, undefined, [])
  ]);
  assert.deepEqual(await reordenarCategorias(ADMIN, []), []);
  cerrar(s);
});

for (const ids of [[], ['1', '2'], ['1', '2', '9']]) {
  test(`Categorías servicio: omisiones o ajenos ${JSON.stringify(ids)} revierten sin UPDATE`, async (t) => {
    const s = simular(t, [paso(/FROM categorias ORDER BY orden, id_categoria FOR UPDATE$/, undefined, FILAS)]);
    await assert.rejects(reordenarCategorias(ADMIN, ids), errorEsperado(400, 'orden_invalido'));
    assert.equal(s.llamadas.some(({ sql }) => /^UPDATE/.test(sql)), false);
    cerrar(s, 'ROLLBACK');
  });
}

test('Categorías servicio: eliminar posición intermedia elimina una fila y recorre posteriores', async (t) => {
  const s = simular(t, [
    seleccionar('2'), paso(/SELECT EXISTS .*FROM cursos/, ['2'], [{ tieneCursos: false }]),
    paso(/^DELETE FROM categorias/, ['2'], [{ idCategoria: '2' }]),
    paso('UPDATE categorias SET orden = orden - 1 WHERE orden > $1', [2])
  ]);
  assert.equal(await eliminarCategoria(ADMIN, '2'), undefined);
  const fila = s.llamadas.findIndex(({ sql }) => /FROM categorias WHERE.*FOR UPDATE/.test(sql));
  const cursos = s.llamadas.findIndex(({ sql }) => /FROM cursos/.test(sql));
  const borrado = s.llamadas.findIndex(({ sql }) => /^DELETE/.test(sql));
  assert.ok(fila < cursos && cursos < borrado);
  cerrar(s);
});

for (const estado of ['borrador', 'publicado', 'retirado']) {
  test(`Categorías servicio: rechaza categoría con curso ${estado} sin filtrar estado`, async (t) => {
    const s = simular(t, [seleccionar('2'), paso(/SELECT EXISTS .*FROM cursos/, ['2'], [{ tieneCursos: true }])]);
    await assert.rejects(eliminarCategoria(ADMIN, '2'), errorEsperado(409, 'categoria_con_cursos'));
    const consulta = s.llamadas.find(({ sql }) => /FROM cursos/.test(sql));
    assert.doesNotMatch(consulta.sql, /estado_publicacion/);
    assert.equal(s.llamadas.some(({ sql }) => /^(DELETE|UPDATE)/.test(sql)), false);
    cerrar(s, 'ROLLBACK');
  });
}

for (const operacion of ['renombrar', 'eliminar']) {
  test(`Categorías servicio: ${operacion} inexistente devuelve 404 y rollback`, async (t) => {
    const s = simular(t, [seleccionar('9', null)]);
    const promesa = operacion === 'renombrar'
      ? renombrarCategoria(ADMIN, '9', 'Ejemplo') : eliminarCategoria(ADMIN, '9');
    await assert.rejects(promesa, errorEsperado(404, 'categoria_no_encontrada'));
    cerrar(s, 'ROLLBACK');
  });
}

for (const valor of [undefined, null, 10, true, [], {}, '', '   ', 'a'.repeat(61), '😀'.repeat(61)]) {
  test(`Categorías servicio: nombre inválido ${JSON.stringify(valor)} no conecta`, async (t) => {
    const conectar = t.mock.method(pool, 'connect', async () => assert.fail('No debe conectar'));
    const verificar = (error) => errorEsperado(400, 'contenido_invalido')(error)
      && error.errores.length === 1 && error.errores[0].ruta === 'categoria.nombre';
    await assert.rejects(crearCategoria(ADMIN, valor), verificar);
    await assert.rejects(renombrarCategoria(ADMIN, '1', valor), verificar);
    assert.equal(conectar.mock.callCount(), 0);
  });
}

for (const id of ['0', '-1', '01', '1.5', '1e2', ' 1', '1 ', '', 'abc', '9223372036854775808', 1, null]) {
  test(`Categorías servicio: ID inválido ${JSON.stringify(id)} no conecta`, async (t) => {
    const conectar = t.mock.method(pool, 'connect', async () => assert.fail('No debe conectar'));
    await assert.rejects(renombrarCategoria(ADMIN, id, 'Ejemplo'), errorEsperado(400, 'id_categoria_invalido'));
    await assert.rejects(eliminarCategoria(ADMIN, id), errorEsperado(400, 'id_categoria_invalido'));
    assert.equal(conectar.mock.callCount(), 0);
  });
}

for (const ids of [undefined, null, {}, '1,2', [1], ['0'], ['01'], ['9223372036854775808'], ['1', '1'], ['1', null]]) {
  test(`Categorías servicio: formato de reordenado inválido ${JSON.stringify(ids)} no conecta`, async (t) => {
    const conectar = t.mock.method(pool, 'connect', async () => assert.fail('No debe conectar'));
    await assert.rejects(reordenarCategorias(ADMIN, ids), errorEsperado(400, 'orden_invalido'));
    assert.equal(conectar.mock.callCount(), 0);
  });
}

for (const [usuario, estado, codigo] of [
  [null, 404, 'perfil_no_registrado'], [{ ...ADMIN, activo: false }, 403, 'cuenta_desactivada'],
  [{ ...ADMIN, rol: 'maestro' }, 403, 'rol_no_autorizado'],
  [{ ...ADMIN, rol: 'estudiante' }, 403, 'rol_no_autorizado'],
  [{ ...ADMIN, uid: '' }, 403, 'rol_no_autorizado'],
  [{ ...ADMIN, uid: 'x'.repeat(129) }, 403, 'rol_no_autorizado']
]) {
  test(`Categorías servicio: solicitante inválido ${codigo} no conecta ninguna escritura`, async (t) => {
    const conectar = t.mock.method(pool, 'connect', async () => assert.fail('No debe conectar'));
    for (const accion of [() => crearCategoria(usuario, 'Ejemplo'), () => renombrarCategoria(usuario, '1', 'Ejemplo'),
      () => reordenarCategorias(usuario, ['1']), () => eliminarCategoria(usuario, '1')]) {
      await assert.rejects(accion(), errorEsperado(estado, codigo));
    }
    assert.equal(conectar.mock.callCount(), 0);
  });
}

for (const [perfil, estado, codigo] of [
  [null, 404, 'perfil_no_registrado'], [{ ...ADMIN, activo: false }, 403, 'cuenta_desactivada'],
  [{ ...ADMIN, rol: 'maestro' }, 403, 'rol_no_autorizado']
]) {
  test(`Categorías servicio: vuelve a comprobar perfil en la transacción ${codigo}`, async (t) => {
    const s = simular(t, [], { perfil });
    await assert.rejects(crearCategoria(ADMIN, 'Ejemplo'), errorEsperado(estado, codigo));
    assert.equal(s.llamadas.some(({ sql }) => /^LOCK TABLE/.test(sql)), false);
    cerrar(s, 'ROLLBACK');
  });
}

test('Categorías servicio: perfil consultado con UID diferente es inconsistente', async (t) => {
  const s = simular(t, [], { perfil: { ...ADMIN, uid: 'otro-admin' } });
  await assert.rejects(crearCategoria(ADMIN, 'Ejemplo'), TypeError);
  cerrar(s, 'ROLLBACK');
});

for (const operacion of ['crear', 'renombrar']) {
  test(`Categorías servicio: ${operacion} duplicado traduce solo la restricción de nombre`, async (t) => {
    const error = Object.assign(new Error('Detalle SQL privado'), { code: '23505', constraint: 'uq_categorias_nombre' });
    const operaciones = operacion === 'crear'
      ? [paso(/max\(orden\)/, undefined, [{ ultimoOrden: 3 }]), paso(/^INSERT INTO categorias/, ['Ejemplo', ADMIN.uid, 4], [], error)]
      : [seleccionar('2'), paso(/^UPDATE categorias SET nombre/, ['Ejemplo', '2'], [], error)];
    const s = simular(t, operaciones);
    await assert.rejects(operacion === 'crear' ? crearCategoria(ADMIN, 'Ejemplo') : renombrarCategoria(ADMIN, '2', 'Ejemplo'),
      errorEsperado(409, 'categoria_duplicada'));
    cerrar(s, 'ROLLBACK');
  });
}

for (const code of ['23503', '23001']) {
  test(`Categorías servicio: protección RESTRICT ${code} se traduce sin CASCADE`, async (t) => {
    const error = Object.assign(new Error('Referencia protegida'), { code, constraint: 'fk_cursos_categoria' });
    const s = simular(t, [seleccionar('2'), paso(/SELECT EXISTS .*FROM cursos/, ['2'], [{ tieneCursos: false }]),
      paso(/^DELETE FROM categorias/, ['2'], [], error)]);
    await assert.rejects(eliminarCategoria(ADMIN, '2'), errorEsperado(409, 'categoria_con_cursos'));
    assert.ok(s.llamadas.every(({ sql }) => !/CASCADE/.test(sql)));
    cerrar(s, 'ROLLBACK');
  });
}

for (const fallar of [/^BEGIN$/, /FROM usuarios/, /^LOCK TABLE/, /^SET CONSTRAINTS/, /^COMMIT$/]) {
  test(`Categorías servicio: fallo ${fallar} libera conexión y revierte cuando corresponde`, async (t) => {
    const error = new Error('Fallo simulado');
    const operaciones = fallar.test('SET CONSTRAINTS') || fallar.test('COMMIT')
      ? [seleccionar('2')] : [];
    const s = simular(t, operaciones, { fallar, error });
    await assert.rejects(renombrarCategoria(ADMIN, '2', 'Pagos digitales'), (recibido) => recibido === error);
    assert.equal(s.cliente.release.mock.callCount(), 1);
    assert.equal(s.llamadas.some(({ sql }) => sql === 'ROLLBACK'), !fallar.test('BEGIN'));
  });
}

test('Categorías servicio: fallo del pool se propaga sin consultas globales', async (t) => {
  const error = new Error('Sin conexión');
  simular(t, [], { errorConexion: error });
  await assert.rejects(crearCategoria(ADMIN, 'Ejemplo'), (recibido) => recibido === error);
});

test('Categorías servicio: rollback fallido descarta conexión y conserva error original', async (t) => {
  const error = new Error('Fallo original');
  const rollback = new Error('Fallo rollback');
  const s = simular(t, [paso(/max\(orden\)/, undefined, [], error)], { errorRollback: rollback });
  t.mock.method(console, 'error', () => {});
  await assert.rejects(crearCategoria(ADMIN, 'Ejemplo'), (recibido) => recibido === error);
  assert.deepEqual(s.cliente.release.mock.calls[0].arguments, [rollback]);
});

test('Categorías servicio: error de otra restricción no se disfraza de nombre duplicado', async (t) => {
  const error = Object.assign(new Error('Otro error'), { code: '23505', constraint: 'otra_restriccion' });
  const s = simular(t, [paso(/max\(orden\)/, undefined, [], error)]);
  await assert.rejects(crearCategoria(ADMIN, 'Ejemplo'), (recibido) => recibido === error);
  cerrar(s, 'ROLLBACK');
});

for (const ultimoOrden of [null, -1, 2147483647]) {
  test(`Categorías servicio: orden máximo inconsistente ${ultimoOrden} no inserta`, async (t) => {
    const s = simular(t, [paso(/max\(orden\)/, undefined, [{ ultimoOrden }])]);
    await assert.rejects(crearCategoria(ADMIN, 'Ejemplo'), TypeError);
    assert.equal(s.llamadas.some(({ sql }) => /^INSERT/.test(sql)), false);
    cerrar(s, 'ROLLBACK');
  });
}

test('Categorías servicio: creación sin fila de retorno no se presenta como éxito', async (t) => {
  const s = simular(t, [paso(/max\(orden\)/, undefined, [{ ultimoOrden: 3 }]),
    paso(/^INSERT INTO categorias/, ['Ejemplo', ADMIN.uid, 4], [])]);
  await assert.rejects(crearCategoria(ADMIN, 'Ejemplo'), TypeError);
  cerrar(s, 'ROLLBACK');
});
