const express = require('express');
const verificarTokenFirebase = require('../middlewares/verificar-token-firebase');
const cargarUsuario = require('../middlewares/cargar-usuario');
const requiereRol = require('../middlewares/requiere-rol');
const { ErrorReglaCurso } = require('../services/reglas-cursos');
const { obtenerMisCursos } = require('../services/mis-cursos');

const router = express.Router();

router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

router.get('/', verificarTokenFirebase, cargarUsuario, requiereRol('estudiante'), async (req, res) => {
  try {
    const categorias = await obtenerMisCursos(req.usuario);
    return res.json(categorias);
  } catch (error) {
    if (error instanceof ErrorReglaCurso) {
      return res.status(error.estado).json({
        ok: false,
        mensaje: error.message,
        codigo: error.codigo
      });
    }

    console.error('No fue posible consultar Mis cursos');
    return res.status(503).json({
      ok: false,
      mensaje: 'No fue posible consultar tus cursos. Intenta más tarde',
      codigo: 'mis_cursos_no_disponible'
    });
  }
});

module.exports = router;
