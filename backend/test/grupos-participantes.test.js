const { test, after } = require('node:test');
const assert = require('node:assert/strict');

process.env.DATABASE_URL =
  'postgresql://prueba:prueba@localhost:5432/prueba';

const pool = require('../src/config/database');
const {
  ErrorOperacionGrupo,
  asignarEstudiante,
  retirarEstudiante,
  asignarMaestro,
  retirarMaestro
} = require('../src/services/grupos');

after(async () => {
  await pool.end();
});

const administrador = {
  uid: 'uid-solicitante', rol: 'administrador', activo: true
};

const tipos = [
  {
    rol: 'estudiante', tabla: 'grupo_estudiantes', campo: 'uid_estudiante',
    uid: 'uid-estudiante', asignar: asignarEstudiante, retirar: retirarEstudiante,
    errorRol: 'usuario_no_es_estudiante', duplicado: 'estudiante_ya_asignado',
    respuesta: {
      uid: 'uid-estudiante', nombreCompleto: 'Estudiante de Prueba',
      apodo: null, activo: true, leccionesCompletadas: 0, ultimaActividad: null
    }
  },
  {
    rol: 'maestro', tabla: 'grupo_maestros', campo: 'uid_maestro',
    uid: 'uid-maestro', asignar: asignarMaestro, retirar: retirarMaestro,
    errorRol: 'usuario_no_es_maestro', duplicado: 'maestro_ya_asignado',
    respuesta: { uid: 'uid-maestro', nombreCompleto: 'Maestro de Prueba' }
  }
];

function destino(tipo, cambios = {}) {
  return { uid: tipo.uid, rol: tipo.rol, activo: true, ...cambios };
}

function accesoPrevio(usuario = administrador, disponible = true) {
  return [
    {
      sql: /SELECT uid, rol, activo FROM usuarios WHERE uid = \$1/,
      parametros: [usuario.uid], filas: [usuario]
    },
    {
      sql: /SELECT g\.id_grupo[\s\S]*FROM grupos g[\s\S]*EXISTS/,
      parametros: ['7', usuario.rol, usuario.uid],
      filas: disponible ? [{ id_grupo: '7' }] : []
    }
  ];
}

function bloquearCuentas(tipo, usuario, participante) {
  const filas = participante ? [usuario, participante] : [usuario];
  filas.sort((a, b) => a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0);

  return {
    sql: /WHERE uid IN \(\$1, \$2\)[\s\S]*ORDER BY uid[\s\S]*FOR UPDATE/,
    parametros: [administrador.uid, tipo.uid],
    filas
  };
}

function accesoProtegido(usuario = administrador) {
  const pasos = [{
    sql: /FROM grupos[\s\S]*WHERE id_grupo = \$1[\s\S]*FOR UPDATE/,
    parametros: ['7'], filas: [{ id_grupo: '7' }]
  }];

  if (usuario.rol === 'maestro') {
    pasos.push({
      sql: /FROM grupo_maestros[\s\S]*uid_maestro = \$2[\s\S]*FOR SHARE/,
      parametros: ['7', usuario.uid], filas: [{ id_grupo: '7' }]
    });
  }

  return pasos;
}

function inicio(tipo, participante, usuario = administrador) {
  return [
    { sql: /^BEGIN$/ },
    ...accesoPrevio(usuario),
    bloquearCuentas(tipo, usuario, participante),
    ...accesoProtegido(usuario)
  ];
}

function insertar(tipo, duplicado = false, error) {
  return {
    sql: new RegExp(
      `INSERT INTO ${tipo.tabla}[\\s\\S]*` +
      `ON CONFLICT \\(id_grupo, ${tipo.campo}\\) DO NOTHING`
    ),
    parametros: ['7', tipo.uid, administrador.uid],
    filas: duplicado ? [] : [{ [tipo.campo]: tipo.uid }],
    error
  };
}

function consultarParticipante(tipo) {
  return tipo.rol === 'estudiante'
    ? {
      sql: /FROM grupo_estudiantes ge[\s\S]*AND u\.uid = \$2/,
      parametros: ['7', tipo.uid], filas: [tipo.respuesta]
    }
    : {
      sql: /SELECT uid, nombre_completo AS "nombreCompleto"[\s\S]*WHERE uid = \$1/,
      parametros: [tipo.uid], filas: [tipo.respuesta]
    };
}

function borrar(tipo, existe = true, error) {
  return {
    sql: new RegExp(
      `DELETE FROM ${tipo.tabla}[\\s\\S]*` +
      `WHERE id_grupo = \\$1 AND ${tipo.campo} = \\$2[\\s\\S]*RETURNING`
    ),
    parametros: ['7', tipo.uid],
    filas: existe ? [{ [tipo.campo]: tipo.uid }] : [],
    error
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
      return { rows: filas, rowCount: filas.length };
    }),
    release: t.mock.fn()
  };
  const conexion = t.mock.method(pool, 'connect', async () => cliente);

  return { cliente, conexion };
}

function comprobarFinal(simulacion, pasos) {
  assert.equal(simulacion.conexion.mock.callCount(), 1);
  assert.equal(simulacion.cliente.query.mock.callCount(), pasos.length);
  assert.equal(simulacion.cliente.release.mock.callCount(), 1);
  assert.deepEqual(simulacion.cliente.release.mock.calls[0].arguments, [undefined]);
}

function errorEsperado(estado, codigo) {
  return (error) => {
    assert.ok(error instanceof ErrorOperacionGrupo);
    assert.equal(error.estado, estado);
    assert.equal(error.codigo, codigo);
    return true;
  };
}

for (const tipo of tipos) {
  test(`Participantes: asignar ${tipo.rol} confirma con bloqueos ordenados`, async (t) => {
    const pasos = [
      ...inicio(tipo, destino(tipo)),
      insertar(tipo),
      consultarParticipante(tipo),
      { sql: /^COMMIT$/ }
    ];
    const simulacion = simularCliente(t, pasos);

    assert.deepEqual(
      await tipo.asignar(administrador.uid, '7', tipo.uid),
      tipo.respuesta
    );
    comprobarFinal(simulacion, pasos);
  });

  for (const escenario of [
    {
      nombre: 'cuenta inexistente', participante: undefined,
      estado: 404, codigo: 'usuario_no_encontrado'
    },
    {
      nombre: 'rol incorrecto', participante: destino(tipo, { rol: 'administrador' }),
      estado: 400, codigo: tipo.errorRol
    },
    {
      nombre: 'cuenta desactivada', participante: destino(tipo, { activo: false }),
      estado: 403, codigo: 'cuenta_desactivada'
    },
    {
      nombre: 'asignación duplicada', participante: destino(tipo),
      estado: 409, codigo: tipo.duplicado, duplicado: true
    }
  ]) {
    test(`Participantes: asignar ${tipo.rol} revierte por ${escenario.nombre}`, async (t) => {
      const pasos = [
        ...inicio(tipo, escenario.participante),
        ...(escenario.duplicado ? [insertar(tipo, true)] : []),
        { sql: /^ROLLBACK$/ }
      ];
      const simulacion = simularCliente(t, pasos);

      await assert.rejects(
        tipo.asignar(administrador.uid, '7', tipo.uid),
        errorEsperado(escenario.estado, escenario.codigo)
      );
      comprobarFinal(simulacion, pasos);
    });
  }

  test(`Participantes: retirar ${tipo.rol} desactivado confirma sin borrar su perfil`, async (t) => {
    const pasos = [
      ...inicio(tipo, destino(tipo, { activo: false })),
      borrar(tipo),
      { sql: /^COMMIT$/ }
    ];
    const simulacion = simularCliente(t, pasos);

    assert.equal(await tipo.retirar(administrador.uid, '7', tipo.uid), undefined);
    comprobarFinal(simulacion, pasos);
  });

  test(`Participantes: retirar ${tipo.rol} no asignado revierte`, async (t) => {
    const pasos = [
      ...inicio(tipo, destino(tipo)),
      borrar(tipo, false),
      { sql: /^ROLLBACK$/ }
    ];
    const simulacion = simularCliente(t, pasos);

    await assert.rejects(
      tipo.retirar(administrador.uid, '7', tipo.uid),
      errorEsperado(404, 'asignacion_no_encontrada')
    );
    comprobarFinal(simulacion, pasos);
  });

  for (const accion of ['asignar', 'retirar']) {
    test(`Participantes: fallo técnico al ${accion} ${tipo.rol} revierte`, async (t) => {
      const fallo = new Error('Fallo simulado de escritura');
      const pasos = [
        ...inicio(tipo, destino(tipo)),
        accion === 'asignar' ? insertar(tipo, false, fallo) : borrar(tipo, true, fallo),
        { sql: /^ROLLBACK$/ }
      ];
      const simulacion = simularCliente(t, pasos);

      await assert.rejects(
        tipo[accion](administrador.uid, '7', tipo.uid),
        (error) => error === fallo
      );
      comprobarFinal(simulacion, pasos);
    });

    for (const escenario of [
      {
        nombre: 'perdió el rol autorizado',
        usuario: { ...administrador, rol: 'estudiante' },
        codigo: 'rol_no_autorizado'
      },
      {
        nombre: 'fue desactivado',
        usuario: { ...administrador, activo: false },
        codigo: 'cuenta_desactivada'
      }
    ]) {
      test(`Participantes: ${accion} ${tipo.rol} rechaza solicitante que ${escenario.nombre}`, async (t) => {
        const pasos = [
          { sql: /^BEGIN$/ },
          ...accesoPrevio(),
          bloquearCuentas(tipo, escenario.usuario, destino(tipo)),
          { sql: /^ROLLBACK$/ }
        ];
        const simulacion = simularCliente(t, pasos);

        await assert.rejects(
          tipo[accion](administrador.uid, '7', tipo.uid),
          errorEsperado(403, escenario.codigo)
        );
        comprobarFinal(simulacion, pasos);
      });
    }
  }
}

const tipoEstudiante = tipos[0];
const maestroSolicitante = { ...administrador, rol: 'maestro' };

test('Participantes: maestro asignado puede agregar estudiante a su grupo', async (t) => {
  const pasos = [
    ...inicio(tipoEstudiante, destino(tipoEstudiante), maestroSolicitante),
    insertar(tipoEstudiante),
    consultarParticipante(tipoEstudiante),
    { sql: /^COMMIT$/ }
  ];
  const simulacion = simularCliente(t, pasos);

  assert.deepEqual(
    await asignarEstudiante(maestroSolicitante.uid, '7', tipoEstudiante.uid),
    tipoEstudiante.respuesta
  );
  comprobarFinal(simulacion, pasos);
});

for (const accion of ['asignar', 'retirar']) {
  test(`Participantes: maestro no puede ${accion} estudiante en grupo ajeno`, async (t) => {
    const pasos = [
      { sql: /^BEGIN$/ },
      ...accesoPrevio(maestroSolicitante, false),
      { sql: /^ROLLBACK$/ }
    ];
    const simulacion = simularCliente(t, pasos);

    await assert.rejects(
      tipoEstudiante[accion](maestroSolicitante.uid, '7', tipoEstudiante.uid),
      errorEsperado(404, 'grupo_no_encontrado')
    );
    comprobarFinal(simulacion, pasos);
  });

  test(`Participantes: servicio impide al maestro ${accion} maestros`, async (t) => {
    const pasos = [
      { sql: /^BEGIN$/ },
      accesoPrevio(maestroSolicitante)[0],
      { sql: /^ROLLBACK$/ }
    ];
    const simulacion = simularCliente(t, pasos);

    await assert.rejects(
      tipos[1][accion](maestroSolicitante.uid, '7', tipos[1].uid),
      errorEsperado(403, 'rol_no_autorizado')
    );
    comprobarFinal(simulacion, pasos);
  });
}
