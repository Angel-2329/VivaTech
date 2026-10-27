function requiereRol(...rolesPermitidos) {
  return (req, res, next) => {
    const usuario = req.usuario;

    if (!usuario || !rolesPermitidos.includes(usuario.rol)) {
      return res.status(403).json({
        ok: false,
        mensaje: 'No tienes permisos para realizar esta acción',
        codigo: 'rol_no_autorizado'
      });
    }

    return next();
  };
}

module.exports = requiereRol;