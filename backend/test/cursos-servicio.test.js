const { test, after } = require('node:test');
const assert = require('node:assert/strict');

process.env.DATABASE_URL = 'postgresql://prueba:prueba@localhost:5432/prueba';
const pool = require('../src/config/database');
const { crearCurso, editarCurso } = require('../src/services/cursos');
const { ErrorReglaCurso } = require('../src/services/reglas-cursos');

const MAESTRO = { uid: 'uid-maestro-prueba', rol: 'maestro', activo: true };
const ADMIN = { uid: 'uid-admin-prueba', rol: 'administrador', activo: true };
const AHORA = new Date('2026-11-12T12:00:00.000Z');
const DATOS = { idCategoria: '1', titulo: 'Curso nuevo', descripcion: 'Contenido ficticio.' };

function leccionPublicable(id = '21', orden = 1, cantidad = 3) {
  return {
    idLeccion: id, titulo: 'Lección de prueba', objetivo: 'Practicar con ejemplos.',
    duracionEstimadaMinutos: 3, orden,
    pasos: Array.from({ length: cantidad }, (_, i) => ({
      idPaso: `${id}${i + 1}`, orden: i + 1, instruccion: 'Usa datos ficticios.', recursos: [],
      actividad: i === 1 ? {
        tipo: 'opcion', pregunta: '¿Qué datos usar?',
        opciones: [{ id: 'a', texto: 'Ficticios' }, { id: 'b', texto: 'Reales' }],
        correcta: 'a', pista: 'Es una práctica.', mensajeAcierto: '¡Bien!'
      } : { tipo: 'lectura' }
    }))
  };
}

after(async () => { await pool.end(); });

function simular(t, opciones = {}) {
  const usuario = opciones.usuario || MAESTRO;
  const llamadas = [];
  let curso = {
    idCurso: '10', idCategoria: '1', titulo: 'Curso original', descripcion: 'Descripción original.',
    estado_publicacion: 'borrador', creado_por: usuario.uid, orden: 2, fecha_cierre: null,
    ...opciones.curso
  };
  let creadoAhora = false;
  const lecciones = structuredClone(opciones.lecciones || []);
  let estadosLecciones = lecciones.map(() => opciones.estadoLecciones || curso.estado_publicacion);
  const cliente = {
    async query(sql, parametros) {
      const texto = sql.trim();
      llamadas.push({ sql: texto, parametros });
      if (opciones.fallar?.test(texto)) throw opciones.error || new Error('Fallo SQL simulado');
      if (texto === 'ROLLBACK' && opciones.errorRollback) throw opciones.errorRollback;
      if (['BEGIN', 'COMMIT', 'ROLLBACK', 'SET CONSTRAINTS uq_cursos_categoria_orden IMMEDIATE'].includes(texto)) return { rows: [] };
      if (/^SELECT uid, rol, activo FROM usuarios/.test(texto)) {
        assert.match(texto, /FOR SHARE$/);
        assert.deepEqual(parametros, [usuario.uid]);
        const perfil = Object.hasOwn(opciones, 'perfil') ? opciones.perfil : usuario;
        return { rows: perfil ? [perfil] : [] };
      }
      if (/FROM categorias[\s\S]*FOR UPDATE/.test(texto)) {
        return { rows: opciones.sinCategoria ? [] : [{ idCategoria: parametros[0] }] };
      }
      if (/COALESCE\(max\(orden\)/.test(texto)) {
        assert.match(texto, /WHERE id_categoria = \$1::bigint/);
        const ultimoOrden = Object.hasOwn(opciones, 'ultimoOrden') ? opciones.ultimoOrden : parametros[0] === '2' ? 5 : 2;
        return { rows: [{ ultimoOrden }] };
      }
      if (/FROM cursos WHERE id_curso[\s\S]*FOR UPDATE/.test(texto)) {
        assert.deepEqual(parametros, [opciones.id || '10']);
        return { rows: opciones.sinCurso ? [] : [{ ...curso }] };
      }
      if (/^SELECT 1 AS permiso FROM curso_editores/.test(texto)) {
        assert.match(texto, /FOR SHARE$/);
        assert.equal(parametros[0], curso.idCurso);
        return { rows: opciones.esEditor ? [{ permiso: 1 }] : [] };
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
        return { rows: [{ tieneAvance: Object.hasOwn(opciones, 'indicadorAvance')
          ? opciones.indicadorAvance : opciones.tieneAvance === true }] };
      }
      if (/^INSERT INTO cursos/.test(texto)) {
        assert.match(texto, /'borrador'/);
        assert.equal(parametros[3], usuario.uid);
        curso = {
          idCurso: opciones.idNuevo || '11', idCategoria: parametros[0], titulo: parametros[1],
          descripcion: parametros[2], estado_publicacion: 'borrador', creado_por: parametros[3],
          orden: parametros[4], fecha_cierre: parametros[5]
        };
        creadoAhora = true;
        return { rows: opciones.sinRetorno ? [] : [{ idCurso: curso.idCurso }] };
      }
      if (/^UPDATE cursos SET/.test(texto)) {
        assert.equal(parametros[5], curso.idCurso);
        Object.assign(curso, { idCategoria: parametros[0], titulo: parametros[1], descripcion: parametros[2], orden: parametros[3], fecha_cierre: parametros[4], estado_publicacion: parametros[6] });
        return { rows: opciones.sinRetorno ? [] : [{ idCurso: curso.idCurso }] };
      }
      if (/^UPDATE lecciones SET estado_publicacion/.test(texto)) {
        assert.deepEqual(parametros, [curso.estado_publicacion, curso.idCurso]);
        assert.match(texto, /estado_publicacion <> \$1/);
        estadosLecciones = estadosLecciones.map(() => parametros[0]);
        return { rows: [], rowCount: lecciones.length };
      }
      if (/WHERE c\.id_curso = \$1::bigint/.test(texto)) {
        assert.equal(parametros.length, 2);
        assert.equal(parametros[0], curso.idCurso);
        assert.equal(typeof parametros[1], 'string');
        const detalleLecciones = creadoAhora ? [] : lecciones;
        return { rows: [{
          ...curso, estadoPublicacion: curso.estado_publicacion, fechaCierre: curso.fecha_cierre,
          creadoPor: 'Autor de Ejemplo', totalLecciones: detalleLecciones.length, esEditor: opciones.esEditor === true,
          tieneAvance: opciones.tieneAvance === true, lecciones: detalleLecciones
        }] };
      }
      assert.fail(`Consulta no prevista: ${texto}`);
    },
    release: t.mock.fn()
  };
  const conectar = t.mock.method(pool, 'connect', async () => {
    if (opciones.errorConexion) throw opciones.errorConexion;
    return cliente;
  });
  t.mock.method(pool, 'query', async () => assert.fail('El detalle debe consultar en la misma transacción'));
  return { cliente, conectar, llamadas, estadosLecciones: () => estadosLecciones };
}

const crear = (datos = DATOS, opciones = {}) => crearCurso(MAESTRO, datos, { reloj: () => AHORA, ...opciones });
const editar = (datos, opciones = {}) => editarCurso(MAESTRO, '10', datos, { reloj: () => AHORA, ...opciones });
const codigo = (estado, esperado) => (error) => error instanceof ErrorReglaCurso && error.estado === estado && error.codigo === esperado;

function cerrar(s, final = 'COMMIT') {
  assert.equal(s.llamadas[0].sql, 'BEGIN');
  assert.equal(s.llamadas.at(-1).sql, final);
  assert.equal(s.cliente.release.mock.callCount(), 1);
  if (final === 'COMMIT') {
    assert.equal(s.llamadas.at(-2).sql, 'SET CONSTRAINTS uq_cursos_categoria_orden IMMEDIATE');
    assert.ok(s.llamadas.findIndex(({ sql }) => /WHERE c\.id_curso =/.test(sql)) < s.llamadas.length - 2);
  }
}

for (const usuario of [MAESTRO, ADMIN]) {
  test(`Cursos servicio: ${usuario.rol} crea borrador con detalle en la misma transacción`, async (t) => {
    const s = simular(t, { usuario });
    const resultado = await crearCurso(usuario, DATOS, { reloj: () => AHORA });
    assert.deepEqual(resultado, {
      idCurso: '11', titulo: 'Curso nuevo', descripcion: 'Contenido ficticio.', orden: 3,
      estadoPublicacion: 'borrador', fechaCierre: null, tieneAvance: false,
      creadoPor: 'Autor de Ejemplo', puedeEditar: true,
      permisoCurso: usuario.rol === 'administrador' ? 'administrador' : 'autor', idCategoria: '1', lecciones: []
    });
    const bloqueo = s.llamadas.findIndex(({ sql }) => /FROM categorias[\s\S]*FOR UPDATE/.test(sql));
    const maximo = s.llamadas.findIndex(({ sql }) => /max\(orden\)/.test(sql));
    assert.ok(bloqueo < maximo);
    cerrar(s);
  });
}

test('Cursos servicio: trim y asignación del primer orden de una categoría sin cursos', async (t) => {
  const s = simular(t, { ultimoOrden: 0 });
  const resultado = await crear({ ...DATOS, titulo: '  Nuevo  ', descripcion: ' Ejemplos. ' });
  assert.equal(resultado.titulo, 'Nuevo');
  assert.equal(resultado.descripcion, 'Ejemplos.');
  assert.equal(resultado.orden, 1);
  cerrar(s);
});

test('Cursos servicio: textos Unicode máximos y SQL literal permanecen parametrizados', async (t) => {
  const s = simular(t);
  const titulo = '😀'.repeat(100);
  const descripcion = "O'Connor; SELECT ejemplo";
  const resultado = await crear({ ...DATOS, titulo, descripcion });
  assert.equal(resultado.titulo, titulo);
  const insercion = s.llamadas.find(({ sql }) => /^INSERT/.test(sql));
  assert.equal(insercion.sql.includes(descripcion), false);
  assert.deepEqual(insercion.parametros.slice(1, 3), [titulo, descripcion]);
  cerrar(s);
});

test('Cursos servicio: editar texto propio conserva categoría, autoría, estado y orden', async (t) => {
  const s = simular(t, { curso: { estado_publicacion: 'publicado' }, tieneAvance: true });
  const resultado = await editar({ titulo: ' Corregido ', descripcion: ' Texto corregido. ' });
  assert.equal(resultado.titulo, 'Corregido');
  assert.equal(resultado.descripcion, 'Texto corregido.');
  assert.equal(resultado.estadoPublicacion, 'publicado');
  assert.equal(resultado.idCategoria, '1');
  assert.equal(resultado.orden, 2);
  assert.equal(resultado.tieneAvance, true);
  cerrar(s);
});

test('Cursos servicio: reenvío sin cambios no escribe ni cambia orden', async (t) => {
  const s = simular(t);
  const resultado = await editar({ idCategoria: '1', titulo: 'Curso original' });
  assert.equal(resultado.orden, 2);
  assert.equal(s.llamadas.some(({ sql }) => /^UPDATE/.test(sql)), false);
  assert.equal(s.llamadas.some(({ sql }) => /FROM categorias/.test(sql)), false);
  cerrar(s);
});

test('Cursos servicio: administrador traslada publicado ajeno al final del destino', async (t) => {
  const s = simular(t, { usuario: ADMIN, curso: { creado_por: MAESTRO.uid, estado_publicacion: 'publicado' }, tieneAvance: true });
  const resultado = await editarCurso(ADMIN, '10', { idCategoria: '2', titulo: 'Corregido' }, { reloj: () => AHORA });
  assert.equal(resultado.idCategoria, '2');
  assert.equal(resultado.orden, 6);
  assert.equal(resultado.titulo, 'Corregido');
  assert.equal(resultado.estadoPublicacion, 'publicado');
  const bloqueoCurso = s.llamadas.findIndex(({ sql }) => /FROM cursos WHERE id_curso.*FOR UPDATE/s.test(sql));
  const bloqueoCategoria = s.llamadas.findIndex(({ sql }) => /FROM categorias.*FOR UPDATE/s.test(sql));
  assert.ok(bloqueoCurso < bloqueoCategoria);
  cerrar(s);
});

for (const fechaCierre of [null, '2026-11-12', '2026-12-01']) {
  test(`Cursos servicio: crear acepta fecha ${fechaCierre}`, async (t) => {
    const s = simular(t);
    assert.equal((await crear({ ...DATOS, fechaCierre })).fechaCierre, fechaCierre);
    cerrar(s);
  });
}

test('Cursos servicio: conservar fecha vencida no impide corregir texto', async (t) => {
  const s = simular(t, { curso: { fecha_cierre: '2020-01-01' } });
  const resultado = await editar({ titulo: 'Corregido' });
  assert.equal(resultado.fechaCierre, '2020-01-01');
  cerrar(s);
});

test('Cursos servicio: reenviar la misma fecha vencida conserva su valor sin reemplazarla', async (t) => {
  const s = simular(t, { curso: { fecha_cierre: '2020-01-01' } });
  const resultado = await editar({ fechaCierre: '2020-01-01', titulo: 'Corregido' });
  assert.equal(resultado.fechaCierre, '2020-01-01');
  cerrar(s);
});

test('Cursos servicio: null elimina fecha y fecha futura reemplaza el valor', async (t) => {
  const s = simular(t, { curso: { fecha_cierre: '2020-01-01' } });
  assert.equal((await editar({ fechaCierre: null })).fechaCierre, null);
  assert.equal((await editar({ fechaCierre: '2026-12-01' })).fechaCierre, '2026-12-01');
  assert.equal(s.cliente.release.mock.callCount(), 2);
});

for (const fechaCierre of ['2026-11-11', '2026-02-30', '2026-1-1', '2026-11-12T00:00:00Z', 12, false, [], undefined]) {
  test(`Cursos servicio: fecha nueva inválida ${JSON.stringify(fechaCierre)} revierte sin escribir`, async (t) => {
    const s = simular(t);
    await assert.rejects(editar({ titulo: 'No guardar parcialmente', fechaCierre }), codigo(400, 'fecha_cierre_invalida'));
    assert.equal(s.llamadas.some(({ sql }) => /^(INSERT|UPDATE)/.test(sql)), false);
    cerrar(s, 'ROLLBACK');
  });
}

test('Cursos servicio: reloj de creación se evalúa después de bloquear categoría', async (t) => {
  const s = simular(t);
  await assert.rejects(crear({ ...DATOS, fechaCierre: '2026-11-12' }, { reloj: () => {
    assert.ok(s.llamadas.some(({ sql }) => /FROM categorias.*FOR UPDATE/s.test(sql)));
    return new Date('2026-11-13T06:00:00.000Z');
  } }), codigo(400, 'fecha_cierre_invalida'));
  assert.equal(s.llamadas.some(({ sql }) => /^INSERT/.test(sql)), false);
  cerrar(s, 'ROLLBACK');
});

for (const [opciones, datos, estado, esperado] of [
  [{ sinCurso: true }, { titulo: 'Corregido' }, 404, 'curso_no_encontrado'],
  [{ curso: { creado_por: 'otro-maestro' } }, { titulo: 'Corregido' }, 403, 'curso_ajeno'],
  [{ curso: { estado_publicacion: 'retirado' } }, { titulo: 'Corregido' }, 409, 'curso_retirado'],
  [{}, { titulo: 'No guardar', idCategoria: '2' }, 403, 'rol_no_autorizado']
]) {
  test(`Cursos servicio: edición rechazada ${esperado} no escribe ningún campo`, async (t) => {
    const s = simular(t, opciones);
    await assert.rejects(editar(datos), codigo(estado, esperado));
    assert.equal(s.llamadas.some(({ sql }) => /^UPDATE/.test(sql)), false);
    cerrar(s, 'ROLLBACK');
  });
}

test('Cursos servicio: administrador tampoco edita retirado ajeno', async (t) => {
  const s = simular(t, { usuario: ADMIN, curso: { estado_publicacion: 'retirado', creado_por: MAESTRO.uid } });
  await assert.rejects(editarCurso(ADMIN, '10', { fechaCierre: null }), codigo(409, 'curso_retirado'));
  cerrar(s, 'ROLLBACK');
});

test('Cursos servicio: categoría inexistente rechaza creación', async (t) => {
  const s = simular(t, { sinCategoria: true });
  await assert.rejects(crear(), codigo(404, 'categoria_no_encontrada'));
  assert.equal(s.llamadas.some(({ sql }) => /^INSERT/.test(sql)), false);
  cerrar(s, 'ROLLBACK');
});

test('Cursos servicio: traslado a categoría inexistente no guarda el texto autorizado', async (t) => {
  const s = simular(t, { usuario: ADMIN, sinCategoria: true });
  await assert.rejects(editarCurso(ADMIN, '10', { idCategoria: '2', titulo: 'No guardar' }), codigo(404, 'categoria_no_encontrada'));
  assert.equal(s.llamadas.some(({ sql }) => /^UPDATE/.test(sql)), false);
  cerrar(s, 'ROLLBACK');
});

for (const id of ['9007199254740993', '9223372036854775807']) {
  test(`Cursos servicio: creación conserva IDs BIGINT ${id}`, async (t) => {
    const s = simular(t, { idNuevo: id });
    const resultado = await crear({ ...DATOS, idCategoria: id });
    assert.equal(resultado.idCurso, id);
    assert.equal(resultado.idCategoria, id);
    cerrar(s);
  });
}

for (const id of ['0', '-1', '01', '1.5', '1e2', ' 1', '1 ', 'abc', '9223372036854775808', 1, null]) {
  test(`Cursos servicio: IDs inválidos ${JSON.stringify(id)} no conectan`, async (t) => {
    const conectar = t.mock.method(pool, 'connect', async () => assert.fail('No debe conectar'));
    await assert.rejects(crear({ ...DATOS, idCategoria: id }), codigo(400, 'id_categoria_invalido'));
    await assert.rejects(editarCurso(MAESTRO, id, { titulo: 'Ejemplo' }), codigo(400, 'id_curso_invalido'));
    assert.equal(conectar.mock.callCount(), 0);
  });
}

for (const [datos, esperado] of [
  [null, 'cuerpo_invalido'], [[], 'cuerpo_invalido'], ['texto', 'cuerpo_invalido'],
  [{}, 'id_categoria_invalido'], [{ ...DATOS, titulo: null }, 'contenido_invalido'],
  [{ ...DATOS, titulo: 'a'.repeat(101) }, 'contenido_invalido'],
  [{ ...DATOS, descripcion: 'a'.repeat(301) }, 'contenido_invalido'],
  [{ ...DATOS, descripcion: ' ' }, 'contenido_invalido'],
  [{ ...DATOS, creado_por: 'otro-autor' }, 'campos_invalidos'],
  [{ ...DATOS, estadoPublicacion: 'publicado' }, 'campos_invalidos'],
  [{ ...DATOS, orden: 1 }, 'campos_invalidos']
]) {
  test(`Cursos servicio: creación inválida ${JSON.stringify(datos)} no conecta`, async (t) => {
    t.mock.method(pool, 'connect', async () => assert.fail('No debe conectar'));
    await assert.rejects(crear(datos), codigo(400, esperado));
  });
}

test('Cursos servicio: PATCH vacío y campos no permitidos son rechazados explícitamente', async (t) => {
  t.mock.method(pool, 'connect', async () => assert.fail('No debe conectar'));
  for (const datos of [{}, { orden: 2 }, { creado_por: 'otro' }]) {
    await assert.rejects(editar(datos), codigo(400, 'campos_invalidos'));
  }
});

test('Cursos servicio: errores de título/descripción tienen rutas seguras y no valores', async (t) => {
  t.mock.method(pool, 'connect', async () => assert.fail('No debe conectar'));
  await assert.rejects(crear({ ...DATOS, titulo: null, descripcion: '' }), (error) => {
    assert.equal(error.codigo, 'contenido_invalido');
    assert.deepEqual(error.errores.map((e) => e.ruta), ['curso.titulo', 'curso.descripcion']);
    assert.ok(error.errores.every((e) => !Object.hasOwn(e, 'valor')));
    return true;
  });
});

for (const [usuario, estado, esperado] of [
  [null, 404, 'perfil_no_registrado'], [{ ...MAESTRO, activo: false }, 403, 'cuenta_desactivada'],
  [{ ...MAESTRO, rol: 'estudiante' }, 403, 'rol_no_autorizado'],
  [{ ...MAESTRO, uid: '' }, 403, 'rol_no_autorizado']
]) {
  test(`Cursos servicio: solicitante inválido ${esperado} no conecta`, async (t) => {
    t.mock.method(pool, 'connect', async () => assert.fail('No debe conectar'));
    await assert.rejects(crearCurso(usuario, DATOS), codigo(estado, esperado));
    await assert.rejects(editarCurso(usuario, '10', { titulo: 'Ejemplo' }), codigo(estado, esperado));
  });
}

for (const [perfil, estado, esperado] of [
  [null, 404, 'perfil_no_registrado'], [{ ...MAESTRO, activo: false }, 403, 'cuenta_desactivada'],
  [{ ...MAESTRO, rol: 'estudiante' }, 403, 'rol_no_autorizado']
]) {
  test(`Cursos servicio: reconfirma perfil en transacción ${esperado}`, async (t) => {
    const s = simular(t, { perfil });
    await assert.rejects(crear(), codigo(estado, esperado));
    assert.equal(s.llamadas.some(({ sql }) => /FROM categorias/.test(sql)), false);
    cerrar(s, 'ROLLBACK');
  });
}

test('Cursos servicio: rol de administrador desactualizado no permite editar ajeno', async (t) => {
  const s = simular(t, { usuario: ADMIN, perfil: { ...ADMIN, rol: 'maestro' }, curso: { creado_por: MAESTRO.uid } });
  await assert.rejects(editarCurso(ADMIN, '10', { titulo: 'No guardar' }), codigo(403, 'curso_ajeno'));
  cerrar(s, 'ROLLBACK');
});

for (const fallar of [/^BEGIN$/, /FROM categorias/, /^INSERT INTO cursos/, /WHERE c\.id_curso =/, /^SET CONSTRAINTS/, /^COMMIT$/]) {
  test(`Cursos servicio: fallo ${fallar} revierte y libera la conexión`, async (t) => {
    const error = new Error('Fallo SQL simulado');
    const s = simular(t, { fallar, error });
    await assert.rejects(crear(), (recibido) => recibido === error);
    assert.equal(s.cliente.release.mock.callCount(), 1);
    assert.equal(s.llamadas.some(({ sql }) => sql === 'ROLLBACK'), !fallar.test('BEGIN'));
  });
}

test('Cursos servicio: fallo al leer detalle después del UPDATE emite rollback', async (t) => {
  const error = new Error('Fallo de detalle simulado');
  const s = simular(t, { fallar: /WHERE c\.id_curso =/, error });
  await assert.rejects(editar({ titulo: 'Corregido' }), (recibido) => recibido === error);
  assert.ok(s.llamadas.some(({ sql }) => /^UPDATE/.test(sql)));
  cerrar(s, 'ROLLBACK');
});

test('Cursos servicio: fallo de conexión se propaga sin consultar', async (t) => {
  const error = new Error('Sin conexión');
  simular(t, { errorConexion: error });
  await assert.rejects(crear(), (recibido) => recibido === error);
});

test('Cursos servicio: rollback fallido conserva error original y descarta conexión', async (t) => {
  const error = new Error('Fallo original');
  const rollback = new Error('Fallo rollback');
  const s = simular(t, { fallar: /^INSERT INTO cursos/, error, errorRollback: rollback });
  t.mock.method(console, 'error', () => {});
  await assert.rejects(crear(), (recibido) => recibido === error);
  assert.deepEqual(s.cliente.release.mock.calls[0].arguments, [rollback]);
});

for (const ultimoOrden of [null, -1, 2147483647]) {
  test(`Cursos servicio: orden inválido ${ultimoOrden} no inserta`, async (t) => {
    const s = simular(t, { ultimoOrden });
    await assert.rejects(crear(), TypeError);
    assert.equal(s.llamadas.some(({ sql }) => /^INSERT/.test(sql)), false);
    cerrar(s, 'ROLLBACK');
  });
}

for (const usuario of [MAESTRO, ADMIN]) {
  for (const estado of ['publicado', 'borrador']) {
    test(`Cursos publicación: ${usuario.rol} cambia a ${estado} y sincroniza lecciones`, async (t) => {
      const lecciones = [leccionPublicable()];
      const s = simular(t, { usuario, lecciones,
        curso: { estado_publicacion: estado === 'publicado' ? 'borrador' : 'publicado', creado_por: MAESTRO.uid } });
      const resultado = await editarCurso(usuario, '10', { estadoPublicacion: estado });
      assert.equal(resultado.estadoPublicacion, estado);
      assert.equal(resultado.puedeEditar, true);
      assert.deepEqual(resultado.lecciones, lecciones);
      assert.deepEqual(s.estadosLecciones(), [estado]);
      const bloqueo = s.llamadas.findIndex(({ sql }) => /FROM cursos.*FOR UPDATE/s.test(sql));
      const revision = s.llamadas.findIndex(({ sql }) => estado === 'publicado'
        ? /FROM lecciones WHERE id_curso/.test(sql) : /SELECT EXISTS.*FROM progresos/s.test(sql));
      const escritura = s.llamadas.findIndex(({ sql }) => /^UPDATE cursos SET/.test(sql));
      assert.ok(bloqueo >= 0 && revision > bloqueo && escritura > revision);
      const sincronizacion = s.llamadas.findIndex(({ sql }) => /^UPDATE lecciones SET/.test(sql));
      const detalle = s.llamadas.findIndex(({ sql }) => /WHERE c\.id_curso =/.test(sql));
      assert.ok(sincronizacion > escritura && detalle > sincronizacion);
      cerrar(s);
    });
  }
}

test('Cursos publicación: valida y guarda simultáneamente textos, fecha y traslado administrativo', async (t) => {
  const s = simular(t, { usuario: ADMIN, lecciones: [leccionPublicable()], curso: { creado_por: MAESTRO.uid, titulo: ' ' } });
  const resultado = await editarCurso(ADMIN, '10', {
    idCategoria: '2', titulo: ' Título corregido ', descripcion: ' Descripción corregida. ',
    fechaCierre: '2026-12-01', estadoPublicacion: 'publicado'
  }, { reloj: () => AHORA });
  assert.equal(resultado.idCategoria, '2');
  assert.equal(resultado.orden, 6);
  assert.equal(resultado.titulo, 'Título corregido');
  assert.equal(resultado.descripcion, 'Descripción corregida.');
  assert.equal(resultado.fechaCierre, '2026-12-01');
  assert.equal(resultado.estadoPublicacion, 'publicado');
  const categoria = s.llamadas.find(({ sql }) => /^SELECT nombre FROM categorias/.test(sql));
  assert.deepEqual(categoria.parametros, ['2']);
  assert.equal(s.llamadas.filter(({ sql }) => /^UPDATE cursos SET/.test(sql)).length, 1);
  cerrar(s);
});

test('Cursos publicación: acepta diez lecciones con ocho pasos cada una y video persistido', async (t) => {
  const lecciones = Array.from({ length: 10 }, (_, i) => leccionPublicable(String(21 + i), i + 1, 8));
  lecciones[0].pasos[0].recursos = [{ tipo: 'video', plataforma: 'youtube', idVideo: 'abcDEF12345', titulo: 'Ejemplo' }];
  const s = simular(t, { lecciones });
  const resultado = await editar({ estadoPublicacion: 'publicado' });
  assert.equal(resultado.lecciones.length, 10);
  assert.ok(resultado.lecciones.every((l) => l.pasos.length === 8));
  assert.deepEqual(s.estadosLecciones(), Array(10).fill('publicado'));
  cerrar(s);
});

const CONTENIDOS_INCOMPLETOS = [
  ['sin lecciones', () => []],
  ['once lecciones', () => Array.from({ length: 11 }, (_, i) => leccionPublicable(String(i + 21), i + 1))],
  ['sin pasos', () => [leccionPublicable('21', 1, 0)]],
  ['dos pasos', () => [leccionPublicable('21', 1, 2)]],
  ['nueve pasos', () => [leccionPublicable('21', 1, 9)]],
  ['sin práctica', () => { const l = leccionPublicable(); l.pasos.forEach((p) => { p.actividad = { tipo: 'lectura' }; }); return [l]; }],
  ['objetivo vacío', () => [{ ...leccionPublicable(), objetivo: ' ' }]],
  ['duración inválida', () => [{ ...leccionPublicable(), duracionEstimadaMinutos: 16 }]],
  ['orden de lección duplicado', () => [leccionPublicable(), leccionPublicable('22')]],
  ['pasos no consecutivos', () => { const l = leccionPublicable(); l.pasos[1].orden = 4; return [l]; }],
  ['respuesta inexistente', () => { const l = leccionPublicable(); l.pasos[1].actividad.correcta = 'z'; return [l]; }],
  ['video en práctica', () => { const l = leccionPublicable(); l.pasos[1].recursos = [{ tipo: 'video', plataforma: 'youtube', idVideo: 'abcDEF12345', titulo: 'Ejemplo' }]; return [l]; }],
  ['video con URL persistida', () => { const l = leccionPublicable(); l.pasos[0].recursos = [{ tipo: 'video', plataforma: 'youtube', url: 'https://youtu.be/abcDEF12345', titulo: 'Ejemplo' }]; return [l]; }]
];

for (const [nombre, generar] of CONTENIDOS_INCOMPLETOS) {
  test(`Cursos publicación: rechaza ${nombre} sin UPDATE parcial`, async (t) => {
    const s = simular(t, { lecciones: generar() });
    await assert.rejects(editar({ estadoPublicacion: 'publicado', titulo: 'No guardar parcialmente' }), (error) => {
      assert.ok(codigo(409, 'contenido_incompleto')(error));
      assert.ok(error.errores.length > 0);
      assert.ok(error.errores.every((e) => Object.keys(e).sort().join(',') === 'codigo,mensaje,ruta'));
      return true;
    });
    assert.equal(s.llamadas.some(({ sql }) => /^(UPDATE|INSERT|DELETE)/.test(sql)), false);
    cerrar(s, 'ROLLBACK');
  });
}

test('Cursos despublicación: cualquier avance bloquea el PATCH combinado sin cambios parciales', async (t) => {
  const s = simular(t, { usuario: ADMIN, curso: { estado_publicacion: 'publicado', creado_por: MAESTRO.uid },
    tieneAvance: true, lecciones: [leccionPublicable()] });
  await assert.rejects(editarCurso(ADMIN, '10', {
    estadoPublicacion: 'borrador', titulo: 'No guardar', idCategoria: '2', fechaCierre: null
  }), codigo(409, 'curso_con_avance'));
  assert.equal(s.llamadas.some(({ sql }) => /^(UPDATE|INSERT|DELETE)/.test(sql)), false);
  assert.deepEqual(s.estadosLecciones(), ['publicado']);
  cerrar(s, 'ROLLBACK');
});

for (const indicadorAvance of [undefined, null, 'false', 0]) {
  test(`Cursos despublicación: indicador SQL no booleano ${String(indicadorAvance)} no autoriza`, async (t) => {
    const s = simular(t, { curso: { estado_publicacion: 'publicado' }, indicadorAvance });
    await assert.rejects(editar({ estadoPublicacion: 'borrador' }), TypeError);
    assert.equal(s.llamadas.some(({ sql }) => /^UPDATE/.test(sql)), false);
    cerrar(s, 'ROLLBACK');
  });
}

for (const estado of ['borrador', 'publicado']) {
  test(`Cursos publicación: reenviar ${estado} no escribe ni revalida contenido histórico`, async (t) => {
    const s = simular(t, { curso: { estado_publicacion: estado }, tieneAvance: true,
      lecciones: [leccionPublicable('21', 1, 1)] });
    assert.equal((await editar({ estadoPublicacion: estado })).estadoPublicacion, estado);
    assert.equal(s.llamadas.some(({ sql }) => /^UPDATE/.test(sql)), false);
    assert.equal(s.llamadas.some(({ sql }) => /FROM lecciones WHERE id_curso|SELECT EXISTS.*FROM progresos/s.test(sql)), false);
    cerrar(s);
  });
}

for (const estadoPublicacion of [null, undefined, 'retirado', 'cerrado', 'PUBLICADO', ' publicado ', true, [], {}]) {
  test(`Cursos publicación: valor inválido ${JSON.stringify(estadoPublicacion)} no conecta`, async (t) => {
    const s = simular(t);
    await assert.rejects(editar({ estadoPublicacion }), (error) => {
      assert.ok(codigo(400, 'contenido_invalido')(error));
      assert.equal(error.errores[0].ruta, 'curso.estadoPublicacion');
      return true;
    });
    assert.equal(s.conectar.mock.callCount(), 0);
  });
}

for (const estadoPublicacion of ['publicado', 'borrador']) {
  for (const [opciones, estado, esperado] of [
    [{ sinCurso: true }, 404, 'curso_no_encontrado'],
    [{ curso: { creado_por: 'otro-autor' } }, 403, 'curso_ajeno'],
    [{ curso: { estado_publicacion: 'retirado' } }, 409, 'curso_retirado'],
    [{ perfil: { ...MAESTRO, activo: false } }, 403, 'cuenta_desactivada']
  ]) {
    test(`Cursos publicación: ${estadoPublicacion} respeta ${esperado}`, async (t) => {
      const s = simular(t, opciones);
      await assert.rejects(editar({ estadoPublicacion }), codigo(estado, esperado));
      assert.equal(s.llamadas.some(({ sql }) => /^UPDATE/.test(sql)), false);
      cerrar(s, 'ROLLBACK');
    });
  }
}

for (const fallar of [/FROM lecciones WHERE id_curso/, /FROM pasos p JOIN/, /^UPDATE cursos SET/,
  /^UPDATE lecciones SET/, /WHERE c\.id_curso =/, /^SET CONSTRAINTS/, /^COMMIT$/]) {
  test(`Cursos publicación: fallo ${fallar} solicita rollback y libera conexión`, async (t) => {
    const error = new Error('Fallo de publicación simulado');
    const s = simular(t, { lecciones: [leccionPublicable()], fallar, error });
    await assert.rejects(editar({ estadoPublicacion: 'publicado' }), (recibido) => recibido === error);
    cerrar(s, 'ROLLBACK');
  });
}

test('Cursos publicación: fecha combinada inválida no escribe ni publica', async (t) => {
  const s = simular(t, { lecciones: [leccionPublicable()] });
  await assert.rejects(editar({ estadoPublicacion: 'publicado', fechaCierre: '2026-02-30' }), codigo(400, 'fecha_cierre_invalida'));
  assert.equal(s.llamadas.some(({ sql }) => /^UPDATE/.test(sql)), false);
  cerrar(s, 'ROLLBACK');
});

test('Cursos publicación: maestro no combina traslado con publicación ni guarda texto parcial', async (t) => {
  const s = simular(t, { lecciones: [leccionPublicable()] });
  await assert.rejects(editar({ estadoPublicacion: 'publicado', idCategoria: '2', titulo: 'No guardar' }), codigo(403, 'rol_no_autorizado'));
  assert.equal(s.llamadas.some(({ sql }) => /^UPDATE/.test(sql)), false);
  cerrar(s, 'ROLLBACK');
});

const AJENO = { creado_por: 'otro-autor' };
const consultaPermiso = (s) => s.llamadas.filter(({ sql }) => /^SELECT 1 AS permiso FROM curso_editores/.test(sql));

test('Cursos servicio P4: maestro con permiso edita título y descripción de un curso ajeno', async (t) => {
  const s = simular(t, { curso: { ...AJENO, estado_publicacion: 'publicado' }, esEditor: true, tieneAvance: true });
  const resultado = await editar({ titulo: ' Corregido por editor ', descripcion: 'Texto del editor.' });
  assert.equal(resultado.titulo, 'Corregido por editor');
  assert.equal(resultado.descripcion, 'Texto del editor.');
  assert.equal(resultado.permisoCurso, 'editor');
  assert.equal(resultado.puedeEditar, true);
  const [permiso] = consultaPermiso(s);
  assert.deepEqual(permiso.parametros, ['10', MAESTRO.uid]);
  assert.match(permiso.sql, /FOR SHARE$/);
  const actualizacion = s.llamadas.find(({ sql }) => /^UPDATE cursos SET/.test(sql));
  assert.equal(actualizacion.parametros[0], '1');
  assert.equal(actualizacion.parametros[6], 'publicado');
  cerrar(s);
});

test('Cursos servicio P4: maestro sin permiso sigue recibiendo curso_ajeno sin escribir', async (t) => {
  const s = simular(t, { curso: AJENO, esEditor: false });
  await assert.rejects(editar({ titulo: 'Intento' }), codigo(403, 'curso_ajeno'));
  assert.equal(consultaPermiso(s).length, 1);
  assert.equal(s.llamadas.some(({ sql }) => /^UPDATE/.test(sql)), false);
  cerrar(s, 'ROLLBACK');
});

for (const [nombre, curso, datos] of [
  ['publicar', { estado_publicacion: 'borrador' }, { estadoPublicacion: 'publicado' }],
  ['despublicar', { estado_publicacion: 'publicado' }, { estadoPublicacion: 'borrador' }],
  ['trasladar', {}, { idCategoria: '2' }],
  ['cambiar fechaCierre a una fecha', {}, { fechaCierre: '2026-12-31' }],
  ['quitar fechaCierre', { fecha_cierre: '2026-12-31' }, { fechaCierre: null }],
  ['enviar fechaCierre inválida', {}, { fechaCierre: 'mañana' }],
  ['combinar texto con publicar', { estado_publicacion: 'borrador' }, { titulo: 'Nuevo', estadoPublicacion: 'publicado' }]
]) {
  test(`Cursos servicio P4: editor no puede ${nombre} (403 permiso_solo_edicion, sin escrituras)`, async (t) => {
    const s = simular(t, { curso: { ...AJENO, ...curso }, esEditor: true });
    await assert.rejects(editar(datos), codigo(403, 'permiso_solo_edicion'));
    assert.equal(s.llamadas.some(({ sql }) => /^(UPDATE|INSERT)/.test(sql)), false);
    assert.equal(s.llamadas.some(({ sql }) => /FROM categorias/.test(sql)), false);
    cerrar(s, 'ROLLBACK');
  });
}

test('Cursos servicio P4: el mensaje de permiso_solo_edicion es el del contrato', async (t) => {
  simular(t, { curso: AJENO, esEditor: true });
  await assert.rejects(editar({ estadoPublicacion: 'publicado' }), (error) => error instanceof ErrorReglaCurso
    && error.message === 'Tienes permiso para editar este curso, pero no para esta acción.');
});

test('Cursos servicio P4: editor reenvía estado, categoría y fecha sin cambios junto con texto nuevo', async (t) => {
  const s = simular(t, { curso: { ...AJENO, estado_publicacion: 'publicado', fecha_cierre: '2020-01-01' }, esEditor: true });
  const resultado = await editar({
    idCategoria: '1', estadoPublicacion: 'publicado', fechaCierre: '2020-01-01', titulo: 'Texto corregido'
  });
  assert.equal(resultado.titulo, 'Texto corregido');
  assert.equal(resultado.fechaCierre, '2020-01-01');
  assert.equal(s.llamadas.some(({ sql }) => /^UPDATE lecciones/.test(sql)), false);
  cerrar(s);
});

test('Cursos servicio P4: editor sobre curso retirado recibe 409 curso_retirado como el autor', async (t) => {
  const s = simular(t, { curso: { ...AJENO, estado_publicacion: 'retirado' }, esEditor: true });
  await assert.rejects(editar({ titulo: 'Intento' }), codigo(409, 'curso_retirado'));
  cerrar(s, 'ROLLBACK');
});

for (const [perfil, estado, esperado] of [
  [{ ...MAESTRO, rol: 'estudiante' }, 403, 'rol_no_autorizado'],
  [{ ...MAESTRO, activo: false }, 403, 'cuenta_desactivada']
]) {
  test(`Cursos servicio P4: permiso sin efecto con perfil vigente ${esperado}`, async (t) => {
    const s = simular(t, { curso: AJENO, esEditor: true, perfil });
    await assert.rejects(editar({ titulo: 'Intento' }), codigo(estado, esperado));
    assert.equal(consultaPermiso(s).length, 0);
    cerrar(s, 'ROLLBACK');
  });
}

for (const [nombre, opciones, ejecutar] of [
  ['autor', {}, () => editar({ titulo: 'Propio' })],
  ['administrador', { usuario: ADMIN, curso: AJENO }, () => editarCurso(ADMIN, '10', { titulo: 'Admin' }, { reloj: () => AHORA })]
]) {
  test(`Cursos servicio P4: ${nombre} no consulta curso_editores`, async (t) => {
    const s = simular(t, opciones);
    await ejecutar();
    assert.equal(consultaPermiso(s).length, 0);
    cerrar(s);
  });
}
