const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const manejarJsonInvalido =
  require('../src/middlewares/manejar-json-invalido');

process.env.DATABASE_URL =
  'postgresql://prueba:prueba@localhost:5432/prueba';
process.env.FIREBASE_PROJECT_ID = 'demo-viva-tech-perfil-caracteres';

const pool = require('../src/config/database');
const firebaseAuth = require('../src/config/firebase');
const perfilRouter = require('../src/routes/perfil');

let servidor;
let urlPerfil;

const ERROR_NOMBRE = {
  ok: false,
  mensaje: "El nombre solo puede tener letras, espacios, apóstrofo (') y guion (-).",
  codigo: 'nombre_invalido'
};

const ERROR_APODO = {
  ok: false,
  mensaje: "El apodo solo puede tener letras, espacios, apóstrofo (') y guion (-).",
  codigo: 'apodo_invalido'
};

before(async () => {
  const app = express();

  app.use(express.json());
  app.use('/api/perfil', perfilRouter);
  app.use(manejarJsonInvalido);

  await new Promise((resolve, reject) => {
    servidor = app.listen(0, '127.0.0.1', resolve);
    servidor.once('error', reject);
  });

  urlPerfil =
    `http://127.0.0.1:${servidor.address().port}/api/perfil`;
});

after(async () => {
  if (servidor) {
    await new Promise((resolve, reject) => {
      servidor.close((error) => {
        if (error) reject(error);
        else resolve();
      });

      servidor.closeAllConnections();
    });
  }

  await pool.end();
});

function simularIdentidad(t) {
  t.mock.method(firebaseAuth, 'verifyIdToken', async () => ({
    uid: 'uid-perfil-prueba'
  }));
}

async function enviar(metodo, cuerpo) {
  const respuesta = await fetch(urlPerfil, {
    method: metodo,
    headers: {
      Authorization: 'Bearer token-prueba',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(cuerpo)
  });

  return { estado: respuesta.status, cuerpo: await respuesta.json() };
}

const usuarioActual = {
  uid: 'uid-perfil-prueba',
  nombre_completo: 'Persona de Prueba',
  nombre_apodo: null,
  rol: 'estudiante',
  activo: true
};

function simularPatch(t) {
  return t.mock.method(pool, 'query', async (sql, parametros) => {
    if (/^\s*SELECT\b/i.test(sql)) {
      return { rowCount: 1, rows: [usuarioActual] };
    }

    if (/^\s*UPDATE\b/i.test(sql)) {
      return {
        rowCount: 1,
        rows: [{
          ...usuarioActual,
          nombre_completo: parametros[0] ? parametros[1] : usuarioActual.nombre_completo,
          nombre_apodo: parametros[2] ? parametros[3] : usuarioActual.nombre_apodo
        }]
      };
    }

    throw new Error('Consulta inesperada');
  });
}

function soloSelect(consulta) {
  assert.equal(consulta.mock.callCount(), 1);
  assert.match(consulta.mock.calls[0].arguments[0], /^\s*SELECT\b/i);
}

const NOMBRES_INVALIDOS = [
  'Ana 😀 López',
  'Juan123',
  'Ana@Gómez',
  'Ana. López',
  '<b>Ana</b>',
  'Ana ç López',
  '---',
  "'''"
];

const APODOS_INVALIDOS = ['Pepe!', '😀', '123', '--', 'La_Güera', "''"];

for (const nombreCompleto of NOMBRES_INVALIDOS) {
  test(`P3 POST perfil rechaza el nombre ${JSON.stringify(nombreCompleto)}`, async (t) => {
    simularIdentidad(t);
    const consulta = t.mock.method(pool, 'query', async () => {
      throw new Error('No debería consultarse PostgreSQL');
    });

    const { estado, cuerpo } = await enviar('POST', { nombreCompleto });

    assert.equal(estado, 400);
    assert.deepEqual(cuerpo, ERROR_NOMBRE);
    assert.equal(consulta.mock.callCount(), 0);
  });
}

for (const apodo of APODOS_INVALIDOS) {
  test(`P3 POST perfil rechaza el apodo ${JSON.stringify(apodo)}`, async (t) => {
    simularIdentidad(t);
    const consulta = t.mock.method(pool, 'query', async () => {
      throw new Error('No debería consultarse PostgreSQL');
    });

    const { estado, cuerpo } = await enviar('POST', {
      nombreCompleto: 'Persona de Prueba',
      apodo
    });

    assert.equal(estado, 400);
    assert.deepEqual(cuerpo, ERROR_APODO);
    assert.equal(consulta.mock.callCount(), 0);
  });
}

for (const caso of [
  {
    nombre: 'longitud antes que caracteres (corto con emoji)',
    entrada: { nombreCompleto: 'A😀' },
    codigo: 'nombre_completo_invalido'
  },
  {
    nombre: 'longitud antes que caracteres (101 con emoji)',
    entrada: { nombreCompleto: `${'a'.repeat(100)}😀` },
    codigo: 'nombre_completo_invalido'
  },
  {
    nombre: 'longitud del apodo antes que caracteres',
    entrada: { nombreCompleto: 'Persona de Prueba', apodo: `${'a'.repeat(30)}!` },
    codigo: 'apodo_invalido',
    mensaje: 'El apodo debe ser texto de hasta 30 caracteres o null'
  },
  {
    nombre: 'nombre antes que apodo',
    entrada: { nombreCompleto: 'Ana 😀', apodo: 'Pepe!' },
    codigo: 'nombre_invalido'
  }
]) {
  test(`P3 POST perfil: ${caso.nombre}`, async (t) => {
    simularIdentidad(t);
    const consulta = t.mock.method(pool, 'query', async () => {
      throw new Error('No debería consultarse PostgreSQL');
    });

    const { estado, cuerpo } = await enviar('POST', caso.entrada);

    assert.equal(estado, 400);
    assert.equal(cuerpo.codigo, caso.codigo);
    if (caso.mensaje) assert.equal(cuerpo.mensaje, caso.mensaje);
    assert.equal(consulta.mock.callCount(), 0);
  });
}

for (const caso of [
  { entrada: { nombreCompleto: 'José Ñúñez' }, nombre: 'José Ñúñez', apodo: null },
  { entrada: { nombreCompleto: "O'Connor", apodo: 'Ana-Mari' }, nombre: "O'Connor", apodo: 'Ana-Mari' },
  { entrada: { nombreCompleto: 'O’Connor' }, nombre: "O'Connor", apodo: null },
  { entrada: { nombreCompleto: '  María   del Carmen  ' }, nombre: 'María del Carmen', apodo: null },
  { entrada: { nombreCompleto: 'José Pérez' }, nombre: 'José Pérez', apodo: null },
  { entrada: { nombreCompleto: 'Persona de Prueba', apodo: '  La   Güera ' }, nombre: 'Persona de Prueba', apodo: 'La Güera' },
  { entrada: { nombreCompleto: 'Persona de Prueba', apodo: '  ' }, nombre: 'Persona de Prueba', apodo: null },
  { entrada: { nombreCompleto: 'Persona de Prueba', apodo: null }, nombre: 'Persona de Prueba', apodo: null }
]) {
  test(`P3 POST perfil guarda normalizado ${JSON.stringify(caso.entrada)}`, async (t) => {
    simularIdentidad(t);
    const consulta = t.mock.method(pool, 'query', async (sql, parametros) => ({
      rowCount: 1,
      rows: [{
        uid: parametros[0],
        nombre_completo: parametros[1],
        nombre_apodo: parametros[2],
        rol: 'estudiante'
      }]
    }));

    const { estado, cuerpo } = await enviar('POST', caso.entrada);

    assert.equal(estado, 201);
    assert.equal(cuerpo.nombreCompleto, caso.nombre);
    assert.equal(cuerpo.apodo, caso.apodo);
    assert.equal(consulta.mock.callCount(), 1);
    assert.deepEqual(
      consulta.mock.calls[0].arguments[1],
      ['uid-perfil-prueba', caso.nombre, caso.apodo]
    );
  });
}

for (const nombreCompleto of NOMBRES_INVALIDOS) {
  test(`P3 PATCH perfil rechaza el nombre ${JSON.stringify(nombreCompleto)}`, async (t) => {
    simularIdentidad(t);
    const consulta = simularPatch(t);

    const { estado, cuerpo } = await enviar('PATCH', { nombreCompleto });

    assert.equal(estado, 400);
    assert.deepEqual(cuerpo, ERROR_NOMBRE);
    soloSelect(consulta);
  });
}

for (const apodo of APODOS_INVALIDOS) {
  test(`P3 PATCH perfil rechaza el apodo ${JSON.stringify(apodo)}`, async (t) => {
    simularIdentidad(t);
    const consulta = simularPatch(t);

    const { estado, cuerpo } = await enviar('PATCH', { apodo });

    assert.equal(estado, 400);
    assert.deepEqual(cuerpo, ERROR_APODO);
    soloSelect(consulta);
  });
}

for (const caso of [
  {
    entrada: { nombreCompleto: '  Ana   María López ' },
    parametros: [true, 'Ana María López', false, null, 'uid-perfil-prueba']
  },
  {
    entrada: { nombreCompleto: 'D’Angelo' },
    parametros: [true, "D'Angelo", false, null, 'uid-perfil-prueba']
  },
  {
    entrada: { apodo: '  Pepe  Toño ' },
    parametros: [false, null, true, 'Pepe Toño', 'uid-perfil-prueba']
  },
  {
    entrada: { apodo: '   ' },
    parametros: [false, null, true, null, 'uid-perfil-prueba']
  }
]) {
  test(`P3 PATCH perfil guarda normalizado ${JSON.stringify(caso.entrada)}`, async (t) => {
    simularIdentidad(t);
    const consulta = simularPatch(t);

    const { estado } = await enviar('PATCH', caso.entrada);

    assert.equal(estado, 200);
    assert.equal(consulta.mock.callCount(), 2);
    assert.deepEqual(consulta.mock.calls[1].arguments[1], caso.parametros);
  });
}
