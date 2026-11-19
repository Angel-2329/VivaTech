const express = require('express');
const verificarTokenFirebase = require('../middlewares/verificar-token-firebase');
const cargarUsuario = require('../middlewares/cargar-usuario');
const requiereRol = require('../middlewares/requiere-rol');
const { listarMisGrupos } = require('../services/mis-grupos');

const router = express.Router();
router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
router.get('/', verificarTokenFirebase, cargarUsuario, requiereRol('estudiante'), async (req, res) => {
  try {
    return res.json(await listarMisGrupos(req.usuario));
  } catch (error) {
    console.error('No fue posible consultar los grupos del estudiante');
    return res.status(503).json({ ok: false, mensaje: 'No fue posible consultar tus grupos. Intenta más tarde', codigo: 'grupos_no_disponibles' });
  }
});

module.exports = router;
