const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

process.env.DATABASE_URL = 'postgresql://prueba:prueba@localhost:5432/prueba';
process.env.FIREBASE_PROJECT_ID = 'demo-viva-tech-contenido';
const pool = require('../src/config/database');
const firebaseAuth = require('../src/config/firebase');
const app = require('../src/app');

const UID = 'uid-maestro-prueba';
const RUTAS = ['', '/cursos/10'];
let servidor;
let url;

before(async () => {
  await new Promise((resolve, reject) => {
    servidor = app.listen(0, '127.0.0.1', resolve);
    servidor.once('error', reject);
  });
  url = `http://127.0.0.1:${servidor.address().port}/api/contenido`;
});

after(async () => {
  if (servidor) {
    servidor.closeAllConnections();
    await new Promise((resolve, reject) => servidor.close((error) => error ? reject(error) : resolve()));
  }
  await pool.end();
});

function fila(cambios = {}) {
  return {
    idCategoria: '1', nombreCategoria: 'Categoría ficticia', ordenCategoria: 1,
    idCurso: '10', titulo: 'Curso ficticio', descripcion: 'Ejemplos sin datos reales.',
    orden: 1, estadoPublicacion: 'borrador', fechaCierre: null,
    creado_por: UID, creadoPor: 'Maestro de Ejemplo', tieneAvance: false, totalLecciones: 1,
    lecciones: [{
      idLeccion: '21', titulo: 'Lección ficticia', objetivo: 'Practicar.', duracionEstimadaMinutos: 3, orden: 1,
      pasos: [{ idPaso: '101', orden: 1, instruccion: 'Lee el ejemplo.', recursos: [], actividad: { tipo: 'lectura' } }]
    }],
    ...cambios
  };
}

function simular(t, opciones = {}) {
  const verificar = t.mock.method(firebaseAuth, 'verifyIdToken', async () => {
    if (opciones.errorToken) throw opciones.errorToken;
    return { uid: UID };
  });
  const consulta = t.mock.method(pool, 'query', async (sql, parametros) => {
    if (/FROM usuarios[\s\S]*WHERE uid = \$1/.test(sql)) {
      assert.deepEqual(parametros, [UID]);
      if (opciones.errorPerfil) throw opciones.errorPerfil;
      const rows = opciones.sinPerfil ? [] : [{
        uid: UID, nombre_completo: 'Maestro de Ejemplo', nombre_apodo: null,
        rol: opciones.rol || 'maestro', activo: opciones.activo !== false
      }];
      return { rowCount: rows.length, rows };
    }
    const detalle = /WHERE c\.id_curso = \$1::bigint/.test(sql);
    assert.deepEqual(parametros, detalle ? [opciones.id || '10'] : []);
    if (opciones.errorContenido) throw opciones.errorContenido;
    const rows = Object.hasOwn(opciones, 'filas') ? opciones.filas : [fila(opciones.cambios)];
    return { rowCount: rows.length, rows };
  });
  t.mock.method(pool, 'connect', async () => assert.fail('No debe abrir una transacción'));
  return { verificar, consulta };
}

function solicitar(ruta = '', token = 'Bearer token-prueba') {
  return fetch(`${url}${ruta}`, { headers: token === null ? {} : { Authorization: token } });
}

async function comprobarError(respuesta, estado, codigo) {
  assert.equal(respuesta.status, estado);
  assert.equal(respuesta.headers.get('cache-control'), 'no-store');
  const cuerpo = await respuesta.json();
  assert.equal(cuerpo.ok, false);
  if (codigo) assert.equal(cuerpo.codigo, codigo);
  return cuerpo;
}

for (const ruta of RUTAS) {
  for (const token of [null, 'Basic prueba', 'Bearer', 'Bearer uno,dos']) {
    test(`GET editor ${ruta}: autenticación mal formada ${token}`, async (t) => {
      const s = simular(t);
      await comprobarError(await solicitar(ruta, token), 401);
      assert.equal(s.verificar.mock.callCount(), 0);
      assert.equal(s.consulta.mock.callCount(), 0);
    });
  }

  for (const code of ['auth/invalid-id-token', 'auth/id-token-expired']) {
    test(`GET editor ${ruta}: token rechazado ${code}`, async (t) => {
      const s = simular(t, { errorToken: Object.assign(new Error('Token ficticio'), { code }) });
      await comprobarError(await solicitar(ruta), 401);
      assert.equal(s.consulta.mock.callCount(), 0);
    });
  }

  for (const [opciones, estado, codigo] of [
    [{ sinPerfil: true }, 404, 'perfil_no_registrado'],
    [{ activo: false }, 403, 'cuenta_desactivada'],
    [{ rol: 'estudiante' }, 403, 'rol_no_autorizado']
  ]) {
    test(`GET editor ${ruta}: perfil o rol ${JSON.stringify(opciones)}`, async (t) => {
      const s = simular(t, opciones);
      await comprobarError(await solicitar(ruta), estado, codigo);
      assert.equal(s.consulta.mock.callCount(), 1);
    });
  }

  for (const rol of ['maestro', 'administrador']) {
    test(`GET editor ${ruta}: ${rol} recibe éxito directo no almacenable`, async (t) => {
      const s = simular(t, { rol });
      const respuesta = await solicitar(ruta);
      assert.equal(respuesta.status, 200);
      assert.equal(respuesta.headers.get('cache-control'), 'no-store');
      const cuerpo = await respuesta.json();
      const curso = ruta ? cuerpo : cuerpo[0].cursos[0];
      assert.equal(curso.idCurso, '10');
      assert.equal(curso.puedeEditar, true);
      assert.equal(curso.creadoPor, 'Maestro de Ejemplo');
      assert.equal(typeof curso.creadoPor, 'string');
      assert.equal(Object.hasOwn(curso, 'creado_por'), false);
      assert.equal(Object.hasOwn(cuerpo, 'datos'), false);
      assert.equal(s.consulta.mock.callCount(), 2);
    });
  }

  test(`GET editor ${ruta}: maestro puede consultar ajeno sin poder editar`, async (t) => {
    simular(t, { cambios: { creado_por: 'otro-autor' } });
    const respuesta = await solicitar(ruta);
    assert.equal(respuesta.status, 200);
    const cuerpo = await respuesta.json();
    assert.equal((ruta ? cuerpo : cuerpo[0].cursos[0]).puedeEditar, false);
  });

  test(`GET editor ${ruta}: admin puede editar curso de otro autor no retirado`, async (t) => {
    simular(t, { rol: 'administrador', cambios: { creado_por: 'otro-autor', estadoPublicacion: 'publicado' } });
    const respuesta = await solicitar(ruta);
    assert.equal(respuesta.status, 200);
    const cuerpo = await respuesta.json();
    assert.equal((ruta ? cuerpo : cuerpo[0].cursos[0]).puedeEditar, true);
  });

  test(`GET editor ${ruta}: retirado visible, sin permiso de edición ni expediente`, async (t) => {
    simular(t, { rol: 'administrador', cambios: {
      estadoPublicacion: 'retirado', totalLecciones: 0, tieneAvance: true,
      historial: ['no-exponer'], uid_estudiante: 'no-exponer'
    } });
    const respuesta = await solicitar(ruta);
    assert.equal(respuesta.status, 200);
    const cuerpo = await respuesta.json();
    const curso = ruta ? cuerpo : cuerpo[0].cursos[0];
    assert.equal(curso.puedeEditar, false);
    assert.equal(curso.tieneAvance, true);
    assert.equal(curso.estadoPublicacion, 'retirado');
    if (ruta) assert.deepEqual(curso.lecciones, []);
    else {
      assert.equal(curso.totalLecciones, 0);
      assert.equal(Object.hasOwn(curso, 'lecciones'), false);
    }
    assert.equal(JSON.stringify(cuerpo).includes('no-exponer'), false);
  });

  test(`GET editor ${ruta}: query no reemplaza identidad ni permisos`, async (t) => {
    simular(t, { cambios: { creado_por: 'otro-autor' } });
    const respuesta = await solicitar(`${ruta}?uid=otro-autor&rol=administrador&puedeEditar=true`);
    assert.equal(respuesta.status, 200);
    const cuerpo = await respuesta.json();
    assert.equal((ruta ? cuerpo : cuerpo[0].cursos[0]).puedeEditar, false);
  });

  test(`GET editor ${ruta}: error de contenido devuelve 503 sin detalles internos`, async (t) => {
    const privado = 'SELECT informacion interna de PostgreSQL';
    simular(t, { errorContenido: new Error(privado) });
    const registro = t.mock.method(console, 'error', () => {});
    const cuerpo = await comprobarError(await solicitar(ruta), 503, 'contenido_no_disponible');
    assert.deepEqual(cuerpo, {
      ok: false, mensaje: 'No fue posible consultar el contenido. Intenta más tarde', codigo: 'contenido_no_disponible'
    });
    assert.equal(JSON.stringify(registro.mock.calls).includes(privado), false);
  });

  test(`GET editor ${ruta}: error del perfil no consulta catálogo`, async (t) => {
    const s = simular(t, { errorPerfil: new Error('Fallo de perfil simulado') });
    t.mock.method(console, 'error', () => {});
    await comprobarError(await solicitar(ruta), 503);
    assert.equal(s.consulta.mock.callCount(), 1);
  });

  test(`GET editor ${ruta}: infraestructura Firebase no consulta PostgreSQL`, async (t) => {
    const s = simular(t, { errorToken: Object.assign(new Error('Fallo Firebase simulado'), { code: 'app/network-error' }) });
    t.mock.method(console, 'error', () => {});
    await comprobarError(await solicitar(ruta), 503);
    assert.equal(s.consulta.mock.callCount(), 0);
  });
}

test('GET editor listado: catálogo vacío devuelve []', async (t) => {
  const s = simular(t, { filas: [] });
  const respuesta = await solicitar();
  assert.equal(respuesta.status, 200);
  assert.deepEqual(await respuesta.json(), []);
  assert.equal(s.consulta.mock.callCount(), 2);
});

test('GET editor listado: categoría sin cursos devuelve cursos []', async (t) => {
  simular(t, { filas: [fila({ idCurso: null })] });
  const respuesta = await solicitar();
  assert.equal(respuesta.status, 200);
  assert.deepEqual(await respuesta.json(), [{ idCategoria: '1', nombre: 'Categoría ficticia', orden: 1, cursos: [] }]);
});

test('GET editor detalle: contrato con lecciones/pasos y borrador incompleto', async (t) => {
  simular(t);
  const respuesta = await solicitar('/cursos/10');
  assert.equal(respuesta.status, 200);
  assert.deepEqual(await respuesta.json(), {
    idCurso: '10', titulo: 'Curso ficticio', descripcion: 'Ejemplos sin datos reales.',
    orden: 1, estadoPublicacion: 'borrador', fechaCierre: null,
    tieneAvance: false, creadoPor: 'Maestro de Ejemplo', puedeEditar: true,
    idCategoria: '1', lecciones: fila().lecciones
  });
});

test('GET editor detalle: borrador sin lecciones devuelve 200', async (t) => {
  simular(t, { cambios: { totalLecciones: 0, lecciones: [] } });
  const respuesta = await solicitar('/cursos/10');
  assert.equal(respuesta.status, 200);
  assert.deepEqual((await respuesta.json()).lecciones, []);
});

for (const id of ['0', '-1', '01', '1.5', 'abc', '9223372036854775808']) {
  test(`GET editor detalle: ID inválido ${id} no consulta detalle`, async (t) => {
    const s = simular(t);
    await comprobarError(await solicitar(`/cursos/${id}`), 400, 'id_curso_invalido');
    assert.equal(s.consulta.mock.callCount(), 1);
  });
}

test('GET editor detalle: curso inexistente devuelve 404', async (t) => {
  simular(t, { filas: [] });
  await comprobarError(await solicitar('/cursos/10'), 404, 'curso_no_encontrado');
});

test('GET editor detalle: BIGINT máximo permanece como cadena', async (t) => {
  const id = '9223372036854775807';
  simular(t, { id, cambios: { idCurso: id } });
  const respuesta = await solicitar(`/cursos/${id}`);
  assert.equal(respuesta.status, 200);
  assert.equal((await respuesta.json()).idCurso, id);
});

for (const ruta of RUTAS) {
  test(`GET editor ${ruta}: datos inconsistentes producen 503`, async (t) => {
    simular(t, { cambios: { tieneAvance: null } });
    t.mock.method(console, 'error', () => {});
    await comprobarError(await solicitar(ruta), 503, 'contenido_no_disponible');
  });
}
