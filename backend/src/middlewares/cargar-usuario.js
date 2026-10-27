const pool = require('../config/database');

async function cargarUsuario(req, res, next) {
  const { uid } = req.auth;

  try {
    const resultado = await pool.query(
      `
        SELECT uid, nombre_completo, nombre_apodo, rol, activo
        FROM usuarios
        WHERE uid = $1
      `,
      [uid]
    );

    if (resultado.rowCount === 0) {
      return res.status(404).json({
        ok: false,
        mensaje: 'El perfil todavía no está registrado',
        codigo: 'perfil_no_registrado'
      });
    }

    const usuario = resultado.rows[0];

    if (!usuario.activo) {
      return res.status(403).json({
        ok: false,
        mensaje: 'La cuenta está desactivada',
        codigo: 'cuenta_desactivada'
      });
    }

    req.usuario = usuario;
    return next();
  } catch (error) {
    console.error('Error al cargar el usuario:', error.message);

    return res.status(503).json({
      ok: false,
      mensaje: 'No fue posible consultar el perfil'
    });
  }
}

module.exports = cargarUsuario;