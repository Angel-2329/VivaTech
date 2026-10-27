function manejarJsonInvalido(error, req, res, next) {
  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({
      ok: false,
      mensaje: 'El cuerpo de la solicitud no contiene un JSON válido',
      codigo: 'json_invalido'
    });
  }

  return next(error);
}

module.exports = manejarJsonInvalido;