const { test, after } = require('node:test');
const assert = require('node:assert/strict');

process.env.DATABASE_URL =
  'postgresql://prueba:prueba@localhost:5432/prueba';

const pool = require('../src/config/database');
const {
  ErrorOperacionGrupo,
  crearGrupo,
  renombrarGrupo,
  eliminarGrupo
} = require('../src/services/grupos');

after(async () => {
  await pool.end();
});

function solicitante(rol = 'maestro', activo = true) {
  return { uid: 'uid-solicitante', rol, activo };
}

function cargarSolicitante(usuario) {
  return {
    sql: /FROM usuarios[\s\S]*FOR SHARE/,
    parametros: [usuario.uid],
    filas: [usuario]
  };
}

function bloquearGrupo() {
  return {
    sql: /FROM grupos[\s\S]*WHERE id_grupo = \$1[\s\S]*FOR UPDATE/,
    parametros: ['7'],
    filas: [{ id_grupo: '7' }]
  };
}

function asignacionMaestro(existe = true) {
  return {
    sql: /FROM grupo_maestros[\s\S]*uid_maestro = \$2[\s\S]*FOR SHARE/,
    parametros: ['7', 'uid-solicitante'],
    filas: existe ? [{ id_grupo: '7' }] : []
  };
}

function grupoEsperado(nombre = 'Grupo de prueba', conMaestro = true) {
  return {
    idGrupo: '7',
    nombre,
    totalEstudiantes: 0,
    maestros: conMaestro
      ? [{ uid: 'uid-solicitante', nombreCompleto: 'Maestro de Prueba' }]
      : []
  };
}

function consultarGrupo(grupo) {
  return {
    sql: /g\.id_grupo::text AS "idGrupo"[\s\S]*WHERE g\.id_grupo = \$1/,
    parametros: ['7'],
    filas: [grupo]
  };
}

function simularCliente(t, pasos) {
  let posicion = 0;
  const cliente = {
    query: t.mock.fn(async (sql, parametros) => {
      const paso = pasos[posicion++];
      assert.ok(paso, `Consulta inesperada: ${sql}`);
      assert.match(sql, paso.sql);
      assert.deepEqual(parametros, paso.parametros);

      if (paso.error) throw paso.error;

      const filas = paso.filas || [];
      return { rowCount: filas.length, rows: filas };
    }),
    release: t.mock.fn()
  };

  const conexion = t.mock.method(pool, 'connect', async () => cliente);

  return { cliente, conexion };
}

function comprobarLiberacion(simulacion, pasos, errorAlRevertir) {
  assert.equal(simulacion.conexion.mock.callCount(), 1);
  assert.equal(simulacion.cliente.query.mock.callCount(), pasos.length);
  assert.equal(simulacion.cliente.release.mock.callCount(), 1);
  assert.deepEqual(
    simulacion.cliente.release.mock.calls[0].arguments,
    [errorAlRevertir]
  );
}

function comprobarErrorOperacion(error, estado, codigo) {
  assert.ok(error instanceof ErrorOperacionGrupo);
  assert.equal(error.estado, estado);
  assert.equal(error.codigo, codigo);
  return true;
}

test('Grupos: crear como maestro confirma grupo y autoasignación juntos', async (t) => {
  const grupo = grupoEsperado();
  const pasos = [
    { sql: /^BEGIN$/ },
    cargarSolicitante(solicitante()),
    {
      sql: /INSERT INTO grupos[\s\S]*RETURNING id_grupo::text/,
      parametros: ['Grupo de prueba', 'uid-solicitante'],
      filas: [{ idGrupo: '7' }]
    },
    {
      sql: /INSERT INTO grupo_maestros[\s\S]*VALUES \(\$1, \$2, \$2\)/,
      parametros: ['7', 'uid-solicitante']
    },
    consultarGrupo(grupo),
    { sql: /^COMMIT$/ }
  ];
  const simulacion = simularCliente(t, pasos);

  assert.deepEqual(await crearGrupo('uid-solicitante', 'Grupo de prueba'), grupo);
  comprobarLiberacion(simulacion, pasos);
});

test('Grupos: crear como administrador no agrega autoasignación', async (t) => {
  const grupo = grupoEsperado('Grupo de prueba', false);
  const pasos = [
    { sql: /^BEGIN$/ },
    cargarSolicitante(solicitante('administrador')),
    {
      sql: /INSERT INTO grupos/,
      parametros: ['Grupo de prueba', 'uid-solicitante'],
      filas: [{ idGrupo: '7' }]
    },
    consultarGrupo(grupo),
    { sql: /^COMMIT$/ }
  ];
  const simulacion = simularCliente(t, pasos);

  assert.deepEqual(await crearGrupo('uid-solicitante', 'Grupo de prueba'), grupo);
  comprobarLiberacion(simulacion, pasos);
});

test('Grupos: maestro asignado renombra y confirma la operación', async (t) => {
  const grupo = grupoEsperado('Grupo renombrado');
  const pasos = [
    { sql: /^BEGIN$/ },
    cargarSolicitante(solicitante()),
    bloquearGrupo(),
    asignacionMaestro(),
    {
      sql: /^UPDATE grupos SET nombre = \$1 WHERE id_grupo = \$2$/,
      parametros: ['Grupo renombrado', '7']
    },
    consultarGrupo(grupo),
    { sql: /^COMMIT$/ }
  ];
  const simulacion = simularCliente(t, pasos);

  assert.deepEqual(
    await renombrarGrupo('uid-solicitante', '7', 'Grupo renombrado'),
    grupo
  );
  comprobarLiberacion(simulacion, pasos);
});

test('Grupos: maestro sobre grupo ajeno revierte sin actualizar', async (t) => {
  const pasos = [
    { sql: /^BEGIN$/ },
    cargarSolicitante(solicitante()),
    bloquearGrupo(),
    asignacionMaestro(false),
    { sql: /^ROLLBACK$/ }
  ];
  const simulacion = simularCliente(t, pasos);

  await assert.rejects(
    renombrarGrupo('uid-solicitante', '7', 'Cambio no permitido'),
    (error) => comprobarErrorOperacion(error, 404, 'grupo_no_encontrado')
  );
  comprobarLiberacion(simulacion, pasos);
});

test('Grupos: estudiantes asignados impiden los borrados y provocan reversión', async (t) => {
  const pasos = [
    { sql: /^BEGIN$/ },
    cargarSolicitante(solicitante('administrador')),
    bloquearGrupo(),
    {
      sql: /SELECT EXISTS[\s\S]*FROM grupo_estudiantes WHERE id_grupo = \$1/,
      parametros: ['7'],
      filas: [{ tieneEstudiantes: true }]
    },
    { sql: /^ROLLBACK$/ }
  ];
  const simulacion = simularCliente(t, pasos);

  await assert.rejects(
    eliminarGrupo('uid-solicitante', '7'),
    (error) => comprobarErrorOperacion(error, 409, 'grupo_con_participantes')
  );
  assert.doesNotMatch(
    simulacion.cliente.query.mock.calls[3].arguments[0],
    /\bactivo\b/i
  );
  comprobarLiberacion(simulacion, pasos);
});

test('Grupos: elimina asignaciones de maestros antes del grupo y confirma', async (t) => {
  const pasos = [
    { sql: /^BEGIN$/ },
    cargarSolicitante(solicitante()),
    bloquearGrupo(),
    asignacionMaestro(),
    {
      sql: /SELECT EXISTS[\s\S]*FROM grupo_estudiantes/,
      parametros: ['7'],
      filas: [{ tieneEstudiantes: false }]
    },
    {
      sql: /^DELETE FROM grupo_maestros WHERE id_grupo = \$1$/,
      parametros: ['7']
    },
    { sql: /^DELETE FROM grupos WHERE id_grupo = \$1$/, parametros: ['7'] },
    { sql: /^COMMIT$/ }
  ];
  const simulacion = simularCliente(t, pasos);

  assert.equal(await eliminarGrupo('uid-solicitante', '7'), undefined);
  comprobarLiberacion(simulacion, pasos);
});

test('Grupos: fallo de autoasignación revierte también la creación pendiente', async (t) => {
  const fallo = new Error('Fallo simulado de autoasignación');
  const pasos = [
    { sql: /^BEGIN$/ },
    cargarSolicitante(solicitante()),
    {
      sql: /INSERT INTO grupos/,
      parametros: ['Grupo de prueba', 'uid-solicitante'],
      filas: [{ idGrupo: '7' }]
    },
    {
      sql: /INSERT INTO grupo_maestros/,
      parametros: ['7', 'uid-solicitante'],
      error: fallo
    },
    { sql: /^ROLLBACK$/ }
  ];
  const simulacion = simularCliente(t, pasos);

  await assert.rejects(
    crearGrupo('uid-solicitante', 'Grupo de prueba'),
    (error) => error === fallo
  );
  comprobarLiberacion(simulacion, pasos);
});

test('Grupos: fallo de ROLLBACK descarta la conexión y conserva el error original', async (t) => {
  const fallo = new Error('Fallo simulado de escritura');
  const falloRollback = new Error('Fallo simulado de reversión');
  const pasos = [
    { sql: /^BEGIN$/ },
    cargarSolicitante(solicitante('administrador')),
    bloquearGrupo(),
    {
      sql: /^UPDATE grupos SET nombre = \$1 WHERE id_grupo = \$2$/,
      parametros: ['Grupo renombrado', '7'],
      error: fallo
    },
    { sql: /^ROLLBACK$/, error: falloRollback }
  ];
  const simulacion = simularCliente(t, pasos);

  await assert.rejects(
    renombrarGrupo('uid-solicitante', '7', 'Grupo renombrado'),
    (error) => error === fallo
  );
  comprobarLiberacion(simulacion, pasos, falloRollback);
});

test('Grupos: fallo al obtener conexión no ejecuta consultas', async (t) => {
  const fallo = new Error('Fallo simulado de conexión');
  const conexion = t.mock.method(pool, 'connect', async () => {
    throw fallo;
  });
  const consulta = t.mock.method(pool, 'query', async () => {
    throw new Error('No debería ejecutarse una consulta');
  });

  await assert.rejects(
    crearGrupo('uid-solicitante', 'Grupo de prueba'),
    (error) => error === fallo
  );
  assert.equal(conexion.mock.callCount(), 1);
  assert.equal(consulta.mock.callCount(), 0);
});

for (const escenario of [
  {
    nombre: 'cuenta desactivada',
    usuario: solicitante('maestro', false),
    codigo: 'cuenta_desactivada'
  },
  {
    nombre: 'rol no permitido',
    usuario: solicitante('estudiante'),
    codigo: 'rol_no_autorizado'
  }
]) {
  test(`Grupos: servicio rechaza ${escenario.nombre} y revierte`, async (t) => {
    const pasos = [
      { sql: /^BEGIN$/ },
      cargarSolicitante(escenario.usuario),
      { sql: /^ROLLBACK$/ }
    ];
    const simulacion = simularCliente(t, pasos);

    await assert.rejects(
      crearGrupo('uid-solicitante', 'Grupo de prueba'),
      (error) => comprobarErrorOperacion(error, 403, escenario.codigo)
    );
    comprobarLiberacion(simulacion, pasos);
  });
}
