const pool = require('../src/config/database');

async function crearAdministrador() {
  const uid = process.argv[2]?.trim();

  if (!uid) {
    console.error('Uso: npm run crear-admin -- <uid>');
    process.exitCode = 1;
    return;
  }

  try {
    const resultado = await pool.query(
      `
        UPDATE usuarios
        SET rol = 'administrador'
        WHERE uid = $1
        RETURNING uid, nombre_completo, rol
      `,
      [uid]
    );

    if (resultado.rowCount === 0) {
      console.error(
        'No existe un perfil registrado con ese UID. La persona debe hacer su primer acceso antes.'
      );
      process.exitCode = 1;
      return;
    }

    console.log('Administrador configurado correctamente:');
    console.log(resultado.rows[0]);
  } catch (error) {
    console.error('No fue posible configurar el administrador:', error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

crearAdministrador();