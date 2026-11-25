const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
process.env.DATABASE_URL = 'postgresql://prueba:prueba@localhost:5432/prueba';
process.env.FIREBASE_PROJECT_ID = 'demo-viva-tech-retiro';
const pool = require('../src/config/database');
const firebaseAuth = require('../src/config/firebase');
const app = require('../src/app');

const UID = 'uid-editor-retiro-prueba';
const FECHA = '2026-11-14T10:00:00.123456-06:00';
const FINAL = '2026-11-14T10:30:00.123789-06:00';
const RETIRO = '2026-11-14T11:00:00.987654-06:00';
const CERTIFICADO = { uid: 'alumno-certificado', tituloCurso: 'Curso histórico',
  lecciones: [{ titulo: 'Lección histórica' }], fechaFinalizacionCurso: FINAL };
let servidor;
let url;

before(async () => {
  await new Promise((resolve, reject) => {
    servidor = app.listen(0, '127.0.0.1', resolve);
    servidor.once('error', reject);
  });
  url = `http://127.0.0.1:${servidor.address().port}/api/cursos`;
});

after(async () => {
  if (servidor) {
    servidor.closeAllConnections();
    await new Promise((resolve, reject) => servidor.close((error) => error ? reject(error) : resolve()));
  }
  await pool.end();
});

function simular(t, opciones = {}) {
  const id = opciones.id || '10';
  const perfil = { uid: UID, rol: opciones.rol || 'maestro', activo: opciones.activo !== false };
  let datos = structuredClone({
    curso: opciones.sinCurso ? null : { idCurso: id, titulo: 'Curso temporal HTTP',
      estado_publicacion: 'borrador', creado_por: UID, ...opciones.curso },
    lecciones: opciones.sinContenido ? [] : [{ idLeccion: '21', titulo: 'Lección temporal', orden: 1 }],
    pasos: opciones.sinContenido ? [] : [1, 2, 3].map((orden) => ({ idPaso: String(100 + orden), idLeccion: '21', orden })),
    progresos: opciones.progresos || (opciones.conAvance ? [{ uid: 'alumno-progreso', idLeccion: '21',
      estado: opciones.completo ? 'completada' : 'en_progreso',
      idUltimoPasoCompletado: opciones.completo ? '103' : '101',
      fechaInicio: FECHA, fechaActualizacion: FECHA, fechaFinalizacion: opciones.completo ? FINAL : null }] : []),
    historiales: opciones.historiales || [], certificados: opciones.certificados || [],
    editores: opciones.editores || []
  });
  const inicial = structuredClone(datos);
  let guardado;
  const llamadas = [];
  const verificar = t.mock.method(firebaseAuth, 'verifyIdToken', async () => {
    if (opciones.errorToken) throw opciones.errorToken;
    return { uid: UID };
  });
  const cargarPerfil = t.mock.method(pool, 'query', async (sql, parametros) => {
    assert.match(sql, /FROM usuarios/);
    assert.deepEqual(parametros, [UID]);
    if (opciones.errorPerfil) throw opciones.errorPerfil;
    const rows = opciones.sinPerfil ? [] : [perfil];
    return { rows, rowCount: rows.length };
  });
  const cliente = {
    async query(sql, parametros) {
      const q = sql.trim();
      llamadas.push({ sql: q, parametros });
      if (opciones.fallar?.test(q)) throw opciones.error || new Error('Detalle SQL privado simulado');
      if (q === 'BEGIN') { guardado = structuredClone(datos); return { rows: [] }; }
      if (q === 'ROLLBACK') { datos = structuredClone(guardado); return { rows: [] }; }
      if (q === 'COMMIT' || q === 'SET CONSTRAINTS ALL IMMEDIATE') return { rows: [] };
      if (/^SELECT uid, rol, activo/.test(q)) {
        assert.deepEqual(parametros, [UID]);
        const vigente = Object.hasOwn(opciones, 'perfilTx') ? opciones.perfilTx : perfil;
        return { rows: vigente ? [vigente] : [] };
      }
      if (/^SELECT.*FROM cursos WHERE id_curso/s.test(q)) {
        assert.deepEqual(parametros, [id]);
        return { rows: datos.curso ? [{ ...datos.curso }] : [] };
      }
      if (/^SELECT.*FROM lecciones WHERE id_curso/s.test(q)) {
        assert.deepEqual(parametros, [id]);
        return { rows: structuredClone(datos.lecciones) };
      }
      if (/FROM pasos p JOIN/.test(q)) {
        assert.deepEqual(parametros, [id]);
        return { rows: structuredClone(datos.pasos) };
      }
      if (/GROUP BY p.uid_estudiante/.test(q)) {
        return { rows: [...new Set(datos.progresos.map((p) => p.uid))].map((uid) => ({ uid,
          fechaFinalizacionCurso: datos.progresos.filter((p) => p.uid === uid)
            .map((p) => p.fechaFinalizacion).filter(Boolean).sort().at(-1) || null })) };
      }
      if (/FROM progresos p JOIN/.test(q)) {
        assert.deepEqual(parametros, [id]);
        return { rows: structuredClone(datos.progresos) };
      }
      if (/FROM historial_cursos_retirados WHERE/.test(q)) return { rows: structuredClone(datos.historiales) };
      if (/FROM certificados WHERE/.test(q)) return { rows: structuredClone(datos.certificados) };
      if (/^SELECT to_jsonb\(clock_timestamp/.test(q)) return { rows: [{ fechaRetiro: RETIRO }] };
      if (/^INSERT INTO historial_cursos_retirados/.test(q)) {
        assert.equal(parametros[1], id);
        assert.equal(datos.historiales.some((h) => h.uid === parametros[0]), false);
        datos.historiales.push({ uid: parametros[0], lecciones: JSON.parse(parametros[2]),
          cursoCompletado: parametros[3], fechaFinalizacionCurso: parametros[4], fechaRetiro: parametros[5] });
        return { rows: [], rowCount: 1 };
      }
      for (const tabla of ['progresos', 'pasos', 'lecciones']) {
        if (q.startsWith(`DELETE FROM ${tabla}`)) {
          assert.deepEqual(parametros, [id]);
          const rowCount = datos[tabla].length;
          datos[tabla] = [];
          return { rows: [], rowCount };
        }
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
        const rowCount = datos.curso ? 1 : 0;
        datos.curso = null;
        return { rows: [], rowCount };
      }
      if (/^UPDATE cursos SET estado_publicacion/.test(q)) {
        assert.deepEqual(parametros, [id]);
        datos.curso.estado_publicacion = 'retirado';
        return { rows: [], rowCount: 1 };
      }
      assert.fail(`Consulta no prevista: ${q}`);
    },
    release: t.mock.fn()
  };
  const conectar = t.mock.method(pool, 'connect', async () => {
    if (opciones.errorConexion) throw opciones.errorConexion;
    return cliente;
  });
  return { verificar, cargarPerfil, conectar, llamadas, cliente, inicial, datos: () => structuredClone(datos) };
}

function solicitar({ ruta = '/10', token = 'Bearer token-prueba', crudo, cuerpo } = {}) {
  return fetch(`${url}${ruta}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', ...(token === null ? {} : { Authorization: token }) },
    body: crudo !== undefined ? crudo : cuerpo === undefined ? undefined : JSON.stringify(cuerpo)
  });
}

async function comprobarError(respuesta, estado, codigo) {
  assert.equal(respuesta.status, estado);
  assert.equal(respuesta.headers.get('cache-control'), 'no-store');
  const cuerpo = await respuesta.json();
  assert.equal(cuerpo.ok, false);
  assert.equal(typeof cuerpo.mensaje, 'string');
  if (codigo) assert.equal(cuerpo.codigo, codigo);
  return cuerpo;
}

for (const rol of ['maestro', 'administrador']) {
  for (const estado_publicacion of ['borrador', 'publicado']) {
    test(`DELETE cursos: ${rol} elimina ${estado_publicacion} sin evidencia con 204 vacío`, async (t) => {
      const s = simular(t, { rol, curso: { estado_publicacion,
        creado_por: rol === 'administrador' ? 'otro-autor' : UID } });
      const respuesta = await solicitar();
      assert.equal(respuesta.status, 204);
      assert.equal(respuesta.headers.get('cache-control'), 'no-store');
      assert.equal(await respuesta.text(), '');
      assert.equal(s.datos().curso, null);
      assert.deepEqual(s.datos().lecciones, []);
      assert.deepEqual(s.datos().pasos, []);
      assert.deepEqual(s.datos().historiales, []);
      assert.equal(s.llamadas.at(-1).sql, 'COMMIT');
      assert.equal(s.cliente.release.mock.callCount(), 1);
    });
  }
  for (const completo of [false, true]) {
    test(`DELETE cursos: ${rol} retira con progreso, completo ${completo}, con 200 mínimo`, async (t) => {
      const s = simular(t, { rol, conAvance: true, completo, curso: { estado_publicacion: 'publicado',
        creado_por: rol === 'administrador' ? 'otro-autor' : UID } });
      const respuesta = await solicitar();
      assert.equal(respuesta.status, 200);
      assert.equal(respuesta.headers.get('cache-control'), 'no-store');
      assert.deepEqual(await respuesta.json(), { idCurso: '10', estadoPublicacion: 'retirado', resultado: 'retirado' });
      const d = s.datos();
      assert.equal(d.curso.estado_publicacion, 'retirado');
      assert.deepEqual(d.progresos, []);
      assert.deepEqual(d.pasos, []);
      assert.deepEqual(d.lecciones, []);
      assert.equal(d.historiales.length, 1);
      assert.equal(d.historiales[0].cursoCompletado, completo);
      assert.equal(d.historiales[0].fechaFinalizacionCurso, completo ? FINAL : null);
      assert.equal(d.historiales[0].lecciones[0].pasosCompletados, completo ? 3 : 1);
      assert.equal(s.llamadas.at(-1).sql, 'COMMIT');
      assert.equal(s.cliente.release.mock.callCount(), 1);
    });
  }
}

test('DELETE cursos: borrador vacío se elimina con 204 sin inventar historial', async (t) => {
  const s = simular(t, { sinContenido: true });
  const respuesta = await solicitar();
  assert.equal(respuesta.status, 204);
  assert.equal(respuesta.headers.get('cache-control'), 'no-store');
  assert.equal(await respuesta.text(), '');
  assert.deepEqual(s.datos().historiales, []);
});

test('DELETE cursos: certificado sin progreso produce retiro y conserva instantánea acreditada', async (t) => {
  const s = simular(t, { certificados: [CERTIFICADO] });
  const respuesta = await solicitar();
  assert.equal(respuesta.status, 200);
  assert.equal(respuesta.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await respuesta.json(), { idCurso: '10', estadoPublicacion: 'retirado', resultado: 'retirado' });
  const d = s.datos();
  assert.deepEqual(d.certificados, [CERTIFICADO]);
  assert.equal(d.historiales[0].cursoCompletado, true);
  assert.equal(d.historiales[0].fechaFinalizacionCurso, FINAL);
  assert.deepEqual(d.historiales[0].lecciones.map((l) => l.titulo), ['Lección histórica']);
  assert.equal(Object.hasOwn(d.historiales[0].lecciones[0], 'idLeccion'), false);
  assert.equal(Object.hasOwn(d.historiales[0].lecciones[0], 'fechaFinalizacion'), false);
});

for (const rol of ['maestro', 'administrador']) {
  test(`DELETE cursos: repetir retiro como ${rol} devuelve mismo 200 sin más escrituras`, async (t) => {
    const s = simular(t, { rol, conAvance: true });
    const primera = await solicitar();
    assert.equal(primera.status, 200);
    const cuerpo = await primera.json();
    const referencia = s.datos();
    const corte = s.llamadas.length;
    const repetida = await solicitar();
    assert.equal(repetida.status, 200);
    assert.equal(repetida.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await repetida.json(), cuerpo);
    assert.deepEqual(s.datos(), referencia);
    assert.equal(s.llamadas.slice(corte).some(({ sql }) => /^(INSERT|UPDATE|DELETE)/.test(sql)), false);
    assert.equal(s.llamadas.filter(({ sql }) => /^INSERT INTO historial/.test(sql)).length, 1);
    assert.equal(s.cliente.release.mock.callCount(), 2);
  });
}

test('DELETE cursos: repetir eliminación física devuelve 404, no retiro ficticio', async (t) => {
  simular(t);
  const primera = await solicitar();
  assert.equal(primera.status, 204);
  await primera.text();
  await comprobarError(await solicitar(), 404, 'curso_no_encontrado');
});

for (const id of ['9007199254740993', '9223372036854775807']) {
  test(`DELETE cursos: retirado conserva BIGINT como cadena ${id}`, async (t) => {
    const s = simular(t, { id, curso: { estado_publicacion: 'retirado' } });
    const respuesta = await solicitar({ ruta: `/${id}` });
    assert.equal(respuesta.status, 200);
    assert.equal(respuesta.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await respuesta.json(), { idCurso: id, estadoPublicacion: 'retirado', resultado: 'retirado' });
    assert.equal(s.llamadas.some(({ sql }) => /^(INSERT|UPDATE|DELETE)/.test(sql)), false);
  });
}

for (const token of [null, 'Basic prueba', 'Bearer uno,dos', 'Bearer']) {
  test(`DELETE cursos: autenticación mal formada ${token}`, async (t) => {
    const s = simular(t);
    await comprobarError(await solicitar({ token }), 401);
    assert.equal(s.verificar.mock.callCount(), 0);
    assert.equal(s.cargarPerfil.mock.callCount(), 0);
    assert.equal(s.conectar.mock.callCount(), 0);
  });
}

for (const code of ['auth/invalid-id-token', 'auth/id-token-expired']) {
  test(`DELETE cursos: token rechazado ${code}`, async (t) => {
    const s = simular(t, { errorToken: Object.assign(new Error('Token simulado'), { code }) });
    await comprobarError(await solicitar(), 401);
    assert.equal(s.cargarPerfil.mock.callCount(), 0);
    assert.equal(s.conectar.mock.callCount(), 0);
  });
}

for (const [opciones, estado, esperado] of [
  [{ sinPerfil: true }, 404, 'perfil_no_registrado'],
  [{ activo: false }, 403, 'cuenta_desactivada'],
  [{ rol: 'estudiante' }, 403, 'rol_no_autorizado']
]) {
  test(`DELETE cursos: acceso rechazado ${esperado} antes de conectar`, async (t) => {
    const s = simular(t, opciones);
    await comprobarError(await solicitar(), estado, esperado);
    assert.equal(s.conectar.mock.callCount(), 0);
    assert.deepEqual(s.datos(), s.inicial);
  });
}

for (const [perfilTx, estado, esperado] of [
  [null, 404, 'perfil_no_registrado'],
  [{ uid: UID, rol: 'maestro', activo: false }, 403, 'cuenta_desactivada'],
  [{ uid: UID, rol: 'estudiante', activo: true }, 403, 'rol_no_autorizado']
]) {
  test(`DELETE cursos: reconfirma perfil vigente ${esperado}`, async (t) => {
    const s = simular(t, { perfilTx });
    await comprobarError(await solicitar(), estado, esperado);
    assert.equal(s.llamadas.some(({ sql }) => /^(INSERT|UPDATE|DELETE)/.test(sql)), false);
    assert.equal(s.llamadas.at(-1).sql, 'ROLLBACK');
    assert.equal(s.cliente.release.mock.callCount(), 1);
  });
}

for (const estado_publicacion of ['borrador', 'publicado', 'retirado']) {
  test(`DELETE cursos: maestro ajeno no elimina ni repite ${estado_publicacion}`, async (t) => {
    const s = simular(t, { curso: { estado_publicacion, creado_por: 'otro-autor' } });
    await comprobarError(await solicitar(), 403, 'curso_ajeno');
    assert.equal(s.llamadas.some(({ sql }) => /^(INSERT|UPDATE|DELETE)/.test(sql)), false);
    assert.deepEqual(s.datos(), s.inicial);
  });
}

test('DELETE cursos: rol administrador anterior no sustituye al perfil vigente', async (t) => {
  const s = simular(t, { rol: 'administrador', curso: { creado_por: 'otro-autor' },
    perfilTx: { uid: UID, rol: 'maestro', activo: true } });
  await comprobarError(await solicitar(), 403, 'curso_ajeno');
  assert.deepEqual(s.datos(), s.inicial);
});

for (const id of ['0', '-1', '01', 'abc', '1.5', '9223372036854775808']) {
  test(`DELETE cursos: identificador inválido ${id}`, async (t) => {
    const s = simular(t);
    await comprobarError(await solicitar({ ruta: `/${id}` }), 400, 'id_curso_invalido');
    assert.equal(s.conectar.mock.callCount(), 0);
  });
}

test('DELETE cursos: BIGINT válido inexistente devuelve 404', async (t) => {
  const id = '9223372036854775807';
  const s = simular(t, { id, sinCurso: true });
  await comprobarError(await solicitar({ ruta: `/${id}` }), 404, 'curso_no_encontrado');
  assert.equal(s.llamadas.at(-1).sql, 'ROLLBACK');
});

for (const crudo of ['null', '"texto"', '{"uid":']) {
  test(`DELETE cursos: JSON mal formado ${crudo} mantiene no-store`, async (t) => {
    const s = simular(t);
    await comprobarError(await solicitar({ crudo }), 400, 'json_invalido');
    assert.equal(s.verificar.mock.callCount(), 0);
    assert.equal(s.conectar.mock.callCount(), 0);
  });
}

for (const datos of [
  { ruta: '/10?uid=otro-autor&rol=administrador' },
  { cuerpo: { uid: 'otro-autor', rol: 'administrador', creado_por: UID } }
]) {
  test(`DELETE cursos: identidad del cliente no eleva permisos ${JSON.stringify(datos)}`, async (t) => {
    const s = simular(t, { curso: { creado_por: 'otro-autor' } });
    await comprobarError(await solicitar(datos), 403, 'curso_ajeno');
    assert.deepEqual(s.datos(), s.inicial);
  });
}

for (const opciones of [
  { certificados: [{ ...CERTIFICADO, lecciones: [] }] },
  { historiales: [{ uid: 'alumno-historico', lecciones: [], cursoCompletado: true, fechaFinalizacionCurso: FINAL }] },
  { conAvance: true, certificados: [{ ...CERTIFICADO, uid: 'alumno-progreso' }] }
]) {
  test(`DELETE cursos: evidencia inconsistente devuelve 409 sin exponer expedientes ${JSON.stringify(opciones)}`, async (t) => {
    const s = simular(t, opciones);
    const cuerpo = await comprobarError(await solicitar(), 409, 'historial_inconsistente');
    assert.deepEqual(Object.keys(cuerpo).sort(), ['codigo', 'mensaje', 'ok']);
    assert.equal(JSON.stringify(cuerpo).includes('alumno-'), false);
    assert.equal(JSON.stringify(cuerpo).includes('Lección histórica'), false);
    assert.equal(s.llamadas.some(({ sql }) => /^(INSERT|UPDATE|DELETE)/.test(sql)), false);
    assert.deepEqual(s.datos(), s.inicial);
    assert.equal(s.llamadas.at(-1).sql, 'ROLLBACK');
  });
}

for (const fallar of [/^SELECT uid, rol/, /^INSERT INTO historial/, /^DELETE FROM progresos/,
  /^DELETE FROM pasos/, /^DELETE FROM lecciones/, /^UPDATE cursos SET/, /^SET CONSTRAINTS/, /^COMMIT$/]) {
  test(`DELETE cursos: fallo ${fallar} responde 503 seguro y solicita rollback`, async (t) => {
    const privado = 'SELECT detalle_privado_del_retiro';
    const s = simular(t, { conAvance: true, fallar, error: new Error(privado) });
    const registro = t.mock.method(console, 'error', () => {});
    const cuerpo = await comprobarError(await solicitar(), 503, 'operacion_cursos_no_disponible');
    assert.equal(JSON.stringify(cuerpo).includes(privado), false);
    assert.equal(JSON.stringify(registro.mock.calls).includes(privado), false);
    assert.deepEqual(s.datos(), s.inicial);
    assert.equal(s.llamadas.at(-1).sql, 'ROLLBACK');
    assert.equal(s.cliente.release.mock.callCount(), 1);
  });
}

test('DELETE cursos: fallo al eliminar físicamente no devuelve un 204 falso', async (t) => {
  const s = simular(t, { fallar: /^DELETE FROM cursos/ });
  t.mock.method(console, 'error', () => {});
  await comprobarError(await solicitar(), 503, 'operacion_cursos_no_disponible');
  assert.deepEqual(s.datos(), s.inicial);
  assert.equal(s.llamadas.at(-1).sql, 'ROLLBACK');
});

for (const opciones of [
  { errorConexion: new Error('Conexión simulada no disponible') },
  { errorPerfil: new Error('Perfil simulado no disponible') },
  { errorToken: Object.assign(new Error('Firebase simulado no disponible'), { code: 'app/network-error' }) }
]) {
  test(`DELETE cursos: indisponibilidad ${Object.keys(opciones)[0]} responde 503`, async (t) => {
    const s = simular(t, opciones);
    t.mock.method(console, 'error', () => {});
    await comprobarError(await solicitar(), 503);
    assert.deepEqual(s.datos(), s.inicial);
  });
}

for (const estado_publicacion of ['borrador', 'publicado', 'retirado']) {
  test(`DELETE cursos P4: editor recibe 403 permiso_solo_edicion en ${estado_publicacion}`, async (t) => {
    const s = simular(t, { curso: { estado_publicacion, creado_por: 'otro-autor' }, esEditor: true });
    const respuesta = await solicitar();
    assert.equal(respuesta.status, 403);
    assert.equal(respuesta.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await respuesta.json(), {
      ok: false,
      mensaje: 'Tienes permiso para editar este curso, pero no para esta acción.',
      codigo: 'permiso_solo_edicion'
    });
    assert.equal(s.llamadas.some(({ sql }) => /^(INSERT|UPDATE|DELETE)/.test(sql)), false);
    assert.deepEqual(s.datos(), s.inicial);
  });
}
