const express = require('express');
const verificarTokenFirebase = require('../middlewares/verificar-token-firebase');
const cargarUsuario = require('../middlewares/cargar-usuario');
const requiereRol = require('../middlewares/requiere-rol');
const { ErrorReglaCurso } = require('../services/reglas-cursos');
const { listarContenido, obtenerContenidoCurso } = require('../services/contenido');

const router = express.Router();

router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

router.use(verificarTokenFirebase, cargarUsuario, requiereRol('maestro', 'administrador'));

function responderError(error, res) {
  if (error instanceof ErrorReglaCurso) {
    return res.status(error.estado).json({ ok: false, mensaje: error.message, codigo: error.codigo });
  }
  console.error('No fue posible consultar el contenido del editor');
  return res.status(503).json({
    ok: false,
    mensaje: 'No fue posible consultar el contenido. Intenta más tarde',
    codigo: 'contenido_no_disponible'
  });
}

router.get('/', async (req, res) => {
  try {
    return res.json(await listarContenido(req.usuario));
  } catch (error) {
    return responderError(error, res);
  }
});

router.get('/cursos/:idCurso', async (req, res) => {
  try {
    return res.json(await obtenerContenidoCurso(req.usuario, req.params.idCurso));
  } catch (error) {
    return responderError(error, res);
  }
});

module.exports = router;
