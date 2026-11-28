const { test } = require('node:test');
const assert = require('node:assert/strict');
const contenido = require('../data/contenido-inicial.json');
const { validarCurso } = require('../src/services/validar-contenido');

test('Contenido inicial: conserva cuatro claves técnicas estables y únicas para la carga', () => {
  assert.deepEqual(contenido.map((curso) => curso.claveCarga), [
    'uso-seguro-banco', 'pago-servicios', 'banca-movil-segura', 'pagos-desde-casa'
  ]);
  assert.equal(new Set(contenido.map((curso) => curso.claveCarga)).size, contenido.length);
  for (const curso of contenido) assert.match(curso.claveCarga, /^[a-z0-9_-]{1,80}$/);
});

test('Contenido inicial: el JSON contiene exactamente los cuatro cursos acordados', () => {
  assert.ok(Array.isArray(contenido));
  assert.equal(contenido.length, 4);
  assert.deepEqual(contenido.map((curso) => ({
    categoria: curso.categoria, orden: curso.orden, titulo: curso.titulo
  })), [
    { categoria: 'Banca móvil', orden: 1, titulo: 'Uso seguro de la aplicación del banco' },
    { categoria: 'Pagos digitales', orden: 1, titulo: 'Pago de servicios en línea' },
    { categoria: 'Banca móvil', orden: 20, titulo: 'Tu banco en el celular, sin miedo' },
    { categoria: 'Pagos digitales', orden: 20, titulo: 'Paga la luz y el agua desde tu celular' }
  ]);
});

for (const [indice, titulo] of [
  'Uso seguro de la aplicación del banco', 'Pago de servicios en línea',
  'Tu banco en el celular, sin miedo', 'Paga la luz y el agua desde tu celular'
].entries()) {
  test(`Contenido inicial: ${titulo} cumple las reglas de publicación`, () => {
    const resultado = validarCurso(contenido[indice]);
    assert.deepEqual(resultado, { valido: true, errores: [] });
  });
}

test('Contenido inicial: conserva las quince lecciones y sus órdenes, sin duplicar el ejemplo', () => {
  assert.deepEqual(contenido.map((curso) => curso.lecciones.map((leccion) => ({
    orden: leccion.orden, titulo: leccion.titulo
  }))), [
    [
      { orden: 1, titulo: 'Abrir la aplicación de forma segura' },
      { orden: 2, titulo: 'Consultar tu saldo y movimientos' },
      { orden: 3, titulo: 'Reconocer mensajes falsos del banco' }
    ],
    [
      { orden: 1, titulo: 'Leer tu recibo de luz' },
      { orden: 2, titulo: 'Capturar la referencia de pago' },
      { orden: 3, titulo: 'Guardar tu comprobante' }
    ],
    [
      { orden: 1, titulo: 'Doña Rosa estrena su aplicación del banco' },
      { orden: 2, titulo: '¿Dónde está mi dinero? Saldo y movimientos' },
      { orden: 3, titulo: '¿Real o fraude? Mensajes falsos del banco' },
      { orden: 4, titulo: 'Reto final: Doña Rosa contra el estafador' }
    ],
    [
      { orden: 1, titulo: 'Lee tu recibo sin perderte' },
      { orden: 2, titulo: 'Paga tu recibo sin salir de casa' },
      { orden: 3, titulo: 'Tu comprobante, tu prueba' },
      { orden: 4, titulo: 'Cuidado con los cobros falsos' },
      { orden: 5, titulo: 'Reto final: paga el agua sin ayuda' }
    ]
  ]);
  assert.equal(contenido.flatMap((curso) => curso.lecciones).length, 15);
  assert.equal(contenido.slice(2).flatMap((curso) => curso.lecciones).length, 9);
});

test('Contenido inicial: conserva ochenta y dos pasos y las cantidades por lección', () => {
  assert.deepEqual(contenido.map((curso) => curso.lecciones.map((leccion) => leccion.pasos.length)), [
    [6, 5, 6], [4, 5, 4], [6, 6, 6, 7], [5, 6, 4, 4, 8]
  ]);
  const pasos = (cursos) => cursos.flatMap((curso) => curso.lecciones).flatMap((leccion) => leccion.pasos);
  assert.equal(pasos(contenido).length, 82);
  assert.equal(pasos(contenido.slice(0, 2)).length, 30);
  assert.equal(pasos(contenido.slice(2)).length, 52);
  assert.equal(pasos(contenido.slice(2)).filter((paso) => ['toque', 'opcion'].includes(paso.actividad.tipo)).length, 37);
});

test('Contenido inicial: conserva las duraciones declaradas por lección', () => {
  assert.deepEqual(contenido.map((curso) => curso.lecciones.map((leccion) => leccion.duracionEstimadaMinutos)), [
    [10, 12, 15], [8, 10, 8], [10, 12, 15, 10], [8, 12, 8, 10, 12]
  ]);
});

test('Contenido inicial: no repite órdenes de cursos dentro de una categoría', () => {
  const ordenesPorCategoria = new Map();
  for (const curso of contenido) {
    const categoria = curso.categoria.trim();
    if (!ordenesPorCategoria.has(categoria)) ordenesPorCategoria.set(categoria, new Set());
    const ordenes = ordenesPorCategoria.get(categoria);
    assert.equal(ordenes.has(curso.orden), false, `Orden duplicado en ${categoria}`);
    ordenes.add(curso.orden);
  }
});

test('Contenido inicial: contiene lectura y práctica en cada lección', () => {
  for (const curso of contenido) {
    for (const leccion of curso.lecciones) {
      assert.ok(leccion.pasos.some((paso) => paso.actividad.tipo === 'lectura'), leccion.titulo);
      assert.ok(leccion.pasos.some((paso) => ['toque', 'opcion'].includes(paso.actividad.tipo)), leccion.titulo);
    }
  }
});
