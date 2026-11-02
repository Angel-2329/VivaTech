const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

process.env.DATABASE_URL =
  'postgresql://prueba:prueba@localhost:5432/prueba';
process.env.FIREBASE_PROJECT_ID = 'demo-viva-tech-admin-progreso';

const pool = require('../src/config/database');
const firebaseAuth = require('../src/config/firebase');
const app = require('../src/app');

let servidor;
let urlAdmin;

const rutas = [
  {
    nombre: 'resumen', ruta: '/resumen', codigo: 'resumen_no_disponible',
    mensaje: 'No fue posible consultar el resumen administrativo'
  },
  {
    nombre: 'progreso', ruta: '/progreso', codigo: 'progreso_no_disponible',
    mensaje: 'No fue posible consultar el progreso general'
  }
];

before(async () => {
  await new Promise((resolve, reject) => {
    servidor = app.listen(0, '127.0.0.1', resolve);
    servidor.once('error', reject);
  });

  urlAdmin = `http://127.0.0.1:${servidor.address().port}/api/admin`;
});

after(async () => {
  if (servidor) {
    servidor.closeAllConnections();
    await new Promise((resolve, reject) => {
      servidor.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }

  await pool.end();
});

function simularSolicitante(t, opciones = {}) {
  t.mock.method(firebaseAuth, 'verifyIdToken', async () => ({
    uid: 'uid-solicitante'
  }));

  const consulta = t.mock.method(pool, 'query', async (sql, parametros) => {
    if (/WHERE uid = \$1/.test(sql)) {
      assert.deepEqual(parametros, ['uid-solicitante']);
      return {
        rowCount: 1,
        rows: [{
          uid: 'uid-solicitante',
          nombre_completo: 'Solicitante de Prueba',
          nombre_apodo: null,
          rol: opciones.rol || 'administrador',
          activo: opciones.activo !== false
        }]
      };
    }

    if (opciones.error) throw opciones.error;
    const filas = opciones.filas || [];
    return { rowCount: filas.length, rows: filas };
  });

  const conexion = t.mock.method(pool, 'connect', async () => {
    throw new Error('Estas consultas no deberían abrir una transacción');
  });

  return { consulta, conexion };
}

async function consultar(ruta) {
  return fetch(`${urlAdmin}${ruta}`, {
    headers: { Authorization: 'Bearer token-prueba' }
  });
}

function comprobarLlamadas(simulacion, cantidad) {
  assert.equal(simulacion.consulta.mock.callCount(), cantidad);
  assert.equal(simulacion.conexion.mock.callCount(), 0);
}

for (const ruta of rutas) {
  test(`Admin ${ruta.nombre}: rechaza solicitud sin token`, async (t) => {
    const consulta = t.mock.method(pool, 'query', async () => {
      throw new Error('No debería consultarse PostgreSQL');
    });
    const conexion = t.mock.method(pool, 'connect', async () => {
      throw new Error('No debería abrirse una conexión');
    });

    const respuesta = await fetch(`${urlAdmin}${ruta.ruta}`);
    const cuerpo = await respuesta.json();

    assert.equal(respuesta.status, 401);
    assert.equal(cuerpo.ok, false);
    assert.equal(consulta.mock.callCount(), 0);
    assert.equal(conexion.mock.callCount(), 0);
  });

  for (const rol of ['estudiante', 'maestro']) {
    test(`Admin ${ruta.nombre}: rechaza al ${rol}`, async (t) => {
      const simulacion = simularSolicitante(t, { rol });
      const respuesta = await consultar(ruta.ruta);
      const cuerpo = await respuesta.json();

      assert.equal(respuesta.status, 403);
      assert.deepEqual(cuerpo, {
        ok: false,
        mensaje: 'No tienes permisos para realizar esta acción',
        codigo: 'rol_no_autorizado'
      });
      comprobarLlamadas(simulacion, 1);
    });
  }

  test(`Admin ${ruta.nombre}: rechaza al administrador desactivado`, async (t) => {
    const simulacion = simularSolicitante(t, { activo: false });
    const respuesta = await consultar(ruta.ruta);
    const cuerpo = await respuesta.json();

    assert.equal(respuesta.status, 403);
    assert.equal(cuerpo.ok, false);
    assert.equal(cuerpo.codigo, 'cuenta_desactivada');
    comprobarLlamadas(simulacion, 1);
  });
}

for (const escenario of [
  {
    nombre: 'totales en cero',
    resumen: {
      totalEstudiantes: 0, estudiantesActivos: 0, estudiantesInactivos: 0,
      totalMaestros: 0, maestrosActivos: 0, maestrosInactivos: 0,
      totalGrupos: 0, totalLeccionesPublicadas: 0, leccionesCompletadas: 0
    }
  },
  {
    nombre: 'totales con desglose',
    resumen: {
      totalEstudiantes: 3, estudiantesActivos: 2, estudiantesInactivos: 1,
      totalMaestros: 2, maestrosActivos: 1, maestrosInactivos: 1,
      totalGrupos: 2, totalLeccionesPublicadas: 2, leccionesCompletadas: 1
    }
  }
]) {
  test(`Admin resumen: conserva el contrato de ${escenario.nombre}`, async (t) => {
    const simulacion = simularSolicitante(t, { filas: [escenario.resumen] });
    const respuesta = await consultar('/resumen');
    const cuerpo = await respuesta.json();

    assert.equal(respuesta.status, 200);
    assert.deepEqual(cuerpo, escenario.resumen);
    for (const valor of Object.values(cuerpo)) {
      assert.equal(typeof valor, 'number');
      assert.ok(Number.isInteger(valor));
    }
    comprobarLlamadas(simulacion, 2);

    const [sql, parametros] = simulacion.consulta.mock.calls[1].arguments;
    assert.equal(parametros, undefined);
    assert.match(sql, /l\.estado_publicacion = 'publicado'/);
    assert.match(sql, /c\.estado_publicacion = 'publicado'/);
    assert.match(sql, /p\.estado = 'completada'/);
    assert.match(sql, /estudiante\.rol = 'estudiante'/);
    assert.doesNotMatch(sql, /JOIN grupo_(estudiantes|maestros)/);
    assert.doesNotMatch(sql, /estudiante\.activo\s*=/);
  });
}

test('Admin progreso: lista vacía conserva paginación predeterminada', async (t) => {
  const simulacion = simularSolicitante(t);
  const respuesta = await consultar('/progreso');

  assert.equal(respuesta.status, 200);
  assert.deepEqual(await respuesta.json(), []);
  comprobarLlamadas(simulacion, 2);
  assert.deepEqual(
    simulacion.consulta.mock.calls[1].arguments[1],
    ['', 50, 0]
  );
});

test('Admin progreso: conserva estudiantes activos e inactivos y parametriza la búsqueda', async (t) => {
  const esperado = [
    {
      uid: 'uid-estudiante-activo', nombreCompleto: 'Persona Activa',
      activo: true, grupos: ['Grupo A', 'Grupo B'],
      leccionesCompletadas: 1, totalLeccionesPublicadas: 2,
      ultimaActividad: '2026-10-20T11:00:00.000Z'
    },
    {
      uid: 'uid-estudiante-inactivo', nombreCompleto: 'Persona Inactiva',
      activo: false, grupos: [], leccionesCompletadas: 0,
      totalLeccionesPublicadas: 2, ultimaActividad: null
    }
  ];
  const filas = esperado.map((fila) => ({
    ...fila,
    ultimaActividad: fila.ultimaActividad ? new Date(fila.ultimaActividad) : null
  }));
  const simulacion = simularSolicitante(t, { filas });
  const parametros = new URLSearchParams({
    buscar: '  Persona  ', limite: '10', desplazamiento: '2'
  });
  const respuesta = await consultar(`/progreso?${parametros}`);

  assert.equal(respuesta.status, 200);
  assert.deepEqual(await respuesta.json(), esperado);
  comprobarLlamadas(simulacion, 2);

  const [sql, valores] = simulacion.consulta.mock.calls[1].arguments;
  assert.deepEqual(valores, ['Persona', 10, 2]);
  assert.match(sql, /strpos\(lower\(nombre_completo\), lower\(\$1::text\)\)/);
  assert.match(sql, /LIMIT \$2 OFFSET \$3/);
  assert.match(sql, /ORDER BY lower\(e\.nombre_completo\), e\.uid/);
  assert.match(sql, /l\.estado_publicacion = 'publicado'/);
  assert.match(sql, /c\.estado_publicacion = 'publicado'/);
  assert.match(sql, /LEFT JOIN LATERAL/);
  assert.match(sql, /max\(p\.fecha_actualizacion\)/);
  assert.match(sql, /FILTER \(WHERE p\.estado = 'completada'\)/);
  assert.doesNotMatch(sql, /\bactivo\s*=\s*true\b/i);
});

for (const escenario of [
  { nombre: 'límite cero', query: 'limite=0', codigo: 'paginacion_invalida' },
  { nombre: 'límite excesivo', query: 'limite=101', codigo: 'paginacion_invalida' },
  { nombre: 'límite no numérico', query: 'limite=abc', codigo: 'paginacion_invalida' },
  { nombre: 'desplazamiento negativo', query: 'desplazamiento=-1', codigo: 'paginacion_invalida' },
  { nombre: 'desplazamiento no numérico', query: 'desplazamiento=abc', codigo: 'paginacion_invalida' },
  { nombre: 'búsqueda demasiado larga', query: `buscar=${'a'.repeat(101)}`, codigo: 'buscar_invalido' },
  { nombre: 'búsqueda múltiple', query: 'buscar=uno&buscar=dos', codigo: 'buscar_invalido' },
  { nombre: 'límite múltiple', query: 'limite=1&limite=2', codigo: 'paginacion_invalida' }
]) {
  test(`Admin progreso: rechaza ${escenario.nombre} antes del listado`, async (t) => {
    const simulacion = simularSolicitante(t);
    const respuesta = await consultar(`/progreso?${escenario.query}`);
    const cuerpo = await respuesta.json();

    assert.equal(respuesta.status, 400);
    assert.equal(cuerpo.ok, false);
    assert.equal(cuerpo.codigo, escenario.codigo);
    comprobarLlamadas(simulacion, 1);
  });
}

for (const ruta of rutas) {
  test(`Admin ${ruta.nombre}: controla fallos sin exponer detalles internos`, async (t) => {
    const simulacion = simularSolicitante(t, {
      error: new Error('DETALLE_INTERNO_NO_PUBLICAR')
    });
    const respuesta = await consultar(ruta.ruta);
    const cuerpo = await respuesta.json();

    assert.equal(respuesta.status, 503);
    assert.deepEqual(cuerpo, {
      ok: false, mensaje: ruta.mensaje, codigo: ruta.codigo
    });
    assert.doesNotMatch(JSON.stringify(cuerpo), /DETALLE_INTERNO_NO_PUBLICAR/);
    comprobarLlamadas(simulacion, 2);
  });
}
