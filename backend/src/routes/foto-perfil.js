const express = require('express');
const multer = require('multer');
const verificarTokenFirebase =
  require('../middlewares/verificar-token-firebase');
const cargarUsuario = require('../middlewares/cargar-usuario');
const {
  ErrorFoto,
  TAMANO_MAXIMO_FOTO,
  guardarFoto,
  quitarFoto
} = require('../services/fotos-perfil');

const router = express.Router();

const recibirFoto = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: TAMANO_MAXIMO_FOTO,
    files: 1,
    fields: 0,
    parts: 1
  }
}).single('foto');

const FOTO_REQUERIDA = {
  ok: false,
  mensaje: 'Envía una sola foto en el campo foto',
  codigo: 'foto_requerida'
};

function sinCache(req, res, next) {
  res.set('Cache-Control', 'no-store');
  return next();
}

function recibirArchivo(req, res, next) {
  recibirFoto(req, res, (error) => {
    if (error?.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        ok: false,
        mensaje: 'La foto debe pesar como máximo 300 KB',
        codigo: 'foto_muy_grande'
      });
    }

    if (error) {
      return res.status(400).json(FOTO_REQUERIDA);
    }

    if (!req.file || !Buffer.isBuffer(req.file.buffer)) {
      return res.status(400).json(FOTO_REQUERIDA);
    }

    return next();
  });
}

function responderError(error, res) {
  if (error instanceof ErrorFoto) {
    return res.status(error.estado).json({
      ok: false,
      mensaje: error.message,
      codigo: error.codigo
    });
  }

  console.error('Error inesperado con la foto de perfil');

  return res.status(503).json({
    ok: false,
    mensaje: 'No fue posible procesar la foto. Intenta de nuevo más tarde.',
    codigo: 'foto_no_disponible'
  });
}

router.use(sinCache, verificarTokenFirebase, cargarUsuario);

router.put('/', recibirArchivo, async (req, res) => {
  try {
    const foto = await guardarFoto(req.usuario.uid, req.file.buffer);
    return res.json(foto);
  } catch (error) {
    return responderError(error, res);
  }
});

router.delete('/', async (req, res) => {
  try {
    await quitarFoto(req.usuario.uid);
    return res.status(204).end();
  } catch (error) {
    return responderError(error, res);
  }
});

module.exports = router;
