const { test, after } = require('node:test');
const assert = require('node:assert/strict');

process.env.DATABASE_URL = 'postgresql://prueba:prueba@localhost:5432/prueba';

const pool = require('../src/config/database');
const { obtenerMisCursos } = require('../src/services/mis-cursos');
const { ErrorReglaCurso } = require('../src/services/reglas-cursos');

const ALUMNO = { uid: 'uid-alumno-prueba', rol: 'estudiante', activo: true };
const AHORA = new Date('2026-11-08T05:59:59.999Z');
const MEDIANOCHE = new Date('2026-11-08T06:00:00.000Z');

after(async () => { await pool.end(); });

function leccion(estado = 'pendiente', idLeccion = '21') {
  return { idLeccion, titulo: `Lección ${idLeccion}`, duracionEstimadaMinutos: 10, estado };
}

function fila(cambios = {}) {
  return {
    idCategoria: '1', nombreCategoria: 'Banca móvil', idCurso: '10',
    titulo: 'Curso ficticio', descripcion: 'Descripción ficticia.',
    estado_publicacion: 'publicado', fecha_cierre: null,
    tieneAvance: false, tieneHistorial: false, completadoHistorico: null,
    certificado: null, lecciones: [leccion()], ...cambios
  };
}

function simular(t, filas, { uid = ALUMNO.uid, error } = {}) {
  const consulta = t.mock.method(pool, 'query', async (sql, parametros) => {
    assert.deepEqual(parametros, [uid]);
    if (error) throw error;
    return { rowCount: filas.length, rows: filas };
  });
  const conexion = t.mock.method(pool, 'connect', async () => assert.fail('No debe abrir una transacción'));
  return { consulta, conexion };
}

async function consultar(t, filas, opciones = {}) {
  const simulacion = simular(t, filas);
  const resultado = await obtenerMisCursos(ALUMNO, { ahora: AHORA, ...opciones });
  assert.equal(simulacion.consulta.mock.callCount(), 1);
  assert.equal(simulacion.conexion.mock.callCount(), 0);
  return resultado;
}

test('Mis cursos servicio: lista vacía conserva el arreglo directo', async (t) => {
  assert.deepEqual(await consultar(t, []), []);
});

test('Mis cursos servicio: conserva contrato de categoría, curso y lecciones', async (t) => {
  assert.deepEqual(await consultar(t, [fila()]), [{
    idCategoria: '1', nombre: 'Banca móvil', cursos: [{
      idCurso: '10', titulo: 'Curso ficticio', descripcion: 'Descripción ficticia.',
      estadoCurso: 'disponible', fechaCierre: null, cursoCompletado: false,
      certificado: null, lecciones: [leccion()]
    }]
  }]);
});

test('Mis cursos servicio: agrupa categorías y conserva el orden de la consulta', async (t) => {
  const resultado = await consultar(t, [
    fila({ idCurso: '12', titulo: 'Primero por orden' }),
    fila({ idCurso: '10', titulo: 'Segundo por orden' }),
    fila({ idCategoria: '2', nombreCategoria: 'Pagos digitales', idCurso: '15' })
  ]);
  assert.deepEqual(resultado.map((categoria) => categoria.idCategoria), ['1', '2']);
  assert.deepEqual(resultado[0].cursos.map((curso) => curso.idCurso), ['12', '10']);
});

test('Mis cursos servicio: pendiente, en progreso y completada se conservan sin fijar seis lecciones', async (t) => {
  const lecciones = [leccion('pendiente'), leccion('en_progreso', '22'), leccion('completada', '23')];
  const resultado = await consultar(t, [fila({ tieneAvance: true, lecciones })]);
  assert.deepEqual(resultado[0].cursos[0].lecciones, lecciones);
  assert.equal(resultado[0].cursos[0].cursoCompletado, false);
});

test('Mis cursos servicio: todas las lecciones completadas habilitan curso completo sin emitir certificado', async (t) => {
  const resultado = await consultar(t, [fila({ tieneAvance: true, lecciones: [leccion('completada'), leccion('completada', '22')] })]);
  assert.equal(resultado[0].cursos[0].cursoCompletado, true);
  assert.equal(resultado[0].cursos[0].certificado, null);
});

test('Mis cursos servicio: curso operativo vacío nunca está completo', async (t) => {
  const resultado = await consultar(t, [fila({ lecciones: [] })]);
  assert.equal(resultado[0].cursos[0].cursoCompletado, false);
});

test('Mis cursos servicio: certificado solo expone ID y folio y no determina por sí solo la finalización', async (t) => {
  const resultado = await consultar(t, [fila({
    certificado: { idCertificado: '7', folio: 'VT-2026-000007', uid: 'no-exponer', nombreCompleto: 'No exponer' }
  })]);
  assert.deepEqual(resultado[0].cursos[0].certificado, { idCertificado: '7', folio: 'VT-2026-000007' });
  assert.equal(resultado[0].cursos[0].cursoCompletado, false);
});

test('Mis cursos servicio: cerrado sin avance se omite junto con su categoría si queda vacía', async (t) => {
  assert.deepEqual(await consultar(t, [fila({ fecha_cierre: '2020-01-01' })]), []);
});

test('Mis cursos servicio: categoría con cursos ocultos y visibles solo conserva los visibles', async (t) => {
  const resultado = await consultar(t, [fila({ fecha_cierre: '2020-01-01' }), fila({ idCurso: '11' })]);
  assert.equal(resultado.length, 1);
  assert.deepEqual(resultado[0].cursos.map((curso) => curso.idCurso), ['11']);
});

test('Mis cursos servicio: cerrado con avance aparece y conserva lecciones pendientes', async (t) => {
  const resultado = await consultar(t, [fila({ fecha_cierre: '2020-01-01', tieneAvance: true })]);
  assert.equal(resultado[0].cursos[0].estadoCurso, 'cerrado');
  assert.equal(resultado[0].cursos[0].fechaCierre, '2020-01-01');
  assert.equal(resultado[0].cursos[0].lecciones[0].estado, 'pendiente');
});

test('Mis cursos servicio: el cierre cambia exactamente al terminar el día en México', async (t) => {
  const simulacion = simular(t, [fila({ fecha_cierre: '2026-11-07' })]);
  const antes = await obtenerMisCursos(ALUMNO, { ahora: AHORA });
  const despues = await obtenerMisCursos(ALUMNO, { ahora: MEDIANOCHE });
  assert.equal(antes[0].cursos[0].estadoCurso, 'disponible');
  assert.deepEqual(despues, []);
  assert.equal(simulacion.consulta.mock.callCount(), 2);
});

test('Mis cursos servicio: retirado sin historial propio no se muestra aunque haya avance operativo inconsistente', async (t) => {
  assert.deepEqual(await consultar(t, [fila({ estado_publicacion: 'retirado', tieneAvance: true })]), []);
});

for (const completadoHistorico of [true, false]) {
  test(`Mis cursos servicio: retirado obtiene finalización ${completadoHistorico} del historial y no del arreglo vacío`, async (t) => {
    const resultado = await consultar(t, [fila({
      estado_publicacion: 'retirado', tieneHistorial: true,
      completadoHistorico, lecciones: []
    })]);
    assert.equal(resultado[0].cursos[0].estadoCurso, 'retirado');
    assert.equal(resultado[0].cursos[0].cursoCompletado, completadoHistorico);
    assert.deepEqual(resultado[0].cursos[0].lecciones, []);
  });
}

test('Mis cursos servicio: retirado domina sobre cerrado y nunca expone lecciones remanentes ni historial', async (t) => {
  const resultado = await consultar(t, [fila({
    estado_publicacion: 'retirado', fecha_cierre: '2020-01-01', tieneHistorial: true,
    completadoHistorico: false, lecciones: [leccion('completada')],
    uid: 'no-exponer', historial: [{ nombre: 'No exponer' }], creado_por: 'no-exponer'
  })]);
  const curso = resultado[0].cursos[0];
  assert.equal(curso.estadoCurso, 'retirado');
  assert.equal(curso.fechaCierre, '2020-01-01');
  assert.equal(curso.cursoCompletado, false);
  assert.deepEqual(curso.lecciones, []);
  assert.equal(JSON.stringify(resultado).includes('no-exponer'), false);
  assert.equal(Object.hasOwn(curso, 'historial'), false);
});

test('Mis cursos servicio: borrador se rechaza también en la capa de reglas', async (t) => {
  assert.deepEqual(await consultar(t, [fila({ estado_publicacion: 'borrador', tieneAvance: true })]), []);
});

test('Mis cursos servicio: IDs superiores a MAX_SAFE_INTEGER permanecen como cadenas', async (t) => {
  const id = '9007199254740993';
  const resultado = await consultar(t, [fila({ idCategoria: id, idCurso: id, lecciones: [leccion('pendiente', id)] })]);
  assert.equal(resultado[0].idCategoria, id);
  assert.equal(resultado[0].cursos[0].idCurso, id);
  assert.equal(resultado[0].cursos[0].lecciones[0].idLeccion, id);
});

test('Mis cursos servicio: no expone campos adicionales de lecciones ni modifica las filas originales', async (t) => {
  const datos = [fila({ lecciones: [{ ...leccion(), uid: 'interno', recursos: ['interno'] }] })];
  const antes = structuredClone(datos);
  const resultado = await consultar(t, datos);
  assert.deepEqual(resultado[0].cursos[0].lecciones, [leccion()]);
  assert.deepEqual(datos, antes);
});

test('Mis cursos servicio: SQL usa una instantánea, parámetros propios, orden estable y no consulta pasos', async (t) => {
  const simulacion = simular(t, []);
  await obtenerMisCursos(ALUMNO, { ahora: AHORA });
  const [sql, parametros] = simulacion.consulta.mock.calls[0].arguments;
  assert.deepEqual(parametros, [ALUMNO.uid]);
  assert.match(sql, /c\.fecha_cierre::text AS fecha_cierre/);
  assert.match(sql, /avance\.uid_estudiante = \$1/);
  assert.match(sql, /h\.uid_estudiante = \$1/);
  assert.match(sql, /cert\.uid_estudiante = \$1/);
  assert.match(sql, /p\.uid_estudiante = \$1/);
  assert.match(sql, /c\.estado_publicacion IN \('publicado', 'retirado'\)/);
  assert.match(sql, /ORDER BY l\.orden, l\.id_leccion/);
  assert.match(sql, /ORDER BY ca\.orden, ca\.id_categoria, c\.orden, c\.id_curso/);
  assert.doesNotMatch(sql, /\b(?:INSERT|UPDATE|DELETE|pasos)\b|SELECT\s+\*|h\.lecciones/);
  assert.equal(sql.includes(ALUMNO.uid), false);
  assert.equal(simulacion.consulta.mock.callCount(), 1);
  assert.equal(simulacion.conexion.mock.callCount(), 0);
});

test('Mis cursos servicio: alumnos diferentes se consultan con parámetros separados', async (t) => {
  const llamadas = [];
  t.mock.method(pool, 'query', async (sql, parametros) => {
    llamadas.push(parametros);
    return { rows: [fila({ lecciones: [leccion(parametros[0] === ALUMNO.uid ? 'completada' : 'pendiente')] })] };
  });
  const primero = await obtenerMisCursos(ALUMNO, { ahora: AHORA });
  const segundo = await obtenerMisCursos({ ...ALUMNO, uid: 'otro-alumno' }, { ahora: AHORA });
  assert.deepEqual(llamadas, [[ALUMNO.uid], ['otro-alumno']]);
  assert.equal(primero[0].cursos[0].cursoCompletado, true);
  assert.equal(segundo[0].cursos[0].cursoCompletado, false);
});

for (const [usuario, codigo, estado] of [
  [null, 'perfil_no_registrado', 404],
  [{ ...ALUMNO, activo: false }, 'cuenta_desactivada', 403],
  [{ ...ALUMNO, rol: 'maestro' }, 'rol_no_autorizado', 403],
  [{ ...ALUMNO, rol: 'administrador' }, 'rol_no_autorizado', 403],
  [{ ...ALUMNO, uid: '' }, 'rol_no_autorizado', 403]
]) {
  test(`Mis cursos servicio: no consulta para solicitante inválido ${JSON.stringify(usuario)}`, async (t) => {
    const consulta = t.mock.method(pool, 'query', async () => assert.fail('No debe consultar'));
    await assert.rejects(obtenerMisCursos(usuario), (error) => {
      assert.ok(error instanceof ErrorReglaCurso);
      assert.equal(error.codigo, codigo);
      assert.equal(error.estado, estado);
      return true;
    });
    assert.equal(consulta.mock.callCount(), 0);
  });
}

test('Mis cursos servicio: propaga fallo SQL sin convertirlo en catálogo vacío', async (t) => {
  const fallo = new Error('Fallo simulado');
  simular(t, [], { error: fallo });
  await assert.rejects(obtenerMisCursos(ALUMNO), (error) => error === fallo);
});

test('Mis cursos servicio: arreglo de lecciones inválido no se presenta como progreso válido', async (t) => {
  simular(t, [fila({ lecciones: null })]);
  await assert.rejects(obtenerMisCursos(ALUMNO), TypeError);
});
