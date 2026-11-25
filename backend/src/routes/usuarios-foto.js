const express = require('express');
const verificarTokenFirebase =
  require('../middlewares/verificar-token-firebase');
const cargarUsuario = require('../middlewares/cargar-usuario');
const { ErrorFoto, obtenerFoto } = require('../services/fotos-perfil');

const router = express.Router();

const FOTO_NO_ENCONTRADA = {
  ok: false,
  mensaje: 'La foto no está disponible',
  codigo: 'foto_no_encontrada'
};

router.get(
  '/:uid/foto',
  (req, res, next) => {
    res.set('Cache-Control', 'private, no-store');
    res.set('X-Content-Type-Options', 'nosniff');
    return next();
  },
  verificarTokenFirebase,
  cargarUsuario,
  async (req, res) => {
    const uid = req.params.uid;

    if (
      typeof uid !== 'string'
      || uid.length > 128
      || uid.trim().length === 0
    ) {
      return res.status(404).json(FOTO_NO_ENCONTRADA);
    }

    try {
      const foto = await obtenerFoto(req.usuario, uid);

      res.set('Content-Type', foto.tipo);
      return res.send(foto.contenido);
    } catch (error) {
      if (error instanceof ErrorFoto) {
        return res.status(error.estado).json({
          ok: false,
          mensaje: error.message,
          codigo: error.codigo
        });
      }

      console.error('Error inesperado al entregar la foto de perfil');

      return res.status(503).json({
        ok: false,
        mensaje: 'No fue posible procesar la foto. Intenta de nuevo más tarde.',
        codigo: 'foto_no_disponible'
      });
    }
  }
);

module.exports = router;
