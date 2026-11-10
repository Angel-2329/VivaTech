const express = require('express');
const verificarTokenFirebase = require('../middlewares/verificar-token-firebase');
const cargarUsuario = require('../middlewares/cargar-usuario');
const requiereRol = require('../middlewares/requiere-rol');
const { ErrorReglaCurso } = require('../services/reglas-cursos');
const { obtenerDetalleLeccion } = require('../services/lecciones');

const router = express.Router();

router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

router.get('/:idLeccion', verificarTokenFirebase, cargarUsuario, requiereRol('estudiante'), async (req, res) => {
  try {
    const leccion = await obtenerDetalleLeccion(req.usuario, req.params.idLeccion);
    return res.json(leccion);
  } catch (error) {
    if (error instanceof ErrorReglaCurso) {
      return res.status(error.estado).json({
        ok: false,
        mensaje: error.message,
        codigo: error.codigo
      });
    }

    console.error('No fue posible consultar la lección');
    return res.status(503).json({
      ok: false,
      mensaje: 'No fue posible consultar la lección. Intenta más tarde',
      codigo: 'leccion_no_disponible'
    });
  }
});

module.exports = router;
