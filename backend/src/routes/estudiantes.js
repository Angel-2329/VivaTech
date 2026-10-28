const express = require('express');
const pool = require('../config/database');
const verificarTokenFirebase =
  require('../middlewares/verificar-token-firebase');
const cargarUsuario = require('../middlewares/cargar-usuario');
const requiereRol = require('../middlewares/requiere-rol');
const validarBusquedaUsuarios =
  require('../middlewares/validar-busqueda-usuarios');

const router = express.Router();

router.use(
  verificarTokenFirebase,
  cargarUsuario,
  requiereRol('maestro', 'administrador')
);

router.get('/', validarBusquedaUsuarios, async (req, res) => {
  const {
    buscar,
    limite,
    desplazamiento
  } = req.busquedaUsuarios;

  try {
    const resultado = await pool.query(
      `
        SELECT
          uid,
          nombre_completo AS "nombreCompleto",
          nombre_apodo AS apodo
        FROM usuarios
        WHERE rol = 'estudiante'
          AND activo = true
          AND strpos(
            lower(nombre_completo),
            lower($1::text)
          ) > 0
        ORDER BY lower(nombre_completo), uid
        LIMIT $2 OFFSET $3
      `,
      [buscar, limite, desplazamiento]
    );

    return res.json(resultado.rows);
  } catch {
    console.error('No fue posible consultar los estudiantes');

    return res.status(503).json({
      ok: false,
      mensaje: 'No fue posible consultar los estudiantes'
    });
  }
});

module.exports = router;