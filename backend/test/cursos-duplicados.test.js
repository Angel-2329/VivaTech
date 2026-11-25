const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

process.env.DATABASE_URL = 'postgresql://prueba:prueba@localhost:5432/prueba';
process.env.FIREBASE_PROJECT_ID = 'demo-viva-tech-cursos-duplicados';

const pool = require('../src/config/database');
const firebaseAuth = require('../src/config/firebase');
const app = require('../src/app');
const { crearCurso, editarCurso } = require('../src/services/cursos');
const { ErrorReglaCurso } = require('../src/services/reglas-cursos');

const UID = 'uid-editor-prueba';
const MAESTRO = { uid: UID, rol: 'maestro', activo: true };
const ADMIN = { uid: UID, rol: 'administrador', activo: true };
const RESPUESTA_409 = {
  ok: false,
  mensaje: 'Ya existe un curso con ese título en esta categoría.',
  codigo: 'curso_duplicado'
};

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
    await new Promise((resolve, reject) => servidor.close((error) => (error ? reject(error) : resolve())));
  }
  await pool.end();
});

function errorIndice(constraint = 'uq_cursos_titulo_normalizado') {
  const error = new Error('duplicate key value violates unique constraint');
  error.code = '23505';
  error.constraint = constraint;
  return error;
}

function crearCliente(t, opciones = {}) {
  const usuario = opciones.usuario || MAESTRO;
  const llamadas = [];
  let curso = {
    idCurso: '10', idCategoria: '1', titulo: 'Curso original', descripcion: 'Descripción original.',
    estado_publicacion: 'borrador', creado_por: UID, orden: 2, fecha_cierre: null,
    ...opciones.curso
  };
  let creado = false;
  const escribir = (texto, parametros) => {
    if (opciones.errorEscritura) throw opciones.errorEscritura;
    if (/^INSERT/.test(texto)) {
      curso = {
        idCurso: '11', idCategoria: parametros[0], titulo: parametros[1], descripcion: parametros[2],
        estado_publicacion: 'borrador', creado_por: parametros[3], orden: parametros[4], fecha_cierre: parametros[5]
      };
      creado = true;
    } else {
      Object.assign(curso, {
        idCategoria: parametros[0], titulo: parametros[1], descripcion: parametros[2],
        orden: parametros[3], fecha_cierre: parametros[4], estado_publicacion: parametros[6]
      });
    }
    return { rows: [{ idCurso: curso.idCurso }] };
  };
  return {
    llamadas,
    curso: () => curso,
    query: t.mock.fn(async (sql, parametros) => {
      const texto = sql.trim();
      llamadas.push({ sql: texto, parametros });
      if (['BEGIN', 'COMMIT', 'ROLLBACK', 'SET CONSTRAINTS uq_cursos_categoria_orden IMMEDIATE'].includes(texto)) {
        return { rows: [] };
      }
      if (/^SELECT uid, rol, activo FROM usuarios[\s\S]*FOR SHARE$/.test(texto)) return { rows: [usuario] };
      if (/FROM categorias[\s\S]*FOR UPDATE/.test(texto)) return { rows: [{ idCategoria: parametros[0] }] };
      if (/COALESCE\(max\(orden\)/.test(texto)) return { rows: [{ ultimoOrden: 2 }] };
      if (/FROM cursos WHERE id_curso[\s\S]*FOR UPDATE/.test(texto)) return { rows: [{ ...curso }] };
      if (/^SELECT nombre FROM categorias/.test(texto)) return { rows: [{ nombre: 'Categoría de prueba' }] };
      if (/FROM lecciones WHERE id_curso/.test(texto)) return { rows: [] };
      if (/FROM pasos p JOIN lecciones/.test(texto)) return { rows: [] };
      if (/^INSERT INTO cursos/.test(texto) || /^UPDATE cursos SET/.test(texto)) return escribir(texto, parametros);
      if (/WHERE c\.id_curso = \$1::bigint/.test(texto)) {
        return { rows: [{
          ...curso, estadoPublicacion: curso.estado_publicacion, fechaCierre: curso.fecha_cierre,
          creadoPor: 'Autor de Ejemplo', totalLecciones: 0, tieneAvance: false, esEditor: false, lecciones: []
        }] };
      }
      assert.fail(`Consulta no prevista: ${texto}`);
    }),
    release: t.mock.fn(),
    creado: () => creado
  };
}

function conectar(t, clientes) {
  const cola = [...clientes];
  return t.mock.method(pool, 'connect', async () => {
    const cliente = cola.shift();
    assert.ok(cliente, 'Conexión inesperada');
    return cliente;
  });
}

function sqls(cliente) {
  return cliente.llamadas.map(({ sql }) => sql);
}

function comprobarRevertido(cliente) {
  const lista = sqls(cliente);
  assert.equal(lista[0], 'BEGIN');
  assert.equal(lista.at(-1), 'ROLLBACK');
  assert.equal(lista.includes('COMMIT'), false);
  assert.equal(lista.some((sql) => /WHERE c\.id_curso = \$1::bigint/.test(sql)), false);
  assert.equal(cliente.release.mock.callCount(), 1);
  assert.equal(cliente.release.mock.calls[0].arguments[0], undefined, 'La conexión no se descarta por un 409');
}

function comprobarConfirmado(cliente) {
  const lista = sqls(cliente);
  assert.equal(lista[0], 'BEGIN');
  assert.equal(lista.at(-1), 'COMMIT');
  assert.equal(lista.includes('ROLLBACK'), false);
  assert.equal(cliente.release.mock.callCount(), 1);
}

const esDuplicado = (error) => {
  assert.ok(error instanceof ErrorReglaCurso);
  assert.equal(error.estado, 409);
  assert.equal(error.codigo, RESPUESTA_409.codigo);
  assert.equal(error.message, RESPUESTA_409.mensaje);
  assert.equal(error.errores, undefined);
  return true;
};


test('Cursos duplicados servicio: crear con título ocupado en la categoría → 409 y revierte', async (t) => {
  const cliente = crearCliente(t, { errorEscritura: errorIndice() });
  conectar(t, [cliente]);

  await assert.rejects(
    crearCurso(MAESTRO, { idCategoria: '1', titulo: 'Curso A', descripcion: 'Ficticio.' }),
    esDuplicado
  );
  comprobarRevertido(cliente);
});

test('Cursos duplicados servicio: cambiar el título a uno ocupado → 409 y revierte', async (t) => {
  const cliente = crearCliente(t, { errorEscritura: errorIndice() });
  conectar(t, [cliente]);

  await assert.rejects(editarCurso(MAESTRO, '10', { titulo: 'Curso B' }), esDuplicado);
  comprobarRevertido(cliente);
  const actualizacion = cliente.llamadas.find(({ sql }) => /^UPDATE cursos SET/.test(sql));
  assert.equal(actualizacion.parametros[1], 'Curso B');
});

test('Cursos duplicados servicio: trasladar a una categoría con ese título → 409 y revierte', async (t) => {
  const cliente = crearCliente(t, { usuario: ADMIN, errorEscritura: errorIndice() });
  conectar(t, [cliente]);

  await assert.rejects(editarCurso(ADMIN, '10', { idCategoria: '2' }), esDuplicado);
  comprobarRevertido(cliente);
  const lista = sqls(cliente);
  const bloqueoDestino = lista.findIndex((sql) => /FROM categorias[\s\S]*FOR UPDATE/.test(sql));
  const actualizacion = lista.findIndex((sql) => /^UPDATE cursos SET/.test(sql));
  assert.ok(bloqueoDestino > 0 && bloqueoDestino < actualizacion);
  assert.equal(cliente.llamadas[actualizacion].parametros[0], '2');
});

test('Cursos duplicados servicio: un maestro que intenta trasladar recibe 403 antes de mirar el título', async (t) => {
  const cliente = crearCliente(t, { errorEscritura: errorIndice() });
  conectar(t, [cliente]);

  await assert.rejects(editarCurso(MAESTRO, '10', { idCategoria: '2' }), (error) => {
    assert.equal(error.estado, 403);
    assert.equal(error.codigo, 'rol_no_autorizado');
    return true;
  });
  assert.equal(sqls(cliente).some((sql) => /^UPDATE cursos SET/.test(sql)), false);
  comprobarRevertido(cliente);
});

test('Cursos duplicados servicio: publicar con contenido incompleto responde contenido_incompleto antes que curso_duplicado', async (t) => {
  const cliente = crearCliente(t, { errorEscritura: errorIndice() });
  conectar(t, [cliente]);

  await assert.rejects(
    editarCurso(MAESTRO, '10', { titulo: 'Curso B', estadoPublicacion: 'publicado' }),
    (error) => {
      assert.equal(error.estado, 409);
      assert.equal(error.codigo, 'contenido_incompleto');
      return true;
    }
  );
  assert.equal(sqls(cliente).some((sql) => /^UPDATE cursos SET/.test(sql)), false);
  comprobarRevertido(cliente);
});

test('Cursos duplicados servicio: dejar el mismo título no falla ni escribe', async (t) => {
  const cliente = crearCliente(t);
  conectar(t, [cliente]);

  const curso = await editarCurso(MAESTRO, '10', { titulo: '  Curso original  ' });
  assert.equal(curso.titulo, 'Curso original');
  assert.equal(sqls(cliente).some((sql) => /^UPDATE cursos SET/.test(sql)), false);
  comprobarConfirmado(cliente);
});

test('Cursos duplicados servicio: mismo título con otra descripción actualiza sin 409 (la fila no choca consigo misma)', async (t) => {
  const cliente = crearCliente(t);
  conectar(t, [cliente]);

  const curso = await editarCurso(MAESTRO, '10', { titulo: 'Curso original', descripcion: 'Nueva descripción.' });
  assert.equal(curso.titulo, 'Curso original');
  assert.equal(curso.descripcion, 'Nueva descripción.');
  const actualizacion = cliente.llamadas.find(({ sql }) => /^UPDATE cursos SET/.test(sql));
  assert.equal(actualizacion.parametros[1], 'Curso original');
  comprobarConfirmado(cliente);
});

test('Cursos duplicados servicio: no consulta títulos por su cuenta (la regla vive solo en el índice)', async (t) => {
  const cliente = crearCliente(t);
  conectar(t, [cliente]);

  await crearCurso(MAESTRO, { idCategoria: '1', titulo: 'Curso retirado antes', descripcion: 'Ficticio.' });
  assert.equal(cliente.llamadas.some(({ sql }) => /titulo[\s\S]*FROM cursos[\s\S]*WHERE[\s\S]*titulo/i.test(sql)), false);
  assert.equal(cliente.llamadas.some(({ sql }) => /unaccent/i.test(sql)), false);
  comprobarConfirmado(cliente);
});

for (const [accion, ejecutar, usuario] of [
  ['crear', () => crearCurso(MAESTRO, { idCategoria: '1', titulo: 'Curso A', descripcion: 'Ficticio.' }), MAESTRO],
  ['editar', () => editarCurso(MAESTRO, '10', { titulo: 'Curso A' }), MAESTRO],
  ['trasladar', () => editarCurso(ADMIN, '10', { idCategoria: '2' }), ADMIN]
]) {
  for (const [nombre, error] of [
    ['otra restricción única', errorIndice('uq_cursos_categoria_orden')],
    ['un 23505 sin restricción', errorIndice(null)],
    ['un error técnico', new Error('Fallo simulado')]
  ]) {
    test(`Cursos duplicados servicio: al ${accion}, ${nombre} no se convierte en 409`, async (t) => {
      const cliente = crearCliente(t, { usuario, errorEscritura: error });
      conectar(t, [cliente]);

      await assert.rejects(ejecutar(), (recibido) => recibido === error);
      comprobarRevertido(cliente);
    });
  }
}


function simularSolicitante(t, rol, clientes) {
  t.mock.method(firebaseAuth, 'verifyIdToken', async () => ({ uid: UID }));
  t.mock.method(pool, 'query', async () => ({
    rowCount: 1,
    rows: [{ uid: UID, nombre_completo: 'Editor de Prueba', nombre_apodo: null, rol, activo: true }]
  }));
  return conectar(t, clientes);
}

async function solicitar(metodo, ruta, cuerpo) {
  const respuesta = await fetch(`${url}${ruta}`, {
    method: metodo,
    headers: { Authorization: 'Bearer token-prueba', 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo)
  });
  return {
    estado: respuesta.status,
    cache: respuesta.headers.get('cache-control'),
    cuerpo: await respuesta.json()
  };
}

function comprobar409(resultado) {
  assert.equal(resultado.estado, 409);
  assert.equal(resultado.cache, 'no-store');
  assert.deepEqual(resultado.cuerpo, RESPUESTA_409);
  const texto = JSON.stringify(resultado.cuerpo);
  for (const dato of ['idCurso', 'creadoPor', 'creado_por', UID, '"10"', '"11"']) {
    assert.equal(texto.includes(dato), false, `El 409 no debe revelar ${dato}`);
  }
}

test('Cursos duplicados ruta: «José», «jose » y «JOSE» chocan → 201, 409, 409', async (t) => {
  const primero = crearCliente(t);
  const segundo = crearCliente(t, { errorEscritura: errorIndice() });
  const tercero = crearCliente(t, { errorEscritura: errorIndice() });
  simularSolicitante(t, 'maestro', [primero, segundo, tercero]);

  const alta = await solicitar('POST', '', { idCategoria: '1', titulo: 'José', descripcion: 'Ficticio.' });
  assert.equal(alta.estado, 201);
  assert.equal(alta.cuerpo.titulo, 'José');

  for (const titulo of ['jose ', 'JOSE']) {
    comprobar409(await solicitar('POST', '', { idCategoria: '1', titulo, descripcion: 'Ficticio.' }));
  }
  comprobarConfirmado(primero);
  comprobarRevertido(segundo);
  comprobarRevertido(tercero);
  assert.equal(segundo.llamadas.find(({ sql }) => /^INSERT INTO cursos/.test(sql)).parametros[1], 'jose');
});

test('Cursos duplicados ruta: PATCH del título a uno ocupado → 409 curso_duplicado', async (t) => {
  const cliente = crearCliente(t, { errorEscritura: errorIndice() });
  simularSolicitante(t, 'maestro', [cliente]);

  comprobar409(await solicitar('PATCH', '/10', { titulo: '  Curso B  ' }));
  comprobarRevertido(cliente);
});

test('Cursos duplicados ruta: traslado a una categoría con ese título → 409 curso_duplicado', async (t) => {
  const cliente = crearCliente(t, { usuario: ADMIN, errorEscritura: errorIndice() });
  simularSolicitante(t, 'administrador', [cliente]);

  comprobar409(await solicitar('PATCH', '/10', { idCategoria: '2' }));
  comprobarRevertido(cliente);
});

test('Cursos duplicados ruta: PATCH que deja el mismo título responde 200', async (t) => {
  const cliente = crearCliente(t);
  simularSolicitante(t, 'maestro', [cliente]);

  const resultado = await solicitar('PATCH', '/10', { titulo: 'Curso original' });
  assert.equal(resultado.estado, 200);
  assert.equal(resultado.cuerpo.titulo, 'Curso original');
  comprobarConfirmado(cliente);
});

test('Cursos duplicados ruta: el título de un curso retirado se puede reutilizar → 201', async (t) => {
  const cliente = crearCliente(t);
  simularSolicitante(t, 'maestro', [cliente]);

  const resultado = await solicitar('POST', '', { idCategoria: '1', titulo: 'Curso que se retiró', descripcion: 'Versión nueva.' });
  assert.equal(resultado.estado, 201);
  assert.equal(resultado.cuerpo.titulo, 'Curso que se retiró');
  assert.equal(resultado.cuerpo.estadoPublicacion, 'borrador');
  comprobarConfirmado(cliente);
});

test('Cursos duplicados ruta: otra restricción única no se presenta como curso_duplicado → 503', async (t) => {
  const cliente = crearCliente(t, { errorEscritura: errorIndice('uq_cursos_categoria_orden') });
  simularSolicitante(t, 'maestro', [cliente]);
  t.mock.method(console, 'error', () => {});

  const resultado = await solicitar('POST', '', { idCategoria: '1', titulo: 'Curso A', descripcion: 'Ficticio.' });
  assert.equal(resultado.estado, 503);
  assert.equal(resultado.cuerpo.codigo, 'operacion_cursos_no_disponible');
  comprobarRevertido(cliente);
});

test('Cursos duplicados ruta: dos altas simultáneas con el mismo título dejan solo una', async (t) => {
  const ganador = crearCliente(t);
  const perdedor = crearCliente(t, { errorEscritura: errorIndice() });
  const conexion = simularSolicitante(t, 'administrador', [ganador, perdedor]);

  const resultados = await Promise.all([
    solicitar('POST', '', { idCategoria: '1', titulo: 'Curso A', descripcion: 'Ficticio.' }),
    solicitar('POST', '', { idCategoria: '1', titulo: 'curso a', descripcion: 'Ficticio.' })
  ]);

  assert.equal(conexion.mock.callCount(), 2);
  assert.deepEqual(resultados.map((r) => r.estado).sort(), [201, 409]);
  comprobar409(resultados.find((r) => r.estado === 409));
  comprobarConfirmado(ganador);
  comprobarRevertido(perdedor);
  assert.equal(ganador.creado(), true);
  assert.equal(perdedor.creado(), false);
});
