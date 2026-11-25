const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

process.env.DATABASE_URL = 'postgresql://prueba:prueba@localhost:5432/prueba';
process.env.FIREBASE_PROJECT_ID = 'demo-viva-tech-editor';
const pool = require('../src/config/database');
const firebaseAuth = require('../src/config/firebase');
const app = require('../src/app');

const UID = 'uid-editor-prueba';
const META = { titulo: 'Nueva lección', objetivo: 'Practicar.', duracionEstimadaMinutos: 3 };
const LECTURA = { instruccion: 'Lee el ejemplo.', recursos: [], actividad: { tipo: 'lectura' } };
const OPERACIONES = [
  { metodo: 'POST', ruta: '/cursos/10/lecciones', cuerpo: META, estado: 201, tipo: 'curso' },
  { metodo: 'PATCH', ruta: '/lecciones/21', cuerpo: { titulo: 'Corregida' }, estado: 200, tipo: 'leccion', textual: true },
  { metodo: 'DELETE', ruta: '/lecciones/21', estado: 204, tipo: 'leccion' },
  { metodo: 'PUT', ruta: '/cursos/10/orden-lecciones', cuerpo: { idsLecciones: ['22', '21'] }, estado: 200, tipo: 'curso' },
  { metodo: 'POST', ruta: '/lecciones/21/pasos', cuerpo: LECTURA, estado: 201, tipo: 'leccion' },
  { metodo: 'PATCH', ruta: '/pasos/101', cuerpo: { instruccion: 'Corregida.' }, estado: 200, tipo: 'paso', textual: true },
  { metodo: 'DELETE', ruta: '/pasos/101', estado: 204, tipo: 'paso' },
  { metodo: 'PUT', ruta: '/lecciones/21/orden-pasos', cuerpo: { idsPasos: ['102', '101'] }, estado: 200, tipo: 'leccion' }
];
let servidor;
let url;

before(async () => {
  await new Promise((resolve, reject) => {
    servidor = app.listen(0, '127.0.0.1', resolve);
    servidor.once('error', reject);
  });
  url = `http://127.0.0.1:${servidor.address().port}/api`;
});

after(async () => {
  if (servidor) {
    servidor.closeAllConnections();
    await new Promise((resolve, reject) => servidor.close((error) => error ? reject(error) : resolve()));
  }
  await pool.end();
});

function simular(t, opciones = {}) {
  const perfil = { uid: UID, rol: opciones.rol || 'maestro', activo: opciones.activo !== false };
  let lecciones = [
    { idLeccion: '21', idCurso: '10', ...META, orden: 1 },
    { idLeccion: '22', idCurso: '10', ...META, orden: 2 }
  ];
  let pasos = [1, 2].map((orden) => ({ idPaso: String(100 + orden), idLeccion: '21', orden, ...structuredClone(LECTURA) }));
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
      if (opciones.fallar?.test(q)) throw opciones.error || new Error('Detalle SQL privado');
      if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(q) || q.startsWith('SET CONSTRAINTS')) return { rows: [] };
      if (/^SELECT uid, rol, activo/.test(q)) {
        assert.deepEqual(parametros, [UID]);
        const vigente = Object.hasOwn(opciones, 'perfilTx') ? opciones.perfilTx : perfil;
        return { rows: vigente ? [vigente] : [] };
      }
      if (/^SELECT 1 AS permiso FROM curso_editores/.test(q)) {
        assert.match(q, /FOR SHARE$/);
        return { rows: opciones.esEditor ? [{ permiso: 1 }] : [] };
      }
      if (/jsonb_array_elements/.test(q)) return { rows: opciones.historica ? [{ idCurso: '10' }] : [] };
      if (/FROM cursos WHERE id_curso.*FOR UPDATE/s.test(q)) return { rows: opciones.sinCurso ? [] : [{
        idCurso: '10', creado_por: opciones.autor || UID, estado_publicacion: opciones.estado || 'borrador'
      }] };
      if (/FROM progresos/.test(q)) return { rows: [{ tieneAvance: opciones.avance === true }] };
      if (/FROM pasos p JOIN lecciones/.test(q)) {
        const paso = pasos.find((p) => p.idPaso === parametros[0]);
        return { rows: paso ? [{ idCurso: '10', idLeccion: paso.idLeccion }] : [] };
      }
      if (/AS total,/.test(q)) {
        const filas = q.includes('FROM lecciones') ? lecciones : pasos.filter((p) => p.idLeccion === parametros[0]);
        return { rows: [{ total: filas.length, ultimo: Math.max(0, ...filas.map((f) => f.orden)) }] };
      }
      if (/^INSERT INTO lecciones/.test(q)) {
        assert.equal(parametros[5], UID);
        const fila = { idLeccion: '23', idCurso: parametros[0], titulo: parametros[1], objetivo: parametros[2], duracionEstimadaMinutos: parametros[3], orden: parametros[6] };
        lecciones.push(fila);
        return { rows: [{ idLeccion: fila.idLeccion }] };
      }
      if (/^INSERT INTO pasos/.test(q)) {
        const fila = { idPaso: '103', idLeccion: parametros[0], orden: parametros[1], instruccion: parametros[2], recursos: JSON.parse(parametros[3]), actividad: JSON.parse(parametros[4]) };
        pasos.push(fila);
        return { rows: [{ idPaso: fila.idPaso }] };
      }
      if (/^UPDATE lecciones SET/.test(q)) {
        const fila = lecciones.find((l) => l.idLeccion === parametros[3] && l.idCurso === parametros[4]);
        assert.ok(fila);
        Object.assign(fila, { titulo: parametros[0], objetivo: parametros[1], duracionEstimadaMinutos: parametros[2] });
        return { rows: [{ idLeccion: fila.idLeccion }] };
      }
      if (/^UPDATE pasos SET/.test(q)) {
        const fila = pasos.find((p) => p.idPaso === parametros[3] && p.idLeccion === parametros[4]);
        assert.ok(fila);
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
        if (/unnest/.test(q)) parametros[0].forEach((id, i) => {
          const fila = filas.find((f) => f[clave] === id && f[padre] === parametros[1]);
          assert.ok(fila);
          fila.orden = i + 1;
        });
        else filas.filter((f) => f[padre] === parametros[0]).sort((a, b) => a.orden - b.orden).forEach((f, i) => { f.orden = i + 1; });
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
  const conectar = t.mock.method(pool, 'connect', async () => {
    if (opciones.errorConexion) throw opciones.errorConexion;
    return cliente;
  });
  return { llamadas, verificar, cargarPerfil, conectar, cliente };
}

function solicitar({ metodo, ruta, cuerpo, crudo, token = 'Bearer token-prueba' }) {
  return fetch(`${url}${ruta}`, {
    method: metodo,
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

function sinEscrituras(s) {
  assert.equal(s.llamadas.some(({ sql }) => /^(INSERT|UPDATE|DELETE)/.test(sql)), false);
}

for (const op of OPERACIONES) {
  const nombre = `${op.metodo} ${op.ruta}`;
  for (const rol of ['maestro', 'administrador']) {
    test(`Editor HTTP: ${nombre} éxito como ${rol}`, async (t) => {
      const s = simular(t, { rol, ...(rol === 'administrador' ? { autor: 'otro-autor' } : {}) });
      const respuesta = await solicitar(op);
      assert.equal(respuesta.status, op.estado);
      assert.equal(respuesta.headers.get('cache-control'), 'no-store');
      if (op.estado === 204) assert.equal(await respuesta.text(), '');
      else {
        const cuerpo = await respuesta.json();
        if (op.metodo === 'PUT') {
          const clave = op.tipo === 'curso' ? 'idLeccion' : 'idPaso';
          const ids = op.cuerpo[op.tipo === 'curso' ? 'idsLecciones' : 'idsPasos'];
          assert.deepEqual(cuerpo, ids.map((id, i) => ({ [clave]: id, orden: i + 1 })));
        } else if (op.ruta.startsWith('/pasos') || op.ruta.endsWith('/pasos')) {
          assert.deepEqual(cuerpo, { idPaso: op.metodo === 'POST' ? '103' : '101', orden: op.metodo === 'POST' ? 3 : 1,
            ...LECTURA, ...(op.metodo === 'PATCH' ? op.cuerpo : {}) });
        } else {
          assert.equal(cuerpo.idLeccion, op.metodo === 'POST' ? '23' : '21');
          assert.equal(cuerpo.titulo, op.cuerpo.titulo);
          assert.equal(cuerpo.objetivo, META.objetivo);
          assert.equal(cuerpo.duracionEstimadaMinutos, 3);
          assert.equal(cuerpo.orden, op.metodo === 'POST' ? 3 : 1);
          assert.equal(cuerpo.pasos.length, op.metodo === 'POST' ? 0 : 2);
          assert.deepEqual(Object.keys(cuerpo).sort(), ['duracionEstimadaMinutos', 'idLeccion', 'objetivo', 'orden', 'pasos', 'titulo']);
        }
      }
      assert.equal(s.llamadas.at(-1).sql, 'COMMIT');
      assert.equal(s.cliente.release.mock.callCount(), 1);
    });
  }

  for (const token of [null, 'Basic prueba', 'Bearer uno,dos']) {
    test(`Editor HTTP: ${nombre} autenticación mal formada ${token}`, async (t) => {
      const s = simular(t);
      await comprobarError(await solicitar({ ...op, token }), 401);
      assert.equal(s.verificar.mock.callCount(), 0);
      assert.equal(s.cargarPerfil.mock.callCount(), 0);
      assert.equal(s.conectar.mock.callCount(), 0);
    });
  }
  for (const code of ['auth/invalid-id-token', 'auth/id-token-expired']) {
    test(`Editor HTTP: ${nombre} token rechazado ${code}`, async (t) => {
      const s = simular(t, { errorToken: Object.assign(new Error('Token ficticio'), { code }) });
      await comprobarError(await solicitar(op), 401);
      assert.equal(s.conectar.mock.callCount(), 0);
    });
  }
  for (const [opciones, estado, codigo] of [
    [{ sinPerfil: true }, 404, 'perfil_no_registrado'],
    [{ activo: false }, 403, 'cuenta_desactivada'],
    [{ rol: 'estudiante' }, 403, 'rol_no_autorizado']
  ]) {
    test(`Editor HTTP: ${nombre} acceso rechazado ${codigo}`, async (t) => {
      const s = simular(t, opciones);
      await comprobarError(await solicitar(op), estado, codigo);
      assert.equal(s.conectar.mock.callCount(), 0);
    });
  }
  for (const [perfilTx, estado, codigo] of [
    [null, 404, 'perfil_no_registrado'],
    [{ uid: UID, rol: 'maestro', activo: false }, 403, 'cuenta_desactivada'],
    [{ uid: UID, rol: 'estudiante', activo: true }, 403, 'rol_no_autorizado']
  ]) {
    test(`Editor HTTP: ${nombre} perfil vigente ${codigo}`, async (t) => {
      const s = simular(t, { perfilTx });
      await comprobarError(await solicitar(op), estado, codigo);
      sinEscrituras(s);
      assert.equal(s.llamadas.at(-1).sql, 'ROLLBACK');
    });
  }
  for (const [opciones, estado, codigo] of [
    [{ autor: 'otro-autor' }, 403, 'curso_ajeno'],
    [{ estado: 'retirado' }, 409, 'curso_retirado'],
    [{ sinCurso: true }, 404, 'curso_no_encontrado'],
    ...(!op.textual ? [
      [{ estado: 'publicado' }, 409, 'curso_publicado'],
      [{ avance: true }, 409, 'curso_con_avance']
    ] : [])
  ]) {
    test(`Editor HTTP: ${nombre} restricción ${codigo}`, async (t) => {
      const s = simular(t, opciones);
      await comprobarError(await solicitar(op), estado, codigo);
      sinEscrituras(s);
      assert.equal(s.llamadas.at(-1).sql, 'ROLLBACK');
    });
  }
  for (const id of ['0', '01', '-1', 'abc', '9223372036854775808']) {
    test(`Editor HTTP: ${nombre} ID inválido ${id}`, async (t) => {
      const s = simular(t);
      await comprobarError(await solicitar({ ...op, ruta: op.ruta.replace(/\d+/, id) }), 400, `id_${op.tipo}_invalido`);
      assert.equal(s.conectar.mock.callCount(), 0);
    });
  }
  for (const crudo of ['null', '"texto"', '{"titulo":']) {
    test(`Editor HTTP: ${nombre} JSON inválido ${crudo}`, async (t) => {
      const s = simular(t);
      await comprobarError(await solicitar({ ...op, crudo }), 400, 'json_invalido');
      assert.equal(s.verificar.mock.callCount(), 0);
      assert.equal(s.conectar.mock.callCount(), 0);
    });
  }
  test(`Editor HTTP: ${nombre} identidad de query no eleva permisos`, async (t) => {
    const s = simular(t, { autor: 'otro-autor' });
    await comprobarError(await solicitar({ ...op, ruta: `${op.ruta}?uid=otro-autor&rol=administrador` }), 403, 'curso_ajeno');
    sinEscrituras(s);
  });
  test(`Editor HTTP: ${nombre} fallo SQL seguro con rollback`, async (t) => {
    const privado = 'SELECT detalle_privado_de_postgresql';
    const s = simular(t, { fallar: /^SELECT uid, rol, activo/, error: new Error(privado) });
    const registro = t.mock.method(console, 'error', () => {});
    const cuerpo = await comprobarError(await solicitar(op), 503,
      op.ruta.startsWith('/cursos') ? 'operacion_cursos_no_disponible' : 'operacion_contenido_no_disponible');
    assert.equal(JSON.stringify(cuerpo).includes(privado), false);
    assert.equal(JSON.stringify(registro.mock.calls).includes(privado), false);
    assert.equal(s.llamadas.at(-1).sql, 'ROLLBACK');
    assert.equal(s.cliente.release.mock.callCount(), 1);
  });
  if (op.metodo !== 'DELETE') {
    test(`Editor HTTP: ${nombre} arreglo no es cuerpo válido`, async (t) => {
      const s = simular(t);
      await comprobarError(await solicitar({ ...op, cuerpo: [] }), 400, 'cuerpo_invalido');
      assert.equal(s.conectar.mock.callCount(), 0);
    });
    for (const campo of ['uid', 'rol', 'creado_por', 'orden', 'estadoPublicacion']) {
      test(`Editor HTTP: ${nombre} campo prohibido ${campo}`, async (t) => {
        const s = simular(t);
        await comprobarError(await solicitar({ ...op, cuerpo: { ...op.cuerpo, [campo]: 'ajeno' } }), 400, 'campos_invalidos');
        assert.equal(s.conectar.mock.callCount(), 0);
      });
    }
  }
}

for (const op of OPERACIONES.filter((op) => op.textual)) {
  test(`Editor HTTP: ${op.ruta} corrección textual publicada con avance`, async (t) => {
    const s = simular(t, { estado: 'publicado', avance: true });
    const respuesta = await solicitar(op);
    assert.equal(respuesta.status, 200);
    assert.equal(respuesta.headers.get('cache-control'), 'no-store');
    const cuerpo = await respuesta.json();
    for (const [clave, valor] of Object.entries(op.cuerpo)) assert.equal(cuerpo[clave], valor);
    assert.equal(s.llamadas.at(-1).sql, 'COMMIT');
  });
  test(`Editor HTTP: ${op.ruta} parche vacío`, async (t) => {
    const s = simular(t);
    await comprobarError(await solicitar({ ...op, cuerpo: {} }), 400, 'campos_invalidos');
    assert.equal(s.conectar.mock.callCount(), 0);
  });
}

for (const op of OPERACIONES.filter((op) => op.tipo !== 'curso')) {
  test(`Editor HTTP: ${op.metodo} ${op.ruta} recurso inexistente`, async (t) => {
    const s = simular(t);
    await comprobarError(await solicitar({ ...op, ruta: op.ruta.replace(/\d+/, '999') }), 404,
      op.tipo === 'paso' ? 'paso_no_encontrado' : 'leccion_no_encontrada');
    sinEscrituras(s);
    assert.equal(s.llamadas.at(-1).sql, 'ROLLBACK');
  });
}

test('Editor HTTP: lección histórica no habilita escritura de curso retirado', async (t) => {
  const s = simular(t, { historica: true, estado: 'retirado' });
  await comprobarError(await solicitar({ ...OPERACIONES[1], ruta: '/lecciones/999' }), 409, 'curso_retirado');
  sinEscrituras(s);
});

for (const op of OPERACIONES.filter((op) => op.metodo === 'PUT')) {
  const clave = op.tipo === 'curso' ? 'idsLecciones' : 'idsPasos';
  for (const ids of [null, ['21', '21'], ['0'], ['9223372036854775808'], [21], ['999'], []]) {
    test(`Editor HTTP: ${op.ruta} lista inválida o incompleta ${JSON.stringify(ids)}`, async (t) => {
      const s = simular(t);
      await comprobarError(await solicitar({ ...op, cuerpo: { [clave]: ids } }), 400, 'orden_invalido');
      sinEscrituras(s);
    });
  }
}

for (const cuerpo of [{ ...META, titulo: ' ' }, { ...META, duracionEstimadaMinutos: 16 }]) {
  test(`Editor HTTP: metadatos inválidos ${JSON.stringify(cuerpo)}`, async (t) => {
    const s = simular(t);
    const error = await comprobarError(await solicitar({ ...OPERACIONES[0], cuerpo }), 400, 'contenido_invalido');
    assert.ok(error.errores.length > 0);
    for (const detalle of error.errores) assert.deepEqual(Object.keys(detalle).sort(), ['codigo', 'mensaje', 'ruta']);
    sinEscrituras(s);
    assert.equal(s.llamadas.at(-1).sql, 'ROLLBACK');
  });
}

test('Editor HTTP: video se normaliza sin URL ni HTML en la respuesta', async (t) => {
  const s = simular(t);
  const respuesta = await solicitar({ ...OPERACIONES[4], cuerpo: { ...LECTURA, recursos: [
    { tipo: 'video', plataforma: 'youtube', url: 'https://youtu.be/abcDEF12345', titulo: ' Ejemplo ' }
  ] } });
  assert.equal(respuesta.status, 201);
  assert.equal(respuesta.headers.get('cache-control'), 'no-store');
  assert.deepEqual((await respuesta.json()).recursos, [{ tipo: 'video', plataforma: 'youtube', idVideo: 'abcDEF12345', titulo: 'Ejemplo' }]);
  assert.equal(s.llamadas.at(-1).sql, 'COMMIT');
});

for (const recurso of [
  { tipo: 'video', plataforma: 'youtube', url: 'https://youtube.com.ejemplo.invalid/watch?v=abcDEF12345', titulo: 'Ejemplo' },
  { tipo: 'video', plataforma: 'youtube', url: 'http://youtu.be/abcDEF12345', titulo: 'Ejemplo' },
  { tipo: 'video', plataforma: 'youtube', idVideo: 'abcDEF12345', url: 'https://youtu.be/abcDEF12345', titulo: 'Ejemplo' },
  { tipo: 'video', plataforma: 'youtube', idVideo: 'abcDEF12345', titulo: 'Ejemplo', html: '<iframe></iframe>' }
]) {
  test(`Editor HTTP: video inválido ${JSON.stringify(recurso)}`, async (t) => {
    const s = simular(t);
    await comprobarError(await solicitar({ ...OPERACIONES[4], cuerpo: { ...LECTURA, recursos: [recurso] } }), 400, 'video_invalido');
    sinEscrituras(s);
    assert.equal(s.llamadas.at(-1).sql, 'ROLLBACK');
  });
}

for (const opciones of [
  { errorConexion: new Error('Conexión simulada no disponible') },
  { errorPerfil: new Error('Perfil simulado no disponible') },
  { errorToken: Object.assign(new Error('Firebase simulado no disponible'), { code: 'app/network-error' }) }
]) {
  test(`Editor HTTP: indisponibilidad ${Object.keys(opciones)[0]}`, async (t) => {
    simular(t, opciones);
    t.mock.method(console, 'error', () => {});
    await comprobarError(await solicitar(OPERACIONES[0]), 503);
  });
}


for (const op of OPERACIONES) {
  const nombre = `${op.metodo} ${op.ruta}`;
  test(`Editor HTTP P4: ${nombre} maestro con permiso en curso ajeno → ${op.estado}`, async (t) => {
    const s = simular(t, { autor: 'otro-autor', esEditor: true });
    const respuesta = await solicitar(op);
    assert.equal(respuesta.status, op.estado);
    assert.equal(respuesta.headers.get('cache-control'), 'no-store');
    assert.equal(s.llamadas.at(-1).sql, 'COMMIT');
  });

  test(`Editor HTTP P4: ${nombre} permiso retirado → 403 curso_ajeno`, async (t) => {
    const s = simular(t, { autor: 'otro-autor', esEditor: false });
    await comprobarError(await solicitar(op), 403, 'curso_ajeno');
    sinEscrituras(s);
  });
}
