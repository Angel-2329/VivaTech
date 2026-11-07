const { test } = require('node:test');
const assert = require('node:assert/strict');
const contenido = require('../data/contenido-inicial.json');
const { validarCurso } = require('../src/services/validar-contenido');

test('Contenido inicial: el JSON contiene exactamente los dos cursos acordados', () => {
  assert.ok(Array.isArray(contenido));
  assert.equal(contenido.length, 2);
  assert.deepEqual(contenido.map((curso) => ({
    categoria: curso.categoria, orden: curso.orden, titulo: curso.titulo
  })), [
    { categoria: 'Banca móvil', orden: 1, titulo: 'Uso seguro de la aplicación del banco' },
    { categoria: 'Pagos digitales', orden: 1, titulo: 'Pago de servicios en línea' }
  ]);
});

for (const [indice, titulo] of [
  'Uso seguro de la aplicación del banco', 'Pago de servicios en línea'
].entries()) {
  test(`Contenido inicial: ${titulo} cumple las reglas de publicación`, () => {
    const resultado = validarCurso(contenido[indice]);
    assert.deepEqual(resultado, { valido: true, errores: [] });
  });
}

test('Contenido inicial: conserva las seis lecciones y sus órdenes, sin duplicar el ejemplo', () => {
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
    ]
  ]);
  assert.equal(contenido.flatMap((curso) => curso.lecciones).length, 6);
});

test('Contenido inicial: conserva treinta pasos y las cantidades por lección', () => {
  assert.deepEqual(contenido.map((curso) => curso.lecciones.map((leccion) => leccion.pasos.length)), [
    [6, 5, 6], [4, 5, 4]
  ]);
  assert.equal(contenido.flatMap((curso) => curso.lecciones).flatMap((leccion) => leccion.pasos).length, 30);
});

test('Contenido inicial: conserva las duraciones declaradas por lección', () => {
  assert.deepEqual(contenido.map((curso) => curso.lecciones.map((leccion) => leccion.duracionEstimadaMinutos)), [
    [10, 12, 15], [8, 10, 8]
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
