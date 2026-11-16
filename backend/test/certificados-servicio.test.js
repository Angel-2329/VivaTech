const { test, after } = require('node:test');
const assert = require('node:assert/strict');
process.env.DATABASE_URL = 'postgresql://prueba:prueba@localhost:5432/prueba';
const pool = require('../src/config/database');
const { emitirCertificado, listarMisCertificados } = require('../src/services/certificados');
const { ErrorReglaCurso } = require('../src/services/reglas-cursos');

const ALUMNO = { uid: 'alumno-certificados-prueba', rol: 'estudiante', activo: true };
const FECHA = '2026-11-15T12:00:00.123789-06:00';
const CERTIFICADO = {
  idCertificado: '7', idCurso: '10', folio: 'VT-2026-000007',
  codigoVerificacion: '7b604b92-7f81-4d56-b117-d2bc14dd1ab2',
  nombreCompleto: 'Persona ficticia', tituloCurso: 'Curso ficticio',
  lecciones: [{ titulo: 'Primera' }, { titulo: 'Segunda' }],
  fechaFinalizacionCurso: FECHA, fechaEmision: '2026-11-15T13:00:00.987654-06:00'
};
const LECCIONES = [1, 2].map((orden) => ({ idLeccion: String(20 + orden), titulo: orden === 1 ? 'Primera' : 'Segunda',
  orden, estado: 'completada', ultimoCompletado: String(100 + orden), ultimoPaso: String(100 + orden),
  totalPasos: 3, fechaFinalizacion: FECHA }));
const HISTORIAL = { cursoCompletado: true, fechaFinalizacionCurso: FECHA,
  lecciones: LECCIONES.map((l) => ({ idLeccion: l.idLeccion, titulo: l.titulo, tituloCurso: 'Título al retirar',
    orden: l.orden, estado: 'completada', origen: 'progreso', totalPasos: 3, pasosCompletados: 3,
    idUltimoPasoCompletado: l.ultimoPaso, fechaFinalizacion: FECHA })) };

after(async () => { await pool.end(); });

function simular(t, opciones = {}) {
  const llamadas = [];
  const perfil = Object.hasOwn(opciones, 'perfil') ? opciones.perfil : { ...ALUMNO, nombre_completo: 'Persona ficticia' };
  let certificado = opciones.existente || null;
  let copia;
  const cliente = {
    async query(sql, parametros) {
      const q = sql.trim();
      llamadas.push({ sql: q, parametros });
      if (opciones.fallar?.test(q)) throw new Error('Detalle SQL privado');
      if (q === 'BEGIN') { copia = certificado; return { rows: [] }; }
      if (q === 'ROLLBACK') { certificado = copia; return { rows: [] }; }
      if (q === 'COMMIT') return { rows: [] };
      if (/FROM usuarios/.test(q)) {
        assert.deepEqual(parametros, [ALUMNO.uid]);
        assert.match(q, /FOR SHARE/);
        return { rows: perfil ? [perfil] : [] };
      }
      if (/FROM cursos WHERE/.test(q)) {
        assert.match(q, /FOR UPDATE/);
        assert.deepEqual(parametros, [opciones.id || '10']);
        return { rows: opciones.sinCurso ? [] : [{ idCurso: opciones.id || '10', titulo: 'Curso ficticio', estado_publicacion: opciones.estado || 'publicado' }] };
      }
      if (/FROM certificados/.test(q)) {
        assert.equal(parametros[0], ALUMNO.uid);
        if (parametros.length === 1) {
          assert.match(q, /ORDER BY fecha_emision DESC, id_certificado DESC/);
          return { rows: opciones.lista || [] };
        }
        assert.equal(parametros[1], opciones.id || '10');
        return { rows: certificado ? [structuredClone(certificado)] : [] };
      }
      if (/FROM historial_cursos_retirados/.test(q)) {
        assert.deepEqual(parametros, [ALUMNO.uid, opciones.id || '10']);
        return { rows: opciones.sinHistorial ? [] : [structuredClone(opciones.historial || HISTORIAL)] };
      }
      if (/FROM lecciones l/.test(q)) {
        assert.deepEqual(parametros, [ALUMNO.uid, opciones.id || '10']);
        return { rows: structuredClone(opciones.lecciones || LECCIONES) };
      }
      if (/max\(p.fecha_finalizacion\)/.test(q)) return { rows: [{ fechaFinalizacionCurso: opciones.maximo || FECHA }] };
      if (/^INSERT INTO certificados/.test(q)) {
        assert.match(q, /clock_timestamp\(\)/);
        assert.match(q, /\$6::timestamptz/);
        assert.doesNotMatch(q.split('VALUES')[0], /codigo_verificacion|\bfolio\b/);
        certificado = { ...CERTIFICADO, idCurso: parametros[1], nombreCompleto: parametros[2],
          tituloCurso: parametros[3], lecciones: JSON.parse(parametros[4]), fechaFinalizacionCurso: parametros[5] };
        return { rows: [structuredClone(certificado)], rowCount: 1 };
      }
      assert.fail(`Consulta inesperada: ${q}`);
    },
    release: t.mock.fn()
  };
  const conectar = t.mock.method(pool, 'connect', async () => {
    if (opciones.errorConexion) throw new Error('Conexión privada');
    return cliente;
  });
  t.mock.method(pool, 'query', async () => assert.fail('Se requiere la conexión transaccional'));
  return { llamadas, cliente, conectar, guardado: () => certificado };
}

const codigo = (estado, valor) => (e) => e instanceof ErrorReglaCurso && e.estado === estado && e.codigo === valor;
function cierre(s, comando = 'COMMIT') {
  assert.equal(s.llamadas[0].sql, 'BEGIN');
  assert.equal(s.llamadas.at(-1).sql, comando);
  assert.equal(s.cliente.release.mock.callCount(), 1);
}

test('Certificados servicio: emite instantánea propia con MAX y precisión original', async (t) => {
  const s = simular(t);
  const resultado = await emitirCertificado(ALUMNO, '10');
  assert.equal(resultado.creado, true);
  assert.deepEqual(resultado.certificado, CERTIFICADO);
  const insercion = s.llamadas.find(({ sql }) => /^INSERT/.test(sql));
  assert.equal(insercion.parametros[0], ALUMNO.uid);
  assert.equal(insercion.parametros[5], FECHA);
  const bloqueo = s.llamadas.findIndex(({ sql }) => /FROM cursos/.test(sql));
  const consulta = s.llamadas.findIndex(({ sql }) => /FROM certificados/.test(sql));
  assert.ok(bloqueo < consulta);
  cierre(s);
});

test('Certificados servicio: repetición devuelve existente sin recalcular ni actualizar', async (t) => {
  const existente = { ...CERTIFICADO, nombreCompleto: 'Nombre histórico', tituloCurso: 'Título histórico' };
  const s = simular(t, { existente, perfil: { ...ALUMNO, nombre_completo: 'Nombre nuevo' }, estado: 'retirado' });
  const resultado = await emitirCertificado(ALUMNO, '10');
  assert.equal(resultado.creado, false);
  assert.deepEqual(resultado.certificado, existente);
  assert.equal(s.llamadas.some(({ sql }) => /^(INSERT|UPDATE|DELETE)/.test(sql)), false);
  assert.equal(s.llamadas.some(({ sql }) => /FROM lecciones|FROM historial_cursos/.test(sql)), false);
  cierre(s);
});

test('Certificados servicio: dos solicitudes secuenciales comparten el mismo certificado', async (t) => {
  const s = simular(t);
  const primera = await emitirCertificado(ALUMNO, '10');
  const segunda = await emitirCertificado(ALUMNO, '10');
  assert.equal(primera.creado, true);
  assert.equal(segunda.creado, false);
  assert.deepEqual(primera.certificado, segunda.certificado);
  assert.equal(s.llamadas.filter(({ sql }) => /^INSERT/.test(sql)).length, 1);
});

for (const lecciones of [[], [{ ...LECCIONES[0], estado: null }], [{ ...LECCIONES[0], estado: 'en_progreso' }]]) {
  test(`Certificados servicio: curso vacío o incompleto rechaza (${JSON.stringify(lecciones.map((l) => l.estado))})`, async (t) => {
    const s = simular(t, { lecciones });
    await assert.rejects(emitirCertificado(ALUMNO, '10'), codigo(409, 'curso_incompleto'));
    assert.equal(s.guardado(), null);
    cierre(s, 'ROLLBACK');
  });
}

for (const cambio of [{ totalPasos: 0 }, { ultimoCompletado: '999' }, { fechaFinalizacion: null }]) {
  test(`Certificados servicio: progreso completo contradictorio rechaza ${JSON.stringify(cambio)}`, async (t) => {
    const s = simular(t, { lecciones: [{ ...LECCIONES[0], ...cambio }] });
    await assert.rejects(emitirCertificado(ALUMNO, '10'), codigo(409, 'historial_inconsistente'));
    cierre(s, 'ROLLBACK');
  });
}

test('Certificados servicio: emisión tras retiro usa orden y títulos históricos y nombre actual', async (t) => {
  const historial = { ...HISTORIAL, lecciones: [...HISTORIAL.lecciones].reverse() };
  const s = simular(t, { estado: 'retirado', historial, perfil: { ...ALUMNO, nombre_completo: 'Nombre actual' } });
  const { certificado } = await emitirCertificado(ALUMNO, '10');
  assert.equal(certificado.tituloCurso, 'Título al retirar');
  assert.equal(certificado.nombreCompleto, 'Nombre actual');
  assert.deepEqual(certificado.lecciones, CERTIFICADO.lecciones);
  assert.equal(certificado.fechaFinalizacionCurso, FECHA);
  assert.equal(s.llamadas.some(({ sql }) => /FROM lecciones/.test(sql)), false);
  cierre(s);
});

for (const opciones of [{ sinHistorial: true }, { historial: { ...HISTORIAL, cursoCompletado: false, fechaFinalizacionCurso: null } }]) {
  test(`Certificados servicio: retirado sin finalización no emite (${opciones.sinHistorial ? 'ausente' : 'parcial'})`, async (t) => {
    const s = simular(t, { estado: 'retirado', ...opciones });
    await assert.rejects(emitirCertificado(ALUMNO, '10'), codigo(409, 'curso_incompleto'));
    cierre(s, 'ROLLBACK');
  });
}

for (const cambio of [
  { lecciones: [] }, { fechaFinalizacionCurso: null },
  { lecciones: [{ ...HISTORIAL.lecciones[0], estado: 'en_progreso' }] },
  { lecciones: [{ ...HISTORIAL.lecciones[0], pasosCompletados: 1 }] },
  { lecciones: [HISTORIAL.lecciones[0], HISTORIAL.lecciones[0]] }
]) {
  test(`Certificados servicio: historial contradictorio rechaza ${JSON.stringify(cambio)}`, async (t) => {
    const s = simular(t, { estado: 'retirado', historial: { ...HISTORIAL, ...cambio } });
    await assert.rejects(emitirCertificado(ALUMNO, '10'), codigo(409, 'historial_inconsistente'));
    cierre(s, 'ROLLBACK');
  });
}

for (const id of ['', '0', '-1', '1.2', '01', '9223372036854775808', 10, null, undefined]) {
  test(`Certificados servicio: BIGINT inválido ${String(id)} (${typeof id})`, async (t) => {
    const s = simular(t);
    await assert.rejects(emitirCertificado(ALUMNO, id), codigo(400, 'id_curso_invalido'));
    assert.equal(s.conectar.mock.callCount(), 0);
  });
}

for (const [usuario, estado, valor] of [
  [null, 404, 'perfil_no_registrado'], [{ ...ALUMNO, activo: false }, 403, 'cuenta_desactivada'],
  [{ ...ALUMNO, rol: 'maestro' }, 403, 'rol_no_autorizado'],
  [{ ...ALUMNO, rol: 'administrador' }, 403, 'rol_no_autorizado'],
  [{ ...ALUMNO, uid: '' }, 403, 'rol_no_autorizado']
]) {
  test(`Certificados servicio: permisos iniciales ${valor} ${usuario?.rol}`, async (t) => {
    const s = simular(t);
    await assert.rejects(emitirCertificado(usuario, '10'), codigo(estado, valor));
    await assert.rejects(listarMisCertificados(usuario), codigo(estado, valor));
    assert.equal(s.conectar.mock.callCount(), 0);
  });
}

for (const [perfil, estado, valor] of [
  [null, 404, 'perfil_no_registrado'], [{ ...ALUMNO, activo: false }, 403, 'cuenta_desactivada'],
  [{ ...ALUMNO, rol: 'maestro' }, 403, 'rol_no_autorizado']
]) {
  test(`Certificados servicio: perfil vigente ${valor}`, async (t) => {
    const s = simular(t, { perfil });
    await assert.rejects(emitirCertificado(ALUMNO, '10'), codigo(estado, valor));
    assert.equal(s.llamadas.some(({ sql }) => /FROM cursos/.test(sql)), false);
    cierre(s, 'ROLLBACK');
  });
}

test('Certificados servicio: curso inexistente revierte', async (t) => {
  const s = simular(t, { sinCurso: true });
  await assert.rejects(emitirCertificado(ALUMNO, '10'), codigo(404, 'curso_no_encontrado'));
  cierre(s, 'ROLLBACK');
});

test('Certificados servicio: borrador no emite aunque tenga progresos', async (t) => {
  const s = simular(t, { estado: 'borrador' });
  await assert.rejects(emitirCertificado(ALUMNO, '10'), codigo(404, 'curso_no_encontrado'));
  cierre(s, 'ROLLBACK');
});

test('Certificados servicio: listado propio vacío y orden SQL explícito', async (t) => {
  const s = simular(t);
  assert.deepEqual(await listarMisCertificados(ALUMNO), []);
  cierre(s);
});

test('Certificados servicio: listado aplica lista de campos sin UID o datos extra', async (t) => {
  const s = simular(t, { lista: [{ ...CERTIFICADO, uid_estudiante: 'privado', telefono: 'privado' }] });
  assert.deepEqual(await listarMisCertificados(ALUMNO), [CERTIFICADO]);
  cierre(s);
});

for (const patron of [/FROM cursos/, /^INSERT INTO certificados/, /^COMMIT$/]) {
  test(`Certificados servicio: fallo ${String(patron)} revierte y libera conexión`, async (t) => {
    const s = simular(t, { fallar: patron });
    await assert.rejects(emitirCertificado(ALUMNO, '10'), /Detalle SQL privado/);
    assert.equal(s.guardado(), null);
    cierre(s, 'ROLLBACK');
  });
}

test('Certificados servicio: fallo de conexión se propaga sin consultas', async (t) => {
  const s = simular(t, { errorConexion: true });
  await assert.rejects(emitirCertificado(ALUMNO, '10'), /Conexión privada/);
  assert.equal(s.llamadas.length, 0);
});
