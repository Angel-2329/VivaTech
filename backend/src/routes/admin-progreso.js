const express = require('express');
const verificarTokenFirebase = require('../middlewares/verificar-token-firebase');
const cargarUsuario = require('../middlewares/cargar-usuario');
const requiereRol = require('../middlewares/requiere-rol');
const validarBusquedaUsuarios = require('../middlewares/validar-busqueda-usuarios');
const { obtenerResumen, listarProgreso } = require('../services/admin-progreso');

const router = express.Router();

router.use(
  verificarTokenFirebase,
  cargarUsuario,
  requiereRol('administrador')
);

router.get('/resumen', async (req, res) => {
  try {
    const resumen = await obtenerResumen();
    return res.json(resumen);
  } catch {
    console.error('No fue posible consultar el resumen administrativo');

    return res.status(503).json({
      ok: false,
      mensaje: 'No fue posible consultar el resumen administrativo',
      codigo: 'resumen_no_disponible'
    });
  }
});

router.get('/progreso', validarBusquedaUsuarios, async (req, res) => {
  try {
    const progreso = await listarProgreso(req.busquedaUsuarios);
    return res.json(progreso);
  } catch {
    console.error('No fue posible consultar el progreso general');

    return res.status(503).json({
      ok: false,
      mensaje: 'No fue posible consultar el progreso general',
      codigo: 'progreso_no_disponible'
    });
  }
});

module.exports = router;
