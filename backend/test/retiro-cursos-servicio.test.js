const { test, after } = require('node:test');
const assert = require('node:assert/strict');
process.env.DATABASE_URL = 'postgresql://prueba:prueba@localhost:5432/prueba';
const pool = require('../src/config/database');
const { eliminarCurso } = require('../src/services/retiro-cursos');
const { ErrorReglaCurso } = require('../src/services/reglas-cursos');

const MAESTRO = { uid: 'uid-maestro-prueba', rol: 'maestro', activo: true };
const ADMIN = { uid: 'uid-admin-prueba', rol: 'administrador', activo: true };
const INICIO = '2026-11-14T10:00:00.123456-06:00';
const ACTUALIZACION = '2026-11-14T10:01:00.123456-06:00';
const FINAL_A = '2026-11-14T10:02:00.123456-06:00';
const FINAL_B = '2026-11-14T10:02:00.123789-06:00';
const RETIRO = '2026-11-14T11:00:00.987654-06:00';
const LECCIONES = [
  { idLeccion: '21', idCurso: '10', titulo: 'Primera', orden: 1, duracionEstimadaMinutos: 10 },
  { idLeccion: '22', idCurso: '10', titulo: 'Segunda', orden: 2, duracionEstimadaMinutos: 12 }
];
const PASOS = Array.from({ length: 6 }, (_, i) => ({
  idPaso: String(101 + i), idLeccion: i < 3 ? '21' : '22', orden: i % 3 + 1
}));
const avance = (uid = 'alumno-a', idLeccion = '21', extras = {}) => ({ uid, idLeccion,
  estado: 'en_progreso', idUltimoPasoCompletado: idLeccion === '21' ? '101' : '104',
  fechaInicio: INICIO, fechaActualizacion: ACTUALIZACION, fechaFinalizacion: null, ...extras });
const completado = (uid, idLeccion, fechaFinalizacion) => avance(uid, idLeccion, {
  estado: 'completada', idUltimoPasoCompletado: idLeccion === '21' ? '103' : '106', fechaFinalizacion
});
const certificado = (extras = {}) => ({ uid: 'alumno-certificado', tituloCurso: 'Curso histórico certificado',
  lecciones: [{ titulo: 'Lección histórica A' }, { titulo: 'Lección histórica B' }],
  fechaFinalizacionCurso: FINAL_A, ...extras });

after(async () => { await pool.end(); });

function simular(t, opciones = {}) {
  const usuario = opciones.usuario || MAESTRO;
  const id = opciones.id || '10';
  let datos = structuredClone({
    curso: opciones.sinCurso ? null : { idCurso: id, titulo: 'Curso de prueba', estado_publicacion: 'borrador',
      creado_por: usuario.uid, idCategoria: '1', orden: 2, fechaActualizacion: INICIO, ...opciones.curso },
    lecciones: opciones.lecciones || LECCIONES,
    pasos: opciones.pasos || PASOS,
    progresos: opciones.progresos || [],
    historiales: opciones.historiales || [],
    certificados: opciones.certificados || [],
    marcas: opciones.marcas || [],
    editores: opciones.editores || []
  });
  const inicial = structuredClone(datos);
  let guardado;
  const llamadas = [];
  const resultadoEscritura = (n, q) => ({ rows: [], rowCount: opciones.cantidadIncorrecta?.test(q) ? n + 1 : n });
  const cliente = {
    async query(sql, parametros) {
      const q = sql.trim();
      llamadas.push({ sql: q, parametros });
      if (opciones.fallar?.test(q)) throw opciones.error || new Error('Fallo SQL simulado');
      if (q === 'ROLLBACK' && opciones.errorRollback) throw opciones.errorRollback;
      if (q === 'BEGIN') { guardado = structuredClone(datos); return { rows: [] }; }
      if (q === 'ROLLBACK') { datos = structuredClone(guardado); return { rows: [] }; }
      if (q === 'COMMIT' || q === 'SET CONSTRAINTS ALL IMMEDIATE') return { rows: [] };
      if (/^SELECT uid, rol, activo/.test(q)) {
        assert.deepEqual(parametros, [usuario.uid]);
        assert.match(q, /FOR SHARE$/);
        const perfil = Object.hasOwn(opciones, 'perfil') ? opciones.perfil : usuario;
        return { rows: perfil ? [perfil] : [] };
      }
      if (/^SELECT.*FROM cursos WHERE id_curso/s.test(q)) {
        assert.deepEqual(parametros, [id]);
        assert.match(q, /FOR UPDATE$/);
        return { rows: datos.curso ? [{ ...datos.curso }] : [] };
      }
      if (/^SELECT.*FROM lecciones WHERE id_curso/s.test(q)) {
        assert.deepEqual(parametros, [id]);
        assert.match(q, /FOR UPDATE$/);
        return { rows: structuredClone(datos.lecciones) };
      }
      if (/FROM pasos p JOIN/.test(q)) {
        assert.deepEqual(parametros, [id]);
        assert.match(q, /FOR UPDATE OF p$/);
        return { rows: structuredClone(datos.pasos) };
      }
      if (/GROUP BY p.uid_estudiante/.test(q)) {
        assert.deepEqual(parametros, [id]);
        const uids = [...new Set(datos.progresos.map((p) => p.uid))];
        return { rows: Object.hasOwn(opciones, 'maximos') ? opciones.maximos : uids.map((uid) => ({ uid,
          fechaFinalizacionCurso: datos.progresos.filter((p) => p.uid === uid)
            .map((p) => p.fechaFinalizacion).filter(Boolean).sort().at(-1) || null })) };
      }
      if (/FROM progresos p JOIN/.test(q)) {
        assert.deepEqual(parametros, [id]);
        assert.match(q, /FOR UPDATE OF p$/);
        return { rows: structuredClone(datos.progresos) };
      }
      if (/FROM historial_cursos_retirados WHERE/.test(q)) {
        assert.deepEqual(parametros, [id]);
        assert.match(q, /FOR UPDATE$/);
        return { rows: structuredClone(datos.historiales) };
      }
      if (/FROM certificados WHERE/.test(q)) {
        assert.deepEqual(parametros, [id]);
        assert.match(q, /FOR UPDATE$/);
        return { rows: structuredClone(datos.certificados) };
      }
      if (/^SELECT to_jsonb\(clock_timestamp/.test(q)) {
        return { rows: [{ fechaRetiro: Object.hasOwn(opciones, 'fechaRetiro') ? opciones.fechaRetiro : RETIRO }] };
      }
      if (/^INSERT INTO historial_cursos_retirados/.test(q)) {
        assert.equal(parametros[1], id);
        assert.equal(datos.historiales.some((h) => h.uid === parametros[0]), false, 'No debe sobrescribir historial');
        datos.historiales.push({ uid: parametros[0], lecciones: JSON.parse(parametros[2]),
          cursoCompletado: parametros[3], fechaFinalizacionCurso: parametros[4], fechaRetiro: parametros[5] });
        return resultadoEscritura(1, q);
      }
      if (/^DELETE FROM progresos/.test(q)) {
        assert.deepEqual(parametros, [id]);
        assert.match(q, /WHERE id_leccion IN.*WHERE id_curso = \$1::bigint/s);
        const n = datos.progresos.length; datos.progresos = [];
        return resultadoEscritura(n, q);
      }
      if (/^DELETE FROM pasos/.test(q)) {
        assert.deepEqual(parametros, [id]);
        assert.match(q, /WHERE id_leccion IN.*WHERE id_curso = \$1::bigint/s);
        const n = datos.pasos.length; datos.pasos = [];
        return resultadoEscritura(n, q);
      }
      if (/^DELETE FROM lecciones/.test(q)) {
        assert.deepEqual(parametros, [id]);
        const n = datos.lecciones.length; datos.lecciones = [];
        return resultadoEscritura(n, q);
      }
      if (/^SELECT 1 AS permiso FROM curso_editores/.test(q)) {
        assert.match(q, /FOR SHARE$/);
        assert.equal(parametros[0], id);
        return { rows: opciones.esEditor ? [{ permiso: 1 }] : [] };
      }
      if (/^DELETE FROM curso_editores/.test(q)) {
        assert.deepEqual(parametros, [id]);
        const rowCount = datos.editores.length;
        datos.editores = [];
        return { rows: [], rowCount };
      }
      if (/^DELETE FROM cursos/.test(q)) {
        assert.deepEqual(parametros, [id]);
        const n = datos.curso ? 1 : 0; datos.curso = null;
        datos.marcas.forEach((m) => { if (m.idCurso === id) m.idCurso = null; });
        return resultadoEscritura(n, q);
      }
      if (/^UPDATE cursos SET estado_publicacion = 'retirado'/.test(q)) {
        assert.deepEqual(parametros, [id]);
        if (!datos.curso) return resultadoEscritura(0, q);
        datos.curso.estado_publicacion = 'retirado';
        datos.curso.fechaActualizacion = RETIRO;
        return resultadoEscritura(1, q);
      }
      assert.fail(`Consulta no prevista: ${q}`);
    },
    release: t.mock.fn()
  };
  const conectar = t.mock.method(pool, 'connect', async () => {
    if (opciones.errorConexion) throw opciones.errorConexion;
    return cliente;
  });
  t.mock.method(pool, 'query', async () => assert.fail('Usar la conexión transaccional dedicada'));
  return { llamadas, cliente, conectar, inicial, datos: () => structuredClone(datos) };
}

const codigo = (estado, esperado) => (error) => error instanceof ErrorReglaCurso && error.estado === estado && error.codigo === esperado;
const retirar = () => eliminarCurso(MAESTRO, '10');
function cerrar(s, final = 'COMMIT') {
  assert.equal(s.llamadas[0].sql, 'BEGIN');
  assert.equal(s.llamadas.at(-1).sql, final);
  assert.equal(s.cliente.release.mock.callCount(), 1);
}

for (const usuario of [MAESTRO, ADMIN]) {
  for (const estado_publicacion of ['borrador', 'publicado']) {
    test(`Retiro servicio: ${usuario.rol} elimina físicamente ${estado_publicacion} sin evidencia`, async (t) => {
      const s = simular(t, { usuario, curso: { estado_publicacion, creado_por: MAESTRO.uid } });
      assert.equal(await eliminarCurso(usuario, '10'), null);
      const d = s.datos();
      assert.equal(d.curso, null);
      assert.deepEqual(d.lecciones, []);
      assert.deepEqual(d.pasos, []);
      assert.deepEqual(d.historiales, []);
      const borrarPasos = s.llamadas.findIndex(({ sql }) => /^DELETE FROM pasos/.test(sql));
      const borrarLecciones = s.llamadas.findIndex(({ sql }) => /^DELETE FROM lecciones/.test(sql));
      const borrarCurso = s.llamadas.findIndex(({ sql }) => /^DELETE FROM cursos/.test(sql));
      assert.ok(borrarPasos >= 0 && borrarLecciones > borrarPasos && borrarCurso > borrarLecciones);
      assert.equal(s.llamadas.some(({ sql }) => /CASCADE|TRUNCATE|DELETE FROM (usuarios|certificados|historial_cursos_retirados|cargas_contenido_inicial)/.test(sql)), false);
      cerrar(s);
    });
  }
}

test('Retiro servicio: elimina borrador vacío sin escrituras de hijos inexistentes', async (t) => {
  const s = simular(t, { lecciones: [], pasos: [] });
  assert.equal(await retirar(), null);
  assert.equal(s.llamadas.some(({ sql }) => /^DELETE FROM (pasos|lecciones|progresos)/.test(sql)), false);
  cerrar(s);
});

test('Retiro servicio: conserva marca de carga al eliminar el curso mediante su FK SET NULL', async (t) => {
  const s = simular(t, { marcas: [{ clave: 'marca-de-prueba', idCurso: '10' }] });
  await retirar();
  assert.deepEqual(s.datos().marcas, [{ clave: 'marca-de-prueba', idCurso: null }]);
  assert.equal(s.llamadas.some(({ sql }) => /^(DELETE|UPDATE).*cargas_contenido_inicial/s.test(sql)), false);
});

test('Retiro servicio: archiva dos alumnos parciales incluyendo lecciones pendientes y fechas exactas', async (t) => {
  const s = simular(t, { curso: { estado_publicacion: 'publicado' },
    progresos: [avance(), avance('alumno-b', '22', { idUltimoPasoCompletado: '105' })] });
  assert.deepEqual(await retirar(), { idCurso: '10', estadoPublicacion: 'retirado', resultado: 'retirado' });
  const d = s.datos();
  assert.equal(d.curso.estado_publicacion, 'retirado');
  assert.equal(d.curso.creado_por, MAESTRO.uid);
  assert.equal(d.curso.titulo, 'Curso de prueba');
  assert.equal(d.historiales.length, 2);
  assert.ok(d.historiales.every((h) => !h.cursoCompletado && h.fechaFinalizacionCurso === null && h.fechaRetiro === RETIRO));
  const a = d.historiales.find((h) => h.uid === 'alumno-a');
  assert.deepEqual(a.lecciones.map((l) => [l.idLeccion, l.estado, l.pasosCompletados, l.totalPasos]),
    [['21', 'en_progreso', 1, 3], ['22', 'pendiente', 0, 3]]);
  assert.equal(a.lecciones[0].fechaInicio, INICIO);
  assert.equal(a.lecciones[0].fechaActualizacion, ACTUALIZACION);
  assert.equal(a.lecciones[0].idUltimoPasoCompletado, '101');
  assert.equal(a.lecciones[0].tituloCurso, 'Curso de prueba');
  const b = d.historiales.find((h) => h.uid === 'alumno-b');
  assert.deepEqual(b.lecciones.map((l) => l.pasosCompletados), [0, 2]);
  for (const tabla of ['progresos', 'pasos', 'lecciones']) assert.deepEqual(d[tabla], []);
  const ultimoArchivo = s.llamadas.map(({ sql }, i) => /^INSERT INTO historial/.test(sql) ? i : -1).filter((i) => i >= 0).at(-1);
  const borrado = s.llamadas.findIndex(({ sql }) => /^DELETE FROM progresos/.test(sql));
  assert.ok(ultimoArchivo < borrado);
  assert.equal(s.llamadas.some(({ sql }) => /^DELETE FROM cursos/.test(sql)), false);
  cerrar(s);
});

test('Retiro servicio: curso completo usa MAX SQL sin perder microsegundos ni confundir retiro con finalización', async (t) => {
  const s = simular(t, { progresos: [completado('alumno-a', '21', FINAL_A), completado('alumno-a', '22', FINAL_B)] });
  await retirar();
  const h = s.datos().historiales[0];
  assert.equal(Date.parse(FINAL_A), Date.parse(FINAL_B), 'Las dos fechas caen en el mismo milisegundo');
  assert.equal(h.cursoCompletado, true);
  assert.equal(h.fechaFinalizacionCurso, FINAL_B);
  assert.notEqual(h.fechaFinalizacionCurso, h.fechaRetiro);
  assert.deepEqual(h.lecciones.map((l) => l.fechaFinalizacion), [FINAL_A, FINAL_B]);
  assert.ok(s.llamadas.some(({ sql }) => /to_jsonb\(max\(p.fecha_finalizacion\)\)/.test(sql)));
  cerrar(s);
});

test('Retiro servicio: completar una sola lección no acredita curso completo', async (t) => {
  const s = simular(t, { progresos: [completado('alumno-a', '21', FINAL_A)] });
  await retirar();
  const h = s.datos().historiales[0];
  assert.equal(h.cursoCompletado, false);
  assert.equal(h.fechaFinalizacionCurso, null);
  assert.equal(h.lecciones[0].fechaFinalizacion, FINAL_A);
  assert.equal(h.lecciones[1].estado, 'pendiente');
});

test('Retiro servicio: certificado sin progreso conserva su instantánea sin inventar IDs o fechas por lección', async (t) => {
  const cert = certificado();
  const s = simular(t, { certificados: [cert], lecciones: [], pasos: [] });
  await retirar();
  const d = s.datos();
  assert.equal(d.curso.estado_publicacion, 'retirado');
  assert.deepEqual(d.certificados, [cert]);
  const h = d.historiales[0];
  assert.equal(h.cursoCompletado, true);
  assert.equal(h.fechaFinalizacionCurso, FINAL_A);
  assert.deepEqual(h.lecciones.map((l) => l.titulo), ['Lección histórica A', 'Lección histórica B']);
  assert.ok(h.lecciones.every((l) => l.tituloCurso === cert.tituloCurso && l.origen === 'certificado'
    && !Object.hasOwn(l, 'idLeccion') && !Object.hasOwn(l, 'fechaFinalizacion') && !Object.hasOwn(l, 'totalPasos')));
  assert.equal(s.llamadas.some(({ sql }) => /^DELETE FROM cursos/.test(sql)), false);
  cerrar(s);
});

test('Retiro servicio: conserva IDs históricos solo cuando el certificado realmente los contiene', async (t) => {
  const s = simular(t, { certificados: [certificado({ lecciones: [{ idLeccion: '9007199254740993', titulo: 'Histórica' }] })] });
  await retirar();
  assert.equal(s.datos().historiales[0].lecciones[0].idLeccion, '9007199254740993');
});

test('Retiro servicio: certificado existente sigue inmutable tras corregir títulos del contenido operativo', async (t) => {
  const cert = certificado({ uid: 'alumno-a', fechaFinalizacionCurso: FINAL_B });
  const s = simular(t, { certificados: [cert],
    progresos: [completado('alumno-a', '21', FINAL_A), completado('alumno-a', '22', FINAL_B)] });
  await retirar();
  assert.deepEqual(s.datos().certificados, [cert]);
  assert.deepEqual(s.datos().historiales[0].lecciones.map((l) => l.titulo), ['Primera', 'Segunda']);
});

test('Retiro servicio: la instantánea guarda la duración de cada lección, incluso pendiente', async (t) => {
  const s = simular(t, { progresos: [avance()] });
  await retirar();
  const { lecciones } = s.datos().historiales[0];
  assert.deepEqual(lecciones.map((l) => [l.estado, l.duracionEstimadaMinutos]), [['en_progreso', 10], ['pendiente', 12]]);
  assert.match(s.llamadas.find(({ sql }) => /FROM lecciones WHERE/.test(sql)).sql, /duracion_estimada_minutos/);
});

test('Retiro servicio: instantánea desde certificado no inventa duración', async (t) => {
  const s = simular(t, { certificados: [certificado()], lecciones: [], pasos: [] });
  await retirar();
  assert.ok(s.datos().historiales[0].lecciones.every((l) => !Object.hasOwn(l, 'duracionEstimadaMinutos')));
});

async function historialSinDuracion(t, progresos) {
  const s = simular(t, { progresos });
  await retirar();
  t.mock.restoreAll();
  const historial = s.datos().historiales[0];
  historial.lecciones = historial.lecciones.map(({ duracionEstimadaMinutos: _duracion, ...resto }) => resto);
  return historial;
}

test('Retiro servicio: historial anterior sin duración no provoca 409 y no se reescribe', async (t) => {
  const progresos = [completado('alumno-a', '21', FINAL_A), completado('alumno-a', '22', FINAL_B)];
  const historial = await historialSinDuracion(t, progresos);
  const s = simular(t, { progresos, historiales: [historial] });
  await retirar();
  assert.deepEqual(s.datos().historiales, [historial]);
  assert.equal(s.llamadas.some(({ sql }) => /^INSERT INTO historial/.test(sql)), false);
  cerrar(s);
});

test('Retiro servicio: historial anterior con otra diferencia sigue siendo inconsistente', async (t) => {
  const progresos = [completado('alumno-a', '21', FINAL_A), completado('alumno-a', '22', FINAL_B)];
  const historial = await historialSinDuracion(t, progresos);
  historial.lecciones[0].titulo = 'Título distinto';
  const s = simular(t, { progresos, historiales: [historial] });
  await assert.rejects(retirar(), codigo(409, 'historial_inconsistente'));
  cerrar(s, 'ROLLBACK');
});

const HISTORIAL_ANTERIOR = { uid: 'alumno-historico', lecciones: [
  { idLeccion: '900', titulo: 'Lección histórica', orden: 1, estado: 'completada' }
], cursoCompletado: true, fechaFinalizacionCurso: FINAL_A, fechaRetiro: '2026-11-14T10:30:00.123456-06:00' };

test('Retiro servicio: evidencia histórica previa impide borrado físico y se conserva sin UPDATE', async (t) => {
  const s = simular(t, { historiales: [HISTORIAL_ANTERIOR] });
  await retirar();
  assert.deepEqual(s.datos().historiales, [HISTORIAL_ANTERIOR]);
  assert.equal(s.datos().curso.estado_publicacion, 'retirado');
  assert.equal(s.llamadas.some(({ sql }) => /^(INSERT|UPDATE|DELETE).*historial_cursos_retirados/s.test(sql)), false);
});

for (const usuario of [MAESTRO, ADMIN]) {
  test(`Retiro servicio: repetir retirado como ${usuario.rol} no rearchiva ni escribe`, async (t) => {
    const s = simular(t, { usuario, curso: { estado_publicacion: 'retirado', creado_por: MAESTRO.uid },
      historiales: [HISTORIAL_ANTERIOR], lecciones: [], pasos: [] });
    assert.deepEqual(await eliminarCurso(usuario, '10'), { idCurso: '10', estadoPublicacion: 'retirado', resultado: 'retirado' });
    assert.deepEqual(s.datos(), s.inicial);
    assert.equal(s.llamadas.some(({ sql }) => /^(INSERT|UPDATE|DELETE)/.test(sql)), false);
    assert.equal(s.llamadas.some(({ sql }) => /FROM historial|FROM certificados|clock_timestamp/.test(sql)), false);
    cerrar(s);
  });
}

test('Retiro servicio: bloquea perfil, curso e hijos antes de archivar y usa fecha posterior a los bloqueos', async (t) => {
  const s = simular(t, { progresos: [avance()] });
  await retirar();
  const posicion = (patron) => {
    const i = s.llamadas.findIndex(({ sql }) => patron.test(sql));
    assert.ok(i >= 0, `Consulta obligatoria ${patron}`);
    return i;
  };
  const orden = [posicion(/FROM usuarios.*FOR SHARE/s), posicion(/FROM cursos.*FOR UPDATE/s),
    posicion(/FROM lecciones WHERE/), posicion(/FROM pasos p JOIN/), posicion(/FROM progresos p JOIN/),
    posicion(/FROM historial_cursos_retirados WHERE/), posicion(/FROM certificados WHERE/),
    posicion(/^SELECT to_jsonb\(clock_timestamp/), posicion(/^INSERT INTO historial/), posicion(/^DELETE FROM progresos/)];
  assert.deepEqual(orden, [...orden].sort((a, b) => a - b));
});

for (const id of [undefined, null, 1, '', '0', '-1', '01', '1.5', '1e2', ' 1', '9223372036854775808']) {
  test(`Retiro servicio: ID inválido ${JSON.stringify(id)} no conecta`, async (t) => {
    const s = simular(t);
    await assert.rejects(eliminarCurso(MAESTRO, id), codigo(400, 'id_curso_invalido'));
    assert.equal(s.conectar.mock.callCount(), 0);
  });
}

for (const id of ['9007199254740993', '9223372036854775807']) {
  test(`Retiro servicio: BIGINT válido ${id} se mantiene como cadena`, async (t) => {
    const s = simular(t, { id, curso: { estado_publicacion: 'retirado' }, lecciones: [], pasos: [] });
    assert.equal((await eliminarCurso(MAESTRO, id)).idCurso, id);
    cerrar(s);
  });
}

for (const [usuario, estado, esperado] of [
  [null, 404, 'perfil_no_registrado'],
  [{ ...MAESTRO, activo: false }, 403, 'cuenta_desactivada'],
  [{ ...MAESTRO, rol: 'estudiante' }, 403, 'rol_no_autorizado'],
  [{ ...MAESTRO, uid: ' ' }, 403, 'rol_no_autorizado'],
  [{ ...MAESTRO, uid: 'u'.repeat(129) }, 403, 'rol_no_autorizado']
]) {
  test(`Retiro servicio: solicitante rechazado ${esperado} ${JSON.stringify(usuario)}`, async (t) => {
    const s = simular(t);
    await assert.rejects(eliminarCurso(usuario, '10'), codigo(estado, esperado));
    assert.equal(s.conectar.mock.callCount(), 0);
  });
}

for (const [perfil, estado, esperado] of [
  [null, 404, 'perfil_no_registrado'],
  [{ ...MAESTRO, activo: false }, 403, 'cuenta_desactivada'],
  [{ ...MAESTRO, rol: 'estudiante' }, 403, 'rol_no_autorizado']
]) {
  test(`Retiro servicio: perfil vigente ${esperado} se reconfirma antes de borrar`, async (t) => {
    const s = simular(t, { perfil });
    await assert.rejects(retirar(), codigo(estado, esperado));
    assert.deepEqual(s.datos(), s.inicial);
    cerrar(s, 'ROLLBACK');
  });
}

for (const estado_publicacion of ['borrador', 'publicado', 'retirado']) {
  test(`Retiro servicio: maestro ajeno no elimina ni repite retiro en ${estado_publicacion}`, async (t) => {
    const s = simular(t, { curso: { creado_por: 'otro-autor', estado_publicacion } });
    await assert.rejects(retirar(), codigo(403, 'curso_ajeno'));
    assert.equal(s.llamadas.some(({ sql }) => /^(INSERT|UPDATE|DELETE)/.test(sql)), false);
    cerrar(s, 'ROLLBACK');
  });
}

test('Retiro servicio: administrador desactualizado no conserva privilegios sobre curso ajeno', async (t) => {
  const s = simular(t, { usuario: ADMIN, perfil: { ...ADMIN, rol: 'maestro' }, curso: { creado_por: MAESTRO.uid } });
  await assert.rejects(eliminarCurso(ADMIN, '10'), codigo(403, 'curso_ajeno'));
  cerrar(s, 'ROLLBACK');
});

test('Retiro servicio: curso inexistente devuelve 404 y no éxito idempotente de retiro', async (t) => {
  const s = simular(t, { sinCurso: true });
  await assert.rejects(retirar(), codigo(404, 'curso_no_encontrado'));
  cerrar(s, 'ROLLBACK');
});

test('Retiro servicio: un perfil con UID diferente cancela la operación', async (t) => {
  const s = simular(t, { perfil: { ...MAESTRO, uid: 'otro-uid' } });
  await assert.rejects(retirar(), TypeError);
  assert.deepEqual(s.datos(), s.inicial);
  cerrar(s, 'ROLLBACK');
});

const INCONSISTENCIAS = [
  { progresos: [avance('alumno-a', '21', { idUltimoPasoCompletado: '999' })] },
  { progresos: [avance('alumno-a', '21', { estado: 'desconocido' })] },
  { progresos: [avance('alumno-a', '21', { fechaInicio: null })] },
  { progresos: [avance('alumno-a', '21', { fechaFinalizacion: FINAL_A })] },
  { progresos: [completado('alumno-a', '21', FINAL_A), avance('alumno-a', '21')] },
  { progresos: [completado('alumno-a', '21', FINAL_A), completado('alumno-a', '22', FINAL_B)], maximos: [] },
  { progresos: [avance('alumno-a', '21', { estado: 'completada', fechaFinalizacion: FINAL_A })] },
  { certificados: [certificado({ lecciones: [] })] },
  { certificados: [certificado({ lecciones: ['Título sin objeto'] })] },
  { certificados: [certificado({ lecciones: [{ titulo: ' ' }] })] },
  { certificados: [certificado({ fechaFinalizacionCurso: null })] },
  { certificados: [certificado({ lecciones: [{ titulo: 'Histórica', idLeccion: '01' }] })] },
  { certificados: [certificado(), certificado()] },
  { historiales: [{ ...HISTORIAL_ANTERIOR, lecciones: [] }] },
  { historiales: [{ ...HISTORIAL_ANTERIOR, fechaFinalizacionCurso: null }] },
  { historiales: [{ ...HISTORIAL_ANTERIOR, lecciones: [
    { titulo: 'Una', orden: 1 }, { titulo: 'Otra', orden: 1 }
  ] }] },
  { progresos: [avance()], historiales: [{ ...HISTORIAL_ANTERIOR, uid: 'alumno-a' }] },
  { progresos: [avance()], certificados: [certificado({ uid: 'alumno-a' })] }
];

INCONSISTENCIAS.forEach((opciones, indice) => {
  test(`Retiro servicio: evidencia inconsistente ${indice + 1} cancela sin pérdidas`, async (t) => {
    const s = simular(t, opciones);
    await assert.rejects(retirar(), codigo(409, 'historial_inconsistente'));
    assert.equal(s.llamadas.some(({ sql }) => /^(INSERT|UPDATE|DELETE)/.test(sql)), false);
    assert.deepEqual(s.datos(), s.inicial);
    cerrar(s, 'ROLLBACK');
  });
});

for (const fallar of [/^BEGIN$/, /^SELECT uid, rol/, /FROM cursos WHERE/, /FROM lecciones WHERE/,
  /FROM pasos p JOIN/, /FROM progresos p JOIN/, /FROM historial_cursos_retirados WHERE/,
  /FROM certificados WHERE/, /GROUP BY p.uid_estudiante/, /^SELECT to_jsonb\(clock_timestamp/,
  /^INSERT INTO historial/, /^DELETE FROM progresos/, /^DELETE FROM pasos/, /^DELETE FROM lecciones/,
  /^UPDATE cursos SET/, /^SET CONSTRAINTS/, /^COMMIT$/]) {
  test(`Retiro servicio: fallo ${fallar} conserva datos mediante rollback simulado`, async (t) => {
    const error = new Error('Fallo de retiro simulado');
    const s = simular(t, { progresos: [avance()], fallar, error });
    await assert.rejects(retirar(), (recibido) => recibido === error);
    assert.deepEqual(s.datos(), s.inicial);
    if (fallar.test('BEGIN')) {
      assert.deepEqual(s.cliente.release.mock.calls[0].arguments, [error]);
      assert.equal(s.llamadas.some(({ sql }) => sql === 'ROLLBACK'), false);
      assert.equal(s.cliente.release.mock.callCount(), 1);
    } else cerrar(s, 'ROLLBACK');
  });
}

test('Retiro servicio: fallo al borrar curso restaura sus hijos y la marca de carga simulados', async (t) => {
  const error = new Error('Borrado final simulado fallido');
  const s = simular(t, { marcas: [{ clave: 'marca-prueba', idCurso: '10' }], fallar: /^DELETE FROM cursos/, error });
  await assert.rejects(retirar(), (recibido) => recibido === error);
  assert.deepEqual(s.datos(), s.inicial);
  cerrar(s, 'ROLLBACK');
});

for (const cantidadIncorrecta of [/^INSERT INTO historial/, /^DELETE FROM progresos/, /^DELETE FROM pasos/,
  /^DELETE FROM lecciones/, /^UPDATE cursos SET/]) {
  test(`Retiro servicio: conteo inesperado en ${cantidadIncorrecta} cancela la transacción`, async (t) => {
    const s = simular(t, { progresos: [avance()], cantidadIncorrecta });
    await assert.rejects(retirar(), TypeError);
    assert.deepEqual(s.datos(), s.inicial);
    cerrar(s, 'ROLLBACK');
  });
}

test('Retiro servicio: fallo al conectar no consulta ni libera una conexión no adquirida', async (t) => {
  const error = new Error('Conexión simulada no disponible');
  const s = simular(t, { errorConexion: error });
  await assert.rejects(retirar(), (recibido) => recibido === error);
  assert.equal(s.llamadas.length, 0);
  assert.equal(s.cliente.release.mock.callCount(), 0);
});

test('Retiro servicio: rollback fallido descarta conexión sin ocultar el error original', async (t) => {
  const error = new Error('Fallo original simulado');
  const errorRollback = new Error('Fallo privado de rollback');
  const s = simular(t, { progresos: [avance()], fallar: /^DELETE FROM pasos/, error, errorRollback });
  const registro = t.mock.method(console, 'error', () => {});
  await assert.rejects(retirar(), (recibido) => recibido === error);
  cerrar(s, 'ROLLBACK');
  assert.deepEqual(s.cliente.release.mock.calls[0].arguments, [errorRollback]);
  assert.equal(JSON.stringify(registro.mock.calls).includes(errorRollback.message), false);
});

test('Retiro servicio: combina alumnos con progreso y certificado sin atribuirles el mismo recorrido', async (t) => {
  const s = simular(t, { progresos: [avance()], certificados: [certificado()] });
  await retirar();
  const d = s.datos();
  assert.equal(d.historiales.length, 2);
  assert.equal(d.historiales.find((h) => h.uid === 'alumno-a').cursoCompletado, false);
  const acreditado = d.historiales.find((h) => h.uid === 'alumno-certificado');
  assert.equal(acreditado.cursoCompletado, true);
  assert.ok(acreditado.lecciones.every((l) => !Object.hasOwn(l, 'idLeccion')));
  assert.deepEqual(d.certificados, s.inicial.certificados);
});

test('Retiro servicio: historial previo compatible se conserva exactamente, sin volver a insertarlo', async (t) => {
  const primero = simular(t, { progresos: [avance()] });
  await retirar();
  const historial = primero.datos().historiales[0];
  t.mock.restoreAll();
  const segundo = simular(t, { progresos: [avance()], historiales: [historial] });
  await retirar();
  assert.deepEqual(segundo.datos().historiales, [historial]);
  assert.equal(segundo.llamadas.some(({ sql }) => /^INSERT INTO historial/.test(sql)), false);
  cerrar(segundo);
});

test('Retiro servicio: progreso sin último paso conserva cero pasos registrados, sin inventarlos', async (t) => {
  const s = simular(t, { progresos: [avance('alumno-a', '21', { idUltimoPasoCompletado: null })] });
  await retirar();
  const l = s.datos().historiales[0].lecciones[0];
  assert.equal(l.pasosCompletados, 0);
  assert.equal(l.idUltimoPasoCompletado, null);
  assert.equal(l.estado, 'en_progreso');
});

test('Retiro servicio: fecha de retiro ausente no permite archivar ni borrar', async (t) => {
  const s = simular(t, { progresos: [avance()], fechaRetiro: null });
  await assert.rejects(retirar(), TypeError);
  assert.deepEqual(s.datos(), s.inicial);
  cerrar(s, 'ROLLBACK');
});

test('Retiro servicio: conteo incorrecto al borrar el curso revierte hijos y SET NULL simulado', async (t) => {
  const s = simular(t, { cantidadIncorrecta: /^DELETE FROM cursos/,
    marcas: [{ clave: 'marca-prueba', idCurso: '10' }] });
  await assert.rejects(retirar(), TypeError);
  assert.deepEqual(s.datos(), s.inicial);
  cerrar(s, 'ROLLBACK');
});


for (const estado_publicacion of ['borrador', 'publicado', 'retirado']) {
  test(`Retiro servicio P4: editor no elimina ni retira en ${estado_publicacion} (403 permiso_solo_edicion)`, async (t) => {
    const s = simular(t, { curso: { creado_por: 'otro-autor', estado_publicacion }, esEditor: true,
      editores: [MAESTRO.uid] });
    await assert.rejects(retirar(), codigo(403, 'permiso_solo_edicion'));
    assert.equal(s.llamadas.some(({ sql }) => /^(INSERT|UPDATE|DELETE)/.test(sql)), false);
    assert.deepEqual(s.datos(), s.inicial);
    const permiso = s.llamadas.find(({ sql }) => /^SELECT 1 AS permiso FROM curso_editores/.test(sql));
    assert.deepEqual(permiso.parametros, ['10', MAESTRO.uid]);
    cerrar(s, 'ROLLBACK');
  });
}

test('Retiro servicio P4: con el perfil vigente como estudiante el permiso no aplica', async (t) => {
  const s = simular(t, { curso: { creado_por: 'otro-autor' }, esEditor: true,
    perfil: { ...MAESTRO, rol: 'estudiante' } });
  await assert.rejects(retirar(), codigo(403, 'rol_no_autorizado'));
  cerrar(s, 'ROLLBACK');
});

test('Retiro servicio P4: la eliminación física borra los permisos antes del curso', async (t) => {
  const s = simular(t, { editores: ['uid-editor-a', 'uid-editor-b'] });
  assert.equal(await retirar(), null);
  assert.deepEqual(s.datos().editores, []);
  const permisos = s.llamadas.findIndex(({ sql }) => /^DELETE FROM curso_editores/.test(sql));
  const curso = s.llamadas.findIndex(({ sql }) => /^DELETE FROM cursos/.test(sql));
  assert.ok(permisos >= 0 && permisos < curso);
  assert.deepEqual(s.llamadas[permisos].parametros, ['10']);
  cerrar(s);
});

test('Retiro servicio P4: el retiro con historial conserva los permisos', async (t) => {
  const s = simular(t, { progresos: [avance()], editores: ['uid-editor-a'] });
  assert.deepEqual(await retirar(), { idCurso: '10', estadoPublicacion: 'retirado', resultado: 'retirado' });
  assert.deepEqual(s.datos().editores, ['uid-editor-a']);
  assert.equal(s.llamadas.some(({ sql }) => /curso_editores/.test(sql) && /^DELETE/.test(sql)), false);
  cerrar(s);
});

test('Retiro servicio P4: autor y administrador no consultan curso_editores', async (t) => {
  const propio = simular(t);
  await retirar();
  assert.equal(propio.llamadas.some(({ sql }) => /^SELECT 1 AS permiso/.test(sql)), false);
  t.mock.restoreAll();
  const admin = simular(t, { usuario: ADMIN, curso: { creado_por: MAESTRO.uid } });
  await eliminarCurso(ADMIN, '10');
  assert.equal(admin.llamadas.some(({ sql }) => /^SELECT 1 AS permiso/.test(sql)), false);
});
