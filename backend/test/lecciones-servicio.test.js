const { test, after } = require('node:test');
const assert = require('node:assert/strict');

process.env.DATABASE_URL = 'postgresql://prueba:prueba@localhost:5432/prueba';

const pool = require('../src/config/database');
const { obtenerDetalleLeccion } = require('../src/services/lecciones');
const { ErrorReglaCurso } = require('../src/services/reglas-cursos');

const ALUMNO = { uid: 'uid-alumno-prueba', rol: 'estudiante', activo: true };
const AHORA = new Date('2026-11-09T12:00:00.000Z');
const FINALIZACION = '2026-11-08T18:30:00.000Z';

after(async () => { await pool.end(); });

function fila(cambios = {}) {
  return {
    idLeccion: '21', idCurso: '10', tituloCurso: 'Curso ficticio',
    titulo: 'Lección ficticia', objetivo: 'Practicar sin datos reales.',
    duracionEstimadaMinutos: 3, estadoPublicacion: 'publicado',
    fechaCierre: null, tieneAvance: false,
    estadoProgreso: null, idUltimoPasoCompletado: null, fechaFinalizacion: null,
    siguienteLeccion: { idLeccion: '22', titulo: 'Siguiente lección' },
    pasos: [1, 2, 3].map((orden) => ({
      idPaso: String(100 + orden), orden, instruccion: `Paso ${orden}`,
      recursos: [], actividad: orden === 2 ? {
        tipo: 'opcion', pregunta: '¿Qué datos usar?',
        opciones: [{ id: 'a', texto: 'Ficticios' }, { id: 'b', texto: 'Reales' }],
        correcta: 'a', pista: 'Usa ejemplos.', mensajeAcierto: '¡Bien!'
      } : { tipo: 'lectura' }
    })),
    ...cambios
  };
}

function simular(t, leccion = fila(), opciones = {}) {
  const consulta = t.mock.method(pool, 'query', async (sql, parametros) => {
    assert.deepEqual(parametros, [opciones.id || '21', opciones.uid || ALUMNO.uid]);
    if (opciones.error) throw opciones.error;
    return { rows: [{ leccion, leccionRetirada: opciones.retirada === true }] };
  });
  t.mock.method(pool, 'connect', async () => assert.fail('No debe abrir una transacción'));
  return consulta;
}

async function consultar(t, datos = fila(), opciones = {}) {
  const consulta = simular(t, datos, opciones);
  const resultado = await obtenerDetalleLeccion(ALUMNO, opciones.id || '21', { ahora: AHORA });
  assert.equal(consulta.mock.callCount(), 1);
  return resultado;
}

function errorEsperado(estado, codigo) {
  return (error) => error instanceof ErrorReglaCurso
    && error.estado === estado && error.codigo === codigo;
}

test('Detalle servicio: contrato directo y progreso pendiente sin escribir', async (t) => {
  const datos = fila();
  const resultado = await consultar(t, datos);
  assert.deepEqual(resultado, {
    idLeccion: '21', idCurso: '10', tituloCurso: datos.tituloCurso,
    titulo: datos.titulo, objetivo: datos.objetivo, duracionEstimadaMinutos: 3,
    progreso: {
      estado: 'pendiente', idUltimoPasoCompletado: null,
      idPasoParaContinuar: '101', pasosCompletados: 0,
      totalPasos: 3, fechaFinalizacion: null
    },
    siguienteLeccion: datos.siguienteLeccion, pasos: datos.pasos
  });
});

for (const [ultimo, siguiente, cantidad] of [[null, '101', 0], ['101', '102', 1], ['102', '103', 2]]) {
  test(`Detalle servicio: en progreso después de ${ultimo} continúa en ${siguiente}`, async (t) => {
    const resultado = await consultar(t, fila({
      tieneAvance: true, estadoProgreso: 'en_progreso', idUltimoPasoCompletado: ultimo
    }));
    assert.deepEqual(resultado.progreso, {
      estado: 'en_progreso', idUltimoPasoCompletado: ultimo,
      idPasoParaContinuar: siguiente, pasosCompletados: cantidad,
      totalPasos: 3, fechaFinalizacion: null
    });
  });
}

for (const fecha of [FINALIZACION, new Date(FINALIZACION), '2026-11-08T12:30:00-06:00']) {
  test(`Detalle servicio: completada conserva instante ${String(fecha)}`, async (t) => {
    const resultado = await consultar(t, fila({
      tieneAvance: true, estadoProgreso: 'completada',
      idUltimoPasoCompletado: '103', fechaFinalizacion: fecha
    }));
    assert.deepEqual(resultado.progreso, {
      estado: 'completada', idUltimoPasoCompletado: '103',
      idPasoParaContinuar: null, pasosCompletados: 3,
      totalPasos: 3, fechaFinalizacion: FINALIZACION
    });
  });
}

test('Detalle servicio: última lección devuelve siguiente null', async (t) => {
  assert.equal((await consultar(t, fila({ siguienteLeccion: null }))).siguienteLeccion, null);
});

test('Detalle servicio: conserva actividad formativa, correcta, pista y recursos', async (t) => {
  const datos = fila();
  datos.pasos[0].recursos = [{ tipo: 'aviso', texto: 'No uses datos reales.' }];
  const resultado = await consultar(t, datos);
  assert.deepEqual(resultado.pasos, datos.pasos);
  assert.equal(resultado.pasos[1].actividad.correcta, 'a');
  assert.equal(resultado.pasos[1].actividad.pista, 'Usa ejemplos.');
});

test('Detalle servicio: no exige tres pasos para leer una lección histórica de un paso', async (t) => {
  const datos = fila();
  const resultado = await consultar(t, fila({ pasos: [datos.pasos[0]] }));
  assert.equal(resultado.progreso.totalPasos, 1);
  assert.equal(resultado.progreso.idPasoParaContinuar, '101');
});

test('Detalle servicio: calcula cantidades por posición y no por valor del orden', async (t) => {
  const datos = fila({ tieneAvance: true, estadoProgreso: 'en_progreso', idUltimoPasoCompletado: '102' });
  datos.pasos.forEach((paso, indice) => { paso.orden = (indice + 1) * 10; });
  const resultado = await consultar(t, datos);
  assert.equal(resultado.progreso.pasosCompletados, 2);
  assert.equal(resultado.progreso.idPasoParaContinuar, '103');
});

for (const id of ['0', '-1', '01', '1.5', '1e2', ' 21', '21 ', '', 'abc', '9223372036854775808', '10000000000000000000', 21, null]) {
  test(`Detalle servicio: rechaza ID inválido ${JSON.stringify(id)} sin SQL`, async (t) => {
    const consulta = t.mock.method(pool, 'query', async () => assert.fail('No debe consultar'));
    await assert.rejects(obtenerDetalleLeccion(ALUMNO, id), errorEsperado(400, 'id_leccion_invalido'));
    assert.equal(consulta.mock.callCount(), 0);
  });
}

for (const id of ['1', '9007199254740993', '9223372036854775807']) {
  test(`Detalle servicio: acepta BIGINT ${id} como cadena`, async (t) => {
    const datos = fila({ idLeccion: id, idCurso: id });
    datos.pasos[0].idPaso = id;
    const resultado = await consultar(t, datos, { id });
    assert.equal(resultado.idLeccion, id);
    assert.equal(resultado.idCurso, id);
    assert.equal(resultado.progreso.idPasoParaContinuar, id);
  });
}

for (const [usuario, estado, codigo] of [
  [null, 404, 'perfil_no_registrado'],
  [{ ...ALUMNO, activo: false }, 403, 'cuenta_desactivada'],
  [{ ...ALUMNO, rol: 'maestro' }, 403, 'rol_no_autorizado'],
  [{ ...ALUMNO, rol: 'administrador' }, 403, 'rol_no_autorizado'],
  [{ ...ALUMNO, uid: '' }, 403, 'rol_no_autorizado'],
  [{ ...ALUMNO, uid: 'x'.repeat(129) }, 403, 'rol_no_autorizado']
]) {
  test(`Detalle servicio: rechaza solicitante ${codigo} antes de consultar`, async (t) => {
    const consulta = t.mock.method(pool, 'query', async () => assert.fail('No debe consultar'));
    await assert.rejects(obtenerDetalleLeccion(usuario, '21'), errorEsperado(estado, codigo));
    assert.equal(consulta.mock.callCount(), 0);
  });
}

for (const [datos, retirada, estado, codigo] of [
  [null, false, 404, 'leccion_no_encontrada'],
  [null, true, 404, 'curso_retirado'],
  [fila({ estadoPublicacion: 'borrador' }), false, 404, 'leccion_no_encontrada'],
  [fila({ fechaCierre: '2026-11-08' }), false, 409, 'curso_cerrado'],
  [fila({ estadoPublicacion: 'retirado' }), false, 404, 'curso_retirado'],
  [fila({ estadoPublicacion: 'retirado', fechaCierre: '2020-01-01' }), false, 404, 'curso_retirado']
]) {
  test(`Detalle servicio: aplica acceso ${estado} ${codigo}`, async (t) => {
    simular(t, datos, { retirada });
    await assert.rejects(obtenerDetalleLeccion(ALUMNO, '21', { ahora: AHORA }), errorEsperado(estado, codigo));
  });
}

test('Detalle servicio: avance en otra lección del curso permite consultar cerrado sin iniciar esta', async (t) => {
  const resultado = await consultar(t, fila({ fechaCierre: '2026-11-08', tieneAvance: true }));
  assert.equal(resultado.progreso.estado, 'pendiente');
});

test('Detalle servicio: permanece accesible durante el día de cierre en México', async (t) => {
  simular(t, fila({ fechaCierre: '2026-11-08' }));
  const resultado = await obtenerDetalleLeccion(ALUMNO, '21', { ahora: new Date('2026-11-09T05:59:59.999Z') });
  assert.equal(resultado.idLeccion, '21');
  await assert.rejects(
    obtenerDetalleLeccion(ALUMNO, '21', { ahora: new Date('2026-11-09T06:00:00.000Z') }),
    errorEsperado(409, 'curso_cerrado')
  );
});

for (const cambios of [
  { pasos: [] }, { pasos: null }, { estadoProgreso: 'desconocido' },
  { estadoProgreso: 'en_progreso', idUltimoPasoCompletado: '999' },
  { estadoProgreso: 'en_progreso', idUltimoPasoCompletado: '103' },
  { estadoProgreso: null, idUltimoPasoCompletado: '101' },
  { estadoProgreso: 'en_progreso', fechaFinalizacion: FINALIZACION },
  { estadoProgreso: 'completada', idUltimoPasoCompletado: '102', fechaFinalizacion: FINALIZACION },
  { estadoProgreso: 'completada', idUltimoPasoCompletado: '103', fechaFinalizacion: null },
  { estadoProgreso: 'completada', idUltimoPasoCompletado: '103', fechaFinalizacion: 'invalida' }
]) {
  test(`Detalle servicio: no presenta datos inconsistentes como válidos ${JSON.stringify(cambios)}`, async (t) => {
    simular(t, fila(cambios));
    await assert.rejects(obtenerDetalleLeccion(ALUMNO, '21'), TypeError);
  });
}

for (const cambios of [{ recursos: null }, { actividad: null }, { actividad: [] }]) {
  test(`Detalle servicio: detecta paso incompleto ${JSON.stringify(cambios)}`, async (t) => {
    const datos = fila();
    Object.assign(datos.pasos[0], cambios);
    simular(t, datos);
    await assert.rejects(obtenerDetalleLeccion(ALUMNO, '21'), TypeError);
  });
}

test('Detalle servicio: proyección explícita no expone autoría ni campos internos', async (t) => {
  const datos = fila({ uid: 'interno', creado_por: 'interno', historial: ['interno'] });
  datos.pasos[0].interno = 'interno';
  datos.siguienteLeccion.uid = 'interno';
  const antes = structuredClone(datos);
  const resultado = await consultar(t, datos);
  assert.equal(JSON.stringify(resultado).includes('interno'), false);
  assert.deepEqual(datos, antes);
});

test('Detalle servicio: SQL parametrizado, instantánea única, orden estable y sin escrituras', async (t) => {
  const consulta = simular(t);
  await obtenerDetalleLeccion(ALUMNO, '21');
  const [sql, parametros] = consulta.mock.calls[0].arguments;
  assert.deepEqual(parametros, ['21', ALUMNO.uid]);
  assert.match(sql, /avance\.uid_estudiante = \$2/);
  assert.match(sql, /p\.uid_estudiante = \$2/);
  assert.match(sql, /l\.id_leccion = \$1::bigint/);
  assert.match(sql, /ORDER BY paso\.orden, paso\.id_paso/);
  assert.match(sql, /ORDER BY siguiente\.orden, siguiente\.id_leccion/);
  assert.match(sql, /siguiente\.id_curso = c\.id_curso/);
  assert.match(sql, /jsonb_array_elements\(h\.lecciones\)/);
  assert.match(sql, /historica->>'idLeccion' = \$1::text/);
  assert.match(sql, /retirado\.estado_publicacion = 'retirado'/);
  assert.match(sql, /NOT EXISTS \(SELECT 1 FROM detalle\)/);
  assert.doesNotMatch(sql, /\b(?:INSERT|UPDATE|DELETE)\b|l\.estado_publicacion|siguiente\.estado_publicacion/);
  assert.equal(sql.includes(ALUMNO.uid), false);
  assert.equal(consulta.mock.callCount(), 1);
});

test('Detalle servicio: parámetros y progreso permanecen separados entre alumnos', async (t) => {
  const llamadas = [];
  t.mock.method(pool, 'query', async (sql, parametros) => {
    llamadas.push(parametros);
    return { rows: [{ leccionRetirada: false, leccion: fila(parametros[1] === ALUMNO.uid ? {
      estadoProgreso: 'en_progreso', tieneAvance: true, idUltimoPasoCompletado: '101'
    } : {}) }] };
  });
  const primero = await obtenerDetalleLeccion(ALUMNO, '21');
  const segundo = await obtenerDetalleLeccion({ ...ALUMNO, uid: 'otro-alumno' }, '21');
  assert.deepEqual(llamadas, [['21', ALUMNO.uid], ['21', 'otro-alumno']]);
  assert.equal(primero.progreso.idPasoParaContinuar, '102');
  assert.equal(segundo.progreso.idPasoParaContinuar, '101');
});

test('Detalle servicio: propaga error SQL sin devolver una lección vacía', async (t) => {
  const error = new Error('Fallo SQL simulado');
  simular(t, fila(), { error });
  await assert.rejects(obtenerDetalleLeccion(ALUMNO, '21'), (recibido) => recibido === error);
});

test('Detalle servicio: respuesta SQL ausente es fallo, no un 404 inventado', async (t) => {
  t.mock.method(pool, 'query', async () => ({ rows: [] }));
  await assert.rejects(obtenerDetalleLeccion(ALUMNO, '21'), TypeError);
});
