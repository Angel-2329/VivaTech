const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { ErrorCargaContenido, cargarContenido, ejecutar } = require('../scripts/cargar-contenido');
const contenidoReal = require('../data/contenido-inicial.json');

const UID = 'uid-administrador-prueba';

function crearContenido() {
  return ['uso-seguro-banco', 'pago-servicios'].map((claveCarga, indice) => ({
    claveCarga,
    categoria: indice === 0 ? 'Banca móvil' : 'Pagos digitales',
    orden: 1,
    titulo: `Curso ficticio ${indice + 1}`,
    descripcion: 'Descripción ficticia.',
    lecciones: [{
      orden: 1, titulo: 'Lección ficticia', objetivo: 'Reconocer los botones.', duracionEstimadaMinutos: 10,
      pasos: [
        { orden: 1, instruccion: 'Lee la explicación.', recursos: [], actividad: { tipo: 'lectura' } },
        {
          orden: 2, instruccion: 'Elige una respuesta.', recursos: [],
          actividad: {
            tipo: 'opcion', pregunta: '¿Qué eliges?',
            opciones: [{ id: 'a', texto: 'Primera opción' }, { id: 'b', texto: 'Segunda opción' }],
            correcta: 'b', pista: 'Revisa con calma.', mensajeAcierto: '¡Muy bien!'
          }
        },
        { orden: 3, instruccion: 'Recuerda lo aprendido.', recursos: [], actividad: { tipo: 'lectura' } }
      ]
    }]
  }));
}

function inicio(usuario = { rol: 'administrador', activo: true }) {
  return [
    { sql: /^BEGIN$/ },
    { sql: /SELECT rol, activo FROM usuarios[\s\S]*FOR SHARE/, parametros: [UID], filas: usuario ? [usuario] : [] },
    { sql: /^LOCK TABLE cargas_contenido_inicial IN SHARE ROW EXCLUSIVE MODE$/ }
  ];
}

function consultaRegistro(clave, filas = []) {
  return { sql: /FROM cargas_contenido_inicial WHERE clave = \$1/, parametros: [clave], filas };
}

function prepararPlan(contenido, registrados = {}) {
  const pasos = inicio();
  let id = 9007199254740993n;

  for (const [indice, curso] of contenido.entries()) {
    if (Object.hasOwn(registrados, curso.claveCarga)) {
      pasos.push(consultaRegistro(curso.claveCarga, [{ idCurso: registrados[curso.claveCarga] }]));
      continue;
    }
    pasos.push(consultaRegistro(curso.claveCarga));
    const idCategoria = String(41 + indice);
    pasos.push({
      sql: /FROM categorias WHERE nombre = \$1 FOR SHARE/,
      parametros: [curso.categoria], filas: [{ idCategoria }]
    });
    pasos.push({
      sql: /FROM cursos[\s\S]*id_categoria = \$1 AND \(orden = \$2 OR titulo = \$3\)[\s\S]*FOR UPDATE/,
      parametros: [idCategoria, curso.orden, curso.titulo], filas: []
    });
    const idCurso = String(id++);
    pasos.push({
      sql: /INSERT INTO cursos[\s\S]*'publicado'[\s\S]*RETURNING id_curso::text/,
      parametros: [idCategoria, curso.titulo, curso.descripcion, UID, curso.orden], filas: [{ idCurso }]
    });
    for (const leccion of curso.lecciones) {
      const idLeccion = String(id++);
      pasos.push({
        sql: /INSERT INTO lecciones[\s\S]*'publicado'[\s\S]*RETURNING id_leccion::text/,
        parametros: [idCurso, leccion.titulo, leccion.duracionEstimadaMinutos, UID, leccion.orden, leccion.objetivo],
        filas: [{ idLeccion }]
      });
      for (const paso of leccion.pasos) {
        pasos.push({
          sql: /INSERT INTO pasos[\s\S]*\$4::jsonb, \$5::jsonb/,
          parametros: [idLeccion, paso.orden, paso.instruccion, JSON.stringify(paso.recursos), JSON.stringify(paso.actividad)]
        });
      }
    }
    pasos.push({
      sql: /INSERT INTO cargas_contenido_inicial \(clave, id_curso\)/,
      parametros: [curso.claveCarga, idCurso]
    });
  }

  pasos.push({ sql: /^COMMIT$/ });
  return pasos;
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
  const pool = { connect: t.mock.fn(async () => cliente), end: t.mock.fn(async () => {}) };
  return { cliente, pool };
}

function comprobarFinal(simulacion, pasos, descartar = false) {
  assert.equal(simulacion.pool.connect.mock.callCount(), 1);
  assert.equal(simulacion.cliente.query.mock.callCount(), pasos.length);
  assert.equal(simulacion.cliente.release.mock.callCount(), 1);
  assert.deepEqual(simulacion.cliente.release.mock.calls[0].arguments, [descartar]);
}

function codigoEsperado(codigo) {
  return (error) => error instanceof ErrorCargaContenido && error.codigo === codigo;
}

for (const uid of [undefined, null, '', '   ', 123, {}, 'u'.repeat(129)]) {
  test(`Carga contenido: rechaza UID inválido ${JSON.stringify(uid)} antes de conectar`, async (t) => {
    const pool = { connect: t.mock.fn(async () => assert.fail('No debe conectar')) };
    await assert.rejects(cargarContenido(pool, uid, crearContenido()), codigoEsperado('uid_invalido'));
    assert.equal(pool.connect.mock.callCount(), 0);
  });
}

for (const contenido of [null, {}, [], [crearContenido()[0]]]) {
  test(`Carga contenido: rechaza raíz inválida ${JSON.stringify(contenido)?.slice(0, 30)} sin conectar`, async (t) => {
    const pool = { connect: t.mock.fn(async () => assert.fail('No debe conectar')) };
    await assert.rejects(cargarContenido(pool, UID, contenido), codigoEsperado('contenido_invalido'));
    assert.equal(pool.connect.mock.callCount(), 0);
  });
}

for (const clave of [undefined, null, 'Clave', 'con espacio', 'á', '', 'x'.repeat(81)]) {
  test(`Carga contenido: rechaza clave técnica inválida ${JSON.stringify(clave)}`, async (t) => {
    const contenido = crearContenido();
    contenido[0].claveCarga = clave;
    const pool = { connect: t.mock.fn(async () => assert.fail('No debe conectar')) };
    await assert.rejects(cargarContenido(pool, UID, contenido), codigoEsperado('clave_carga_invalida'));
    assert.equal(pool.connect.mock.callCount(), 0);
  });
}

test('Carga contenido: rechaza claves duplicadas y orden repetido por categoría antes de conectar', async (t) => {
  const pool = { connect: t.mock.fn(async () => assert.fail('No debe conectar')) };
  const contenido = crearContenido();
  contenido[1].claveCarga = contenido[0].claveCarga;
  await assert.rejects(cargarContenido(pool, UID, contenido), codigoEsperado('clave_carga_duplicada'));
  contenido[1].claveCarga = 'pago-servicios';
  contenido[1].categoria = ' Banca móvil ';
  await assert.rejects(cargarContenido(pool, UID, contenido), codigoEsperado('orden_curso_duplicado'));
  assert.equal(pool.connect.mock.callCount(), 0);
});

test('Carga contenido: exige formato publicable y ubica el error antes de conectar', async (t) => {
  const contenido = crearContenido();
  contenido[1].lecciones[0].pasos[1].actividad.correcta = 'inexistente';
  const pool = { connect: t.mock.fn(async () => assert.fail('No debe conectar')) };
  await assert.rejects(cargarContenido(pool, UID, contenido), (error) => {
    assert.equal(error.codigo, 'contenido_invalido');
    assert.match(error.message, /cursos\[1\]/);
    assert.match(error.message, /lecciones\[0\]\.pasos\[1\]\.actividad\.correcta/);
    return true;
  });
  assert.equal(pool.connect.mock.callCount(), 0);
});

for (const usuario of [null, { rol: 'maestro', activo: true }, { rol: 'administrador', activo: false }]) {
  test(`Carga contenido: administrador no válido ${JSON.stringify(usuario)} revierte antes de bloquear registro`, async (t) => {
    const pasos = [...inicio(usuario).slice(0, 2), { sql: /^ROLLBACK$/ }];
    const simulacion = simularPool(t, pasos);
    await assert.rejects(cargarContenido(simulacion.pool, UID, crearContenido()), codigoEsperado('administrador_invalido'));
    comprobarFinal(simulacion, pasos);
  });
}

test('Carga contenido: crea ambos cursos publicados, registra al final y mantiene IDs BIGINT como cadenas', async (t) => {
  const contenido = crearContenido();
  const pasos = prepararPlan(contenido);
  const simulacion = simularPool(t, pasos);
  assert.deepEqual(await cargarContenido(simulacion.pool, ` ${UID} `, contenido), {
    cursosCreados: 2, cursosYaRegistrados: 0, cursosEliminadosPreviamente: 0, leccionesCreadas: 2, pasosCreados: 6
  });
  comprobarFinal(simulacion, pasos);
  for (const llamada of simulacion.cliente.query.mock.calls) {
    assert.doesNotMatch(llamada.arguments[0], /\bUPDATE\b(?!\s*$)|\bDELETE FROM\b/);
  }
});

test('Carga contenido: el archivo real produce dos cursos, seis lecciones y treinta pasos', async (t) => {
  const pasos = prepararPlan(contenidoReal);
  const simulacion = simularPool(t, pasos);
  assert.deepEqual(await cargarContenido(simulacion.pool, UID, contenidoReal), {
    cursosCreados: 2, cursosYaRegistrados: 0, cursosEliminadosPreviamente: 0, leccionesCreadas: 6, pasosCreados: 30
  });
  comprobarFinal(simulacion, pasos);
});

test('Carga contenido: normaliza textos y JSON en copias sin alterar la fuente', async (t) => {
  const esperado = crearContenido();
  const contenido = crearContenido();
  contenido[0].categoria = ' Banca móvil ';
  contenido[0].titulo = ` ${esperado[0].titulo} `;
  contenido[0].descripcion = ` ${esperado[0].descripcion} `;
  contenido[0].lecciones[0].objetivo = ` ${esperado[0].lecciones[0].objetivo} `;
  contenido[0].lecciones[0].pasos[1].actividad.opciones[0].texto = ' Primera opción ';
  const anterior = structuredClone(contenido);
  const pasos = prepararPlan(esperado);
  const simulacion = simularPool(t, pasos);
  await cargarContenido(simulacion.pool, UID, contenido);
  comprobarFinal(simulacion, pasos);
  assert.deepEqual(contenido, anterior);
});

test('Carga contenido: claves ya cargadas se omiten sin buscar categorías ni tocar cursos o hijos', async (t) => {
  const contenido = crearContenido();
  const pasos = prepararPlan(contenido, { 'uso-seguro-banco': '77', 'pago-servicios': '88' });
  const simulacion = simularPool(t, pasos);
  assert.deepEqual(await cargarContenido(simulacion.pool, UID, contenido), {
    cursosCreados: 0, cursosYaRegistrados: 2, cursosEliminadosPreviamente: 0, leccionesCreadas: 0, pasosCreados: 0
  });
  comprobarFinal(simulacion, pasos);
  assert.ok(simulacion.cliente.query.mock.calls.every((llamada) => !/\b(?:INSERT|UPDATE|DELETE)\b/.test(llamada.arguments[0])));
});

test('Carga contenido: no recrea cursos eliminados físicamente ni reconstruye hijos', async (t) => {
  const contenido = crearContenido();
  const pasos = prepararPlan(contenido, { 'uso-seguro-banco': null, 'pago-servicios': null });
  const simulacion = simularPool(t, pasos);
  assert.deepEqual(await cargarContenido(simulacion.pool, UID, contenido), {
    cursosCreados: 0, cursosYaRegistrados: 0, cursosEliminadosPreviamente: 2, leccionesCreadas: 0, pasosCreados: 0
  });
  comprobarFinal(simulacion, pasos);
});

test('Carga contenido: conserva un registro existente y crea solo el curso faltante', async (t) => {
  const contenido = crearContenido();
  const pasos = prepararPlan(contenido, { 'uso-seguro-banco': '77' });
  const simulacion = simularPool(t, pasos);
  assert.deepEqual(await cargarContenido(simulacion.pool, UID, contenido), {
    cursosCreados: 1, cursosYaRegistrados: 1, cursosEliminadosPreviamente: 0, leccionesCreadas: 1, pasosCreados: 3
  });
  comprobarFinal(simulacion, pasos);
});

test('Carga contenido: conserva una eliminación previa y crea solo el otro curso', async (t) => {
  const contenido = crearContenido();
  const pasos = prepararPlan(contenido, { 'uso-seguro-banco': null });
  const simulacion = simularPool(t, pasos);
  const resultado = await cargarContenido(simulacion.pool, UID, contenido);
  assert.equal(resultado.cursosCreados, 1);
  assert.equal(resultado.cursosEliminadosPreviamente, 1);
  comprobarFinal(simulacion, pasos);
});

for (const posicion of [0, 1]) {
  test(`Carga contenido: categoría ausente del curso ${posicion + 1} revierte la carga`, async (t) => {
    const contenido = crearContenido();
    const plan = prepararPlan(contenido);
    const indices = plan.flatMap((paso, indice) => /FROM categorias/.test(paso.sql.source) ? [indice] : []);
    const final = indices[posicion];
    const pasos = [...plan.slice(0, final), { ...plan[final], filas: [] }, { sql: /^ROLLBACK$/ }];
    const simulacion = simularPool(t, pasos);
    await assert.rejects(cargarContenido(simulacion.pool, UID, contenido), codigoEsperado('categoria_no_disponible'));
    comprobarFinal(simulacion, pasos);
  });
}

for (const posicion of [0, 1]) {
  test(`Carga contenido: conflicto sin registro del curso ${posicion + 1} no adopta ni sobrescribe`, async (t) => {
    const contenido = crearContenido();
    const plan = prepararPlan(contenido);
    const indices = plan.flatMap((paso, indice) => /FROM cursos/.test(paso.sql.source) ? [indice] : []);
    const final = indices[posicion];
    const pasos = [...plan.slice(0, final), { ...plan[final], filas: [{ idCurso: '99' }] }, { sql: /^ROLLBACK$/ }];
    const simulacion = simularPool(t, pasos);
    await assert.rejects(cargarContenido(simulacion.pool, UID, contenido), codigoEsperado('curso_sin_registro'));
    comprobarFinal(simulacion, pasos);
  });
}

for (const [nombre, patron] of [
  ['bloqueo de registro', /LOCK TABLE/],
  ['consulta de registro', /FROM cargas_contenido_inicial/],
  ['inserción de curso', /INSERT INTO cursos/],
  ['inserción de lección', /INSERT INTO lecciones/],
  ['inserción de paso', /INSERT INTO pasos/],
  ['registro de carga', /INSERT INTO cargas_contenido_inicial/],
  ['COMMIT', /COMMIT/]
]) {
  test(`Carga contenido: fallo en ${nombre} solicita rollback y conserva el error`, async (t) => {
    const contenido = crearContenido();
    const plan = prepararPlan(contenido);
    const final = plan.findIndex((paso) => patron.test(paso.sql.source));
    assert.ok(final >= 0);
    const fallo = new Error(`Fallo simulado en ${nombre}`);
    const pasos = [...plan.slice(0, final), { ...plan[final], error: fallo }, { sql: /^ROLLBACK$/ }];
    const simulacion = simularPool(t, pasos);
    await assert.rejects(cargarContenido(simulacion.pool, UID, contenido), (error) => error === fallo);
    comprobarFinal(simulacion, pasos);
  });
}

test('Carga contenido: descarta conexión si falla rollback, sin perder el error original', async (t) => {
  const fallo = new Error('Fallo simulado de bloqueo');
  const pasos = [...inicio().slice(0, 2), { ...inicio()[2], error: fallo }, { sql: /^ROLLBACK$/, error: new Error('Fallo rollback') }];
  const simulacion = simularPool(t, pasos);
  await assert.rejects(cargarContenido(simulacion.pool, UID, crearContenido()), (error) => error === fallo);
  comprobarFinal(simulacion, pasos, true);
});

test('Carga contenido: propaga fallo al conectar sin intentar consultas', async (t) => {
  const fallo = new Error('Conexión no disponible');
  const pool = { connect: t.mock.fn(async () => { throw fallo; }) };
  await assert.rejects(cargarContenido(pool, UID, crearContenido()), (error) => error === fallo);
  assert.equal(pool.connect.mock.callCount(), 1);
});

test('Comando cargar contenido: argumentos y UID inválidos no leen archivo ni crean pool', async (t) => {
  for (const argumentos of [[], [UID, 'extra'], [' '], [123]]) {
    const errores = [];
    const leerArchivo = t.mock.fn(async () => assert.fail('No debe leer'));
    const crearPool = t.mock.fn(() => assert.fail('No debe crear pool'));
    assert.equal(await ejecutar(argumentos, { leerArchivo, crearPool, informarError: (m) => errores.push(m) }), 1);
    assert.equal(leerArchivo.mock.callCount(), 0);
    assert.equal(crearPool.mock.callCount(), 0);
    assert.equal(errores.length, 1);
  }
});

test('Comando cargar contenido: lectura, sintaxis y validación fallidas no crean pool', async (t) => {
  for (const escenario of ['lectura', 'sintaxis', 'contenido']) {
    const errores = [];
    const crearPool = t.mock.fn(() => assert.fail('No debe crear pool'));
    const codigo = await ejecutar([UID], {
      leerArchivo: async () => {
        if (escenario === 'lectura') throw new Error('Fallo privado de lectura');
        return escenario === 'sintaxis' ? '{' : '[]';
      },
      crearPool, informarError: (m) => errores.push(m)
    });
    assert.equal(codigo, 1);
    assert.equal(crearPool.mock.callCount(), 0);
    assert.equal(errores.length, 1);
    assert.doesNotMatch(errores[0], /Fallo privado/);
  }
});

test('Comando cargar contenido: lee la ruta del repositorio, informa y cierra pool', async (t) => {
  const contenido = crearContenido();
  const pasos = prepararPlan(contenido);
  const simulacion = simularPool(t, pasos);
  const mensajes = [];
  const codigo = await ejecutar([UID], {
    leerArchivo: async (ruta, codificacion) => {
      assert.equal(ruta, path.join(__dirname, '..', 'data', 'contenido-inicial.json'));
      assert.equal(codificacion, 'utf8');
      return JSON.stringify(contenido);
    },
    crearPool: () => simulacion.pool,
    informar: (m) => mensajes.push(m), informarError: () => assert.fail('No debe fallar')
  });
  assert.equal(codigo, 0);
  assert.match(mensajes[0], /Cursos creados: 2/);
  comprobarFinal(simulacion, pasos);
  assert.equal(simulacion.pool.end.mock.callCount(), 1);
});

test('Comando cargar contenido: no expone errores SQL y cierra pool tras fallo', async (t) => {
  const contenido = crearContenido();
  const pasos = [...inicio().slice(0, 2), { ...inicio()[2], error: new Error('Detalle SQL privado') }, { sql: /^ROLLBACK$/ }];
  const simulacion = simularPool(t, pasos);
  const errores = [];
  assert.equal(await ejecutar([UID], {
    leerArchivo: async () => JSON.stringify(contenido), crearPool: () => simulacion.pool,
    informarError: (m) => errores.push(m)
  }), 1);
  assert.doesNotMatch(errores[0], /Detalle SQL privado/);
  assert.match(errores[0], /migraciones/);
  comprobarFinal(simulacion, pasos);
  assert.equal(simulacion.pool.end.mock.callCount(), 1);
});

test('Comando cargar contenido: fallo de cierre devuelve error sin ocultar el resultado de carga', async (t) => {
  const contenido = crearContenido();
  const pasos = prepararPlan(contenido, { 'uso-seguro-banco': '77', 'pago-servicios': null });
  const simulacion = simularPool(t, pasos);
  simulacion.pool.end = t.mock.fn(async () => { throw new Error('Error de cierre'); });
  const mensajes = [];
  const errores = [];
  assert.equal(await ejecutar([UID], {
    leerArchivo: async () => JSON.stringify(contenido), crearPool: () => simulacion.pool,
    informar: (m) => mensajes.push(m), informarError: (m) => errores.push(m)
  }), 1);
  assert.match(mensajes[0], /Ya registrados: 1/);
  assert.match(mensajes[0], /Eliminados previamente, no recreados: 1/);
  assert.match(errores[0], /cerrar correctamente/);
  comprobarFinal(simulacion, pasos);
});
