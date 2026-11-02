const CATEGORIAS_INICIALES = [
  { nombre: 'Banca móvil', orden: 1 },
  { nombre: 'Pagos digitales', orden: 2 }
];

async function cargarCategorias(pool, uid) {
  if (typeof uid !== 'string' || !uid.trim() || uid.trim().length > 128) {
    throw new Error('Debes proporcionar un UID de administrador válido.');
  }

  const uidAdministrador = uid.trim();
  const cliente = await pool.connect();

  let transaccionActiva = false;
  let descartarConexion = false;

  try {
    await cliente.query('BEGIN');
    transaccionActiva = true;

    const administrador = await cliente.query(
      `
        SELECT rol, activo
        FROM usuarios
        WHERE uid = $1
        FOR SHARE
      `,
      [uidAdministrador]
    );

    if (
      administrador.rowCount !== 1 ||
      administrador.rows[0].rol !== 'administrador' ||
      administrador.rows[0].activo !== true
    ) {
      throw new Error(
        'El UID debe corresponder a un administrador activo registrado.'
      );
    }

    await cliente.query(
      'LOCK TABLE categorias IN SHARE ROW EXCLUSIVE MODE'
    );

    let creadas = 0;
    let existentes = 0;

    for (const categoria of CATEGORIAS_INICIALES) {
      const resultado = await cliente.query(
        `
          SELECT nombre, orden
          FROM categorias
          WHERE nombre = $1 OR orden = $2
        `,
        [categoria.nombre, categoria.orden]
      );

      if (resultado.rowCount > 0) {
        const compatible =
          resultado.rowCount === 1 &&
          resultado.rows[0].nombre === categoria.nombre &&
          resultado.rows[0].orden === categoria.orden;

        if (!compatible) {
          throw new Error(
            `Conflicto en la categoría "${categoria.nombre}" ` +
            `o en el orden ${categoria.orden}. No se sobrescribieron datos.`
          );
        }

        existentes += 1;
        continue;
      }

      await cliente.query(
        `
          INSERT INTO categorias (nombre, orden, creado_por)
          VALUES ($1, $2, $3)
        `,
        [categoria.nombre, categoria.orden, uidAdministrador]
      );

      creadas += 1;
    }

    await cliente.query('COMMIT');
    transaccionActiva = false;

    return { creadas, existentes };
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

async function ejecutar() {
  const argumentos = process.argv.slice(2);

  if (argumentos.length !== 1 || !argumentos[0].trim()) {
    console.error(
      'Uso: npm run cargar-categorias -- "UID_DEL_ADMINISTRADOR"'
    );
    process.exitCode = 1;
    return;
  }

  let pool;

  try {
    pool = require('../src/config/database');

    const resultado = await cargarCategorias(pool, argumentos[0]);

    console.log(
      'Carga completada. ' +
      `Creadas: ${resultado.creadas}. ` +
      `Ya existentes: ${resultado.existentes}.`
    );
  } catch (error) {
    const erroresEsperados = [
      'Debes proporcionar un UID de administrador válido.',
      'El UID debe corresponder a un administrador activo registrado.'
    ];

    if (
      erroresEsperados.includes(error.message) ||
      error.message?.startsWith('Conflicto en la categoría')
    ) {
      console.error(error.message);
    } else {
      console.error(
        'No fue posible cargar las categorías. ' +
        'Revisa la configuración y la disponibilidad de PostgreSQL.'
      );
    }

    process.exitCode = 1;
  } finally {
    if (pool) {
      try {
        await pool.end();
      } catch {
        console.error('No fue posible cerrar correctamente la conexión.');
        process.exitCode = 1;
      }
    }
  }
}

if (require.main === module) {
  ejecutar();
}

module.exports = { cargarCategorias };
