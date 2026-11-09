const { readFile } = require('node:fs/promises');
const path = require('node:path');
const { validarCurso } = require('../src/services/validar-contenido');

const ARCHIVO_CONTENIDO = path.join(__dirname, '..', 'data', 'contenido-inicial.json');

class ErrorCargaContenido extends Error {
  constructor(codigo, mensaje) {
    super(mensaje);
    this.name = 'ErrorCargaContenido';
    this.codigo = codigo;
  }
}

function validarUid(uid) {
  if (typeof uid !== 'string' || !uid.trim() || uid.trim().length > 128) {
    throw new ErrorCargaContenido('uid_invalido', 'Debes proporcionar un UID de administrador válido.');
  }
  return uid.trim();
}

function normalizarTextos(valor) {
  if (typeof valor === 'string') return valor.trim();
  if (Array.isArray(valor)) return valor.map(normalizarTextos);
  if (valor !== null && typeof valor === 'object') {
    return Object.fromEntries(Object.entries(valor).map(([clave, elemento]) => [clave, normalizarTextos(elemento)]));
  }
  return valor;
}

function prepararContenido(contenido) {
  if (!Array.isArray(contenido) || contenido.length !== 2) {
    throw new ErrorCargaContenido('contenido_invalido', 'El archivo debe contener los dos cursos iniciales.');
  }

  const claves = new Set();
  const ordenes = new Map();

  for (const [indice, curso] of contenido.entries()) {
    const resultado = validarCurso(curso);
    if (!resultado.valido) {
      const detalles = resultado.errores.map((error) => `${error.ruta}: ${error.mensaje}`).join('; ');
      throw new ErrorCargaContenido('contenido_invalido', `Contenido inválido en cursos[${indice}]: ${detalles}`);
    }

    if (typeof curso.claveCarga !== 'string' || !/^[a-z0-9_-]{1,80}$/.test(curso.claveCarga)) {
      throw new ErrorCargaContenido('clave_carga_invalida', `La claveCarga de cursos[${indice}] no es válida.`);
    }
    if (claves.has(curso.claveCarga)) {
      throw new ErrorCargaContenido('clave_carga_duplicada', 'Las claves de carga deben ser únicas.');
    }
    claves.add(curso.claveCarga);

    const categoria = curso.categoria.trim();
    if (!ordenes.has(categoria)) ordenes.set(categoria, new Set());
    if (ordenes.get(categoria).has(curso.orden)) {
      throw new ErrorCargaContenido('orden_curso_duplicado', 'Hay cursos con el mismo orden dentro de una categoría.');
    }
    ordenes.get(categoria).add(curso.orden);
  }

  return normalizarTextos(contenido);
}

async function cargarContenido(pool, uid, contenido) {
  const uidAdministrador = validarUid(uid);
  const cursos = prepararContenido(contenido);
  const cliente = await pool.connect();
  let transaccionActiva = false;
  let descartarConexion = false;

  const resumen = {
    cursosCreados: 0,
    cursosYaRegistrados: 0,
    cursosEliminadosPreviamente: 0,
    leccionesCreadas: 0,
    pasosCreados: 0
  };

  try {
    await cliente.query('BEGIN');
    transaccionActiva = true;

    const administrador = await cliente.query(
      'SELECT rol, activo FROM usuarios WHERE uid = $1 FOR SHARE',
      [uidAdministrador]
    );
    if (
      administrador.rowCount !== 1
      || administrador.rows[0].rol !== 'administrador'
      || administrador.rows[0].activo !== true
    ) {
      throw new ErrorCargaContenido('administrador_invalido', 'El UID debe corresponder a un administrador activo registrado.');
    }

    await cliente.query('LOCK TABLE cargas_contenido_inicial IN SHARE ROW EXCLUSIVE MODE');

    for (const curso of cursos) {
      const registro = await cliente.query(
        'SELECT id_curso::text AS "idCurso" FROM cargas_contenido_inicial WHERE clave = $1',
        [curso.claveCarga]
      );
      if (registro.rowCount === 1) {
        if (registro.rows[0].idCurso === null) resumen.cursosEliminadosPreviamente += 1;
        else resumen.cursosYaRegistrados += 1;
        continue;
      }

      const categoria = await cliente.query(
        'SELECT id_categoria::text AS "idCategoria" FROM categorias WHERE nombre = $1 FOR SHARE',
        [curso.categoria]
      );
      if (categoria.rowCount !== 1) {
        throw new ErrorCargaContenido('categoria_no_disponible', 'Falta una categoría inicial. Carga o revisa las categorías antes de crear contenido nuevo.');
      }
      const { idCategoria } = categoria.rows[0];

      const conflicto = await cliente.query(
        `
          SELECT id_curso::text AS "idCurso"
          FROM cursos
          WHERE id_categoria = $1 AND (orden = $2 OR titulo = $3)
          FOR UPDATE
        `,
        [idCategoria, curso.orden, curso.titulo]
      );
      if (conflicto.rowCount > 0) {
        throw new ErrorCargaContenido('curso_sin_registro', 'Hay un curso sin registro de carga con el título o el orden inicial. No se adoptaron ni sobrescribieron datos.');
      }

      const creado = await cliente.query(
        `
          INSERT INTO cursos (id_categoria, titulo, descripcion, estado_publicacion, creado_por, orden)
          VALUES ($1, $2, $3, 'publicado', $4, $5)
          RETURNING id_curso::text AS "idCurso"
        `,
        [idCategoria, curso.titulo, curso.descripcion, uidAdministrador, curso.orden]
      );
      const { idCurso } = creado.rows[0];

      for (const leccion of curso.lecciones) {
        const creada = await cliente.query(
          `
            INSERT INTO lecciones (
              id_curso, titulo, duracion_estimada_minutos, estado_publicacion,
              creado_por, orden, objetivo
            )
            VALUES ($1, $2, $3, 'publicado', $4, $5, $6)
            RETURNING id_leccion::text AS "idLeccion"
          `,
          [idCurso, leccion.titulo, leccion.duracionEstimadaMinutos, uidAdministrador, leccion.orden, leccion.objetivo]
        );
        const { idLeccion } = creada.rows[0];

        for (const paso of leccion.pasos) {
          await cliente.query(
            `
              INSERT INTO pasos (id_leccion, orden, instruccion, recursos, actividad)
              VALUES ($1, $2, $3, $4::jsonb, $5::jsonb)
            `,
            [idLeccion, paso.orden, paso.instruccion, JSON.stringify(paso.recursos), JSON.stringify(paso.actividad)]
          );
          resumen.pasosCreados += 1;
        }
        resumen.leccionesCreadas += 1;
      }

      await cliente.query(
        'INSERT INTO cargas_contenido_inicial (clave, id_curso) VALUES ($1, $2)',
        [curso.claveCarga, idCurso]
      );
      resumen.cursosCreados += 1;
    }

    await cliente.query('COMMIT');
    transaccionActiva = false;
    return resumen;
  } catch (error) {
    if (transaccionActiva) {
      try {
        await cliente.query('ROLLBACK');
      } catch {
        descartarConexion = true;
      }
    }
    throw error;
  } finally {
    cliente.release(descartarConexion);
  }
}

async function ejecutar(argumentos, {
  leerArchivo = readFile,
  crearPool = () => require('../src/config/database'),
  informar = console.log,
  informarError = console.error
} = {}) {
  if (!Array.isArray(argumentos) || argumentos.length !== 1) {
    informarError('Uso: npm run cargar-contenido -- "UID_DEL_ADMINISTRADOR"');
    return 1;
  }

  let pool;
  let codigo = 0;
  try {
    const uid = validarUid(argumentos[0]);
    let texto;
    try {
      texto = await leerArchivo(ARCHIVO_CONTENIDO, 'utf8');
    } catch {
      throw new ErrorCargaContenido('archivo_no_disponible', 'No fue posible leer backend/data/contenido-inicial.json.');
    }

    let contenido;
    try {
      contenido = JSON.parse(texto);
    } catch {
      throw new ErrorCargaContenido('json_invalido', 'El archivo de contenido inicial no contiene JSON válido.');
    }
    prepararContenido(contenido);
    pool = crearPool();
    const resultado = await cargarContenido(pool, uid, contenido);
    informar(
      `Carga completada. Cursos creados: ${resultado.cursosCreados}. `
      + `Ya registrados: ${resultado.cursosYaRegistrados}. `
      + `Eliminados previamente, no recreados: ${resultado.cursosEliminadosPreviamente}. `
      + `Lecciones creadas: ${resultado.leccionesCreadas}. Pasos creados: ${resultado.pasosCreados}.`
    );
  } catch (error) {
    codigo = 1;
    informarError(error instanceof ErrorCargaContenido
      ? error.message
      : 'No fue posible cargar el contenido. Revisa las migraciones, la configuración y la disponibilidad de PostgreSQL.');
  } finally {
    if (pool) {
      try {
        await pool.end();
      } catch {
        codigo = 1;
        informarError('No fue posible cerrar correctamente la conexión.');
      }
    }
  }
  return codigo;
}

if (require.main === module) {
  ejecutar(process.argv.slice(2))
    .then((codigo) => { process.exitCode = codigo; })
    .catch(() => {
      console.error('No fue posible completar la carga de contenido.');
      process.exitCode = 1;
    });
}

module.exports = { ErrorCargaContenido, cargarContenido, ejecutar };
