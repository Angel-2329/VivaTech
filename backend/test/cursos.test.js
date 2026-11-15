const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

process.env.DATABASE_URL = 'postgresql://prueba:prueba@localhost:5432/prueba';
process.env.FIREBASE_PROJECT_ID = 'demo-viva-tech-cursos';
const pool = require('../src/config/database');
const firebaseAuth = require('../src/config/firebase');
const app = require('../src/app');

const UID = 'uid-editor-prueba';
const DATOS = { idCategoria: '1', titulo: 'Curso nuevo', descripcion: 'Ejemplos ficticios.' };
const OPERACIONES = [
  { metodo: 'POST', ruta: '', cuerpo: DATOS },
  { metodo: 'PATCH', ruta: '/10', cuerpo: { titulo: 'Corregido' } },
  { metodo: 'PATCH', ruta: '/10', cuerpo: { estadoPublicacion: 'publicado' } },
  { metodo: 'PATCH', ruta: '/10', cuerpo: { estadoPublicacion: 'borrador' } }
];
const LECCIONES = [{
  idLeccion: '21', titulo: 'Lección ficticia', objetivo: 'Practicar.', orden: 1, duracionEstimadaMinutos: 3,
  pasos: [1, 2, 3].map((orden) => ({
    idPaso: String(100 + orden), orden, instruccion: 'Usa datos ficticios.', recursos: [],
    actividad: orden === 2 ? {
      tipo: 'opcion', pregunta: '¿Qué datos usar?',
      opciones: [{ id: 'a', texto: 'Ficticios' }, { id: 'b', texto: 'Reales' }],
      correcta: 'a', pista: 'Usa ejemplos.', mensajeAcierto: '¡Bien!'
    } : { tipo: 'lectura' }
  }))
}];
let servidor;
let url;

before(async () => {
  await new Promise((resolve, reject) => {
    servidor = app.listen(0, '127.0.0.1', resolve);
    servidor.once('error', reject);
  });
  url = `http://127.0.0.1:${servidor.address().port}/api/cursos`;
});

after(async () => {
  if (servidor) {
    servidor.closeAllConnections();
    await new Promise((resolve, reject) => servidor.close((error) => error ? reject(error) : resolve()));
  }
  await pool.end();
});

function simular(t, opciones = {}) {
  const llamadas = [];
  let nuevo = false;
  let curso = {
    idCurso: opciones.id || '10', idCategoria: '1', titulo: 'Curso original', descripcion: 'Descripción original.',
    orden: 2, estado_publicacion: 'borrador', creado_por: UID, fecha_cierre: null,
    ...opciones.curso
  };
  const lecciones = structuredClone(opciones.lecciones || []);
  let estadosLecciones = lecciones.map(() => curso.estado_publicacion);
  const verificar = t.mock.method(firebaseAuth, 'verifyIdToken', async () => {
    if (opciones.errorToken) throw opciones.errorToken;
    return { uid: UID };
  });
  const perfil = t.mock.method(pool, 'query', async (sql, parametros) => {
    assert.match(sql, /FROM usuarios/);
    assert.deepEqual(parametros, [UID]);
    if (opciones.errorPerfil) throw opciones.errorPerfil;
    const rows = opciones.sinPerfil ? [] : [{
      uid: UID, nombre_completo: 'Editor ficticio', nombre_apodo: null,
      rol: opciones.rol || 'maestro', activo: opciones.activo !== false
    }];
    return { rowCount: rows.length, rows };
  });
  const cliente = {
    async query(sql, parametros) {
      const texto = sql.trim();
      llamadas.push({ sql: texto, parametros });
      if (opciones.fallar?.test(texto)) throw opciones.error || new Error('Fallo SQL simulado');
      if (['BEGIN', 'COMMIT', 'ROLLBACK', 'SET CONSTRAINTS uq_cursos_categoria_orden IMMEDIATE'].includes(texto)) return { rows: [] };
      if (/^SELECT uid, rol, activo FROM usuarios/.test(texto)) {
        assert.deepEqual(parametros, [UID]);
        const fila = Object.hasOwn(opciones, 'perfilTx')
          ? opciones.perfilTx : { uid: UID, rol: opciones.rol || 'maestro', activo: true };
        return { rows: fila ? [fila] : [] };
      }
      if (/FROM categorias[\s\S]*FOR UPDATE/.test(texto)) return { rows: opciones.sinCategoria ? [] : [{ idCategoria: parametros[0] }] };
      if (/max\(orden\)/.test(texto)) return { rows: [{ ultimoOrden: parametros[0] === '2' ? 5 : 2 }] };
      if (/FROM cursos WHERE id_curso[\s\S]*FOR UPDATE/.test(texto)) {
        assert.deepEqual(parametros, [opciones.id || '10']);
        return { rows: opciones.sinCurso ? [] : [{ ...curso }] };
      }
      if (/^SELECT nombre FROM categorias/.test(texto)) {
        return { rows: opciones.sinCategoria ? [] : [{ nombre: 'Categoría de prueba' }] };
      }
      if (/FROM lecciones WHERE id_curso/.test(texto)) {
        assert.deepEqual(parametros, [curso.idCurso]);
        assert.match(texto, /FOR UPDATE$/);
        return { rows: lecciones.map(({ pasos, ...meta }) => meta) };
      }
      if (/FROM pasos p JOIN lecciones/.test(texto)) {
        assert.deepEqual(parametros, [curso.idCurso]);
        assert.match(texto, /FOR UPDATE OF p$/);
        return { rows: lecciones.flatMap((l) => l.pasos.map((p) => ({ ...p, idLeccion: l.idLeccion }))) };
      }
      if (/SELECT EXISTS.*FROM progresos/s.test(texto)) {
        assert.deepEqual(parametros, [curso.idCurso]);
        return { rows: [{ tieneAvance: opciones.tieneAvance === true }] };
      }
      if (/^INSERT INTO cursos/.test(texto)) {
        assert.equal(parametros[3], UID);
        curso = { idCurso: '11', idCategoria: parametros[0], titulo: parametros[1], descripcion: parametros[2],
          estado_publicacion: 'borrador', creado_por: parametros[3], orden: parametros[4], fecha_cierre: parametros[5] };
        nuevo = true;
        return { rows: [{ idCurso: curso.idCurso }] };
      }
      if (/^UPDATE cursos SET/.test(texto)) {
        assert.equal(parametros[5], curso.idCurso);
        Object.assign(curso, { idCategoria: parametros[0], titulo: parametros[1], descripcion: parametros[2], orden: parametros[3], fecha_cierre: parametros[4], estado_publicacion: parametros[6] });
        return { rows: [{ idCurso: curso.idCurso }] };
      }
      if (/^UPDATE lecciones SET estado_publicacion/.test(texto)) {
        assert.deepEqual(parametros, [curso.estado_publicacion, curso.idCurso]);
        estadosLecciones = estadosLecciones.map(() => parametros[0]);
        return { rows: [], rowCount: lecciones.length };
      }
      if (/WHERE c\.id_curso = \$1::bigint/.test(texto)) {
        assert.deepEqual(parametros, [curso.idCurso]);
        const detalleLecciones = nuevo ? [] : lecciones;
        return { rows: [{ ...curso, estadoPublicacion: curso.estado_publicacion,
          fechaCierre: curso.fecha_cierre, creadoPor: 'Autor de Ejemplo', tieneAvance: opciones.tieneAvance === true,
          totalLecciones: detalleLecciones.length, lecciones: detalleLecciones }] };
      }
      assert.fail(`Consulta no prevista: ${texto}`);
    },
    release: t.mock.fn()
  };
  const conectar = t.mock.method(pool, 'connect', async () => {
    if (opciones.errorConexion) throw opciones.errorConexion;
    return cliente;
  });
  return { llamadas, verificar, perfil, conectar, cliente, estadosLecciones: () => estadosLecciones };
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

for (const rol of ['maestro', 'administrador']) {
  test(`POST cursos: ${rol} crea borrador y recibe detalle completo`, async (t) => {
    const s = simular(t, { rol });
    const respuesta = await solicitar(OPERACIONES[0]);
    assert.equal(respuesta.status, 201);
    assert.equal(respuesta.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await respuesta.json(), {
      idCurso: '11', titulo: 'Curso nuevo', descripcion: 'Ejemplos ficticios.', orden: 3,
      estadoPublicacion: 'borrador', fechaCierre: null, tieneAvance: false,
      creadoPor: 'Autor de Ejemplo', puedeEditar: true, idCategoria: '1', lecciones: []
    });
    assert.equal(s.llamadas.at(-1).sql, 'COMMIT');
    assert.equal(s.cliente.release.mock.callCount(), 1);
  });
}

test('PATCH cursos: texto publicado propio conserva contenido, estado y autoría', async (t) => {
  const s = simular(t, { curso: { estado_publicacion: 'publicado' }, lecciones: LECCIONES, tieneAvance: true });
  const respuesta = await solicitar(OPERACIONES[1]);
  assert.equal(respuesta.status, 200);
  assert.equal(respuesta.headers.get('cache-control'), 'no-store');
  const cuerpo = await respuesta.json();
  assert.equal(cuerpo.titulo, 'Corregido');
  assert.equal(cuerpo.estadoPublicacion, 'publicado');
  assert.equal(cuerpo.tieneAvance, true);
  assert.equal(cuerpo.orden, 2);
  assert.deepEqual(cuerpo.lecciones, LECCIONES);
  assert.equal(Object.hasOwn(cuerpo, 'creado_por'), false);
  assert.equal(s.llamadas.at(-1).sql, 'COMMIT');
});

test('PATCH cursos: administrador traslada publicado ajeno sin alterar contenido', async (t) => {
  simular(t, { rol: 'administrador', curso: { creado_por: 'otro-autor', estado_publicacion: 'publicado' }, lecciones: LECCIONES });
  const respuesta = await solicitar({ metodo: 'PATCH', ruta: '/10', cuerpo: { idCategoria: '2' } });
  assert.equal(respuesta.status, 200);
  assert.equal(respuesta.headers.get('cache-control'), 'no-store');
  const cuerpo = await respuesta.json();
  assert.equal(cuerpo.idCategoria, '2');
  assert.equal(cuerpo.orden, 6);
  assert.equal(cuerpo.estadoPublicacion, 'publicado');
  assert.deepEqual(cuerpo.lecciones, LECCIONES);
});

for (const operacion of OPERACIONES) {
  for (const token of [null, 'Basic prueba', 'Bearer uno,dos']) {
    test(`${operacion.metodo} cursos: autenticación mal formada ${token}`, async (t) => {
      const s = simular(t);
      await comprobarError(await solicitar({ ...operacion, token }), 401);
      assert.equal(s.verificar.mock.callCount(), 0);
      assert.equal(s.perfil.mock.callCount(), 0);
      assert.equal(s.conectar.mock.callCount(), 0);
    });
  }
  for (const code of ['auth/invalid-id-token', 'auth/id-token-expired']) {
    test(`${operacion.metodo} cursos: token rechazado ${code}`, async (t) => {
      const s = simular(t, { errorToken: Object.assign(new Error('Token ficticio'), { code }) });
      await comprobarError(await solicitar(operacion), 401);
      assert.equal(s.conectar.mock.callCount(), 0);
    });
  }
  for (const [opciones, estado, codigo] of [
    [{ sinPerfil: true }, 404, 'perfil_no_registrado'],
    [{ activo: false }, 403, 'cuenta_desactivada'],
    [{ rol: 'estudiante' }, 403, 'rol_no_autorizado']
  ]) {
    test(`${operacion.metodo} cursos: perfil o rol ${JSON.stringify(opciones)}`, async (t) => {
      const s = simular(t, opciones);
      await comprobarError(await solicitar(operacion), estado, codigo);
      assert.equal(s.conectar.mock.callCount(), 0);
    });
  }
  test(`${operacion.metodo} cursos: reconfirma estado del editor dentro de la transacción`, async (t) => {
    const s = simular(t, { perfilTx: { uid: UID, rol: 'maestro', activo: false } });
    await comprobarError(await solicitar(operacion), 403, 'cuenta_desactivada');
    assert.equal(s.llamadas.at(-1).sql, 'ROLLBACK');
    assert.equal(s.llamadas.some(({ sql }) => /^(INSERT|UPDATE)/.test(sql)), false);
  });
  for (const crudo of ['null', '"texto"', '{"titulo":']) {
    test(`${operacion.metodo} cursos: JSON rechazado ${crudo} conserva no-store`, async (t) => {
      const s = simular(t);
      await comprobarError(await solicitar({ ...operacion, crudo }), 400, 'json_invalido');
      assert.equal(s.verificar.mock.callCount(), 0);
      assert.equal(s.perfil.mock.callCount(), 0);
      assert.equal(s.conectar.mock.callCount(), 0);
    });
  }
  test(`${operacion.metodo} cursos: arreglo como cuerpo no es un objeto de curso`, async (t) => {
    const s = simular(t);
    await comprobarError(await solicitar({ ...operacion, cuerpo: [] }), 400, 'cuerpo_invalido');
    assert.equal(s.conectar.mock.callCount(), 0);
  });
  test(`${operacion.metodo} cursos: fallo SQL devuelve 503 sin detalles internos`, async (t) => {
    const privado = 'SELECT informacion interna de PostgreSQL';
    const s = simular(t, { fallar: /FROM usuarios.*FOR SHARE/, error: new Error(privado) });
    const registro = t.mock.method(console, 'error', () => {});
    const cuerpo = await comprobarError(await solicitar(operacion), 503, 'operacion_cursos_no_disponible');
    assert.equal(JSON.stringify(cuerpo).includes(privado), false);
    assert.equal(JSON.stringify(registro.mock.calls).includes(privado), false);
    assert.equal(s.llamadas.at(-1).sql, 'ROLLBACK');
  });
}

for (const [campo, valor] of [
  ['titulo', null], ['titulo', ' '], ['titulo', 'a'.repeat(101)],
  ['descripcion', 10], ['descripcion', 'a'.repeat(301)]
]) {
  test(`POST cursos: ${campo} inválido devuelve rutas sin valores enviados`, async (t) => {
    const s = simular(t);
    const cuerpo = await comprobarError(await solicitar({ cuerpo: { ...DATOS, [campo]: valor } }), 400, 'contenido_invalido');
    assert.equal(cuerpo.errores[0].ruta, `curso.${campo}`);
    assert.deepEqual(Object.keys(cuerpo.errores[0]).sort(), ['codigo', 'mensaje', 'ruta']);
    assert.equal(s.conectar.mock.callCount(), 0);
  });
}

for (const campo of ['uid', 'creado_por', 'rol', 'orden', 'estadoPublicacion', 'lecciones']) {
  test(`POST cursos: rechaza campo no autorizado ${campo}`, async (t) => {
    const s = simular(t);
    await comprobarError(await solicitar({ cuerpo: { ...DATOS, [campo]: 'valor-ficticio' } }), 400, 'campos_invalidos');
    assert.equal(s.conectar.mock.callCount(), 0);
  });
}

for (const cuerpo of [{}, { creado_por: 'otro' }, { orden: 1 }]) {
  test(`PATCH cursos: campos vacíos o fuera del bloque ${JSON.stringify(cuerpo)}`, async (t) => {
    const s = simular(t);
    await comprobarError(await solicitar({ metodo: 'PATCH', ruta: '/10', cuerpo }), 400, 'campos_invalidos');
    assert.equal(s.conectar.mock.callCount(), 0);
  });
}

for (const idCategoria of ['0', '01', '9223372036854775808', 1, null]) {
  test(`POST cursos: categoría con ID inválido ${JSON.stringify(idCategoria)}`, async (t) => {
    const s = simular(t);
    await comprobarError(await solicitar({ cuerpo: { ...DATOS, idCategoria } }), 400, 'id_categoria_invalido');
    assert.equal(s.conectar.mock.callCount(), 0);
  });
}

for (const id of ['0', '-1', '01', 'abc', '9223372036854775808']) {
  test(`PATCH cursos: ID inválido ${id} no abre conexión`, async (t) => {
    const s = simular(t);
    await comprobarError(await solicitar({ metodo: 'PATCH', ruta: `/${id}`, cuerpo: { titulo: 'Ejemplo' } }), 400, 'id_curso_invalido');
    assert.equal(s.conectar.mock.callCount(), 0);
  });
}

test('PATCH cursos: BIGINT válido inexistente devuelve 404', async (t) => {
  const id = '9223372036854775807';
  const s = simular(t, { id, sinCurso: true });
  await comprobarError(await solicitar({ metodo: 'PATCH', ruta: `/${id}`, cuerpo: { titulo: 'Ejemplo' } }), 404, 'curso_no_encontrado');
  assert.equal(s.llamadas.at(-1).sql, 'ROLLBACK');
});

for (const fechaCierre of [null, '2099-12-31']) {
  test(`POST cursos: fecha opcional explícita ${fechaCierre}`, async (t) => {
    simular(t);
    const respuesta = await solicitar({ cuerpo: { ...DATOS, fechaCierre } });
    assert.equal(respuesta.status, 201);
    assert.equal((await respuesta.json()).fechaCierre, fechaCierre);
  });
}

for (const fechaCierre of ['2000-01-01', '2026-02-30', '2099-1-1', '2099-12-31T00:00:00Z', 12, false]) {
  test(`PATCH cursos: fecha inválida ${JSON.stringify(fechaCierre)} no aplica el texto combinado`, async (t) => {
    const s = simular(t);
    await comprobarError(await solicitar({ metodo: 'PATCH', ruta: '/10', cuerpo: { titulo: 'No guardar', fechaCierre } }),
      400, 'fecha_cierre_invalida');
    assert.equal(s.llamadas.some(({ sql }) => /^UPDATE/.test(sql)), false);
    assert.equal(s.llamadas.at(-1).sql, 'ROLLBACK');
  });
}

test('PATCH cursos: editar texto con fecha vencida conservada funciona', async (t) => {
  simular(t, { curso: { estado_publicacion: 'publicado', fecha_cierre: '2000-01-01' } });
  const respuesta = await solicitar(OPERACIONES[1]);
  assert.equal(respuesta.status, 200);
  assert.equal((await respuesta.json()).fechaCierre, '2000-01-01');
});

test('PATCH cursos: null elimina fecha de cierre', async (t) => {
  simular(t, { curso: { fecha_cierre: '2000-01-01' } });
  const respuesta = await solicitar({ metodo: 'PATCH', ruta: '/10', cuerpo: { fechaCierre: null } });
  assert.equal(respuesta.status, 200);
  assert.equal((await respuesta.json()).fechaCierre, null);
});

for (const [opciones, cuerpo, estado, codigo] of [
  [{ curso: { creado_por: 'otro-autor' } }, { titulo: 'Ejemplo' }, 403, 'curso_ajeno'],
  [{}, { idCategoria: '2', titulo: 'No guardar' }, 403, 'rol_no_autorizado'],
  [{ curso: { estado_publicacion: 'retirado' } }, { titulo: 'Ejemplo' }, 409, 'curso_retirado'],
  [{ rol: 'administrador', curso: { estado_publicacion: 'retirado', creado_por: 'otro-autor' } }, { idCategoria: '2' }, 409, 'curso_retirado'],
  [{ rol: 'administrador', sinCategoria: true }, { idCategoria: '2', titulo: 'No guardar' }, 404, 'categoria_no_encontrada']
]) {
  test(`PATCH cursos: restricción ${codigo} no guarda parcialmente`, async (t) => {
    const s = simular(t, opciones);
    await comprobarError(await solicitar({ metodo: 'PATCH', ruta: '/10', cuerpo }), estado, codigo);
    assert.equal(s.llamadas.some(({ sql }) => /^UPDATE/.test(sql)), false);
    assert.equal(s.llamadas.at(-1).sql, 'ROLLBACK');
  });
}

test('POST cursos: categoría inexistente devuelve 404 sin insertar', async (t) => {
  const s = simular(t, { sinCategoria: true });
  await comprobarError(await solicitar(OPERACIONES[0]), 404, 'categoria_no_encontrada');
  assert.equal(s.llamadas.some(({ sql }) => /^INSERT/.test(sql)), false);
});

test('PATCH cursos: misma categoría conserva orden y no produce traslado', async (t) => {
  const s = simular(t, { rol: 'administrador' });
  const respuesta = await solicitar({ metodo: 'PATCH', ruta: '/10', cuerpo: { idCategoria: '1' } });
  assert.equal(respuesta.status, 200);
  assert.equal((await respuesta.json()).orden, 2);
  assert.equal(s.llamadas.some(({ sql }) => /FROM categorias/.test(sql)), false);
  assert.equal(s.llamadas.some(({ sql }) => /^UPDATE/.test(sql)), false);
});

test('POST cursos: identidad enviada en Query no sustituye creado_por', async (t) => {
  const s = simular(t);
  const respuesta = await solicitar({ ruta: '?uid=otro-autor&creado_por=otro-autor', cuerpo: DATOS });
  assert.equal(respuesta.status, 201);
  const insercion = s.llamadas.find(({ sql }) => /^INSERT/.test(sql));
  assert.equal(insercion.parametros[3], UID);
  assert.equal(Object.hasOwn(await respuesta.json(), 'creado_por'), false);
});

test('PATCH cursos: Query no convierte maestro ajeno en administrador', async (t) => {
  simular(t, { curso: { creado_por: 'otro-autor' } });
  await comprobarError(await solicitar({ metodo: 'PATCH', ruta: '/10?uid=otro-autor&rol=administrador', cuerpo: { titulo: 'No guardar' } }),
    403, 'curso_ajeno');
});

for (const opciones of [
  { errorConexion: new Error('Conexión simulada no disponible') },
  { errorPerfil: new Error('Perfil simulado no disponible') },
  { errorToken: Object.assign(new Error('Firebase simulado no disponible'), { code: 'app/network-error' }) }
]) {
  test(`POST cursos: indisponibilidad ${Object.keys(opciones)[0]} devuelve 503`, async (t) => {
    simular(t, opciones);
    t.mock.method(console, 'error', () => {});
    const cuerpo = await comprobarError(await solicitar(OPERACIONES[0]), 503);
    if (opciones.errorConexion) assert.equal(cuerpo.codigo, 'operacion_cursos_no_disponible');
  });
}

for (const rol of ['maestro', 'administrador']) {
  for (const estadoPublicacion of ['publicado', 'borrador']) {
    test(`PATCH publicación: ${rol} cambia a ${estadoPublicacion} y recibe detalle sincronizado`, async (t) => {
      const s = simular(t, { rol, lecciones: LECCIONES, curso: {
        estado_publicacion: estadoPublicacion === 'publicado' ? 'borrador' : 'publicado',
        creado_por: rol === 'administrador' ? 'otro-autor' : UID
      } });
      const respuesta = await solicitar({ metodo: 'PATCH', ruta: '/10', cuerpo: { estadoPublicacion } });
      assert.equal(respuesta.status, 200);
      assert.equal(respuesta.headers.get('cache-control'), 'no-store');
      assert.deepEqual(await respuesta.json(), {
        idCurso: '10', idCategoria: '1', titulo: 'Curso original', descripcion: 'Descripción original.',
        orden: 2, estadoPublicacion, fechaCierre: null, creadoPor: 'Autor de Ejemplo',
        tieneAvance: false, puedeEditar: true, lecciones: LECCIONES
      });
      assert.deepEqual(s.estadosLecciones(), [estadoPublicacion]);
      assert.equal(s.llamadas.at(-1).sql, 'COMMIT');
      assert.equal(s.cliente.release.mock.callCount(), 1);
    });
  }
}

for (const [nombre, lecciones] of [
  ['curso vacío', []],
  ['lección vacía', [{ ...LECCIONES[0], pasos: [] }]],
  ['solo dos pasos', [{ ...LECCIONES[0], pasos: LECCIONES[0].pasos.slice(0, 2) }]],
  ['sin práctica', [{ ...LECCIONES[0], pasos: LECCIONES[0].pasos.map((p) => ({ ...p, actividad: { tipo: 'lectura' } })) }]]
]) {
  test(`PATCH publicación: ${nombre} devuelve 409 con errores seguros y sin UPDATE`, async (t) => {
    const s = simular(t, { lecciones });
    const cuerpo = await comprobarError(await solicitar({ metodo: 'PATCH', ruta: '/10',
      cuerpo: { estadoPublicacion: 'publicado', titulo: 'No guardar parcialmente' } }), 409, 'contenido_incompleto');
    assert.ok(cuerpo.errores.length > 0);
    for (const error of cuerpo.errores) assert.deepEqual(Object.keys(error).sort(), ['codigo', 'mensaje', 'ruta']);
    assert.equal(JSON.stringify(cuerpo).includes('No guardar parcialmente'), false);
    assert.equal(s.llamadas.some(({ sql }) => /^(UPDATE|INSERT|DELETE)/.test(sql)), false);
    assert.equal(s.llamadas.at(-1).sql, 'ROLLBACK');
  });
}

test('PATCH despublicación: avance de cualquier alumno rechaza cambios combinados', async (t) => {
  const s = simular(t, { rol: 'administrador', curso: { estado_publicacion: 'publicado' },
    tieneAvance: true, lecciones: LECCIONES });
  await comprobarError(await solicitar({ metodo: 'PATCH', ruta: '/10', cuerpo: {
    estadoPublicacion: 'borrador', titulo: 'No guardar', idCategoria: '2', fechaCierre: null
  } }), 409, 'curso_con_avance');
  assert.equal(s.llamadas.some(({ sql }) => /^(UPDATE|INSERT|DELETE)/.test(sql)), false);
  assert.deepEqual(s.estadosLecciones(), ['publicado']);
  assert.equal(s.llamadas.at(-1).sql, 'ROLLBACK');
});

for (const estadoPublicacion of ['borrador', 'publicado']) {
  test(`PATCH publicación: reenvío ${estadoPublicacion} sin cambios no escribe`, async (t) => {
    const s = simular(t, { curso: { estado_publicacion: estadoPublicacion }, tieneAvance: true });
    const respuesta = await solicitar({ metodo: 'PATCH', ruta: '/10', cuerpo: { estadoPublicacion } });
    assert.equal(respuesta.status, 200);
    assert.equal(respuesta.headers.get('cache-control'), 'no-store');
    assert.equal((await respuesta.json()).estadoPublicacion, estadoPublicacion);
    assert.equal(s.llamadas.some(({ sql }) => /^UPDATE/.test(sql)), false);
    assert.equal(s.llamadas.at(-1).sql, 'COMMIT');
  });
}

for (const estadoPublicacion of [null, 'retirado', 'cerrado', 'PUBLICADO', ' publicado ', true, [], {}]) {
  test(`PATCH publicación: estado inválido ${JSON.stringify(estadoPublicacion)}`, async (t) => {
    const s = simular(t);
    const cuerpo = await comprobarError(await solicitar({ metodo: 'PATCH', ruta: '/10', cuerpo: { estadoPublicacion } }),
      400, 'contenido_invalido');
    assert.equal(cuerpo.errores[0].ruta, 'curso.estadoPublicacion');
    assert.equal(s.conectar.mock.callCount(), 0);
  });
}

for (const estadoPublicacion of ['publicado', 'borrador']) {
  for (const [opciones, estado, esperado] of [
    [{ curso: { creado_por: 'otro-autor' } }, 403, 'curso_ajeno'],
    [{ curso: { estado_publicacion: 'retirado' } }, 409, 'curso_retirado'],
    [{ rol: 'administrador', curso: { estado_publicacion: 'retirado', creado_por: 'otro-autor' } }, 409, 'curso_retirado'],
    [{ sinCurso: true }, 404, 'curso_no_encontrado']
  ]) {
    test(`PATCH publicación: ${estadoPublicacion} respeta ${esperado} ${opciones.rol || 'maestro'}`, async (t) => {
      const s = simular(t, opciones);
      await comprobarError(await solicitar({ metodo: 'PATCH', ruta: '/10', cuerpo: { estadoPublicacion } }), estado, esperado);
      assert.equal(s.llamadas.some(({ sql }) => /^UPDATE/.test(sql)), false);
      assert.equal(s.llamadas.at(-1).sql, 'ROLLBACK');
    });
  }
}

test('PATCH publicación: administrador combina publicación, traslado, textos y fecha', async (t) => {
  const s = simular(t, { rol: 'administrador', curso: { creado_por: 'otro-autor' }, lecciones: LECCIONES });
  const respuesta = await solicitar({ metodo: 'PATCH', ruta: '/10', cuerpo: {
    estadoPublicacion: 'publicado', idCategoria: '2', titulo: 'Curso corregido', fechaCierre: '2099-12-31'
  } });
  assert.equal(respuesta.status, 200);
  assert.equal(respuesta.headers.get('cache-control'), 'no-store');
  const cuerpo = await respuesta.json();
  assert.equal(cuerpo.estadoPublicacion, 'publicado');
  assert.equal(cuerpo.idCategoria, '2');
  assert.equal(cuerpo.orden, 6);
  assert.equal(cuerpo.titulo, 'Curso corregido');
  assert.equal(cuerpo.fechaCierre, '2099-12-31');
  assert.deepEqual(cuerpo.lecciones, LECCIONES);
  assert.deepEqual(s.estadosLecciones(), ['publicado']);
});

test('PATCH publicación: maestro no traslada ni publica parcialmente', async (t) => {
  const s = simular(t, { lecciones: LECCIONES });
  await comprobarError(await solicitar({ metodo: 'PATCH', ruta: '/10', cuerpo: {
    estadoPublicacion: 'publicado', idCategoria: '2', titulo: 'No guardar'
  } }), 403, 'rol_no_autorizado');
  assert.equal(s.llamadas.some(({ sql }) => /^UPDATE/.test(sql)), false);
  assert.equal(s.llamadas.at(-1).sql, 'ROLLBACK');
});

for (const fallar of [/FROM lecciones WHERE id_curso/, /FROM pasos p JOIN/, /^UPDATE lecciones SET/,
  /WHERE c\.id_curso =/, /^COMMIT$/]) {
  test(`PATCH publicación: fallo ${fallar} devuelve 503 seguro y solicita rollback`, async (t) => {
    const privado = 'Detalle SQL de publicación que no debe exponerse';
    const s = simular(t, { lecciones: LECCIONES, fallar, error: new Error(privado) });
    const registro = t.mock.method(console, 'error', () => {});
    const cuerpo = await comprobarError(await solicitar({ metodo: 'PATCH', ruta: '/10',
      cuerpo: { estadoPublicacion: 'publicado' } }), 503, 'operacion_cursos_no_disponible');
    assert.equal(JSON.stringify(cuerpo).includes(privado), false);
    assert.equal(JSON.stringify(registro.mock.calls).includes(privado), false);
    assert.equal(s.llamadas.at(-1).sql, 'ROLLBACK');
    assert.equal(s.cliente.release.mock.callCount(), 1);
  });
}
