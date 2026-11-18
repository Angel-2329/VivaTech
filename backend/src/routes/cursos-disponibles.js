const express = require('express');
const verificarTokenFirebase = require('../middlewares/verificar-token-firebase');
const cargarUsuario = require('../middlewares/cargar-usuario');
const requiereRol = require('../middlewares/requiere-rol');
const { ErrorReglaCurso } = require('../services/reglas-cursos');
const { obtenerCursosDisponibles } = require('../services/cursos-disponibles');

const router = express.Router();

router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

router.get('/', verificarTokenFirebase, cargarUsuario, requiereRol('estudiante'), async (req, res) => {
  try {
    return res.json(await obtenerCursosDisponibles(req.usuario));
  } catch (error) {
    if (error instanceof ErrorReglaCurso) {
      return res.status(error.estado).json({ ok: false, mensaje: error.message, codigo: error.codigo });
    }
    console.error('No fue posible consultar los cursos disponibles');
    return res.status(503).json({
      ok: false,
      mensaje: 'No fue posible consultar los cursos disponibles. Intenta más tarde',
      codigo: 'cursos_disponibles_no_disponible'
    });
  }
});

module.exports = router;
