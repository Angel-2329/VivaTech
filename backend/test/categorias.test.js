const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

process.env.DATABASE_URL = 'postgresql://prueba:prueba@localhost:5432/prueba';
process.env.FIREBASE_PROJECT_ID = 'demo-viva-tech-categorias';
const pool = require('../src/config/database');
const firebaseAuth = require('../src/config/firebase');
const app = require('../src/app');

const UID = 'uid-admin-prueba';
const INICIALES = [
  { idCategoria: '1', nombre: 'Banca móvil', orden: 1 },
  { idCategoria: '2', nombre: 'Pagos digitales', orden: 2 },
  { idCategoria: '3', nombre: 'Comunicación', orden: 3 }
];
const OPERACIONES = [
  { metodo: 'POST', ruta: '', cuerpo: { nombre: 'Nueva categoría' } },
  { metodo: 'PATCH', ruta: '/2', cuerpo: { nombre: 'Pagos seguros' } },
  { metodo: 'PUT', ruta: '/orden', cuerpo: { idsCategorias: ['3', '1', '2'] } },
  { metodo: 'DELETE', ruta: '/2' }
];
let servidor;
let url;

before(async () => {
  await new Promise((resolve, reject) => {
    servidor = app.listen(0, '127.0.0.1', resolve);
    servidor.once('error', reject);
  });
  url = `http://127.0.0.1:${servidor.address().port}/api/categorias`;
});

after(async () => {
  if (servidor) {
    servidor.closeAllConnections();
    await new Promise((resolve, reject) => servidor.close((error) => error ? reject(error) : resolve()));
  }
  await pool.end();
});

function simular(t, opciones = {}) {
  let categorias = (opciones.filas || INICIALES).map((fila) => ({ ...fila }));
  const llamadas = [];
  const verificar = t.mock.method(firebaseAuth, 'verifyIdToken', async () => {
    if (opciones.errorToken) throw opciones.errorToken;
    return { uid: UID };
  });
  const perfil = t.mock.method(pool, 'query', async (sql, parametros) => {
    assert.match(sql, /FROM usuarios/);
    assert.deepEqual(parametros, [UID]);
    if (opciones.errorPerfil) throw opciones.errorPerfil;
    const rows = opciones.sinPerfil ? [] : [{
      uid: UID, nombre_completo: 'Administrador ficticio', nombre_apodo: null,
      rol: opciones.rol || 'administrador', activo: opciones.activo !== false
    }];
    return { rowCount: rows.length, rows };
  });
  const cliente = {
    async query(sql, parametros) {
      const texto = sql.trim();
      llamadas.push({ sql: texto, parametros });
      if (opciones.fallar?.test(texto)) throw opciones.error || new Error('Fallo SQL simulado');
      if (['BEGIN', 'COMMIT', 'ROLLBACK', 'LOCK TABLE categorias IN SHARE ROW EXCLUSIVE MODE',
        'SET CONSTRAINTS uq_categorias_orden IMMEDIATE'].includes(texto)) return { rows: [] };
      if (/^SELECT uid, rol, activo FROM usuarios/.test(texto)) {
        assert.deepEqual(parametros, [UID]);
        const fila = Object.hasOwn(opciones, 'perfilTx')
          ? opciones.perfilTx : { uid: UID, rol: 'administrador', activo: true };
        return { rows: fila ? [fila] : [] };
      }
      if (/max\(orden\)/.test(texto)) return { rows: [{ ultimoOrden: Math.max(0, ...categorias.map((c) => c.orden)) }] };
      if (/^INSERT INTO categorias/.test(texto)) {
        assert.equal(parametros[1], UID);
        const nueva = { idCategoria: opciones.idNuevo || '4', nombre: parametros[0], orden: parametros[2] };
        categorias.push(nueva);
        return { rows: [nueva] };
      }
      if (/^UPDATE categorias SET nombre/.test(texto)) {
        const categoria = categorias.find((c) => c.idCategoria === parametros[1]);
        if (!categoria) return { rows: [] };
        categoria.nombre = parametros[0];
        return { rows: [categoria] };
      }
      if (/^UPDATE categorias AS c/.test(texto)) {
        assert.match(texto, /unnest\(\$1::bigint\[\]\)/);
        categorias.forEach((c) => { c.orden = parametros[0].indexOf(c.idCategoria) + 1; });
        return { rows: [] };
      }
      if (/^UPDATE categorias SET orden = orden - 1/.test(texto)) {
        categorias.forEach((c) => { if (c.orden > parametros[0]) c.orden -= 1; });
        return { rows: [] };
      }
      if (/^DELETE FROM categorias/.test(texto)) {
        const eliminadas = categorias.filter((c) => c.idCategoria === parametros[0]);
        categorias = categorias.filter((c) => c.idCategoria !== parametros[0]);
        return { rows: eliminadas.map(({ idCategoria }) => ({ idCategoria })) };
      }
      if (/^SELECT EXISTS .*FROM cursos/.test(texto)) return { rows: [{ tieneCursos: opciones.tieneCursos === true }] };
      if (/^SELECT .*FROM categorias WHERE id_categoria/s.test(texto)) {
        return { rows: categorias.filter((c) => c.idCategoria === parametros[0]) };
      }
      if (/^SELECT .*FROM categorias ORDER BY/s.test(texto)) {
        return { rows: [...categorias].sort((a, b) => a.orden - b.orden) };
      }
      assert.fail(`Consulta no prevista: ${texto}`);
    },
    release: t.mock.fn()
  };
  const conectar = t.mock.method(pool, 'connect', async () => {
    if (opciones.errorConexion) throw opciones.errorConexion;
    return cliente;
  });
  return { llamadas, verificar, perfil, conectar, cliente, categorias: () => categorias };
}

function solicitar({ metodo = 'POST', ruta = '', cuerpo, crudo, token = 'Bearer token-prueba' } = {}) {
  return fetch(`${url}${ruta}`, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...(token === null ? {} : { Authorization: token }) },
    body: crudo !== undefined ? crudo : cuerpo === undefined ? undefined : JSON.stringify(cuerpo)
  });
}

async function comprobarError(respuesta, estado, codigo) {
  assert.equal(respuesta.status, estado);
  assert.equal(respuesta.headers.get('cache-control'), 'no-store');
  const cuerpo = await respuesta.json();
  assert.equal(cuerpo.ok, false);
  if (codigo) assert.equal(cuerpo.codigo, codigo);
  return cuerpo;
}

test('POST categorías: 201 con recurso directo, trim y autoría del servidor', async (t) => {
  const s = simular(t);
  const respuesta = await solicitar({ cuerpo: { nombre: '  Nueva categoría  ' } });
  assert.equal(respuesta.status, 201);
  assert.equal(respuesta.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await respuesta.json(), { idCategoria: '4', nombre: 'Nueva categoría', orden: 4 });
  assert.equal(s.llamadas.at(-1).sql, 'COMMIT');
  assert.equal(s.cliente.release.mock.callCount(), 1);
});

test('PATCH categorías: 200 con categoría renombrada y orden conservado', async (t) => {
  const s = simular(t);
  const respuesta = await solicitar(OPERACIONES[1]);
  assert.equal(respuesta.status, 200);
  assert.equal(respuesta.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await respuesta.json(), { idCategoria: '2', nombre: 'Pagos seguros', orden: 2 });
  assert.equal(s.llamadas.at(-1).sql, 'COMMIT');
});

test('PUT categorías/orden: 200 con lista reducida en el orden resultante', async (t) => {
  const s = simular(t);
  const respuesta = await solicitar(OPERACIONES[2]);
  assert.equal(respuesta.status, 200);
  assert.equal(respuesta.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await respuesta.json(), [
    { idCategoria: '3', orden: 1 }, { idCategoria: '1', orden: 2 }, { idCategoria: '2', orden: 3 }
  ]);
  assert.equal(s.llamadas.at(-1).sql, 'COMMIT');
});

test('DELETE categorías: 204 vacío y desplazamiento de posiciones posteriores', async (t) => {
  const s = simular(t);
  const respuesta = await solicitar(OPERACIONES[3]);
  assert.equal(respuesta.status, 204);
  assert.equal(respuesta.headers.get('cache-control'), 'no-store');
  assert.equal(await respuesta.text(), '');
  assert.deepEqual(s.categorias(), [INICIALES[0], { ...INICIALES[2], orden: 2 }]);
  assert.equal(s.llamadas.at(-1).sql, 'COMMIT');
});

for (const operacion of OPERACIONES) {
  for (const token of [null, 'Basic prueba', 'Bearer uno,dos']) {
    test(`${operacion.metodo} categorías: autenticación mal formada ${token}`, async (t) => {
      const s = simular(t);
      await comprobarError(await solicitar({ ...operacion, token }), 401);
      assert.equal(s.verificar.mock.callCount(), 0);
      assert.equal(s.perfil.mock.callCount(), 0);
      assert.equal(s.conectar.mock.callCount(), 0);
    });
  }
  for (const code of ['auth/invalid-id-token', 'auth/id-token-expired']) {
    test(`${operacion.metodo} categorías: Firebase rechaza ${code}`, async (t) => {
      const s = simular(t, { errorToken: Object.assign(new Error('Token ficticio'), { code }) });
      await comprobarError(await solicitar(operacion), 401);
      assert.equal(s.perfil.mock.callCount(), 0);
      assert.equal(s.conectar.mock.callCount(), 0);
    });
  }
  for (const [opciones, estado, codigo] of [
    [{ sinPerfil: true }, 404, 'perfil_no_registrado'],
    [{ activo: false }, 403, 'cuenta_desactivada'],
    [{ rol: 'maestro' }, 403, 'rol_no_autorizado'],
    [{ rol: 'estudiante' }, 403, 'rol_no_autorizado']
  ]) {
    test(`${operacion.metodo} categorías: perfil o rol ${JSON.stringify(opciones)}`, async (t) => {
      const s = simular(t, opciones);
      await comprobarError(await solicitar(operacion), estado, codigo);
      assert.equal(s.conectar.mock.callCount(), 0);
    });
  }
  test(`${operacion.metodo} categorías: reconfirma estado del administrador en la transacción`, async (t) => {
    const s = simular(t, { perfilTx: { uid: UID, rol: 'administrador', activo: false } });
    await comprobarError(await solicitar(operacion), 403, 'cuenta_desactivada');
    assert.equal(s.llamadas.at(-1).sql, 'ROLLBACK');
    assert.equal(s.llamadas.some(({ sql }) => /^LOCK TABLE/.test(sql)), false);
    assert.equal(s.cliente.release.mock.callCount(), 1);
  });
  test(`${operacion.metodo} categorías: fallo de operación devuelve 503 sin datos internos`, async (t) => {
    const privado = 'SELECT informacion privada de PostgreSQL';
    const s = simular(t, { fallar: /^LOCK TABLE/, error: new Error(privado) });
    const registro = t.mock.method(console, 'error', () => {});
    const cuerpo = await comprobarError(await solicitar(operacion), 503, 'operacion_categorias_no_disponible');
    assert.equal(JSON.stringify(cuerpo).includes(privado), false);
    assert.equal(JSON.stringify(registro.mock.calls).includes(privado), false);
    assert.equal(s.llamadas.at(-1).sql, 'ROLLBACK');
    assert.equal(s.cliente.release.mock.callCount(), 1);
  });
}

for (const operacion of OPERACIONES.filter((op) => op.metodo !== 'DELETE')) {
  for (const crudo of ['null', '"texto"', '{"nombre":']) {
    test(`${operacion.metodo} categorías: parser rechaza ${crudo} con no-store`, async (t) => {
      const s = simular(t);
      await comprobarError(await solicitar({ ...operacion, crudo }), 400, 'json_invalido');
      assert.equal(s.verificar.mock.callCount(), 0);
      assert.equal(s.perfil.mock.callCount(), 0);
      assert.equal(s.conectar.mock.callCount(), 0);
    });
  }
  test(`${operacion.metodo} categorías: arreglo como cuerpo devuelve cuerpo_invalido`, async (t) => {
    const s = simular(t);
    await comprobarError(await solicitar({ ...operacion, cuerpo: [] }), 400, 'cuerpo_invalido');
    assert.equal(s.conectar.mock.callCount(), 0);
  });
}

for (const metodo of ['POST', 'PATCH']) {
  for (const nombre of [undefined, null, 10, '', '   ', 'a'.repeat(61), '😀'.repeat(61)]) {
    test(`${metodo} categorías: nombre inválido ${JSON.stringify(nombre)} devuelve desglose seguro`, async (t) => {
      const s = simular(t);
      const cuerpo = await comprobarError(await solicitar({
        metodo, ruta: metodo === 'PATCH' ? '/2' : '', cuerpo: { nombre }
      }), 400, 'contenido_invalido');
      assert.equal(cuerpo.errores.length, 1);
      assert.equal(cuerpo.errores[0].ruta, 'categoria.nombre');
      assert.deepEqual(Object.keys(cuerpo.errores[0]).sort(), ['codigo', 'mensaje', 'ruta']);
      assert.equal(Object.hasOwn(cuerpo.errores[0], 'valor'), false);
      assert.equal(s.conectar.mock.callCount(), 0);
    });
  }
  test(`${metodo} categorías: nombre duplicado devuelve 409 categoria_duplicada`, async (t) => {
    const error = Object.assign(new Error('Detalle SQL privado'), { code: '23505', constraint: 'uq_categorias_nombre' });
    const s = simular(t, { fallar: metodo === 'POST' ? /^INSERT INTO categorias/ : /^UPDATE categorias SET nombre/, error });
    await comprobarError(await solicitar({ metodo, ruta: metodo === 'PATCH' ? '/2' : '', cuerpo: { nombre: 'Duplicado' } }),
      409, 'categoria_duplicada');
    assert.equal(s.llamadas.at(-1).sql, 'ROLLBACK');
  });
}

for (const campo of ['uid', 'creado_por', 'rol', 'orden', 'descripcion', 'icono']) {
  test(`POST categorías: rechaza campo no autorizado ${campo}`, async (t) => {
    const s = simular(t);
    await comprobarError(await solicitar({ cuerpo: { nombre: 'Ejemplo', [campo]: 'valor-ficticio' } }), 400, 'campos_invalidos');
    assert.equal(s.conectar.mock.callCount(), 0);
  });
}

test('PATCH categorías: no permite cambiar orden mediante el recurso individual', async (t) => {
  const s = simular(t);
  await comprobarError(await solicitar({ metodo: 'PATCH', ruta: '/2', cuerpo: { orden: 1 } }), 400, 'campos_invalidos');
  assert.equal(s.conectar.mock.callCount(), 0);
});

for (const metodo of ['PATCH', 'DELETE']) {
  for (const id of ['0', '01', '-1', 'abc', '9223372036854775808']) {
    test(`${metodo} categorías: ID inválido ${id} no conecta`, async (t) => {
      const s = simular(t);
      await comprobarError(await solicitar({ metodo, ruta: `/${id}`, cuerpo: metodo === 'PATCH' ? { nombre: 'Ejemplo' } : undefined }),
        400, 'id_categoria_invalido');
      assert.equal(s.conectar.mock.callCount(), 0);
    });
  }
  test(`${metodo} categorías: BIGINT válido inexistente devuelve 404`, async (t) => {
    const s = simular(t);
    await comprobarError(await solicitar({ metodo, ruta: '/9223372036854775807', cuerpo: metodo === 'PATCH' ? { nombre: 'Ejemplo' } : undefined }),
      404, 'categoria_no_encontrada');
    assert.equal(s.llamadas.at(-1).sql, 'ROLLBACK');
  });
}

for (const idsCategorias of [undefined, null, '1,2,3', [1, 2, 3], ['1', '1', '2'], ['1', '2'], ['1', '2', '9'], []]) {
  test(`PUT categorías/orden: rechaza lista incompleta o inválida ${JSON.stringify(idsCategorias)}`, async (t) => {
    const s = simular(t);
    await comprobarError(await solicitar({ metodo: 'PUT', ruta: '/orden', cuerpo: { idsCategorias } }), 400, 'orden_invalido');
    assert.equal(s.llamadas.some(({ sql }) => /^UPDATE/.test(sql)), false);
  });
}

test('PUT categorías/orden: rechaza identidad adicional en el cuerpo', async (t) => {
  const s = simular(t);
  await comprobarError(await solicitar({ metodo: 'PUT', ruta: '/orden', cuerpo: { idsCategorias: ['1', '2', '3'], uid: 'otro-admin' } }),
    400, 'campos_invalidos');
  assert.equal(s.conectar.mock.callCount(), 0);
});

test('PUT categorías/orden: [] es válido si no existen categorías', async (t) => {
  simular(t, { filas: [] });
  const respuesta = await solicitar({ metodo: 'PUT', ruta: '/orden', cuerpo: { idsCategorias: [] } });
  assert.equal(respuesta.status, 200);
  assert.equal(respuesta.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await respuesta.json(), []);
});

test('DELETE categorías: con cursos responde 409, sin borrar ni recorrer posiciones', async (t) => {
  const s = simular(t, { tieneCursos: true });
  await comprobarError(await solicitar(OPERACIONES[3]), 409, 'categoria_con_cursos');
  assert.equal(s.llamadas.some(({ sql }) => /^(DELETE|UPDATE)/.test(sql)), false);
  assert.equal(s.llamadas.at(-1).sql, 'ROLLBACK');
});

for (const code of ['23503', '23001']) {
  test(`DELETE categorías: integridad ${code} protege cursos con 409`, async (t) => {
    const error = Object.assign(new Error('Referencia privada'), { code, constraint: 'fk_cursos_categoria' });
    const s = simular(t, { fallar: /^DELETE FROM categorias/, error });
    await comprobarError(await solicitar(OPERACIONES[3]), 409, 'categoria_con_cursos');
    assert.equal(s.llamadas.at(-1).sql, 'ROLLBACK');
  });
}

test('POST categorías: parámetros Query no sustituyen autoría del token', async (t) => {
  const s = simular(t);
  const respuesta = await solicitar({ ruta: '?uid=otro-admin&creado_por=otro-admin', cuerpo: { nombre: 'Ejemplo' } });
  assert.equal(respuesta.status, 201);
  const insercion = s.llamadas.find(({ sql }) => /^INSERT/.test(sql));
  assert.equal(insercion.parametros[1], UID);
  assert.deepEqual(await respuesta.json(), { idCategoria: '4', nombre: 'Ejemplo', orden: 4 });
});

for (const opciones of [
  { errorConexion: new Error('Conexión simulada no disponible') },
  { errorPerfil: new Error('Perfil simulado no disponible') },
  { errorToken: Object.assign(new Error('Firebase simulado no disponible'), { code: 'app/network-error' }) }
]) {
  test(`POST categorías: indisponibilidad ${Object.keys(opciones)[0]} conserva 503`, async (t) => {
    simular(t, opciones);
    t.mock.method(console, 'error', () => {});
    const cuerpo = await comprobarError(await solicitar(OPERACIONES[0]), 503);
    if (opciones.errorConexion) assert.equal(cuerpo.codigo, 'operacion_categorias_no_disponible');
  });
}
