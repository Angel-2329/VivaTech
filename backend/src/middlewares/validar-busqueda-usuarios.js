function leerEntero(valor, predeterminado, minimo, maximo) {
  if (valor === undefined) return predeterminado;

  if (typeof valor !== 'string' || !/^[0-9]+$/.test(valor)) {
    return null;
  }

  const numero = Number(valor);

  if (
    !Number.isSafeInteger(numero)
    || numero < minimo
    || numero > maximo
  ) {
    return null;
  }

  return numero;
}

function validarBusquedaUsuarios(req, res, next) {
  const valorBuscar = req.query.buscar;

  if (
    valorBuscar !== undefined
    && typeof valorBuscar !== 'string'
  ) {
    return res.status(400).json({
      ok: false,
      mensaje: 'La búsqueda debe ser un texto',
      codigo: 'buscar_invalido'
    });
  }

  const buscar = valorBuscar?.trim() || '';

  if (buscar.length > 100) {
    return res.status(400).json({
      ok: false,
      mensaje: 'La búsqueda debe tener como máximo 100 caracteres',
      codigo: 'buscar_invalido'
    });
  }

  const limite = leerEntero(
    req.query.limite,
    50,
    1,
    100
  );

  const desplazamiento = leerEntero(
    req.query.desplazamiento,
    0,
    0,
    2147483647
  );

  if (limite === null || desplazamiento === null) {
    return res.status(400).json({
      ok: false,
      mensaje:
        'El límite debe ser un entero entre 1 y 100 y el desplazamiento un entero entre 0 y 2147483647',
      codigo: 'paginacion_invalida'
    });
  }

  req.busquedaUsuarios = {
    buscar,
    limite,
    desplazamiento
  };

  return next();
}

module.exports = validarBusquedaUsuarios;