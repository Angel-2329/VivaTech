const { test, after } = require('node:test');
const assert = require('node:assert/strict');

process.env.DATABASE_URL = 'postgresql://prueba:prueba@localhost:5432/prueba';
const pool = require('../src/config/database');
const { listarContenido, obtenerContenidoCurso } = require('../src/services/contenido');
const { ErrorReglaCurso } = require('../src/services/reglas-cursos');

const MAESTRO = { uid: 'uid-maestro-prueba', rol: 'maestro', activo: true };
const ADMIN = { uid: 'uid-admin-prueba', rol: 'administrador', activo: true };

after(async () => { await pool.end(); });

function fila(cambios = {}) {
  return {
    idCategoria: '1', nombreCategoria: 'Categoría ficticia', ordenCategoria: 1,
    idCurso: '10', titulo: 'Curso ficticio', descripcion: 'Prácticas sin datos reales.',
    orden: 1, estadoPublicacion: 'borrador', fechaCierre: null,
    creado_por: MAESTRO.uid, creadoPor: 'Maestro de Ejemplo',
    totalLecciones: 1, tieneAvance: false, esEditor: false,
    lecciones: [{
      idLeccion: '21', titulo: 'Lección ficticia', objetivo: 'Practicar con ejemplos.',
      duracionEstimadaMinutos: 3, orden: 1,
      pasos: [{ idPaso: '101', orden: 1, instruccion: 'Lee el ejemplo.', recursos: [], actividad: { tipo: 'lectura' } }]
    }],
    ...cambios
  };
}

function simular(t, rows, parametros = [], uid) {
  const consulta = t.mock.method(pool, 'query', async (sql, recibidos) => {
    assert.equal(recibidos.length, parametros.length + 1);
    assert.deepEqual(recibidos.slice(0, -1), parametros);
    assert.equal(typeof recibidos.at(-1), 'string');
    if (uid !== undefined) assert.equal(recibidos.at(-1), uid);
    return { rows };
  });
  t.mock.method(pool, 'connect', async () => assert.fail('Las consultas no abren transacción'));
  return consulta;
}

function errorEsperado(estado, codigo) {
  return (error) => error instanceof ErrorReglaCurso && error.estado === estado && error.codigo === codigo;
}

test('Editor servicio: listado vacío devuelve arreglo directo', async (t) => {
  const consulta = simular(t, []);
  assert.deepEqual(await listarContenido(MAESTRO), []);
  assert.equal(consulta.mock.callCount(), 1);
});

test('Editor servicio: listado conserva categoría vacía con cursos []', async (t) => {
  simular(t, [fila({ idCurso: null })]);
  assert.deepEqual(await listarContenido(MAESTRO), [{ idCategoria: '1', nombre: 'Categoría ficticia', orden: 1, cursos: [] }]);
});

test('Editor servicio: listado proyecta contrato sin lecciones, UID ni campos adicionales', async (t) => {
  simular(t, [fila({ interno: 'no-exponer' })]);
  assert.deepEqual(await listarContenido(MAESTRO), [{
    idCategoria: '1', nombre: 'Categoría ficticia', orden: 1,
    cursos: [{
      idCurso: '10', titulo: 'Curso ficticio', descripcion: 'Prácticas sin datos reales.',
      orden: 1, estadoPublicacion: 'borrador', fechaCierre: null,
      tieneAvance: false, creadoPor: 'Maestro de Ejemplo', puedeEditar: true, permisoCurso: 'autor', totalLecciones: 1
    }]
  }]);
});

test('Editor servicio: conserva orden de categorías y cursos recibido de SQL', async (t) => {
  simular(t, [fila({ idCurso: '12' }), fila({ idCurso: '10', orden: 2 }),
    fila({ idCategoria: '2', nombreCategoria: 'Vacía', ordenCategoria: 2, idCurso: null })]);
  const resultado = await listarContenido(MAESTRO);
  assert.deepEqual(resultado.map((c) => c.idCategoria), ['1', '2']);
  assert.deepEqual(resultado[0].cursos.map((c) => c.idCurso), ['12', '10']);
  assert.deepEqual(resultado[1].cursos, []);
});

for (const usuario of [MAESTRO, ADMIN]) {
  for (const estado of ['borrador', 'publicado', 'retirado']) {
    for (const propio of [true, false]) {
      test(`Editor servicio: ${usuario.rol}, ${estado}, propio ${propio}`, async (t) => {
        simular(t, [fila({
          creado_por: propio ? usuario.uid : 'otro-autor', estadoPublicacion: estado,
          totalLecciones: estado === 'retirado' ? 0 : 1,
          tieneAvance: estado === 'retirado'
        })]);
        const curso = (await listarContenido(usuario))[0].cursos[0];
        assert.equal(curso.puedeEditar, estado !== 'retirado' && (usuario.rol === 'administrador' || propio));
        assert.equal(curso.permisoCurso, estado === 'retirado' ? null
          : usuario.rol === 'administrador' ? 'administrador' : propio ? 'autor' : null);
        assert.equal(curso.estadoPublicacion, estado);
        assert.equal(curso.totalLecciones, estado === 'retirado' ? 0 : 1);
        assert.equal(curso.tieneAvance, estado === 'retirado');
      });
    }
  }
}

test('Editor servicio: fecha vencida no oculta cursos del editor ni cambia permiso general', async (t) => {
  simular(t, [fila({ estadoPublicacion: 'publicado', fechaCierre: '2020-01-01', tieneAvance: true })]);
  const curso = (await listarContenido(MAESTRO))[0].cursos[0];
  assert.equal(curso.fechaCierre, '2020-01-01');
  assert.equal(curso.puedeEditar, true);
});

test('Editor servicio: detalle devuelve lecciones y pasos del borrador sin exigir publicación', async (t) => {
  const datos = fila();
  simular(t, [datos], ['10']);
  assert.deepEqual(await obtenerContenidoCurso(MAESTRO, '10'), {
    idCurso: '10', titulo: datos.titulo, descripcion: datos.descripcion,
    orden: 1, estadoPublicacion: 'borrador', fechaCierre: null,
    tieneAvance: false, creadoPor: 'Maestro de Ejemplo', puedeEditar: true, permisoCurso: 'autor',
    idCategoria: '1', lecciones: datos.lecciones
  });
});

test('Editor servicio: curso borrador sin lecciones es consultable', async (t) => {
  simular(t, [fila({ totalLecciones: 0, lecciones: [] })], ['10']);
  assert.deepEqual((await obtenerContenidoCurso(MAESTRO, '10')).lecciones, []);
});

test('Editor servicio: lección incompleta sin pasos y objetivo null es consultable', async (t) => {
  const datos = fila();
  datos.lecciones[0].pasos = [];
  datos.lecciones[0].objetivo = null;
  simular(t, [datos], ['10']);
  const leccion = (await obtenerContenidoCurso(MAESTRO, '10')).lecciones[0];
  assert.deepEqual(leccion.pasos, []);
  assert.equal(leccion.objetivo, null);
});

test('Editor servicio: maestro consulta curso ajeno sin curso_ajeno y sin permiso de escritura', async (t) => {
  simular(t, [fila({ creado_por: 'otro-maestro' })], ['10']);
  const resultado = await obtenerContenidoCurso(MAESTRO, '10');
  assert.equal(resultado.puedeEditar, false);
  assert.equal(resultado.permisoCurso, null);
});

for (const usuario of [MAESTRO, ADMIN]) {
  test(`Editor servicio: retirado solo resumen para ${usuario.rol}, incluso si remaneciera contenido`, async (t) => {
    simular(t, [fila({ creado_por: usuario.uid, estadoPublicacion: 'retirado', tieneAvance: true })], ['10']);
    const resultado = await obtenerContenidoCurso(usuario, '10');
    assert.equal(resultado.puedeEditar, false);
    assert.deepEqual(resultado.lecciones, []);
    assert.equal(resultado.tieneAvance, true);
  });
}

test('Editor servicio: no expone historial, UID, autoría interna ni campos extra anidados', async (t) => {
  const datos = fila({ historial: ['privado'], uid_estudiante: 'privado' });
  datos.lecciones[0].creado_por = 'privado';
  datos.lecciones[0].pasos[0].interno = 'privado';
  const antes = structuredClone(datos);
  simular(t, [datos], ['10']);
  const resultado = await obtenerContenidoCurso(MAESTRO, '10');
  assert.equal(JSON.stringify(resultado).includes('privado'), false);
  assert.equal(JSON.stringify(resultado).includes(MAESTRO.uid), false);
  assert.deepEqual(datos, antes);
});

test('Editor servicio: conserva recursos y actividad para vista previa sin transformarlos', async (t) => {
  const datos = fila();
  datos.lecciones[0].pasos[0].recursos = [{ tipo: 'aviso', texto: 'Datos ficticios.' }];
  datos.lecciones[0].pasos[0].actividad = {
    tipo: 'opcion', pregunta: '¿Qué usar?', correcta: 'a', pista: 'Ejemplos.',
    opciones: [{ id: 'a', texto: 'Datos ficticios' }, { id: 'b', texto: 'Datos reales' }], mensajeAcierto: '¡Bien!'
  };
  simular(t, [datos], ['10']);
  assert.deepEqual((await obtenerContenidoCurso(MAESTRO, '10')).lecciones[0].pasos, datos.lecciones[0].pasos);
});

for (const id of ['1', '9007199254740993', '9223372036854775807']) {
  test(`Editor servicio: BIGINT ${id} permanece como cadena`, async (t) => {
    const datos = fila({ idCurso: id, idCategoria: id });
    datos.lecciones[0].idLeccion = id;
    datos.lecciones[0].pasos[0].idPaso = id;
    simular(t, [datos], [id]);
    const resultado = await obtenerContenidoCurso(MAESTRO, id);
    assert.equal(resultado.idCurso, id);
    assert.equal(resultado.idCategoria, id);
    assert.equal(resultado.lecciones[0].idLeccion, id);
    assert.equal(resultado.lecciones[0].pasos[0].idPaso, id);
  });
}

for (const id of ['0', '-1', '01', '1.5', '1e2', '', ' 10', '10 ', 'abc', '9223372036854775808', 10, null]) {
  test(`Editor servicio: ID inválido ${JSON.stringify(id)} no consulta`, async (t) => {
    t.mock.method(pool, 'query', async () => assert.fail('No debe consultar'));
    await assert.rejects(obtenerContenidoCurso(MAESTRO, id), errorEsperado(400, 'id_curso_invalido'));
  });
}

for (const [usuario, estado, codigo] of [
  [null, 404, 'perfil_no_registrado'],
  [{ ...MAESTRO, activo: false }, 403, 'cuenta_desactivada'],
  [{ ...MAESTRO, rol: 'estudiante' }, 403, 'rol_no_autorizado'],
  [{ ...MAESTRO, uid: '' }, 403, 'rol_no_autorizado'],
  [{ ...MAESTRO, uid: 'x'.repeat(129) }, 403, 'rol_no_autorizado']
]) {
  test(`Editor servicio: solicitante inválido ${codigo} no consulta ninguna operación`, async (t) => {
    t.mock.method(pool, 'query', async () => assert.fail('No debe consultar'));
    await assert.rejects(listarContenido(usuario), errorEsperado(estado, codigo));
    await assert.rejects(obtenerContenidoCurso(usuario, '10'), errorEsperado(estado, codigo));
  });
}

test('Editor servicio: curso inexistente conserva 404', async (t) => {
  simular(t, [], ['10']);
  await assert.rejects(obtenerContenidoCurso(MAESTRO, '10'), errorEsperado(404, 'curso_no_encontrado'));
});

for (const cambios of [
  { estadoPublicacion: 'desconocido' }, { tieneAvance: 'true' }, { esEditor: 'true' }, { esEditor: null },
  { creadoPor: { uid: 'privado' } }, { totalLecciones: null }, { totalLecciones: -1 },
  { lecciones: null }
]) {
  test(`Editor servicio: detalle inconsistente no se presenta como válido ${JSON.stringify(cambios)}`, async (t) => {
    simular(t, [fila(cambios)], ['10']);
    await assert.rejects(obtenerContenidoCurso(MAESTRO, '10'), TypeError);
  });
}

test('Editor servicio: lista exige metadatos coherentes para un curso real', async (t) => {
  simular(t, [fila({ tieneAvance: null })]);
  await assert.rejects(listarContenido(MAESTRO), TypeError);
});

test('Editor servicio: detalle exige pasos como arreglo pero permite vacío', async (t) => {
  const datos = fila();
  datos.lecciones[0].pasos = null;
  simular(t, [datos], ['10']);
  await assert.rejects(obtenerContenidoCurso(MAESTRO, '10'), TypeError);
});

for (const operacion of ['listado', 'detalle']) {
  test(`Editor servicio: SQL ${operacion} no escribe ni expone expedientes`, async (t) => {
    const consulta = simular(t, [fila()], operacion === 'detalle' ? ['10'] : []);
    if (operacion === 'detalle') await obtenerContenidoCurso(MAESTRO, '10');
    else await listarContenido(MAESTRO);
    const [sql] = consulta.mock.calls[0].arguments;
    assert.equal(consulta.mock.callCount(), 1);
    assert.match(sql, /historial_cursos_retirados/);
    assert.match(sql, /count\(\*\)::integer/);
    assert.doesNotMatch(sql, /\b(?:INSERT|UPDATE|DELETE)\b|uid_estudiante|h\.lecciones|c\.creado_por\s*=\s*\$/);
    if (operacion === 'listado') {
      assert.match(sql, /LEFT JOIN cursos/);
      assert.match(sql, /ORDER BY ca\.orden, ca\.id_categoria, c\.orden, c\.id_curso/);
      assert.doesNotMatch(sql, /\bpasos\b/);
    } else {
      assert.match(sql, /c\.id_curso = \$1::bigint/);
      assert.match(sql, /c\.estado_publicacion <> 'retirado'/);
      assert.match(sql, /ORDER BY l\.orden, l\.id_leccion/);
      assert.match(sql, /ORDER BY paso\.orden, paso\.id_paso/);
    }
  });
}

test('Editor servicio: fallo SQL no se convierte en catálogo vacío o curso inexistente', async (t) => {
  const error = new Error('Fallo SQL simulado');
  t.mock.method(pool, 'query', async () => { throw error; });
  await assert.rejects(listarContenido(MAESTRO), (recibido) => recibido === error);
  await assert.rejects(obtenerContenidoCurso(MAESTRO, '10'), (recibido) => recibido === error);
});

for (const estado of ['borrador', 'publicado']) {
  test(`Editor servicio P4: maestro con permiso en curso ajeno ${estado} recibe editor y puedeEditar`, async (t) => {
    simular(t, [fila({ creado_por: 'otro-autor', estadoPublicacion: estado, esEditor: true })], ['10'], MAESTRO.uid);
    const resultado = await obtenerContenidoCurso(MAESTRO, '10');
    assert.equal(resultado.puedeEditar, true);
    assert.equal(resultado.permisoCurso, 'editor');
  });
}

test('Editor servicio P4: listado marca editor por curso y pasa el uid del solicitante como $1', async (t) => {
  const consulta = simular(t, [
    fila({ idCurso: '10', creado_por: 'otro-autor', esEditor: true }),
    fila({ idCurso: '11', creado_por: 'otro-autor', esEditor: false }),
    fila({ idCurso: '12', creado_por: MAESTRO.uid, esEditor: false })
  ], [], MAESTRO.uid);
  const cursos = (await listarContenido(MAESTRO))[0].cursos;
  assert.deepEqual(cursos.map((c) => [c.idCurso, c.permisoCurso, c.puedeEditar]),
    [['10', 'editor', true], ['11', null, false], ['12', 'autor', true]]);
  const [sql] = consulta.mock.calls[0].arguments;
  assert.match(sql, /FROM curso_editores ce\s+WHERE ce\.id_curso = c\.id_curso AND ce\.uid_maestro = \$1\s/);
});

test('Editor servicio P4: detalle usa $2 para el uid y $1 para el curso', async (t) => {
  const consulta = simular(t, [fila()], ['10'], MAESTRO.uid);
  await obtenerContenidoCurso(MAESTRO, '10');
  const [sql] = consulta.mock.calls[0].arguments;
  assert.match(sql, /ce\.uid_maestro = \$2\s/);
  assert.match(sql, /c\.id_curso = \$1::bigint/);
});

test('Editor servicio P4: curso retirado con permiso no da editor ni puedeEditar', async (t) => {
  simular(t, [fila({ creado_por: 'otro-autor', estadoPublicacion: 'retirado', tieneAvance: true, esEditor: true })], ['10']);
  const resultado = await obtenerContenidoCurso(MAESTRO, '10');
  assert.equal(resultado.permisoCurso, null);
  assert.equal(resultado.puedeEditar, false);
});

test('Editor servicio P4: administrador y autor conservan su permiso aunque exista fila de editor', async (t) => {
  simular(t, [fila({ creado_por: 'otro-autor', esEditor: true })], ['10']);
  assert.equal((await obtenerContenidoCurso(ADMIN, '10')).permisoCurso, 'administrador');
  t.mock.restoreAll();
  simular(t, [fila({ creado_por: MAESTRO.uid, esEditor: true })], ['10']);
  assert.equal((await obtenerContenidoCurso(MAESTRO, '10')).permisoCurso, 'autor');
});
