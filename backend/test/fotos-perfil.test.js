const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.DATABASE_URL =
  'postgresql://prueba:prueba@localhost:5432/prueba';
process.env.FIREBASE_PROJECT_ID = 'demo-viva-tech-fotos';

const pool = require('../src/config/database');
const firebaseAuth = require('../src/config/firebase');
const app = require('../src/app');
const {
  TAMANO_MAXIMO_FOTO,
  detectarFormato
} = require('../src/services/fotos-perfil');

const DIRECTORIO = fs.mkdtempSync(path.join(os.tmpdir(), 'vivatech-fotos-'));
const NOMBRE_VALIDO = /^[0-9a-f]{32}\.(jpg|webp)$/;

let servidor;
let base;

before(async () => {
  await new Promise((resolve, reject) => {
    servidor = app.listen(0, '127.0.0.1', resolve);
    servidor.once('error', reject);
  });

  base = `http://127.0.0.1:${servidor.address().port}/api`;
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
  fs.rmSync(DIRECTORIO, { recursive: true, force: true });
});

beforeEach(() => {
  process.env.FOTOS_DIR = DIRECTORIO;

  for (const archivo of fs.readdirSync(DIRECTORIO)) {
    fs.rmSync(path.join(DIRECTORIO, archivo));
  }
});

function jpeg(tamano = 64) {
  const contenido = Buffer.alloc(tamano, 0x11);
  contenido[0] = 0xff;
  contenido[1] = 0xd8;
  contenido[2] = 0xff;
  return contenido;
}

function webp(tamano = 64) {
  const contenido = Buffer.alloc(tamano, 0x22);
  contenido.write('RIFF', 0, 'ascii');
  contenido.write('WEBP', 8, 'ascii');
  return contenido;
}

function png() {
  return Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
}

function archivosGuardados() {
  return fs.readdirSync(DIRECTORIO);
}

function guardarArchivo(nombre, contenido) {
  fs.writeFileSync(path.join(DIRECTORIO, nombre), contenido);
}

function crearUsuario(rol = 'estudiante', uid = 'uid-persona') {
  return {
    uid,
    nombre_completo: 'Persona de Prueba',
    nombre_apodo: null,
    rol,
    activo: true
  };
}

function simularIdentidad(t, uid = 'uid-persona') {
  t.mock.method(firebaseAuth, 'verifyIdToken', async () => ({ uid }));
}

function simularBase(t, { usuario = crearUsuario(), responder }) {
  return t.mock.method(pool, 'query', async (sql, parametros) => {
    if (/SELECT uid, nombre_completo, nombre_apodo, rol, activo\s+FROM usuarios\s+WHERE uid = \$1/.test(sql)) {
      return usuario
        ? { rowCount: 1, rows: [usuario] }
        : { rowCount: 0, rows: [] };
    }

    return responder(sql, parametros);
  });
}

function impedirConsultas(t) {
  return t.mock.method(pool, 'query', async () => {
    throw new Error('No debería consultarse PostgreSQL');
  });
}

function formulario(contenido, opciones = {}) {
  const datos = new FormData();
  const campo = opciones.campo || 'foto';
  const tipo = opciones.tipo || 'image/jpeg';
  const nombre = opciones.nombre || 'foto.jpg';

  datos.append(campo, new Blob([contenido], { type: tipo }), nombre);

  if (opciones.segundo) {
    datos.append('foto', new Blob([contenido], { type: tipo }), 'otra.jpg');
  }

  if (opciones.extra) {
    datos.append('extra', 'texto');
  }

  return datos;
}

function subir(cuerpo, encabezados = {}) {
  return fetch(`${base}/perfil/foto`, {
    method: 'PUT',
    headers: { Authorization: 'Bearer token-prueba', ...encabezados },
    body: cuerpo
  });
}

const FECHA = '2026-11-26T18:00:00.123456+00:00';

function responderGuardado({ anterior = null, filas = 1 } = {}) {
  const llamadas = [];

  return {
    llamadas,
    responder(sql, parametros) {
      llamadas.push({ sql, parametros });

      if (/^\s*UPDATE usuarios u\s+SET foto_archivo = \$2/.test(sql)) {
        return filas === 1
          ? { rowCount: 1, rows: [{ fotoAnterior: anterior, fotoActualizada: FECHA }] }
          : { rowCount: 0, rows: [] };
      }

      throw new Error(`Consulta inesperada: ${sql}`);
    }
  };
}


test('P7 detectarFormato reconoce JPEG y WebP por la firma', () => {
  assert.deepEqual(detectarFormato(jpeg()), { extension: 'jpg', tipo: 'image/jpeg' });
  assert.deepEqual(detectarFormato(webp()), { extension: 'webp', tipo: 'image/webp' });
});

for (const [nombre, contenido] of [
  ['PNG', png()],
  ['GIF', Buffer.from('GIF89a000000', 'ascii')],
  ['texto', Buffer.from('<svg></svg>', 'utf8')],
  ['RIFF que no es WEBP', Buffer.from('RIFF0000WAVE', 'ascii')],
  ['JPEG truncado', Buffer.from([0xff, 0xd8])],
  ['vacío', Buffer.alloc(0)]
]) {
  test(`P7 detectarFormato rechaza ${nombre}`, () => {
    assert.equal(detectarFormato(contenido), null);
  });
}

test('P7 el límite es 307 200 bytes (300 KiB)', () => {
  assert.equal(TAMANO_MAXIMO_FOTO, 307200);
});


test('P7 PUT sin token responde 401, sin consultar ni escribir', async (t) => {
  const consulta = impedirConsultas(t);

  const respuesta = await fetch(`${base}/perfil/foto`, {
    method: 'PUT',
    body: formulario(jpeg())
  });

  assert.equal(respuesta.status, 401);
  assert.equal(respuesta.headers.get('cache-control'), 'no-store');
  assert.equal(consulta.mock.callCount(), 0);
  assert.deepEqual(archivosGuardados(), []);
});

test('P7 PUT con cuenta desactivada responde 403 sin escribir', async (t) => {
  simularIdentidad(t);
  simularBase(t, {
    usuario: { ...crearUsuario(), activo: false },
    responder() {
      throw new Error('No debería continuar');
    }
  });

  const respuesta = await subir(formulario(jpeg()));
  const cuerpo = await respuesta.json();

  assert.equal(respuesta.status, 403);
  assert.equal(cuerpo.codigo, 'cuenta_desactivada');
  assert.deepEqual(archivosGuardados(), []);
});

for (const caso of [
  { nombre: 'sin cuerpo', cuerpo: undefined },
  { nombre: 'con JSON', cuerpo: JSON.stringify({ foto: 'x' }), encabezados: { 'Content-Type': 'application/json' } },
  { nombre: 'con el campo equivocado', cuerpo: () => formulario(jpeg(), { campo: 'imagen' }) },
  { nombre: 'con dos archivos', cuerpo: () => formulario(jpeg(), { segundo: true }) },
  { nombre: 'con un campo de texto adicional', cuerpo: () => formulario(jpeg(), { extra: true }) },
  {
    nombre: 'con multipart mal formado',
    cuerpo: '--limite\r\nContent-Disposition: form-data; name="foto"; filename="a.jpg"\r\n\r\nxxx',
    encabezados: { 'Content-Type': 'multipart/form-data; boundary=limite' }
  }
]) {
  test(`P7 PUT ${caso.nombre} responde 400 foto_requerida`, async (t) => {
    simularIdentidad(t);
    const consulta = simularBase(t, {
      responder() {
        throw new Error('No debería guardarse');
      }
    });

    const cuerpo = typeof caso.cuerpo === 'function' ? caso.cuerpo() : caso.cuerpo;
    const respuesta = await subir(cuerpo, caso.encabezados);
    const datos = await respuesta.json();

    assert.equal(respuesta.status, 400);
    assert.deepEqual(datos, {
      ok: false,
      mensaje: 'Envía una sola foto en el campo foto',
      codigo: 'foto_requerida'
    });
    assert.equal(respuesta.headers.get('cache-control'), 'no-store');
    assert.equal(consulta.mock.callCount(), 1);
    assert.deepEqual(archivosGuardados(), []);
  });
}

test('P7 PUT de 307 201 bytes responde 413 foto_muy_grande sin escribir', async (t) => {
  simularIdentidad(t);
  const consulta = simularBase(t, {
    responder() {
      throw new Error('No debería guardarse');
    }
  });

  const respuesta = await subir(formulario(jpeg(TAMANO_MAXIMO_FOTO + 1)));
  const cuerpo = await respuesta.json();

  assert.equal(respuesta.status, 413);
  assert.equal(cuerpo.codigo, 'foto_muy_grande');
  assert.equal(consulta.mock.callCount(), 1);
  assert.deepEqual(archivosGuardados(), []);
});

test('P7 PUT de exactamente 307 200 bytes se acepta', async (t) => {
  simularIdentidad(t);
  const guardado = responderGuardado();
  simularBase(t, { responder: guardado.responder });

  const respuesta = await subir(formulario(jpeg(TAMANO_MAXIMO_FOTO)));

  assert.equal(respuesta.status, 200);
  const [archivo] = archivosGuardados();
  assert.equal(fs.statSync(path.join(DIRECTORIO, archivo)).size, TAMANO_MAXIMO_FOTO);
});

for (const caso of [
  { nombre: 'un PNG', contenido: png(), tipo: 'image/png', archivo: 'foto.png' },
  { nombre: 'un PNG con extensión y tipo de JPEG', contenido: png(), tipo: 'image/jpeg', archivo: 'foto.jpg' },
  { nombre: 'un SVG con tipo de WebP', contenido: Buffer.from('<svg onload="x"></svg>'), tipo: 'image/webp', archivo: 'foto.webp' }
]) {
  test(`P7 PUT con ${caso.nombre} responde 415 formato_no_permitido`, async (t) => {
    simularIdentidad(t);
    const consulta = simularBase(t, {
      responder() {
        throw new Error('No debería guardarse');
      }
    });

    const respuesta = await subir(
      formulario(caso.contenido, { tipo: caso.tipo, nombre: caso.archivo })
    );
    const cuerpo = await respuesta.json();

    assert.equal(respuesta.status, 415);
    assert.equal(cuerpo.codigo, 'formato_no_permitido');
    assert.equal(consulta.mock.callCount(), 1);
    assert.deepEqual(archivosGuardados(), []);
  });
}

for (const caso of [
  { nombre: 'JPEG', contenido: jpeg(), extension: 'jpg' },
  { nombre: 'WebP aunque diga image/jpeg', contenido: webp(), extension: 'webp', tipo: 'image/jpeg', archivo: 'x.jpg' }
]) {
  test(`P7 PUT guarda un ${caso.nombre} con nombre aleatorio y responde 200`, async (t) => {
    simularIdentidad(t);
    const guardado = responderGuardado();
    simularBase(t, { responder: guardado.responder });

    const respuesta = await subir(
      formulario(caso.contenido, { tipo: caso.tipo, nombre: caso.archivo })
    );
    const cuerpo = await respuesta.json();

    assert.equal(respuesta.status, 200);
    assert.deepEqual(cuerpo, { tieneFoto: true, fotoActualizada: FECHA });
    assert.equal(respuesta.headers.get('cache-control'), 'no-store');

    const archivos = archivosGuardados();
    assert.equal(archivos.length, 1);
    assert.match(archivos[0], NOMBRE_VALIDO);
    assert.ok(archivos[0].endsWith(`.${caso.extension}`));
    assert.notEqual(archivos[0], caso.archivo || 'foto.jpg');
    assert.deepEqual(fs.readFileSync(path.join(DIRECTORIO, archivos[0])), caso.contenido);

    assert.equal(guardado.llamadas.length, 1);
    const { sql, parametros } = guardado.llamadas[0];
    assert.deepEqual(parametros, ['uid-persona', archivos[0]]);
    assert.match(sql, /foto_actualizada = now\(\)/);
    assert.match(sql, /AND activo = true\s+FOR UPDATE/);
    assert.match(sql, /to_jsonb\(u\.foto_actualizada\) #>> '\{\}'/);
  });
}

test('P7 PUT no revela la ruta ni el nombre del archivo en la respuesta', async (t) => {
  simularIdentidad(t);
  const guardado = responderGuardado();
  simularBase(t, { responder: guardado.responder });

  const respuesta = await subir(formulario(jpeg()));
  const texto = await respuesta.text();
  const [archivo] = archivosGuardados();

  assert.equal(texto.includes(archivo), false);
  assert.equal(texto.includes(DIRECTORIO), false);
});

test('P7 PUT al reemplazar guarda el nuevo y después borra el anterior', async (t) => {
  const anterior = `${'a'.repeat(32)}.jpg`;
  guardarArchivo(anterior, jpeg());

  simularIdentidad(t);
  const guardado = responderGuardado({ anterior });
  simularBase(t, { responder: guardado.responder });

  const respuesta = await subir(formulario(webp()));

  assert.equal(respuesta.status, 200);
  const archivos = archivosGuardados();
  assert.equal(archivos.length, 1);
  assert.notEqual(archivos[0], anterior);
  assert.ok(archivos[0].endsWith('.webp'));
});

test('P7 PUT responde 200 aunque el archivo anterior ya no exista', async (t) => {
  simularIdentidad(t);
  const guardado = responderGuardado({ anterior: `${'b'.repeat(32)}.jpg` });
  simularBase(t, { responder: guardado.responder });

  const respuesta = await subir(formulario(jpeg()));

  assert.equal(respuesta.status, 200);
  assert.equal(archivosGuardados().length, 1);
});

test('P7 PUT con fallo de PostgreSQL responde 503 y borra el archivo nuevo', async (t) => {
  simularIdentidad(t);
  t.mock.method(console, 'error', () => {});
  simularBase(t, {
    responder() {
      throw new Error('conexión perdida');
    }
  });

  const respuesta = await subir(formulario(jpeg()));
  const cuerpo = await respuesta.json();

  assert.equal(respuesta.status, 503);
  assert.equal(cuerpo.codigo, 'foto_no_disponible');
  assert.deepEqual(archivosGuardados(), []);
});

test('P7 PUT si la cuenta dejó de estar activa responde 409 y borra el archivo nuevo', async (t) => {
  simularIdentidad(t);
  const guardado = responderGuardado({ filas: 0 });
  simularBase(t, { responder: guardado.responder });

  const respuesta = await subir(formulario(jpeg()));
  const cuerpo = await respuesta.json();

  assert.equal(respuesta.status, 409);
  assert.equal(cuerpo.codigo, 'perfil_no_actualizado');
  assert.deepEqual(archivosGuardados(), []);
});

for (const valor of [undefined, '', 'fotos-relativas']) {
  test(`P7 PUT con FOTOS_DIR ${JSON.stringify(valor)} responde 503 sin escribir ni guardar`, async (t) => {
    if (valor === undefined) delete process.env.FOTOS_DIR;
    else process.env.FOTOS_DIR = valor;

    simularIdentidad(t);
    t.mock.method(console, 'error', () => {});
    const consulta = simularBase(t, {
      responder() {
        throw new Error('No debería guardarse');
      }
    });

    const respuesta = await subir(formulario(jpeg()));
    const cuerpo = await respuesta.json();

    assert.equal(respuesta.status, 503);
    assert.equal(cuerpo.codigo, 'foto_no_disponible');
    assert.equal(consulta.mock.callCount(), 1);
    assert.deepEqual(archivosGuardados(), []);
  });
}

test('P7 PUT con fallo al escribir en disco responde 503 sin tocar PostgreSQL', async (t) => {
  process.env.FOTOS_DIR = path.join(DIRECTORIO, 'no-existe');
  simularIdentidad(t);
  t.mock.method(console, 'error', () => {});
  const consulta = simularBase(t, {
    responder() {
      throw new Error('No debería guardarse');
    }
  });

  const respuesta = await subir(formulario(jpeg()));
  const cuerpo = await respuesta.json();

  assert.equal(respuesta.status, 503);
  assert.equal(cuerpo.codigo, 'foto_no_disponible');
  assert.equal(consulta.mock.callCount(), 1);
});


function borrar() {
  return fetch(`${base}/perfil/foto`, {
    method: 'DELETE',
    headers: { Authorization: 'Bearer token-prueba' }
  });
}

test('P7 DELETE sin token responde 401', async (t) => {
  const consulta = impedirConsultas(t);
  const respuesta = await fetch(`${base}/perfil/foto`, { method: 'DELETE' });

  assert.equal(respuesta.status, 401);
  assert.equal(consulta.mock.callCount(), 0);
});

test('P7 DELETE quita la referencia y borra el archivo después', async (t) => {
  const nombre = `${'c'.repeat(32)}.jpg`;
  guardarArchivo(nombre, jpeg());
  const otro = `${'d'.repeat(32)}.jpg`;
  guardarArchivo(otro, jpeg());

  simularIdentidad(t);
  const llamadas = [];
  simularBase(t, {
    responder(sql, parametros) {
      llamadas.push({ sql, parametros });
      return { rowCount: 1, rows: [{ fotoAnterior: nombre }] };
    }
  });

  const respuesta = await borrar();

  assert.equal(respuesta.status, 204);
  assert.equal(respuesta.headers.get('cache-control'), 'no-store');
  assert.deepEqual(archivosGuardados(), [otro]);
  assert.equal(llamadas.length, 1);
  assert.deepEqual(llamadas[0].parametros, ['uid-persona']);
  assert.match(llamadas[0].sql, /SET foto_archivo = NULL,\s+foto_actualizada = NULL/);
  assert.match(llamadas[0].sql, /AND foto_archivo IS NOT NULL\s+FOR UPDATE/);
});

test('P7 DELETE sin foto responde 204 sin borrar nada', async (t) => {
  const otro = `${'e'.repeat(32)}.jpg`;
  guardarArchivo(otro, jpeg());

  simularIdentidad(t);
  simularBase(t, { responder: () => ({ rowCount: 0, rows: [] }) });

  const respuesta = await borrar();

  assert.equal(respuesta.status, 204);
  assert.deepEqual(archivosGuardados(), [otro]);
});

test('P7 DELETE responde 204 y deja aviso si el archivo no se puede borrar', async (t) => {
  delete process.env.FOTOS_DIR;
  simularIdentidad(t);
  const aviso = t.mock.method(console, 'error', () => {});
  simularBase(t, {
    responder: () => ({ rowCount: 1, rows: [{ fotoAnterior: `${'f'.repeat(32)}.jpg` }] })
  });

  const respuesta = await borrar();

  assert.equal(respuesta.status, 204);
  assert.ok(aviso.mock.callCount() >= 1);
});

test('P7 DELETE no borra archivos con una referencia de formato inesperado', async (t) => {
  guardarArchivo('importante.txt', 'no borrar');
  simularIdentidad(t);
  t.mock.method(console, 'error', () => {});
  simularBase(t, {
    responder: () => ({ rowCount: 1, rows: [{ fotoAnterior: '../importante.txt' }] })
  });

  const respuesta = await borrar();

  assert.equal(respuesta.status, 204);
  assert.deepEqual(archivosGuardados(), ['importante.txt']);
});

test('P7 DELETE con fallo de PostgreSQL responde 503', async (t) => {
  simularIdentidad(t);
  t.mock.method(console, 'error', () => {});
  simularBase(t, {
    responder() {
      throw new Error('conexión perdida');
    }
  });

  const respuesta = await borrar();
  const cuerpo = await respuesta.json();

  assert.equal(respuesta.status, 503);
  assert.equal(cuerpo.codigo, 'foto_no_disponible');
});


function pedirFoto(uid) {
  return fetch(`${base}/usuarios/${encodeURIComponent(uid)}/foto`, {
    headers: { Authorization: 'Bearer token-prueba' }
  });
}

const FOTO_NO_ENCONTRADA = {
  ok: false,
  mensaje: 'La foto no está disponible',
  codigo: 'foto_no_encontrada'
};

test('P7 GET foto sin token responde 401 con no-store y nosniff', async (t) => {
  const consulta = impedirConsultas(t);
  const respuesta = await fetch(`${base}/usuarios/uid-persona/foto`);

  assert.equal(respuesta.status, 401);
  assert.equal(respuesta.headers.get('cache-control'), 'private, no-store');
  assert.equal(respuesta.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(consulta.mock.callCount(), 0);
});

for (const caso of [
  { rol: 'estudiante', solicitante: 'uid-persona', destino: 'uid-persona', contenido: jpeg(), tipo: 'image/jpeg' },
  { rol: 'administrador', solicitante: 'uid-admin', destino: 'uid-persona', contenido: webp(), tipo: 'image/webp' },
  { rol: 'maestro', solicitante: 'uid-maestro', destino: 'uid-persona', contenido: jpeg(), tipo: 'image/jpeg' }
]) {
  test(`P7 GET foto como ${caso.rol} permitido devuelve el binario con su tipo real`, async (t) => {
    const nombre = `${'1'.repeat(32)}.${caso.tipo === 'image/webp' ? 'webp' : 'jpg'}`;
    guardarArchivo(nombre, caso.contenido);

    simularIdentidad(t, caso.solicitante);
    const llamadas = [];
    simularBase(t, {
      usuario: crearUsuario(caso.rol, caso.solicitante),
      responder(sql, parametros) {
        llamadas.push({ sql, parametros });
        return { rowCount: 1, rows: [{ fotoArchivo: nombre }] };
      }
    });

    const respuesta = await pedirFoto(caso.destino);
    const contenido = Buffer.from(await respuesta.arrayBuffer());

    assert.equal(respuesta.status, 200);
    assert.equal(respuesta.headers.get('content-type'), caso.tipo);
    assert.equal(respuesta.headers.get('cache-control'), 'private, no-store');
    assert.equal(respuesta.headers.get('x-content-type-options'), 'nosniff');
    assert.deepEqual(contenido, caso.contenido);
    assert.deepEqual(llamadas[0].parametros, [caso.destino, caso.solicitante, caso.rol]);
  });
}

test('P7 GET foto: la consulta limita la visibilidad según el contrato', async (t) => {
  simularIdentidad(t, 'uid-maestro');
  const llamadas = [];
  simularBase(t, {
    usuario: crearUsuario('maestro', 'uid-maestro'),
    responder(sql, parametros) {
      llamadas.push({ sql, parametros });
      return { rowCount: 0, rows: [] };
    }
  });

  await pedirFoto('uid-persona');
  const { sql } = llamadas[0];

  assert.match(sql, /d\.uid = \$1/);
  assert.match(sql, /d\.foto_archivo IS NOT NULL/);
  assert.match(sql, /d\.uid = \$2/);
  assert.match(sql, /\$3::text = 'administrador'/);
  assert.match(sql, /\$3::text = 'maestro'\s+AND EXISTS/);
  assert.match(sql, /FROM grupo_estudiantes ge\s+JOIN grupo_maestros gm ON gm\.id_grupo = ge\.id_grupo/);
  assert.match(sql, /ge\.uid_estudiante = d\.uid\s+AND gm\.uid_maestro = \$2/);
  assert.doesNotMatch(sql, /'estudiante'/);
});

test('P7 GET foto sin permiso y sin foto responde el mismo 404', async (t) => {
  simularIdentidad(t, 'uid-companero');
  simularBase(t, {
    usuario: crearUsuario('estudiante', 'uid-companero'),
    responder: () => ({ rowCount: 0, rows: [] })
  });

  const sinPermiso = await pedirFoto('uid-persona');
  const cuerpoSinPermiso = await sinPermiso.json();
  const inexistente = await pedirFoto('uid-que-no-existe');
  const cuerpoInexistente = await inexistente.json();

  assert.equal(sinPermiso.status, 404);
  assert.equal(inexistente.status, 404);
  assert.deepEqual(cuerpoSinPermiso, FOTO_NO_ENCONTRADA);
  assert.deepEqual(cuerpoInexistente, FOTO_NO_ENCONTRADA);
  assert.equal(sinPermiso.headers.get('cache-control'), 'private, no-store');
});

test('P7 GET foto con UID de más de 128 caracteres responde 404 sin consultar', async (t) => {
  simularIdentidad(t);
  const llamadas = [];
  simularBase(t, {
    responder(sql) {
      llamadas.push(sql);
      return { rowCount: 0, rows: [] };
    }
  });

  const respuesta = await pedirFoto('u'.repeat(129));
  const cuerpo = await respuesta.json();

  assert.equal(respuesta.status, 404);
  assert.deepEqual(cuerpo, FOTO_NO_ENCONTRADA);
  assert.equal(llamadas.length, 0);
});

test('P7 GET foto registrada pero sin archivo en disco responde 404', async (t) => {
  simularIdentidad(t);
  t.mock.method(console, 'error', () => {});
  simularBase(t, {
    responder: () => ({ rowCount: 1, rows: [{ fotoArchivo: `${'2'.repeat(32)}.jpg` }] })
  });

  const respuesta = await pedirFoto('uid-persona');

  assert.equal(respuesta.status, 404);
  assert.deepEqual(await respuesta.json(), FOTO_NO_ENCONTRADA);
});

test('P7 GET foto con referencia de formato inesperado responde 503 sin leer', async (t) => {
  simularIdentidad(t);
  t.mock.method(console, 'error', () => {});
  simularBase(t, {
    responder: () => ({ rowCount: 1, rows: [{ fotoArchivo: '../../backend/.env' }] })
  });

  const respuesta = await pedirFoto('uid-persona');

  assert.equal(respuesta.status, 503);
  assert.equal((await respuesta.json()).codigo, 'foto_no_disponible');
});

test('P7 GET foto con archivo que no es JPEG ni WebP responde 503', async (t) => {
  const nombre = `${'3'.repeat(32)}.jpg`;
  guardarArchivo(nombre, png());
  simularIdentidad(t);
  t.mock.method(console, 'error', () => {});
  simularBase(t, {
    responder: () => ({ rowCount: 1, rows: [{ fotoArchivo: nombre }] })
  });

  const respuesta = await pedirFoto('uid-persona');

  assert.equal(respuesta.status, 503);
});

test('P7 GET foto con fallo de PostgreSQL responde 503', async (t) => {
  simularIdentidad(t);
  t.mock.method(console, 'error', () => {});
  simularBase(t, {
    responder() {
      throw new Error('conexión perdida');
    }
  });

  const respuesta = await pedirFoto('uid-persona');

  assert.equal(respuesta.status, 503);
  assert.equal((await respuesta.json()).codigo, 'foto_no_disponible');
});


test('P7 GET /api/perfil incluye tieneFoto y fotoActualizada', async (t) => {
  simularIdentidad(t);
  const llamadas = [];
  simularBase(t, {
    responder(sql, parametros) {
      llamadas.push({ sql, parametros });
      return { rowCount: 1, rows: [{ tieneFoto: true, fotoActualizada: FECHA }] };
    }
  });

  const respuesta = await fetch(`${base}/perfil`, {
    headers: { Authorization: 'Bearer token-prueba' }
  });
  const cuerpo = await respuesta.json();

  assert.equal(respuesta.status, 200);
  assert.deepEqual(cuerpo, {
    uid: 'uid-persona',
    nombreCompleto: 'Persona de Prueba',
    apodo: null,
    rol: 'estudiante',
    tieneFoto: true,
    fotoActualizada: FECHA
  });
  assert.deepEqual(llamadas[0].parametros, ['uid-persona']);
  assert.match(llamadas[0].sql, /foto_archivo IS NOT NULL AS "tieneFoto"/);
  assert.doesNotMatch(llamadas[0].sql, /foto_archivo\s+AS|,\s*foto_archivo\s*,/);
});

test('P7 GET /api/perfil responde 503 si falla la consulta de la foto', async (t) => {
  simularIdentidad(t);
  t.mock.method(console, 'error', () => {});
  simularBase(t, {
    responder() {
      throw new Error('conexión perdida');
    }
  });

  const respuesta = await fetch(`${base}/perfil`, {
    headers: { Authorization: 'Bearer token-prueba' }
  });

  assert.equal(respuesta.status, 503);
});

test('P7 GET /api/admin/usuarios agrega los campos sin exponer el nombre del archivo', async (t) => {
  simularIdentidad(t, 'uid-admin');
  const llamadas = [];
  simularBase(t, {
    usuario: crearUsuario('administrador', 'uid-admin'),
    responder(sql) {
      llamadas.push(sql);
      return { rowCount: 0, rows: [] };
    }
  });

  const respuesta = await fetch(`${base}/admin/usuarios`, {
    headers: { Authorization: 'Bearer token-prueba' }
  });

  assert.equal(respuesta.status, 200);
  assert.match(llamadas[0], /foto_archivo IS NOT NULL AS "tieneFoto"/);
  assert.match(llamadas[0], /to_jsonb\(foto_actualizada\) #>> '\{\}' AS "fotoActualizada"/);
});


function simularCambioActivo(t, { activoActual, fotoAnterior }) {
  const administrador = {
    uid: 'uid-admin',
    nombreCompleto: 'Administrador',
    apodo: null,
    rol: 'administrador',
    activo: true,
    tieneFoto: false,
    fotoActualizada: null
  };
  const destinatario = {
    uid: 'uid-persona',
    nombreCompleto: 'Persona de Prueba',
    apodo: null,
    rol: 'estudiante',
    activo: activoActual,
    tieneFoto: Boolean(fotoAnterior),
    fotoActualizada: fotoAnterior ? FECHA : null
  };
  const actualizaciones = [];

  const cliente = {
    query: t.mock.fn(async (sql, parametros) => {
      if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql.trim())) {
        return { rowCount: 0, rows: [] };
      }

      if (/FOR UPDATE/.test(sql)) {
        return { rowCount: 2, rows: [administrador, destinatario] };
      }

      if (/^\s*UPDATE usuarios\s+SET activo = \$1/.test(sql)) {
        actualizaciones.push({ sql, parametros });
        const activo = parametros[0];
        return {
          rowCount: 1,
          rows: [{
            ...destinatario,
            activo,
            tieneFoto: activo ? destinatario.tieneFoto : false,
            fotoActualizada: activo ? destinatario.fotoActualizada : null,
            fotoAnterior
          }]
        };
      }

      throw new Error(`Consulta inesperada: ${sql}`);
    }),
    release: t.mock.fn()
  };

  t.mock.method(pool, 'connect', async () => cliente);
  return { cliente, actualizaciones };
}

function cambiarActivo(activo) {
  return fetch(`${base}/admin/usuarios/uid-persona/activo`, {
    method: 'PATCH',
    headers: {
      Authorization: 'Bearer token-prueba',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ activo })
  });
}

test('P7 desactivar una cuenta quita la foto y borra el archivo después del COMMIT', async (t) => {
  const nombre = `${'4'.repeat(32)}.jpg`;
  guardarArchivo(nombre, jpeg());

  simularIdentidad(t, 'uid-admin');
  simularBase(t, {
    usuario: crearUsuario('administrador', 'uid-admin'),
    responder() {
      throw new Error('Consulta inesperada fuera de la transacción');
    }
  });
  const { cliente, actualizaciones } = simularCambioActivo(t, {
    activoActual: true,
    fotoAnterior: nombre
  });

  const respuesta = await cambiarActivo(false);
  const cuerpo = await respuesta.json();

  assert.equal(respuesta.status, 200);
  assert.deepEqual(cuerpo, {
    uid: 'uid-persona',
    nombreCompleto: 'Persona de Prueba',
    apodo: null,
    rol: 'estudiante',
    activo: false,
    tieneFoto: false,
    fotoActualizada: null
  });
  assert.deepEqual(archivosGuardados(), []);

  const comandos = cliente.query.mock.calls.map((llamada) => llamada.arguments[0].trim());
  assert.equal(comandos.at(-1), 'COMMIT');
  assert.deepEqual(actualizaciones[0].parametros, [false, 'uid-persona']);
  assert.match(actualizaciones[0].sql, /foto_archivo = CASE WHEN \$1::boolean THEN foto_archivo ELSE NULL END/);
  assert.match(actualizaciones[0].sql, /foto_actualizada = CASE WHEN \$1::boolean THEN foto_actualizada ELSE NULL END/);
});

test('P7 reactivar una cuenta no borra archivos', async (t) => {
  const nombre = `${'5'.repeat(32)}.jpg`;
  guardarArchivo(nombre, jpeg());

  simularIdentidad(t, 'uid-admin');
  simularBase(t, {
    usuario: crearUsuario('administrador', 'uid-admin'),
    responder() {
      throw new Error('Consulta inesperada');
    }
  });
  simularCambioActivo(t, { activoActual: false, fotoAnterior: nombre });

  const respuesta = await cambiarActivo(true);
  const cuerpo = await respuesta.json();

  assert.equal(respuesta.status, 200);
  assert.equal(cuerpo.activo, true);
  assert.equal('fotoAnterior' in cuerpo, false);
  assert.deepEqual(archivosGuardados(), [nombre]);
});

test('P7 desactivar una cuenta ya desactivada responde sin cambios y sin borrar', async (t) => {
  const nombre = `${'6'.repeat(32)}.jpg`;
  guardarArchivo(nombre, jpeg());

  simularIdentidad(t, 'uid-admin');
  simularBase(t, {
    usuario: crearUsuario('administrador', 'uid-admin'),
    responder() {
      throw new Error('Consulta inesperada');
    }
  });
  const { actualizaciones } = simularCambioActivo(t, {
    activoActual: false,
    fotoAnterior: nombre
  });

  const respuesta = await cambiarActivo(false);
  const cuerpo = await respuesta.json();

  assert.equal(respuesta.status, 200);
  assert.equal(cuerpo.activo, false);
  assert.equal('fotoAnterior' in cuerpo, false);
  assert.equal(actualizaciones.length, 0);
  assert.deepEqual(archivosGuardados(), [nombre]);
});

test('P7 desactivar responde 200 aunque falle el borrado del archivo', async (t) => {
  delete process.env.FOTOS_DIR;
  simularIdentidad(t, 'uid-admin');
  const aviso = t.mock.method(console, 'error', () => {});
  simularBase(t, {
    usuario: crearUsuario('administrador', 'uid-admin'),
    responder() {
      throw new Error('Consulta inesperada');
    }
  });
  simularCambioActivo(t, { activoActual: true, fotoAnterior: `${'7'.repeat(32)}.jpg` });

  const respuesta = await cambiarActivo(false);

  assert.equal(respuesta.status, 200);
  assert.ok(aviso.mock.callCount() >= 1);
});
