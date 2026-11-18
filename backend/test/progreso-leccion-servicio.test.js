const { test, after } = require('node:test');
const assert = require('node:assert/strict');

process.env.DATABASE_URL = 'postgresql://prueba:prueba@localhost:5432/prueba';
const pool = require('../src/config/database');
const { guardarPasoLeccion } = require('../src/services/lecciones');
const { ErrorReglaCurso } = require('../src/services/reglas-cursos');

const ALUMNO = { uid: 'uid-alumno-prueba', rol: 'estudiante', activo: true };
const AHORA = new Date('2026-11-10T12:00:00.000Z');
const FECHA = '2026-11-10T10:00:00.000Z';
const PASOS = [1, 2, 3].map((orden) => ({ idPaso: String(100 + orden), orden }));

after(async () => { await pool.end(); });

function simular(t, opciones = {}) {
  const llamadas = [];
  const uid = opciones.uid || ALUMNO.uid;
  const id = opciones.id || '21';
  const pasos = opciones.pasos || PASOS;
  let progreso = opciones.progreso || null;
  const cliente = {
    async query(sql, parametros) {
      const texto = sql.trim();
      llamadas.push({ sql: texto, parametros });
      if (opciones.fallar && opciones.fallar.test(texto)) throw opciones.error || new Error('Fallo simulado');
      if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(texto)) return { rows: [] };
      if (/FOR UPDATE OF c/.test(texto)) {
        assert.deepEqual(parametros, [id]);
        return { rows: opciones.sinCurso ? [] : [{
          idCurso: '10', estado_publicacion: opciones.estado || 'publicado', fecha_cierre: opciones.cierre || null
        }] };
      }
      if (/AS retirada/.test(texto)) {
        assert.deepEqual(parametros, [id]);
        return { rows: [{ retirada: opciones.retirada === true }] };
      }
      if (/FROM lecciones[\s\S]*FOR UPDATE/.test(texto)) {
        assert.deepEqual(parametros, [id, '10']);
        return { rows: opciones.sinLeccion ? [] : [{ idLeccion: id }] };
      }
      if (/AS "tieneAvance"/.test(texto)) {
        assert.deepEqual(parametros, [uid, '10']);
        return { rows: [{ tieneAvance: opciones.avance ?? Boolean(progreso) }] };
      }
      if (/FROM pasos/.test(texto)) {
        assert.deepEqual(parametros, [id]);
        return { rows: pasos };
      }
      if (/FROM progresos[\s\S]*FOR UPDATE/.test(texto)) {
        assert.deepEqual(parametros, [uid, id]);
        return { rows: progreso ? [progreso] : [] };
      }
      if (/^(INSERT INTO|UPDATE) progresos/.test(texto)) {
        assert.equal(parametros[0], uid);
        assert.equal(parametros[1], id);
        progreso = {
          estadoProgreso: parametros[2], idUltimoPasoCompletado: parametros[3],
          fechaFinalizacion: parametros[4] ? FECHA : null
        };
        return { rows: opciones.sinRetorno ? [] : [progreso] };
      }
      if (/AS "totalLecciones"/.test(texto)) {
        assert.deepEqual(parametros, [uid, '10']);
        return { rows: [opciones.resumen || {
          totalLecciones: 2, leccionesCompletadas: progreso?.estadoProgreso === 'completada' ? 1 : 0
        }] };
      }
      assert.fail(`Consulta no prevista: ${texto}`);
    },
    release: t.mock.fn()
  };
  const conectar = t.mock.method(pool, 'connect', async () => cliente);
  t.mock.method(pool, 'query', async () => assert.fail('Toda consulta debe usar la conexión transaccional'));
  return { llamadas, cliente, conectar };
}

function ejecutar(idPaso = '101', opciones = {}) {
  return guardarPasoLeccion(ALUMNO, '21', idPaso, { reloj: () => AHORA, ...opciones });
}

function codigo(estado, esperado) {
  return (error) => error instanceof ErrorReglaCurso && error.estado === estado && error.codigo === esperado;
}

function comprobarCierre(simulacion, final = 'COMMIT') {
  assert.equal(simulacion.llamadas[0].sql, 'BEGIN');
  assert.equal(simulacion.llamadas.at(-1).sql, final);
  assert.equal(simulacion.cliente.release.mock.callCount(), 1);
}

test('Guardar servicio: primer paso inserta progreso y devuelve contrato directo', async (t) => {
  const s = simular(t);
  assert.deepEqual(await ejecutar(), {
    idLeccion: '21', estado: 'en_progreso', idUltimoPasoCompletado: '101',
    idPasoParaContinuar: '102', pasosCompletados: 1, totalPasos: 3,
    fechaFinalizacion: null, leccionCompletada: false, cursoCompletado: false
  });
  assert.equal(s.llamadas.filter(({ sql }) => /^INSERT INTO progresos/.test(sql)).length, 1);
  comprobarCierre(s);
});

test('Guardar servicio: siguiente paso actualiza el registro existente', async (t) => {
  const s = simular(t, { progreso: { estadoProgreso: 'en_progreso', idUltimoPasoCompletado: '101', fechaFinalizacion: null } });
  const resultado = await ejecutar('102');
  assert.equal(resultado.pasosCompletados, 2);
  assert.equal(resultado.idPasoParaContinuar, '103');
  assert.equal(s.llamadas.filter(({ sql }) => /^UPDATE progresos/.test(sql)).length, 1);
  comprobarCierre(s);
});

test('Guardar servicio: último paso completa lección pero no todo el curso', async (t) => {
  const s = simular(t, { progreso: { estadoProgreso: 'en_progreso', idUltimoPasoCompletado: '102', fechaFinalizacion: null } });
  const resultado = await ejecutar('103');
  assert.equal(resultado.estado, 'completada');
  assert.equal(resultado.leccionCompletada, true);
  assert.equal(resultado.cursoCompletado, false);
  assert.equal(resultado.idPasoParaContinuar, null);
  assert.equal(resultado.fechaFinalizacion, FECHA);
  comprobarCierre(s);
});

test('Guardar servicio: completa curso según su total real y sin emitir certificado', async (t) => {
  const s = simular(t, {
    progreso: { estadoProgreso: 'en_progreso', idUltimoPasoCompletado: '102', fechaFinalizacion: null },
    resumen: { totalLecciones: 7, leccionesCompletadas: 7 }
  });
  assert.equal((await ejecutar('103')).cursoCompletado, true);
  assert.equal(s.llamadas.some(({ sql }) => /certificados/i.test(sql)), false);
  comprobarCierre(s);
});

test('Guardar servicio: lección histórica de un paso se completa desde el primer guardado', async (t) => {
  const s = simular(t, { pasos: [PASOS[0]], resumen: { totalLecciones: 1, leccionesCompletadas: 1 } });
  const resultado = await ejecutar();
  assert.equal(resultado.estado, 'completada');
  assert.equal(resultado.cursoCompletado, true);
  assert.equal(resultado.pasosCompletados, 1);
  assert.equal(resultado.idPasoParaContinuar, null);
  comprobarCierre(s);
});

for (const idPaso of ['101', '102']) {
  test(`Guardar servicio: repetir paso ${idPaso} no retrocede ni actualiza fechas`, async (t) => {
    const s = simular(t, { progreso: { estadoProgreso: 'en_progreso', idUltimoPasoCompletado: '102', fechaFinalizacion: null } });
    const resultado = await ejecutar(idPaso);
    assert.equal(resultado.idUltimoPasoCompletado, '102');
    assert.equal(resultado.idPasoParaContinuar, '103');
    assert.equal(s.llamadas.some(({ sql }) => /^(INSERT INTO|UPDATE) progresos/.test(sql)), false);
    comprobarCierre(s);
  });
}

for (const idPaso of ['101', '102', '103']) {
  test(`Guardar servicio: repaso de completada con ${idPaso} conserva finalización sin UPDATE`, async (t) => {
    const s = simular(t, { progreso: {
      estadoProgreso: 'completada', idUltimoPasoCompletado: '103', fechaFinalizacion: '2026-11-08T12:00:00-06:00'
    } });
    const resultado = await ejecutar(idPaso);
    assert.equal(resultado.fechaFinalizacion, '2026-11-08T18:00:00.000Z');
    assert.equal(resultado.estado, 'completada');
    assert.equal(resultado.idUltimoPasoCompletado, '103');
    assert.equal(s.llamadas.some(({ sql }) => /^(INSERT INTO|UPDATE) progresos/.test(sql)), false);
    comprobarCierre(s);
  });
}

for (const [progreso, paso] of [
  [null, '102'], [null, '103'],
  [{ estadoProgreso: 'en_progreso', idUltimoPasoCompletado: '101', fechaFinalizacion: null }, '103']
]) {
  test(`Guardar servicio: salto hacia ${paso} responde 409 y rollback`, async (t) => {
    const s = simular(t, { progreso });
    await assert.rejects(ejecutar(paso), codigo(409, 'paso_fuera_de_secuencia'));
    assert.equal(s.llamadas.some(({ sql }) => /^(INSERT INTO|UPDATE) progresos/.test(sql)), false);
    comprobarCierre(s, 'ROLLBACK');
  });
}

test('Guardar servicio: paso inexistente o ajeno responde 400 sin buscarlo en otras lecciones', async (t) => {
  const s = simular(t);
  await assert.rejects(ejecutar('999'), codigo(400, 'id_paso_invalido'));
  comprobarCierre(s, 'ROLLBACK');
});

for (const [campo, valor] of [
  ['leccion', '0'], ['leccion', '01'], ['leccion', '9223372036854775808'],
  ['paso', '0'], ['paso', '-1'], ['paso', '01'], ['paso', '1.5'],
  ['paso', '1e2'], ['paso', ' 101'], ['paso', 101], ['paso', null],
  ['paso', undefined], ['paso', '9223372036854775808']
]) {
  test(`Guardar servicio: ID ${campo} inválido ${String(valor)} no conecta`, async (t) => {
    const conectar = t.mock.method(pool, 'connect', async () => assert.fail('No debe conectar'));
    await assert.rejects(
      guardarPasoLeccion(ALUMNO, campo === 'leccion' ? valor : '21', campo === 'paso' ? valor : '101'),
      codigo(400, campo === 'leccion' ? 'id_leccion_invalido' : 'id_paso_invalido')
    );
    assert.equal(conectar.mock.callCount(), 0);
  });
}

test('Guardar servicio: BIGINT máximo nunca se convierte a Number', async (t) => {
  const id = '9223372036854775807';
  const s = simular(t, { id, pasos: [{ idPaso: id, orden: 1 }] });
  const resultado = await guardarPasoLeccion(ALUMNO, id, id, { reloj: () => AHORA });
  assert.equal(resultado.idLeccion, id);
  assert.equal(resultado.idUltimoPasoCompletado, id);
  comprobarCierre(s);
});

for (const [usuario, estado, esperado] of [
  [null, 404, 'perfil_no_registrado'],
  [{ ...ALUMNO, activo: false }, 403, 'cuenta_desactivada'],
  [{ ...ALUMNO, rol: 'maestro' }, 403, 'rol_no_autorizado'],
  [{ ...ALUMNO, rol: 'administrador' }, 403, 'rol_no_autorizado'],
  [{ ...ALUMNO, uid: '' }, 403, 'rol_no_autorizado']
]) {
  test(`Guardar servicio: solicitante inválido ${esperado} no conecta`, async (t) => {
    t.mock.method(pool, 'connect', async () => assert.fail('No debe conectar'));
    await assert.rejects(guardarPasoLeccion(usuario, '21', '101'), codigo(estado, esperado));
  });
}

for (const [opciones, estado, esperado] of [
  [{ sinCurso: true }, 404, 'leccion_no_encontrada'],
  [{ sinCurso: true, retirada: true }, 404, 'curso_retirado'],
  [{ sinLeccion: true, retirada: true }, 404, 'curso_retirado'],
  [{ estado: 'borrador' }, 404, 'leccion_no_encontrada'],
  [{ estado: 'retirado' }, 404, 'curso_retirado'],
  [{ cierre: '2026-11-09' }, 409, 'curso_cerrado']
]) {
  test(`Guardar servicio: acceso rechazado ${JSON.stringify(opciones)}`, async (t) => {
    const s = simular(t, opciones);
    await assert.rejects(ejecutar(), codigo(estado, esperado));
    comprobarCierre(s, 'ROLLBACK');
  });
}

test('Guardar servicio: cerrado con avance en otra lección permite primer paso', async (t) => {
  const s = simular(t, { cierre: '2026-11-09', avance: true });
  assert.equal((await ejecutar()).estado, 'en_progreso');
  comprobarCierre(s);
});

test('Guardar servicio: consulta reloj después de bloquear curso y lección', async (t) => {
  const s = simular(t, { cierre: '2026-11-09' });
  await assert.rejects(ejecutar('101', { reloj: () => {
    assert.ok(s.llamadas.some(({ sql }) => /FOR UPDATE OF c/.test(sql)));
    assert.ok(s.llamadas.some(({ sql }) => /FROM lecciones[\s\S]*FOR UPDATE/.test(sql)));
    return new Date('2026-11-10T06:00:00.000Z');
  } }), codigo(409, 'curso_cerrado'));
  comprobarCierre(s, 'ROLLBACK');
});

test('Guardar servicio: disponible durante el día de cierre en México', async (t) => {
  const s = simular(t, { cierre: '2026-11-09' });
  const resultado = await ejecutar('101', { reloj: () => new Date('2026-11-10T05:59:59.999Z') });
  assert.equal(resultado.estado, 'en_progreso');
  comprobarCierre(s);
});

for (const fallar of [/^BEGIN$/, /FOR UPDATE OF c/, /FROM pasos/, /^INSERT INTO progresos/, /AS "totalLecciones"/, /^COMMIT$/]) {
  test(`Guardar servicio: fallo ${fallar} libera conexión y revierte si corresponde`, async (t) => {
    const error = new Error('Fallo privado simulado');
    const s = simular(t, { fallar, error });
    await assert.rejects(ejecutar(), (recibido) => recibido === error);
    assert.equal(s.cliente.release.mock.callCount(), 1);
    assert.equal(s.llamadas.some(({ sql }) => sql === 'ROLLBACK'), !fallar.test('BEGIN'));
  });
}

test('Guardar servicio: fallo de pool.connect se propaga sin consultar', async (t) => {
  const error = new Error('Sin conexión');
  t.mock.method(pool, 'connect', async () => { throw error; });
  await assert.rejects(ejecutar(), (recibido) => recibido === error);
});

test('Guardar servicio: si falla rollback descarta conexión y conserva error original', async (t) => {
  const s = simular(t);
  const consulta = s.cliente.query.bind(s.cliente);
  const fallo = new Error('Fallo original');
  const rollback = new Error('Fallo rollback');
  s.cliente.query = async (sql, parametros) => {
    if (/INSERT INTO progresos/.test(sql)) throw fallo;
    if (sql === 'ROLLBACK') throw rollback;
    return consulta(sql, parametros);
  };
  t.mock.method(console, 'error', () => {});
  await assert.rejects(ejecutar(), (recibido) => recibido === fallo);
  assert.deepEqual(s.cliente.release.mock.calls[0].arguments, [rollback]);
});

for (const opciones of [
  { pasos: [] }, { sinRetorno: true },
  { progreso: { estadoProgreso: 'en_progreso', idUltimoPasoCompletado: '999', fechaFinalizacion: null } },
  { resumen: { totalLecciones: 0, leccionesCompletadas: 0 } },
  { resumen: { totalLecciones: 2, leccionesCompletadas: 3 } }
]) {
  test(`Guardar servicio: inconsistencia revierte ${JSON.stringify(opciones)}`, async (t) => {
    const s = simular(t, opciones);
    await assert.rejects(ejecutar(), TypeError);
    comprobarCierre(s, 'ROLLBACK');
  });
}

test('Guardar servicio: orden de bloqueos y parámetros propios', async (t) => {
  const s = simular(t, { uid: 'otro-alumno' });
  await guardarPasoLeccion({ ...ALUMNO, uid: 'otro-alumno' }, '21', '101', { reloj: () => AHORA });
  const curso = s.llamadas.findIndex(({ sql }) => /FOR UPDATE OF c/.test(sql));
  const leccion = s.llamadas.findIndex(({ sql }) => /FROM lecciones[\s\S]*FOR UPDATE/.test(sql));
  const progreso = s.llamadas.findIndex(({ sql }) => /FROM progresos[\s\S]*FOR UPDATE/.test(sql));
  assert.ok(curso < leccion && leccion < progreso);
  const escritura = s.llamadas.find(({ sql }) => /^INSERT INTO progresos/.test(sql));
  assert.equal(escritura.parametros[0], 'otro-alumno');
  assert.match(escritura.sql, /clock_timestamp\(\)/);
  comprobarCierre(s);
});
