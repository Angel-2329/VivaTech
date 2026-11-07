const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validarCurso, validarLeccion, validarPaso } = require('../src/services/validar-contenido');
const { interpretarArgumentos, comprobarArchivos } = require('../scripts/validar-contenido');

function crearPaso(orden = 1, tipo = 'lectura') {
  const paso = {
    orden,
    instruccion: 'Observa esta práctica.',
    recursos: [],
    actividad: { tipo }
  };
  if (tipo !== 'lectura') {
    Object.assign(paso.actividad, {
      opciones: [{ id: 'a', texto: 'Primera opción' }, { id: 'b', texto: 'Segunda opción' }],
      correcta: 'b', pista: 'Revisa con calma.', mensajeAcierto: '¡Muy bien!'
    });
    if (tipo === 'opcion') paso.actividad.pregunta = '¿Qué eliges?';
    if (tipo === 'toque') paso.actividad.pantalla = { titulo: 'Pantalla ficticia' };
  }
  return paso;
}

function crearLeccion(orden = 1) {
  return {
    orden, titulo: 'Lección ficticia', objetivo: 'Reconocer los botones.', duracionEstimadaMinutos: 10,
    pasos: [crearPaso(1), crearPaso(2, 'opcion'), crearPaso(3, 'toque')]
  };
}

function crearCurso() {
  const curso = {
    categoria: 'Banca móvil', orden: 1, titulo: 'Curso ficticio', descripcion: 'Una descripción sencilla.',
    lecciones: [crearLeccion()]
  };
  curso.lecciones[0].pasos[0].recursos = [
    { tipo: 'icono', nombre: 'smartphone', alt: 'Celular' },
    { tipo: 'lista', elementos: ['Primera idea.', 'Segunda idea.'] },
    { tipo: 'aviso', texto: 'No uses datos reales.' }
  ];
  return curso;
}

function contieneError(resultado, ruta, codigo) {
  assert.equal(resultado.valido, false);
  assert.ok(resultado.errores.some((error) => error.ruta === ruta && error.codigo === codigo), JSON.stringify(resultado));
}

test('Contenido: acepta un curso publicable con los tres tipos y recursos acordados', () => {
  assert.deepEqual(validarCurso(crearCurso()), { valido: true, errores: [] });
});

test('Contenido: valida lecciones y pasos por separado', () => {
  assert.equal(validarLeccion(crearLeccion()).valido, true);
  assert.equal(validarPaso(crearPaso()).valido, true);
});

test('Contenido: no modifica los objetos ni recorta silenciosamente su texto', () => {
  const curso = crearCurso();
  curso.titulo = '  Título con espacios  ';
  const anterior = structuredClone(curso);
  assert.equal(validarCurso(curso).valido, true);
  assert.deepEqual(curso, anterior);
});

for (const valor of [null, [], 'texto', 1, true, undefined]) {
  test(`Contenido: rechaza raíz no objeto ${String(valor)}`, () => {
    contieneError(validarCurso(valor), 'curso', 'objeto_requerido');
  });
}

const camposTexto = [
  { ruta: 'curso.categoria', maximo: 60, asignar: (c, v) => { c.categoria = v; } },
  { ruta: 'curso.titulo', maximo: 100, asignar: (c, v) => { c.titulo = v; } },
  { ruta: 'curso.descripcion', maximo: 300, asignar: (c, v) => { c.descripcion = v; } },
  { ruta: 'curso.lecciones[0].titulo', maximo: 100, asignar: (c, v) => { c.lecciones[0].titulo = v; } },
  { ruta: 'curso.lecciones[0].objetivo', maximo: 200, asignar: (c, v) => { c.lecciones[0].objetivo = v; } },
  { ruta: 'curso.lecciones[0].pasos[0].instruccion', maximo: 300, asignar: (c, v) => { c.lecciones[0].pasos[0].instruccion = v; } },
  { ruta: 'curso.lecciones[0].pasos[1].actividad.pregunta', maximo: 200, asignar: (c, v) => { c.lecciones[0].pasos[1].actividad.pregunta = v; } },
  { ruta: 'curso.lecciones[0].pasos[1].actividad.opciones[0].texto', maximo: 100, asignar: (c, v) => { c.lecciones[0].pasos[1].actividad.opciones[0].texto = v; } },
  { ruta: 'curso.lecciones[0].pasos[1].actividad.pista', maximo: 200, asignar: (c, v) => { c.lecciones[0].pasos[1].actividad.pista = v; } },
  { ruta: 'curso.lecciones[0].pasos[1].actividad.mensajeAcierto', maximo: 150, asignar: (c, v) => { c.lecciones[0].pasos[1].actividad.mensajeAcierto = v; } },
  { ruta: 'curso.lecciones[0].pasos[2].actividad.pantalla.titulo', maximo: 40, asignar: (c, v) => { c.lecciones[0].pasos[2].actividad.pantalla.titulo = v; } },
  { ruta: 'curso.lecciones[0].pasos[2].actividad.pantalla.subtitulo', maximo: 80, asignar: (c, v) => { c.lecciones[0].pasos[2].actividad.pantalla.subtitulo = v; } },
  { ruta: 'curso.lecciones[0].pasos[0].recursos[0].alt', maximo: 80, asignar: (c, v) => { c.lecciones[0].pasos[0].recursos[0].alt = v; } },
  { ruta: 'curso.lecciones[0].pasos[0].recursos[1].elementos[0]', maximo: 150, asignar: (c, v) => { c.lecciones[0].pasos[0].recursos[1].elementos[0] = v; } },
  { ruta: 'curso.lecciones[0].pasos[0].recursos[2].texto', maximo: 200, asignar: (c, v) => { c.lecciones[0].pasos[0].recursos[2].texto = v; } }
];

for (const campo of camposTexto) {
  test(`Contenido: acepta un carácter y el máximo Unicode con trim en ${campo.ruta}`, () => {
    for (const longitud of [1, campo.maximo]) {
      const curso = crearCurso();
      campo.asignar(curso, `  ${'😀'.repeat(longitud)}  `);
      assert.equal(validarCurso(curso).valido, true);
    }
  });

  test(`Contenido: rechaza vacío, exceso y tipo incorrecto en ${campo.ruta}`, () => {
    for (const [valor, codigo] of [
      ['', 'longitud_invalida'], ['   ', 'longitud_invalida'],
      ['x'.repeat(campo.maximo + 1), 'longitud_invalida'],
      [null, 'texto_requerido'], [123, 'texto_requerido'], [undefined, 'texto_requerido']
    ]) {
      const curso = crearCurso();
      campo.asignar(curso, valor);
      contieneError(validarCurso(curso), campo.ruta, codigo);
    }
  });
}

test('Contenido: permite curso sin lecciones solo en modo borrador', () => {
  const curso = crearCurso();
  curso.lecciones = [];
  assert.equal(validarCurso(curso, { publicable: false }).valido, true);
  contieneError(validarCurso(curso), 'curso.lecciones', 'cantidad_invalida');
});

test('Contenido: permite lección sin pasos solo en borrador', () => {
  const leccion = crearLeccion();
  leccion.pasos = [];
  assert.equal(validarLeccion(leccion, { publicable: false }).valido, true);
  contieneError(validarLeccion(leccion), 'leccion.pasos', 'cantidad_invalida');
});

test('Contenido: acepta diez lecciones y rechaza once también en borrador', () => {
  const curso = crearCurso();
  curso.lecciones = Array.from({ length: 10 }, (_, i) => crearLeccion(i + 1));
  assert.equal(validarCurso(curso).valido, true);
  curso.lecciones.push(crearLeccion(11));
  for (const publicable of [true, false]) {
    contieneError(validarCurso(curso, { publicable }), 'curso.lecciones', 'cantidad_invalida');
  }
});

test('Contenido: límites de tres a ocho pasos y máximo también en borrador', () => {
  const leccion = crearLeccion();
  leccion.pasos = [crearPaso(1), crearPaso(2, 'opcion')];
  contieneError(validarLeccion(leccion), 'leccion.pasos', 'cantidad_invalida');
  assert.equal(validarLeccion(leccion, { publicable: false }).valido, true);
  leccion.pasos = Array.from({ length: 8 }, (_, i) => crearPaso(i + 1, i === 0 ? 'opcion' : 'lectura'));
  assert.equal(validarLeccion(leccion).valido, true);
  leccion.pasos.push(crearPaso(9));
  for (const publicable of [true, false]) {
    contieneError(validarLeccion(leccion, { publicable }), 'leccion.pasos', 'cantidad_invalida');
  }
});

test('Contenido: exige práctica al publicar, no en borrador', () => {
  const leccion = crearLeccion();
  leccion.pasos = [crearPaso(1), crearPaso(2), crearPaso(3)];
  contieneError(validarLeccion(leccion), 'leccion.pasos', 'practica_requerida');
  assert.equal(validarLeccion(leccion, { publicable: false }).valido, true);
});

test('Contenido: no permite guardar pasos incompletos aunque el curso sea borrador', () => {
  const curso = crearCurso();
  delete curso.lecciones[0].pasos[1].actividad.pista;
  contieneError(validarCurso(curso, { publicable: false }), 'curso.lecciones[0].pasos[1].actividad.pista', 'texto_requerido');
});

test('Contenido: duración entera entre uno y quince', () => {
  for (const valor of [1, 15]) {
    const leccion = crearLeccion();
    leccion.duracionEstimadaMinutos = valor;
    assert.equal(validarLeccion(leccion).valido, true);
  }
  for (const valor of [0, 16, 1.5, '10', null, NaN, Infinity]) {
    const leccion = crearLeccion();
    leccion.duracionEstimadaMinutos = valor;
    contieneError(validarLeccion(leccion), 'leccion.duracionEstimadaMinutos', 'entero_invalido');
  }
});

test('Contenido: órdenes enteros positivos compatibles con INTEGER', () => {
  for (const valor of [0, -1, 1.5, '1', 2147483648]) {
    const curso = crearCurso();
    curso.orden = valor;
    contieneError(validarCurso(curso), 'curso.orden', 'entero_invalido');
  }
});

test('Contenido: rechaza orden duplicado de lección, permite órdenes únicos con huecos', () => {
  const curso = crearCurso();
  curso.lecciones.push(crearLeccion(1));
  contieneError(validarCurso(curso), 'curso.lecciones[1].orden', 'orden_duplicado');
  curso.lecciones[1].orden = 3;
  assert.equal(validarCurso(curso).valido, true);
});

test('Contenido: exige pasos consecutivos en el orden del archivo', () => {
  for (const valor of [1, 4]) {
    const leccion = crearLeccion();
    leccion.pasos[1].orden = valor;
    contieneError(validarLeccion(leccion), 'leccion.pasos[1].orden', 'orden_no_consecutivo');
  }
});

for (const [tipo, maximo] of [['opcion', 4], ['toque', 6]]) {
  test(`Contenido: valida cantidades de opciones para ${tipo}`, () => {
    for (const cantidad of [2, maximo]) {
      const paso = crearPaso(1, tipo);
      paso.actividad.opciones = Array.from({ length: cantidad }, (_, i) => ({ id: `id_${i}`, texto: 'Opción' }));
      paso.actividad.correcta = 'id_0';
      assert.equal(validarPaso(paso).valido, true);
    }
    for (const cantidad of [0, 1, maximo + 1]) {
      const paso = crearPaso(1, tipo);
      paso.actividad.opciones = Array.from({ length: cantidad }, (_, i) => ({ id: `id_${i}`, texto: 'Opción' }));
      paso.actividad.correcta = 'id_0';
      contieneError(validarPaso(paso), 'paso.actividad.opciones', 'cantidad_invalida');
    }
  });
}

test('Contenido: IDs de opción con patrón exacto, unicidad y correcta existente', () => {
  for (const id of ['A', 'á', 'con espacio', '', 'x'.repeat(21), 1, ' a ']) {
    const paso = crearPaso(1, 'opcion');
    paso.actividad.opciones[0].id = id;
    contieneError(validarPaso(paso), 'paso.actividad.opciones[0].id', 'id_opcion_invalido');
  }
  const paso = crearPaso(1, 'opcion');
  paso.actividad.opciones[0].id = 'a_1-b';
  paso.actividad.correcta = 'a_1-b';
  assert.equal(validarPaso(paso).valido, true);
  paso.actividad.opciones[1].id = 'a_1-b';
  contieneError(validarPaso(paso), 'paso.actividad.opciones[1].id', 'id_opcion_duplicado');
  paso.actividad.correcta = 'inexistente';
  contieneError(validarPaso(paso), 'paso.actividad.correcta', 'respuesta_invalida');
});

test('Contenido: lectura solo contiene tipo; no exige pregunta ni opciones', () => {
  const paso = crearPaso();
  assert.equal(validarPaso(paso).valido, true);
  paso.actividad.correcta = 'a';
  contieneError(validarPaso(paso), 'paso.actividad', 'lectura_con_campos_extra');
});

test('Contenido: subtítulo e icono de opción opcionales; presentes no pueden estar vacíos', () => {
  const paso = crearPaso(1, 'toque');
  assert.equal(validarPaso(paso).valido, true);
  paso.actividad.pantalla.subtitulo = '  ';
  paso.actividad.opciones[0].icono = '';
  contieneError(validarPaso(paso), 'paso.actividad.pantalla.subtitulo', 'longitud_invalida');
  contieneError(validarPaso(paso), 'paso.actividad.opciones[0].icono', 'longitud_invalida');
});

test('Contenido: valida listas de dos a cinco elementos y nombre no vacío de icono', () => {
  for (const cantidad of [2, 5]) {
    const paso = crearPaso();
    paso.recursos = [{ tipo: 'lista', elementos: Array(cantidad).fill('Una idea.') }];
    assert.equal(validarPaso(paso).valido, true);
  }
  for (const cantidad of [0, 1, 6]) {
    const paso = crearPaso();
    paso.recursos = [{ tipo: 'lista', elementos: Array(cantidad).fill('Una idea.') }];
    contieneError(validarPaso(paso), 'paso.recursos[0].elementos', 'cantidad_invalida');
  }
  const paso = crearPaso();
  paso.recursos = [{ tipo: 'icono', nombre: ' ', alt: 'Celular' }];
  contieneError(validarPaso(paso), 'paso.recursos[0].nombre', 'longitud_invalida');
});

for (const escenario of [
  { ruta: 'paso.recursos', codigo: 'arreglo_requerido', cambiar: (p) => { p.recursos = null; } },
  { ruta: 'paso.recursos[0]', codigo: 'objeto_requerido', cambiar: (p) => { p.recursos = [null]; } },
  { ruta: 'paso.recursos[0].tipo', codigo: 'tipo_recurso_invalido', cambiar: (p) => { p.recursos = [{ tipo: 'video' }]; } },
  { ruta: 'paso.actividad', codigo: 'objeto_requerido', cambiar: (p) => { p.actividad = []; } },
  { ruta: 'paso.actividad.tipo', codigo: 'tipo_actividad_invalido', cambiar: (p) => { p.actividad = { tipo: 'examen' }; } },
  { ruta: 'paso.actividad.pantalla', codigo: 'objeto_requerido', cambiar: (p) => { p.actividad.pantalla = null; } },
  { ruta: 'paso.actividad.opciones', codigo: 'arreglo_requerido', cambiar: (p) => { p.actividad.opciones = {}; } },
  { ruta: 'paso.actividad.opciones[0]', codigo: 'objeto_requerido', cambiar: (p) => { p.actividad.opciones[0] = null; } }
]) {
  test(`Contenido: estructura inválida en ${escenario.ruta} (${escenario.codigo})`, () => {
    const paso = crearPaso(1, 'toque');
    escenario.cambiar(paso);
    contieneError(validarPaso(paso), escenario.ruta, escenario.codigo);
  });
}

test('Contenido: lecciones y pasos deben ser arreglos con objetos', () => {
  const curso = crearCurso();
  curso.lecciones = null;
  contieneError(validarCurso(curso), 'curso.lecciones', 'arreglo_requerido');
  curso.lecciones = [null];
  contieneError(validarCurso(curso), 'curso.lecciones[0]', 'objeto_requerido');
  const leccion = crearLeccion();
  leccion.pasos = null;
  contieneError(validarLeccion(leccion), 'leccion.pasos', 'arreglo_requerido');
  leccion.pasos = [null, crearPaso(2), crearPaso(3, 'opcion')];
  contieneError(validarLeccion(leccion), 'leccion.pasos[0]', 'objeto_requerido');
});

test('Contenido: no admite modo de publicación ambiguo', () => {
  assert.throws(() => validarCurso(crearCurso(), { publicable: 'false' }), TypeError);
});

test('Comando: interpreta rutas con espacios y modo sin depender de rutas personales', () => {
  assert.deepEqual(interpretarArgumentos(['--curso', 'Mis documentos/curso.json', '--leccion', 'ejemplo.json', '--borrador']), {
    publicable: false,
    archivos: [{ tipo: 'curso', ruta: 'Mis documentos/curso.json' }, { tipo: 'leccion', ruta: 'ejemplo.json' }]
  });
});

test('Comando: rechaza uso inválido antes de leer archivos', async () => {
  for (const argumentos of [[], ['--curso'], ['--otro', 'archivo'], ['--borrador'], ['--borrador', '--borrador', '--curso', 'a'], ['--curso', '--leccion', 'a']]) {
    const mensajes = [];
    const codigo = await comprobarArchivos(argumentos, {
      leerArchivo: async () => assert.fail('No debe leer'), informarError: (m) => mensajes.push(m)
    });
    assert.equal(codigo, 1);
    assert.match(mensajes[0], /^Uso:/);
  }
});

test('Comando: analiza JSON de curso y ejemplo sin escribir ni conectar servicios', async () => {
  const documentos = { 'curso.json': crearCurso(), 'ejemplo.json': crearLeccion() };
  const mensajes = [];
  const codigo = await comprobarArchivos(['--curso', 'curso.json', '--leccion', 'ejemplo.json'], {
    leerArchivo: async (ruta, codificacion) => {
      assert.equal(codificacion, 'utf8');
      return JSON.stringify(documentos[ruta]);
    },
    informar: (m) => mensajes.push(m), informarError: () => assert.fail('No debe fallar')
  });
  assert.equal(codigo, 0);
  assert.equal(mensajes.length, 2);
});

test('Comando: informa lectura fallida, sintaxis y ruta de validación, y continúa', async () => {
  const errores = [];
  const codigo = await comprobarArchivos(['--curso', 'ausente', '--curso', 'mal-json', '--curso', 'invalido'], {
    leerArchivo: async (ruta) => {
      if (ruta === 'ausente') throw new Error('Error simulado');
      if (ruta === 'mal-json') return '{';
      return JSON.stringify({ ...crearCurso(), titulo: '' });
    },
    informar: () => assert.fail('No debe aprobar'), informarError: (m) => errores.push(m)
  });
  assert.equal(codigo, 1);
  assert.equal(errores.length, 3);
  assert.match(errores[0], /no fue posible leer/);
  assert.match(errores[1], /JSON válido/);
  assert.match(errores[2], /curso\.titulo \[longitud_invalida\]/);
});

test('Comando: modo borrador explícito acepta el curso vacío; modo normal lo rechaza', async () => {
  const curso = crearCurso();
  curso.lecciones = [];
  const dependencias = {
    leerArchivo: async () => JSON.stringify(curso), informar: () => {}, informarError: () => {}
  };
  assert.equal(await comprobarArchivos(['--curso', 'curso'], dependencias), 1);
  assert.equal(await comprobarArchivos(['--borrador', '--curso', 'curso'], dependencias), 0);
});
