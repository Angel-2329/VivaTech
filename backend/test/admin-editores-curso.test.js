const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

process.env.DATABASE_URL = 'postgresql://prueba:prueba@localhost:5432/prueba';
process.env.FIREBASE_PROJECT_ID = 'demo-viva-tech-admin-editores';

const pool = require('../src/config/database');
const firebaseAuth = require('../src/config/firebase');
const app = require('../src/app');

const ADMIN_UID = 'uid-admin-prueba';
const AUTOR_UID = 'uid-autor-prueba';
const MAESTRO_UID = 'uid-maestro-editor';
const FECHA = '2026-11-25T16:00:00.123456+00:00';
const SOLO_ADMIN = { ok: false, mensaje: 'No tienes permisos para realizar esta acción', codigo: 'rol_no_autorizado' };

let servidor;
let url;

before(async () => {
  await new Promise((resolve, reject) => {
    servidor = app.listen(0, '127.0.0.1', resolve);
    servidor.once('error', reject);
  });
  url = `http://127.0.0.1:${servidor.address().port}/api/admin/cursos`;
});

after(async () => {
  if (servidor) {
    servidor.closeAllConnections();
    await new Promise((resolve, reject) => servidor.close((error) => (error ? reject(error) : resolve())));
  }
  await pool.end();
});

const USUARIOS = {
  [ADMIN_UID]: { uid: ADMIN_UID, nombre: 'Administrador de Ejemplo', rol: 'administrador', activo: true },
  [AUTOR_UID]: { uid: AUTOR_UID, nombre: 'Autora de Ejemplo', rol: 'maestro', activo: true },
  [MAESTRO_UID]: { uid: MAESTRO_UID, nombre: 'maestro Editor', rol: 'maestro', activo: true },
  'uid-estudiante': { uid: 'uid-estudiante', nombre: 'Estudiante de Ejemplo', rol: 'estudiante', activo: true },
  'uid-maestro-inactivo': { uid: 'uid-maestro-inactivo', nombre: 'Maestro Inactivo', rol: 'maestro', activo: false },
  'uid-otro-admin': { uid: 'uid-otro-admin', nombre: 'Otra Administradora', rol: 'administrador', activo: true }
};

function simular(t, opciones = {}) {
  const usuarios = structuredClone({ ...USUARIOS, ...opciones.usuarios });
  const rolSolicitante = opciones.rol || 'administrador';
  let editores = structuredClone(opciones.editores || []);
  const curso = opciones.sinCurso ? null : {
    idCurso: opciones.id || '10', estado_publicacion: 'borrador', creado_por: AUTOR_UID, ...opciones.curso
  };
  const llamadas = [];
  const verificar = t.mock.method(firebaseAuth, 'verifyIdToken', async () => ({ uid: ADMIN_UID }));
  const perfil = t.mock.method(pool, 'query', async (sql, parametros) => {
    assert.match(sql, /FROM usuarios/);
    assert.deepEqual(parametros, [ADMIN_UID]);
    return { rowCount: 1, rows: [{ uid: ADMIN_UID, nombre_completo: 'Administrador de Ejemplo',
      nombre_apodo: null, rol: rolSolicitante, activo: true }] };
  });
  const filaEditor = (e) => ({
    uid: e.uid,
    nombreCompleto: usuarios[e.uid].nombre,
    activo: usuarios[e.uid].rol === 'maestro' && usuarios[e.uid].activo,
    otorgadoPor: usuarios[e.otorgadoPor].nombre,
    fechaOtorgamiento: e.fecha || FECHA
  });
  const cliente = {
    async query(sql, parametros) {
      const q = sql.trim();
      llamadas.push({ sql: q, parametros });
      if (opciones.fallar?.test(q)) throw new Error('Detalle SQL privado simulado');
      if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(q)) return { rows: [] };
      if (/^SELECT uid, rol, activo FROM usuarios WHERE uid = \$1 FOR SHARE$/.test(q)) {
        if (parametros[0] === ADMIN_UID && Object.hasOwn(opciones, 'perfilTx')) {
          return { rows: opciones.perfilTx ? [opciones.perfilTx] : [] };
        }
        const usuario = usuarios[parametros[0]];
        return { rows: usuario ? [{ uid: usuario.uid, rol: usuario.rol, activo: usuario.activo }] : [] };
      }
      if (/FROM cursos WHERE id_curso = \$1::bigint FOR SHARE$/.test(q)) {
        return { rows: curso && parametros[0] === curso.idCurso ? [{ ...curso }] : [] };
      }
      if (/^SELECT ce\.uid_maestro AS uid/.test(q)) {
        assert.equal(parametros[0], curso.idCurso);
        const filas = editores.filter((e) => parametros.length < 2 || e.uid === parametros[1]).map(filaEditor);
        return { rows: filas };
      }
      if (/^INSERT INTO curso_editores/.test(q)) {
        assert.match(q, /ON CONFLICT \(id_curso, uid_maestro\) DO NOTHING$/);
        const [, uid, otorgadoPor] = parametros;
        if (editores.some((e) => e.uid === uid)) return { rows: [], rowCount: 0 };
        editores.push({ uid, otorgadoPor, fecha: FECHA });
        return { rows: [], rowCount: 1 };
      }
      if (/^DELETE FROM curso_editores/.test(q)) {
        const antes = editores.length;
        editores = editores.filter((e) => e.uid !== parametros[1]);
        return { rows: [], rowCount: antes - editores.length };
      }
      assert.fail(`Consulta no prevista: ${q}`);
    },
    release: t.mock.fn()
  };
  const conectar = t.mock.method(pool, 'connect', async () => cliente);
  return { llamadas, cliente, conectar, verificar, perfil, editores: () => editores };
}

function solicitar({ metodo = 'GET', ruta = '/10/editores', cuerpo, crudo, token = 'Bearer token-prueba' } = {}) {
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
  assert.equal(cuerpo.codigo, codigo);
  assert.equal(typeof cuerpo.mensaje, 'string');
  return cuerpo;
}

function sinEscrituras(s) {
  assert.equal(s.llamadas.some(({ sql }) => /^(INSERT|UPDATE|DELETE)/.test(sql)), false);
}

function cerrada(s, final) {
  assert.equal(s.llamadas[0].sql, 'BEGIN');
  assert.equal(s.llamadas.at(-1).sql, final);
  assert.equal(s.cliente.release.mock.callCount(), 1);
}

const OPERACIONES = [
  { metodo: 'GET', ruta: '/10/editores' },
  { metodo: 'POST', ruta: '/10/editores', cuerpo: { uid: MAESTRO_UID } },
  { metodo: 'DELETE', ruta: `/10/editores/${MAESTRO_UID}` }
];

for (const op of OPERACIONES) {
  const nombre = `${op.metodo} ${op.ruta}`;

  test(`Admin editores: ${nombre} sin token → 401 sin consultar`, async (t) => {
    const s = simular(t);
    const respuesta = await solicitar({ ...op, token: null });
    assert.equal(respuesta.status, 401);
    assert.equal(respuesta.headers.get('cache-control'), 'no-store');
    assert.equal(s.perfil.mock.callCount(), 0);
    assert.equal(s.conectar.mock.callCount(), 0);
  });

  for (const rol of ['maestro', 'estudiante']) {
    test(`Admin editores: ${nombre} como ${rol} → 403 rol_no_autorizado sin abrir transacción`, async (t) => {
      const s = simular(t, { rol });
      const respuesta = await solicitar(op);
      assert.equal(respuesta.status, 403);
      assert.equal(respuesta.headers.get('cache-control'), 'no-store');
      assert.deepEqual(await respuesta.json(), SOLO_ADMIN);
      assert.equal(s.conectar.mock.callCount(), 0);
    });
  }

  test(`Admin editores: ${nombre} verifica el token una sola vez`, async (t) => {
    const s = simular(t, { editores: [{ uid: MAESTRO_UID, otorgadoPor: ADMIN_UID }] });
    await solicitar(op);
    assert.equal(s.verificar.mock.callCount(), 1);
    assert.equal(s.perfil.mock.callCount(), 1);
  });

  test(`Admin editores: ${nombre} curso inexistente → 404 curso_no_encontrado`, async (t) => {
    const s = simular(t, { sinCurso: true });
    await comprobarError(await solicitar(op), 404, 'curso_no_encontrado');
    sinEscrituras(s);
    cerrada(s, 'ROLLBACK');
  });

  for (const id of ['0', '-1', '01', 'abc', '1.5', '9223372036854775808']) {
    test(`Admin editores: ${nombre} id de curso inválido ${id} → 400`, async (t) => {
      const s = simular(t);
      await comprobarError(await solicitar({ ...op, ruta: op.ruta.replace('/10/', `/${id}/`) }), 400, 'id_curso_invalido');
      assert.equal(s.conectar.mock.callCount(), 0);
    });
  }

  test(`Admin editores: ${nombre} perfil vigente ya no es administrador → 403`, async (t) => {
    const s = simular(t, { perfilTx: { uid: ADMIN_UID, rol: 'maestro', activo: true } });
    await comprobarError(await solicitar(op), 403, 'rol_no_autorizado');
    sinEscrituras(s);
    cerrada(s, 'ROLLBACK');
  });

  test(`Admin editores: ${nombre} fallo de PostgreSQL → 503 sin detalles internos`, async (t) => {
    const s = simular(t, { fallar: /FROM cursos/ });
    const registro = t.mock.method(console, 'error', () => {});
    const cuerpo = await comprobarError(await solicitar(op), 503, 'permisos_curso_no_disponible');
    assert.equal(JSON.stringify(cuerpo).includes('privado'), false);
    assert.equal(JSON.stringify(registro.mock.calls).includes('privado'), false);
    cerrada(s, 'ROLLBACK');
  });
}

test('Admin editores: GET lista los permisos con la forma del contrato', async (t) => {
  const s = simular(t, { editores: [
    { uid: MAESTRO_UID, otorgadoPor: ADMIN_UID },
    { uid: 'uid-maestro-inactivo', otorgadoPor: ADMIN_UID }
  ] });
  const respuesta = await solicitar();
  assert.equal(respuesta.status, 200);
  assert.equal(respuesta.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await respuesta.json(), [
    { uid: MAESTRO_UID, nombreCompleto: 'maestro Editor', activo: true,
      otorgadoPor: 'Administrador de Ejemplo', fechaOtorgamiento: FECHA },
    { uid: 'uid-maestro-inactivo', nombreCompleto: 'Maestro Inactivo', activo: false,
      otorgadoPor: 'Administrador de Ejemplo', fechaOtorgamiento: FECHA }
  ]);
  const consulta = s.llamadas.find(({ sql }) => /^SELECT ce\.uid_maestro/.test(sql));
  assert.match(consulta.sql, /ORDER BY lower\(maestro\.nombre_completo\), ce\.uid_maestro$/);
  assert.match(consulta.sql, /\(maestro\.rol = 'maestro' AND maestro\.activo\) AS activo/);
  assert.match(consulta.sql, /to_jsonb\(ce\.fecha_otorgamiento\)/);
  assert.deepEqual(consulta.parametros, ['10']);
  sinEscrituras(s);
  cerrada(s, 'COMMIT');
});

test('Admin editores: GET sin permisos devuelve [] y también funciona en curso retirado', async (t) => {
  simular(t, { curso: { estado_publicacion: 'retirado' } });
  const respuesta = await solicitar();
  assert.equal(respuesta.status, 200);
  assert.deepEqual(await respuesta.json(), []);
});

test('Admin editores: POST otorga permiso → 201 con el elemento creado', async (t) => {
  const s = simular(t);
  const respuesta = await solicitar({ metodo: 'POST', cuerpo: { uid: MAESTRO_UID } });
  assert.equal(respuesta.status, 201);
  assert.equal(respuesta.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await respuesta.json(), {
    uid: MAESTRO_UID, nombreCompleto: 'maestro Editor', activo: true,
    otorgadoPor: 'Administrador de Ejemplo', fechaOtorgamiento: FECHA
  });
  const insercion = s.llamadas.find(({ sql }) => /^INSERT INTO curso_editores/.test(sql));
  assert.deepEqual(insercion.parametros, ['10', MAESTRO_UID, ADMIN_UID]);
  assert.deepEqual(s.editores(), [{ uid: MAESTRO_UID, otorgadoPor: ADMIN_UID, fecha: FECHA }]);
  const bloqueo = s.llamadas.find(({ sql }) => /FROM cursos WHERE/.test(sql));
  assert.match(bloqueo.sql, /FOR SHARE$/);
  cerrada(s, 'COMMIT');
});

test('Admin editores: POST repetido → 200 con el elemento existente sin duplicar', async (t) => {
  const s = simular(t, { editores: [{ uid: MAESTRO_UID, otorgadoPor: 'uid-otro-admin' }] });
  const respuesta = await solicitar({ metodo: 'POST', cuerpo: { uid: MAESTRO_UID } });
  assert.equal(respuesta.status, 200);
  const cuerpo = await respuesta.json();
  assert.equal(cuerpo.otorgadoPor, 'Otra Administradora');
  assert.equal(s.editores().length, 1);
  cerrada(s, 'COMMIT');
});

test('Admin editores: POST en curso publicado también se permite', async (t) => {
  simular(t, { curso: { estado_publicacion: 'publicado' } });
  const respuesta = await solicitar({ metodo: 'POST', cuerpo: { uid: MAESTRO_UID } });
  assert.equal(respuesta.status, 201);
});

for (const cuerpo of [{}, { uid: '' }, { uid: '   ' }, { uid: 123 }, { uid: null }, { uid: ['x'] }, { uid: 'u'.repeat(129) }]) {
  test(`Admin editores: POST ${JSON.stringify(cuerpo).slice(0, 40)} → 400 seleccion_invalida`, async (t) => {
    const s = simular(t);
    await comprobarError(await solicitar({ metodo: 'POST', cuerpo }), 400, 'seleccion_invalida');
    assert.equal(s.conectar.mock.callCount(), 0);
  });
}

test('Admin editores: POST con uid de 128 caracteres es válido en formato', async (t) => {
  simular(t);
  await comprobarError(await solicitar({ metodo: 'POST', cuerpo: { uid: 'u'.repeat(128) } }), 404, 'usuario_no_encontrado');
});

test('Admin editores: POST con campos extra → 400 campos_invalidos', async (t) => {
  const s = simular(t);
  await comprobarError(await solicitar({ metodo: 'POST', cuerpo: { uid: MAESTRO_UID, otorgadoPor: 'otro' } }),
    400, 'campos_invalidos');
  assert.equal(s.conectar.mock.callCount(), 0);
});

for (const crudo of ['[]', '"texto"']) {
  test(`Admin editores: POST con cuerpo ${crudo} → 400`, async (t) => {
    const s = simular(t);
    const respuesta = await solicitar({ metodo: 'POST', crudo });
    assert.equal(respuesta.status, 400);
    assert.equal(s.conectar.mock.callCount(), 0);
  });
}

for (const [nombre, opciones, uid, estado, codigo] of [
  ['curso retirado', { curso: { estado_publicacion: 'retirado' } }, MAESTRO_UID, 409, 'curso_retirado'],
  ['uid inexistente', {}, 'uid-no-existe', 404, 'usuario_no_encontrado'],
  ['autor del curso', {}, AUTOR_UID, 409, 'es_autor'],
  ['estudiante', {}, 'uid-estudiante', 409, 'usuario_no_maestro'],
  ['administrador', {}, 'uid-otro-admin', 409, 'usuario_no_maestro'],
  ['maestro desactivado', {}, 'uid-maestro-inactivo', 409, 'usuario_no_maestro'],
  ['autor desactivado sigue siendo autor', { usuarios: { [AUTOR_UID]: { ...USUARIOS[AUTOR_UID], activo: false } } },
    AUTOR_UID, 409, 'es_autor']
]) {
  test(`Admin editores: POST ${nombre} → ${estado} ${codigo} sin escribir`, async (t) => {
    const s = simular(t, opciones);
    await comprobarError(await solicitar({ metodo: 'POST', cuerpo: { uid } }), estado, codigo);
    sinEscrituras(s);
    cerrada(s, 'ROLLBACK');
  });
}

test('Admin editores: POST a maestro desactivado que ya tenía permiso → 409 usuario_no_maestro', async (t) => {
  const s = simular(t, { editores: [{ uid: 'uid-maestro-inactivo', otorgadoPor: ADMIN_UID }] });
  await comprobarError(await solicitar({ metodo: 'POST', cuerpo: { uid: 'uid-maestro-inactivo' } }), 409, 'usuario_no_maestro');
  assert.equal(s.editores().length, 1);
});

test('Admin editores: DELETE quita el permiso → 204 sin cuerpo', async (t) => {
  const s = simular(t, { editores: [{ uid: MAESTRO_UID, otorgadoPor: ADMIN_UID }] });
  const respuesta = await solicitar({ metodo: 'DELETE', ruta: `/10/editores/${MAESTRO_UID}` });
  assert.equal(respuesta.status, 204);
  assert.equal(respuesta.headers.get('cache-control'), 'no-store');
  assert.equal(await respuesta.text(), '');
  assert.deepEqual(s.editores(), []);
  const borrado = s.llamadas.find(({ sql }) => /^DELETE FROM curso_editores/.test(sql));
  assert.deepEqual(borrado.parametros, ['10', MAESTRO_UID]);
  assert.match(borrado.sql, /WHERE id_curso = \$1::bigint AND uid_maestro = \$2$/);
  cerrada(s, 'COMMIT');
});

test('Admin editores: DELETE sin permiso previo o de uid inexistente → 204 idempotente', async (t) => {
  simular(t);
  for (const uid of [MAESTRO_UID, 'uid-no-existe']) {
    const respuesta = await solicitar({ metodo: 'DELETE', ruta: `/10/editores/${uid}` });
    assert.equal(respuesta.status, 204);
  }
});

test('Admin editores: DELETE en curso retirado se permite', async (t) => {
  const s = simular(t, { curso: { estado_publicacion: 'retirado' },
    editores: [{ uid: MAESTRO_UID, otorgadoPor: ADMIN_UID }] });
  const respuesta = await solicitar({ metodo: 'DELETE', ruta: `/10/editores/${MAESTRO_UID}` });
  assert.equal(respuesta.status, 204);
  assert.deepEqual(s.editores(), []);
});

test('Admin editores: DELETE con uid de más de 128 caracteres → 400 seleccion_invalida', async (t) => {
  const s = simular(t);
  await comprobarError(await solicitar({ metodo: 'DELETE', ruta: `/10/editores/${'u'.repeat(129)}` }),
    400, 'seleccion_invalida');
  assert.equal(s.conectar.mock.callCount(), 0);
});

test('Admin editores: DELETE con uid codificado se recibe decodificado y parametrizado', async (t) => {
  const s = simular(t);
  const uid = "uid'; DROP TABLE x;--";
  const respuesta = await solicitar({ metodo: 'DELETE', ruta: `/10/editores/${encodeURIComponent(uid)}` });
  assert.equal(respuesta.status, 204);
  const borrado = s.llamadas.find(({ sql }) => /^DELETE FROM curso_editores/.test(sql));
  assert.deepEqual(borrado.parametros, ['10', uid]);
  assert.equal(borrado.sql.includes('DROP'), false);
});
