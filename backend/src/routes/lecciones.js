const express = require('express');
const verificarTokenFirebase = require('../middlewares/verificar-token-firebase');
const cargarUsuario = require('../middlewares/cargar-usuario');
const requiereRol = require('../middlewares/requiere-rol');
const { ErrorReglaCurso } = require('../services/reglas-cursos');
const { obtenerDetalleLeccion, guardarPasoLeccion } = require('../services/lecciones');

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

router.put('/:idLeccion/progreso', verificarTokenFirebase, cargarUsuario, requiereRol('estudiante'), async (req, res) => {
  if (req.body === null || typeof req.body !== 'object' || Array.isArray(req.body)) {
    return res.status(400).json({
      ok: false,
      mensaje: 'Envía los datos como un objeto JSON',
      codigo: 'cuerpo_invalido'
    });
  }
  if (Object.keys(req.body).some((campo) => campo !== 'idPaso')) {
    return res.status(400).json({
      ok: false,
      mensaje: 'Envía únicamente el identificador del paso',
      codigo: 'campos_invalidos'
    });
  }

  try {
    const progreso = await guardarPasoLeccion(req.usuario, req.params.idLeccion, req.body.idPaso);
    return res.json(progreso);
  } catch (error) {
    if (error instanceof ErrorReglaCurso) {
      return res.status(error.estado).json({ ok: false, mensaje: error.message, codigo: error.codigo });
    }
    console.error('No fue posible guardar el progreso de la lección');
    return res.status(503).json({
      ok: false,
      mensaje: 'No fue posible guardar tu progreso. Intenta más tarde',
      codigo: 'progreso_no_disponible'
    });
  }
});

module.exports = router;
