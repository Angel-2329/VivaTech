const { test, after } = require('node:test');
const assert = require('node:assert/strict');
process.env.DATABASE_URL = 'postgresql://prueba:prueba@localhost:5432/prueba';
const pool = require('../src/config/database');
const servicio = require('../src/services/editor-lecciones-pasos');
const { ErrorReglaCurso } = require('../src/services/reglas-cursos');

const MAESTRO = { uid: 'uid-maestro-prueba', rol: 'maestro', activo: true };
const ADMIN = { uid: 'uid-admin-prueba', rol: 'administrador', activo: true };
const META = { titulo: 'Lección nueva', objetivo: 'Practicar.', duracionEstimadaMinutos: 3 };
const LECTURA = { instruccion: 'Lee el ejemplo.', recursos: [], actividad: { tipo: 'lectura' } };
const OPCION = { tipo: 'opcion', pregunta: '¿Qué eliges?', opciones: [{ id: 'a', texto: 'Primera' }, { id: 'b', texto: 'Segunda' }],
  correcta: 'a', pista: 'Usa el ejemplo.', mensajeAcierto: '¡Bien!' };
after(async () => { await pool.end(); });

function simular(t, opciones = {}) {
  const usuario = opciones.usuario || MAESTRO;
  let lecciones = structuredClone(opciones.lecciones || [
    { idLeccion: '21', idCurso: '10', titulo: 'Primera', objetivo: 'Practicar.', duracionEstimadaMinutos: 3, orden: 1 },
    { idLeccion: '22', idCurso: '10', titulo: 'Segunda', objetivo: 'Practicar.', duracionEstimadaMinutos: 3, orden: 2 }
  ]);
  let pasos = structuredClone(opciones.pasos || [
    { idPaso: '101', idLeccion: '21', orden: 1, ...LECTURA },
    { idPaso: '102', idLeccion: '21', orden: 2, ...LECTURA, actividad: OPCION },
    { idPaso: '103', idLeccion: '21', orden: 3, ...LECTURA }
  ]);
  const llamadas = [];
  const cliente = {
    async query(sql, parametros) {
      const q = sql.trim();
      llamadas.push({ sql: q, parametros });
      if (opciones.fallar?.test(q)) throw opciones.error || new Error('Fallo SQL simulado');
      if (q === 'ROLLBACK' && opciones.errorRollback) throw opciones.errorRollback;
       if (q === 'BEGIN' || q === 'COMMIT' || q === 'ROLLBACK' || q.startsWith('SET CONSTRAINTS')) return { rows: [] };
       if (opciones.responder && opciones.responder.test(q)) return { rows: opciones.filasRespuesta || [] };
      if (/^SELECT uid, rol, activo/.test(q)) {
        assert.deepEqual(parametros, [usuario.uid]);
        const perfil = Object.hasOwn(opciones, 'perfil') ? opciones.perfil : usuario;
        return { rows: perfil ? [perfil] : [] };
      }
      if (/^SELECT 1 AS permiso FROM curso_editores/.test(q)) {
        assert.match(q, /FOR SHARE$/);
        return { rows: opciones.esEditor ? [{ permiso: 1 }] : [] };
      }
      if (/jsonb_array_elements/.test(q)) return { rows: opciones.historica ? [{ idCurso: '10' }] : [] };
      if (/FROM cursos WHERE id_curso.*FOR UPDATE/s.test(q)) return { rows: opciones.sinCurso ? [] : [{
        idCurso: '10', creado_por: opciones.autor || usuario.uid, estado_publicacion: opciones.estado || 'borrador'
      }] };
      if (/FROM progresos/.test(q)) return { rows: [{ tieneAvance: opciones.avance ?? false }] };
      if (/FROM pasos p JOIN lecciones/.test(q)) {
        const paso = pasos.find((p) => p.idPaso === parametros[0]);
        const leccion = lecciones.find((l) => l.idLeccion === paso?.idLeccion);
        return { rows: leccion ? [{ idCurso: leccion.idCurso, idLeccion: leccion.idLeccion }] : [] };
      }
      if (/AS total,/.test(q)) {
        const filas = q.includes('FROM lecciones') ? lecciones.filter((l) => l.idCurso === parametros[0]) : pasos.filter((p) => p.idLeccion === parametros[0]);
        return { rows: [opciones.contador || { total: filas.length, ultimo: Math.max(0, ...filas.map((f) => f.orden)) }] };
      }
      if (/^INSERT INTO lecciones/.test(q)) {
        assert.equal(parametros[5], usuario.uid);
        const fila = { idLeccion: '23', idCurso: parametros[0], titulo: parametros[1], objetivo: parametros[2], duracionEstimadaMinutos: parametros[3], orden: parametros[6] };
        lecciones.push(fila);
        return { rows: [{ idLeccion: fila.idLeccion }] };
      }
      if (/^INSERT INTO pasos/.test(q)) {
        const fila = { idPaso: '104', idLeccion: parametros[0], orden: parametros[1], instruccion: parametros[2], recursos: JSON.parse(parametros[3]), actividad: JSON.parse(parametros[4]) };
        pasos.push(fila);
        return { rows: [{ idPaso: fila.idPaso }] };
      }
      if (/^UPDATE lecciones SET/.test(q)) {
        const fila = lecciones.find((l) => l.idLeccion === parametros[3] && l.idCurso === parametros[4]);
        if (!fila) return { rows: [] };
        Object.assign(fila, { titulo: parametros[0], objetivo: parametros[1], duracionEstimadaMinutos: parametros[2] });
        return { rows: [{ idLeccion: fila.idLeccion }] };
      }
      if (/^UPDATE pasos SET/.test(q)) {
        const fila = pasos.find((p) => p.idPaso === parametros[3] && p.idLeccion === parametros[4]);
        if (!fila) return { rows: [] };
        Object.assign(fila, { instruccion: parametros[0], recursos: JSON.parse(parametros[1]), actividad: JSON.parse(parametros[2]) });
        return { rows: [{ idPaso: fila.idPaso }] };
      }
      if (/^DELETE FROM pasos WHERE id_leccion/.test(q)) {
        pasos = pasos.filter((p) => p.idLeccion !== parametros[0]);
        return { rows: [] };
      }
      if (/^DELETE FROM (lecciones|pasos)/.test(q)) {
        const esLeccion = q.startsWith('DELETE FROM lecciones');
        const clave = esLeccion ? 'idLeccion' : 'idPaso';
        const filas = esLeccion ? lecciones : pasos;
        const borradas = filas.filter((f) => f[clave] === parametros[0]);
        if (esLeccion) lecciones = filas.filter((f) => f[clave] !== parametros[0]);
        else pasos = filas.filter((f) => f[clave] !== parametros[0]);
        return { rows: borradas.map((f) => ({ [clave]: f[clave] })) };
      }
      if (/^UPDATE (lecciones|pasos) AS elemento/.test(q)) {
        const esLeccion = q.startsWith('UPDATE lecciones');
        const clave = esLeccion ? 'idLeccion' : 'idPaso';
        const padre = esLeccion ? 'idCurso' : 'idLeccion';
        const filas = esLeccion ? lecciones : pasos;
        if (/unnest/.test(q)) parametros[0].forEach((id, indice) => { filas.find((f) => f[clave] === id && f[padre] === parametros[1]).orden = indice + 1; });
        else filas.filter((f) => f[padre] === parametros[0]).sort((a, b) => a.orden - b.orden).forEach((f, indice) => { f.orden = indice + 1; });
        return { rows: [] };
      }
      if (/FROM lecciones WHERE id_leccion/.test(q)) return { rows: lecciones.filter((l) => l.idLeccion === parametros[0] && (parametros.length < 2 || l.idCurso === parametros[1])) };
      if (/FROM pasos WHERE id_paso/.test(q)) return { rows: pasos.filter((p) => p.idPaso === parametros[0] && (parametros.length < 2 || p.idLeccion === parametros[1])) };
      if (/FROM (lecciones|pasos)\s+WHERE/.test(q)) {
        const esLeccion = /FROM lecciones/.test(q);
        const clave = esLeccion ? 'idLeccion' : 'idPaso';
        const padre = esLeccion ? 'idCurso' : 'idLeccion';
        const filas = (esLeccion ? lecciones : pasos).filter((f) => f[padre] === parametros[0]).sort((a, b) => a.orden - b.orden);
        return { rows: /AS id\b/.test(q) ? filas.map((f) => ({ id: f[clave] })) : filas };
      }
      assert.fail(`Consulta no prevista: ${q}`);
    },
    release: t.mock.fn()
  };
  const conectar = t.mock.method(pool, 'connect', async () => { if (opciones.errorConexion) throw opciones.errorConexion; return cliente; });
  t.mock.method(pool, 'query', async () => assert.fail('Toda escritura/lectura debe usar su transacción'));
  return { llamadas, cliente, conectar, lecciones: () => lecciones, pasos: () => pasos };
}

const codigo = (estado, esperado) => (error) => error instanceof ErrorReglaCurso && error.estado === estado && error.codigo === esperado;
function cerrar(s, final = 'COMMIT') {
  assert.equal(s.llamadas[0].sql, 'BEGIN');
  assert.equal(s.llamadas.at(-1).sql, final);
  assert.equal(s.cliente.release.mock.callCount(), 1);
}

test('Editor escritura: crear lección devuelve recurso sin pasos y autoría del servidor', async (t) => {
  const s = simular(t);
  assert.deepEqual(await servicio.crearLeccion(MAESTRO, '10', META), { idLeccion: '23', ...META, orden: 3, pasos: [] });
  cerrar(s);
});

test('Editor escritura: crear paso normaliza video sin conservar URL', async (t) => {
  const s = simular(t);
  const resultado = await servicio.crearPaso(MAESTRO, '21', { ...LECTURA, recursos: [{ tipo: 'video', plataforma: 'youtube', url: 'https://youtu.be/abcDEF12345', titulo: ' Ejemplo ' }] });
  assert.equal(resultado.orden, 4);
  assert.deepEqual(resultado.recursos, [{ tipo: 'video', plataforma: 'youtube', idVideo: 'abcDEF12345', titulo: 'Ejemplo' }]);
  cerrar(s);
});

test('Editor escritura: elimina lección y sus pasos sin CASCADE, renumera restantes', async (t) => {
  const s = simular(t);
  await servicio.eliminarLeccion(MAESTRO, '21');
  assert.deepEqual(s.lecciones().map((l) => [l.idLeccion, l.orden]), [['22', 1]]);
  assert.equal(s.pasos().length, 0);
  assert.ok(s.llamadas.every(({ sql }) => !/CASCADE/.test(sql)));
  cerrar(s);
});

test('Editor escritura: elimina paso y renumera sin borrar progreso o historial', async (t) => {
  const s = simular(t);
  await servicio.eliminarPaso(MAESTRO, '102');
  assert.deepEqual(s.pasos().map((p) => [p.idPaso, p.orden]), [['101', 1], ['103', 2]]);
  assert.equal(s.llamadas.some(({ sql }) => /DELETE FROM (progresos|historial)/.test(sql)), false);
  cerrar(s);
});

for (const [metodo, id, datos, esperado] of [
  ['reordenarLecciones', '10', { idsLecciones: ['22', '21'] }, [{ idLeccion: '22', orden: 1 }, { idLeccion: '21', orden: 2 }]],
  ['reordenarPasos', '21', { idsPasos: ['103', '101', '102'] }, [{ idPaso: '103', orden: 1 }, { idPaso: '101', orden: 2 }, { idPaso: '102', orden: 3 }]]
]) {
  test(`Editor escritura: ${metodo} usa lista completa y devuelve ID/orden`, async (t) => {
    const s = simular(t);
    assert.deepEqual(await servicio[metodo](MAESTRO, id, datos), esperado);
    cerrar(s);
  });
}

const OPERACIONES = [
  ['crearLeccion', 'curso', '10', META], ['editarLeccion', 'leccion', '21', { titulo: 'Corregido' }],
  ['eliminarLeccion', 'leccion', '21'], ['reordenarLecciones', 'curso', '10', { idsLecciones: ['22', '21'] }],
  ['crearPaso', 'leccion', '21', LECTURA], ['editarPaso', 'paso', '101', { instruccion: 'Corregida.' }],
  ['eliminarPaso', 'paso', '101'], ['reordenarPasos', 'leccion', '21', { idsPasos: ['103', '101', '102'] }]
];

for (const [estado, avance, esperado] of [['publicado', false, 'curso_publicado'], ['borrador', true, 'curso_con_avance']]) {
  for (const [metodo, , id, datos] of OPERACIONES.filter(([nombre]) => !['editarLeccion', 'editarPaso'].includes(nombre))) {
    test(`Editor escritura: ${metodo} bloqueado en ${estado}, avance ${avance}`, async (t) => {
      const s = simular(t, { estado, avance });
      await assert.rejects(servicio[metodo](MAESTRO, id, datos), codigo(409, esperado));
      assert.equal(s.llamadas.some(({ sql }) => /^(INSERT|UPDATE|DELETE)/.test(sql)), false);
      cerrar(s, 'ROLLBACK');
    });
  }
  test(`Editor escritura: textos y duración sin cambios en ${estado}, avance ${avance}`, async (t) => {
    const s = simular(t, { estado, avance });
    const resultado = await servicio.editarLeccion(MAESTRO, '21', { titulo: ' Corregida ', objetivo: ' Objetivo corregido. ', duracionEstimadaMinutos: 3 });
    assert.equal(resultado.titulo, 'Corregida');
    assert.equal(resultado.duracionEstimadaMinutos, 3);
    cerrar(s);
  });
  test(`Editor escritura: duración realmente cambiada bloqueada en ${estado}`, async (t) => {
    const s = simular(t, { estado, avance });
    await assert.rejects(servicio.editarLeccion(MAESTRO, '21', { titulo: 'No guardar', duracionEstimadaMinutos: 4 }), codigo(409, esperado));
    assert.equal(s.llamadas.some(({ sql }) => /^UPDATE/.test(sql)), false);
    cerrar(s, 'ROLLBACK');
  });
}

test('Editor escritura: corrige textos de opción publicada sin cambiar IDs/correcta', async (t) => {
  const s = simular(t, { estado: 'publicado', avance: true });
  const actividad = structuredClone(OPCION);
  actividad.pregunta = ' Pregunta corregida ';
  actividad.opciones[0].texto = ' Texto corregido ';
  const antes = structuredClone(actividad);
  const resultado = await servicio.editarPaso(MAESTRO, '102', { actividad });
  assert.equal(resultado.actividad.pregunta, 'Pregunta corregida');
  assert.equal(resultado.actividad.opciones[0].texto, 'Texto corregido');
  assert.equal(resultado.actividad.correcta, 'a');
  assert.deepEqual(actividad, antes);
  cerrar(s);
});

for (const cambio of [
  { correcta: 'b' },
  { opciones: [...OPCION.opciones].reverse() },
  { opciones: [...OPCION.opciones, { id: 'c', texto: 'Tercera' }] },
  { opciones: [{ id: 'z', texto: 'Primera' }, OPCION.opciones[1]], correcta: 'z' }
]) {
  test(`Editor escritura: estructura de actividad publicada bloqueada ${JSON.stringify(cambio)}`, async (t) => {
    const s = simular(t, { estado: 'publicado' });
    await assert.rejects(servicio.editarPaso(MAESTRO, '102', { actividad: { ...structuredClone(OPCION), ...cambio } }), codigo(409, 'curso_publicado'));
    cerrar(s, 'ROLLBACK');
  });
}

for (const [anterior, nuevo, permitido] of [
  [[{ tipo: 'icono', nombre: 'lock', alt: 'Candado' }], [{ tipo: 'icono', nombre: 'lock', alt: 'Texto alternativo corregido' }], true],
  [[{ tipo: 'icono', nombre: 'lock', alt: 'Candado' }], [{ tipo: 'icono', nombre: 'smartphone', alt: 'Celular' }], false],
  [[{ tipo: 'lista', elementos: ['Uno', 'Dos'] }], [{ tipo: 'lista', elementos: ['Primero corregido', 'Segundo corregido'] }], true],
  [[{ tipo: 'lista', elementos: ['Uno', 'Dos'] }], [{ tipo: 'lista', elementos: ['Uno', 'Dos', 'Tres'] }], false],
  [[{ tipo: 'video', plataforma: 'youtube', idVideo: 'abcDEF12345', titulo: 'Antes' }], [{ tipo: 'video', plataforma: 'youtube', idVideo: 'abcDEF12345', titulo: 'Corregido' }], true],
  [[{ tipo: 'video', plataforma: 'youtube', idVideo: 'abcDEF12345', titulo: 'Antes' }], [{ tipo: 'video', plataforma: 'youtube', idVideo: 'xyzDEF12345', titulo: 'Otro' }], false],
  [[], [{ tipo: 'aviso', texto: 'Nuevo recurso' }], false]
]) {
  test(`Editor escritura: recurso publicado, corrección permitida ${permitido}: ${JSON.stringify(nuevo)}`, async (t) => {
    const s = simular(t, { estado: 'publicado', pasos: [{ idPaso: '101', idLeccion: '21', orden: 1, ...LECTURA, recursos: anterior }] });
    if (permitido) {
      assert.deepEqual((await servicio.editarPaso(MAESTRO, '101', { recursos: nuevo })).recursos, nuevo);
      cerrar(s);
    } else {
      await assert.rejects(servicio.editarPaso(MAESTRO, '101', { recursos: nuevo }), codigo(409, 'curso_publicado'));
      cerrar(s, 'ROLLBACK');
    }
  });
}

test('Editor escritura: editar sin cambios no hace UPDATE', async (t) => {
  const s = simular(t, { estado: 'publicado' });
  await servicio.editarPaso(MAESTRO, '101', { instruccion: LECTURA.instruccion });
  assert.equal(s.llamadas.some(({ sql }) => /^UPDATE/.test(sql)), false);
  cerrar(s);
});

for (const [metodo, id, datos, contador, esperado] of [
  ['crearLeccion', '10', META, { total: 10, ultimo: 10 }, 'limite_lecciones'],
  ['crearPaso', '21', LECTURA, { total: 8, ultimo: 8 }, 'limite_pasos']
]) {
  test(`Editor escritura: ${esperado} antes de insertar`, async (t) => {
    const s = simular(t, { contador });
    await assert.rejects(servicio[metodo](MAESTRO, id, datos), codigo(409, esperado));
    assert.equal(s.llamadas.some(({ sql }) => /^INSERT/.test(sql)), false);
    cerrar(s, 'ROLLBACK');
  });
}

for (const [metodo, id, datos] of [
  ['reordenarLecciones', '10', { idsLecciones: ['21'] }],
  ['reordenarLecciones', '10', { idsLecciones: ['21', '99'] }],
  ['reordenarPasos', '21', { idsPasos: ['101', '102'] }]
]) {
  test(`Editor escritura: ${metodo} rechaza omisiones/ajenos`, async (t) => {
    const s = simular(t);
    await assert.rejects(servicio[metodo](MAESTRO, id, datos), codigo(400, 'orden_invalido'));
    assert.equal(s.llamadas.some(({ sql }) => /^UPDATE/.test(sql)), false);
    cerrar(s, 'ROLLBACK');
  });
}

for (const [metodo, tipo, id, datos] of OPERACIONES) {
  for (const [usuario, estado, esperado] of [
    [null, 404, 'perfil_no_registrado'],
    [{ ...MAESTRO, activo: false }, 403, 'cuenta_desactivada'],
    [{ ...MAESTRO, rol: 'estudiante' }, 403, 'rol_no_autorizado'],
    [{ ...MAESTRO, uid: ' ' }, 403, 'rol_no_autorizado'],
    [{ ...MAESTRO, uid: 'u'.repeat(129) }, 403, 'rol_no_autorizado']
  ]) {
    test(`Editor permisos: ${metodo} rechaza solicitante ${JSON.stringify(usuario)}`, async (t) => {
      const s = simular(t);
      await assert.rejects(servicio[metodo](usuario, id, datos), codigo(estado, esperado));
      assert.equal(s.conectar.mock.callCount(), 0);
    });
  }

  for (const [perfil, estado, esperado] of [
    [null, 404, 'perfil_no_registrado'],
    [{ ...MAESTRO, activo: false }, 403, 'cuenta_desactivada'],
    [{ ...MAESTRO, rol: 'estudiante' }, 403, 'rol_no_autorizado']
  ]) {
    test(`Editor permisos: ${metodo} reconfirma perfil ${esperado}`, async (t) => {
      const s = simular(t, { perfil });
      await assert.rejects(servicio[metodo](MAESTRO, id, datos), codigo(estado, esperado));
      assert.equal(s.llamadas.some(({ sql }) => /^(INSERT|UPDATE|DELETE)/.test(sql)), false);
      cerrar(s, 'ROLLBACK');
    });
  }

  test(`Editor permisos: ${metodo} usa rol vigente y no el administrador anterior`, async (t) => {
    const s = simular(t, { usuario: ADMIN, perfil: { ...ADMIN, rol: 'maestro' }, autor: 'otro-autor' });
    await assert.rejects(servicio[metodo](ADMIN, id, datos), codigo(403, 'curso_ajeno'));
    cerrar(s, 'ROLLBACK');
  });

  test(`Editor permisos: ${metodo} administrador modifica curso ajeno`, async (t) => {
    const s = simular(t, { usuario: ADMIN, autor: 'otro-autor' });
    await servicio[metodo](ADMIN, id, datos);
    cerrar(s);
  });

  for (const [opciones, estado, esperado] of [
    [{ autor: 'otro-autor' }, 403, 'curso_ajeno'],
    [{ estado: 'retirado' }, 409, 'curso_retirado'],
    [{ sinCurso: true }, 404, 'curso_no_encontrado']
  ]) {
    test(`Editor permisos: ${metodo} rechaza ${esperado} antes de escribir`, async (t) => {
      const s = simular(t, opciones);
      await assert.rejects(servicio[metodo](MAESTRO, id, datos), codigo(estado, esperado));
      assert.equal(s.llamadas.some(({ sql }) => /^(INSERT|UPDATE|DELETE)/.test(sql)), false);
      cerrar(s, 'ROLLBACK');
    });
  }

  for (const invalido of [undefined, null, 1, '', '0', '01', '-1', '1.5', ' 1', '9223372036854775808']) {
    test(`Editor validación: ${metodo} rechaza ID ${JSON.stringify(invalido)}`, async (t) => {
      const s = simular(t);
      await assert.rejects(servicio[metodo](MAESTRO, invalido, datos), codigo(400, `id_${tipo}_invalido`));
      assert.equal(s.conectar.mock.callCount(), 0);
    });
  }

  test(`Editor transacción: ${metodo} propaga fallo al conectar sin consultas`, async (t) => {
    const error = new Error('Conexión simulada no disponible');
    const s = simular(t, { errorConexion: error });
    await assert.rejects(servicio[metodo](MAESTRO, id, datos), (recibido) => recibido === error);
    assert.equal(s.llamadas.length, 0);
    assert.equal(s.cliente.release.mock.callCount(), 0);
  });

  for (const fallar of [/^BEGIN$/, /^SELECT uid, rol, activo/, /^SET CONSTRAINTS/, /^COMMIT$/]) {
    test(`Editor transacción: ${metodo} fallo en ${fallar}`, async (t) => {
      const error = new Error('Fallo SQL simulado');
      const s = simular(t, { fallar, error });
      await assert.rejects(servicio[metodo](MAESTRO, id, datos), (recibido) => recibido === error);
      if (fallar.test('BEGIN')) {
        assert.deepEqual(s.llamadas.map(({ sql }) => sql), ['BEGIN']);
        assert.deepEqual(s.cliente.release.mock.calls[0].arguments, [error]);
      } else {
        cerrar(s, 'ROLLBACK');
        assert.deepEqual(s.cliente.release.mock.calls[0].arguments, []);
      }
      assert.equal(s.cliente.release.mock.callCount(), 1);
    });
  }
}

for (const [metodo, , id, datos] of OPERACIONES.filter(([nombre]) => !nombre.startsWith('eliminar'))) {
  for (const cuerpo of [null, [], 'texto', 1]) {
    test(`Editor cuerpo: ${metodo} rechaza ${JSON.stringify(cuerpo)}`, async (t) => {
      const s = simular(t);
      await assert.rejects(servicio[metodo](MAESTRO, id, cuerpo), codigo(400, 'cuerpo_invalido'));
      assert.equal(s.conectar.mock.callCount(), 0);
    });
  }
  for (const campo of ['uid', 'rol', 'creado_por', 'orden', 'estadoPublicacion']) {
    test(`Editor cuerpo: ${metodo} rechaza campo ${campo}`, async (t) => {
      const s = simular(t);
      await assert.rejects(servicio[metodo](MAESTRO, id, { ...datos, [campo]: 'ajeno' }), codigo(400, 'campos_invalidos'));
      assert.equal(s.conectar.mock.callCount(), 0);
    });
  }
}

for (const [metodo, id] of [['editarLeccion', '21'], ['editarPaso', '101']]) {
  test(`Editor cuerpo: ${metodo} rechaza parche vacío`, async (t) => {
    const s = simular(t);
    await assert.rejects(servicio[metodo](MAESTRO, id, {}), codigo(400, 'campos_invalidos'));
    assert.equal(s.conectar.mock.callCount(), 0);
  });
}

for (const [metodo, id, clave] of [
  ['reordenarLecciones', '10', 'idsLecciones'], ['reordenarPasos', '21', 'idsPasos']
]) {
  for (const lista of [undefined, null, '21', [21], ['0'], ['01'], ['9223372036854775808'], ['21', '21']]) {
    test(`Editor orden: ${metodo} lista inválida ${JSON.stringify(lista)}`, async (t) => {
      const s = simular(t);
      await assert.rejects(servicio[metodo](MAESTRO, id, { [clave]: lista }), codigo(400, 'orden_invalido'));
      assert.equal(s.conectar.mock.callCount(), 0);
    });
  }
}

for (const [metodo, tipo, , datos] of OPERACIONES.filter(([, tipo]) => tipo !== 'curso')) {
  test(`Editor referencias: ${metodo} recurso inexistente`, async (t) => {
    const s = simular(t);
    await assert.rejects(servicio[metodo](MAESTRO, '999', datos),
      codigo(404, tipo === 'leccion' ? 'leccion_no_encontrada' : 'paso_no_encontrado'));
    cerrar(s, 'ROLLBACK');
  });
  if (tipo === 'leccion') {
    test(`Editor referencias: ${metodo} lección histórica de curso retirado`, async (t) => {
      const s = simular(t, { historica: true, estado: 'retirado' });
      await assert.rejects(servicio[metodo](MAESTRO, '999', datos), codigo(409, 'curso_retirado'));
      assert.equal(s.llamadas.some(({ sql }) => /^(INSERT|UPDATE|DELETE)/.test(sql)), false);
      cerrar(s, 'ROLLBACK');
    });
  }
}

test('Editor perfil: UID reconfirmado diferente provoca rollback sin escrituras', async (t) => {
  const s = simular(t, { perfil: { ...MAESTRO, uid: 'otro-uid' } });
  await assert.rejects(servicio.crearLeccion(MAESTRO, '10', META), TypeError);
  assert.equal(s.llamadas.some(({ sql }) => /^(INSERT|UPDATE|DELETE)/.test(sql)), false);
  cerrar(s, 'ROLLBACK');
});

for (const [metodo, id, datos] of [
  ['crearLeccion', '10', { ...META, titulo: ' ' }],
  ['editarLeccion', '21', { duracionEstimadaMinutos: 16 }],
  ['crearPaso', '21', { ...LECTURA, actividad: { tipo: 'desconocido' } }],
  ['editarPaso', '101', { instruccion: '' }],
  ['crearPaso', '21', { ...LECTURA, actividad: { tipo: 'lectura', uid: 'no-permitido' } }]
]) {
  test(`Editor validación: ${metodo} contenido inválido revierte sin escribir ${JSON.stringify(datos)}`, async (t) => {
    const s = simular(t);
    await assert.rejects(servicio[metodo](MAESTRO, id, datos), (error) => {
      assert.ok(codigo(400, 'contenido_invalido')(error));
      assert.ok(error.errores.length > 0);
      for (const detalle of error.errores) assert.deepEqual(Object.keys(detalle).sort(), ['codigo', 'mensaje', 'ruta']);
      return true;
    });
    assert.equal(s.llamadas.some(({ sql }) => /^(INSERT|UPDATE|DELETE)/.test(sql)), false);
    cerrar(s, 'ROLLBACK');
  });
}

for (const [metodo, , id, datos] of OPERACIONES) {
  test(`Editor transacción: ${metodo} fallo de escritura conserva error y solicita rollback`, async (t) => {
    const error = new Error('Escritura simulada fallida');
    const s = simular(t, { fallar: /^(INSERT|UPDATE|DELETE)/, error });
    await assert.rejects(servicio[metodo](MAESTRO, id, datos), (recibido) => recibido === error);
    cerrar(s, 'ROLLBACK');
    assert.equal(s.llamadas.some(({ sql }) => sql === 'COMMIT'), false);
  });
}

for (const code of ['23503', '23001']) {
  for (const constraint of ['fk_progresos_leccion', 'fk_progresos_paso_correcto']) {
    test(`Editor integridad: referencia de progreso ${code}/${constraint} se traduce a conflicto`, async (t) => {
      const error = Object.assign(new Error('Referencia SQL simulada'), { code, constraint });
      const s = simular(t, { fallar: /^DELETE FROM pasos/, error });
      await assert.rejects(servicio.eliminarPaso(MAESTRO, '101'), codigo(409, 'curso_con_avance'));
      cerrar(s, 'ROLLBACK');
    });
  }
}

test('Editor integridad: no disfraza una referencia desconocida como avance', async (t) => {
  const error = Object.assign(new Error('Otra referencia simulada'), { code: '23503', constraint: 'otra_referencia' });
  const s = simular(t, { fallar: /^DELETE FROM pasos/, error });
  await assert.rejects(servicio.eliminarPaso(MAESTRO, '101'), (recibido) => recibido === error);
  cerrar(s, 'ROLLBACK');
});

test('Editor transacción: rollback fallido descarta conexión y conserva el error original', async (t) => {
  const error = new Error('Fallo original simulado');
  const errorRollback = new Error('Detalle privado del rollback');
  const s = simular(t, { fallar: /^INSERT INTO lecciones/, error, errorRollback });
  const registro = t.mock.method(console, 'error', () => {});
  await assert.rejects(servicio.crearLeccion(MAESTRO, '10', META), (recibido) => recibido === error);
  cerrar(s, 'ROLLBACK');
  assert.deepEqual(s.cliente.release.mock.calls[0].arguments, [errorRollback]);
  assert.equal(registro.mock.callCount(), 1);
  assert.equal(JSON.stringify(registro.mock.calls).includes(errorRollback.message), false);
});

for (const [metodo, id, datos, responder, esperado] of [
  ['editarLeccion', '21', { titulo: 'Corregida' }, /FROM lecciones WHERE id_leccion.*FOR UPDATE/s, 'leccion_no_encontrada'],
  ['editarPaso', '101', { instruccion: 'Corregida.' }, /FROM pasos WHERE id_paso.*FOR UPDATE/s, 'paso_no_encontrado']
]) {
  test(`Editor referencias: ${metodo} referencia desaparecida antes del bloqueo`, async (t) => {
    const s = simular(t, { responder });
    await assert.rejects(servicio[metodo](MAESTRO, id, datos), codigo(404, esperado));
    assert.equal(s.llamadas.some(({ sql }) => /^(INSERT|UPDATE|DELETE)/.test(sql)), false);
    cerrar(s, 'ROLLBACK');
  });
}

test('Editor bloqueo: perfil, curso, avance, lección y paso preceden a la escritura', async (t) => {
  const s = simular(t);
  await servicio.editarPaso(MAESTRO, '101', { instruccion: 'Corregida.' });
  const indice = (patron) => {
    const posicion = s.llamadas.findIndex(({ sql }) => patron.test(sql));
    assert.ok(posicion >= 0, `Consulta requerida: ${patron}`);
    return posicion;
  };
  const posiciones = [
    indice(/^SELECT uid, rol, activo.*FOR SHARE/s),
    indice(/FROM cursos WHERE id_curso.*FOR UPDATE/s),
    indice(/FROM progresos/),
    indice(/FROM lecciones WHERE id_leccion.*FOR UPDATE/s),
    indice(/FROM pasos WHERE id_paso.*FOR UPDATE/s),
    indice(/^UPDATE pasos SET/)
  ];
  assert.deepEqual(posiciones, [...posiciones].sort((a, b) => a - b));
  cerrar(s);
});

for (const contador of [
  { total: -1, ultimo: 0 }, { total: '2', ultimo: 2 },
  { total: 2, ultimo: -1 }, { total: 2, ultimo: 2147483647 },
  { total: 2, ultimo: 3 }
]) {
  test(`Editor integridad: conteo de pasos inconsistente ${JSON.stringify(contador)}`, async (t) => {
    const s = simular(t, { contador });
    await assert.rejects(servicio.crearPaso(MAESTRO, '21', LECTURA), TypeError);
    assert.equal(s.llamadas.some(({ sql }) => /^INSERT/.test(sql)), false);
    cerrar(s, 'ROLLBACK');
  });
}

for (const filasRespuesta of [[], [{ idLeccion: '0' }], [{ idLeccion: '23' }, { idLeccion: '24' }]]) {
  test(`Editor integridad: INSERT debe devolver un ID único válido ${JSON.stringify(filasRespuesta)}`, async (t) => {
    const s = simular(t, { responder: /^INSERT INTO lecciones/, filasRespuesta });
    await assert.rejects(servicio.crearLeccion(MAESTRO, '10', META), TypeError);
    cerrar(s, 'ROLLBACK');
    assert.equal(s.llamadas.some(({ sql }) => sql === 'COMMIT'), false);
  });
}

test('Editor integridad: indicador de avance no booleano no habilita la escritura', async (t) => {
  const s = simular(t, { responder: /FROM progresos/, filasRespuesta: [{ tieneAvance: 'false' }] });
  await assert.rejects(servicio.crearLeccion(MAESTRO, '10', META), TypeError);
  assert.equal(s.llamadas.some(({ sql }) => /^(INSERT|UPDATE|DELETE)/.test(sql)), false);
  cerrar(s, 'ROLLBACK');
});

test('Editor IDs: BIGINT máximo válido llega a la consulta como cadena', async (t) => {
  const s = simular(t, { sinCurso: true });
  const id = '9223372036854775807';
  await assert.rejects(servicio.crearLeccion(MAESTRO, id, META), codigo(404, 'curso_no_encontrado'));
  const consulta = s.llamadas.find(({ sql }) => /FROM cursos WHERE id_curso.*FOR UPDATE/s.test(sql));
  assert.deepEqual(consulta.parametros, [id]);
  cerrar(s, 'ROLLBACK');
});



const consultasPermiso = (s) => s.llamadas.filter(({ sql }) => /^SELECT 1 AS permiso FROM curso_editores/.test(sql));

for (const [metodo, , id, datos] of OPERACIONES) {
  test(`Editor P4: ${metodo} con permiso de edición sobre curso ajeno`, async (t) => {
    const s = simular(t, { autor: 'otro-autor', esEditor: true });
    await servicio[metodo](MAESTRO, id, datos);
    const [permiso] = consultasPermiso(s);
    assert.deepEqual(permiso.parametros, ['10', MAESTRO.uid]);
    assert.match(permiso.sql, /FOR SHARE$/);
    cerrar(s);
  });

  test(`Editor P4: ${metodo} sin permiso sobre curso ajeno sigue en curso_ajeno`, async (t) => {
    const s = simular(t, { autor: 'otro-autor', esEditor: false });
    await assert.rejects(servicio[metodo](MAESTRO, id, datos), codigo(403, 'curso_ajeno'));
    assert.equal(s.llamadas.some(({ sql }) => /^(INSERT|UPDATE|DELETE)/.test(sql)), false);
    cerrar(s, 'ROLLBACK');
  });

  test(`Editor P4: ${metodo} con permiso sobre curso retirado responde curso_retirado`, async (t) => {
    const s = simular(t, { autor: 'otro-autor', esEditor: true, estado: 'retirado' });
    await assert.rejects(servicio[metodo](MAESTRO, id, datos), codigo(409, 'curso_retirado'));
    cerrar(s, 'ROLLBACK');
  });

  test(`Editor P4: ${metodo} con permiso pero perfil vigente estudiante no aplica`, async (t) => {
    const s = simular(t, { autor: 'otro-autor', esEditor: true, perfil: { ...MAESTRO, rol: 'estudiante' } });
    await assert.rejects(servicio[metodo](MAESTRO, id, datos), codigo(403, 'rol_no_autorizado'));
    assert.equal(consultasPermiso(s).length, 0);
    cerrar(s, 'ROLLBACK');
  });

  test(`Editor P4: ${metodo} de autor y de administrador no consultan permisos`, async (t) => {
    const propio = simular(t);
    await servicio[metodo](MAESTRO, id, datos);
    assert.equal(consultasPermiso(propio).length, 0);
    t.mock.restoreAll();
    const admin = simular(t, { usuario: ADMIN, autor: 'otro-autor' });
    await servicio[metodo](ADMIN, id, datos);
    assert.equal(consultasPermiso(admin).length, 0);
  });
}

for (const [estado, avance, esperado] of [['publicado', false, 'curso_publicado'], ['borrador', true, 'curso_con_avance']]) {
  for (const [metodo, , id, datos] of OPERACIONES.filter(([nombre]) => !['editarLeccion', 'editarPaso'].includes(nombre))) {
    test(`Editor P4: ${metodo} del editor respeta ${esperado} igual que el autor`, async (t) => {
      const s = simular(t, { autor: 'otro-autor', esEditor: true, estado, avance });
      await assert.rejects(servicio[metodo](MAESTRO, id, datos), codigo(409, esperado));
      assert.equal(s.llamadas.some(({ sql }) => /^(INSERT|UPDATE|DELETE)/.test(sql)), false);
      cerrar(s, 'ROLLBACK');
    });
  }
}

test('Editor P4: la lección creada por el editor guarda su uid como creado_por', async (t) => {
  const s = simular(t, { autor: 'otro-autor', esEditor: true });
  await servicio.crearLeccion(MAESTRO, '10', META);
  const insercion = s.llamadas.find(({ sql }) => /^INSERT INTO lecciones/.test(sql));
  assert.equal(insercion.parametros[5], MAESTRO.uid);
});
