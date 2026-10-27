const express = require('express');
const pool = require('../config/database');
const verificarTokenFirebase = require('../middlewares/verificar-token-firebase');
const cargarUsuario = require('../middlewares/cargar-usuario');

const router = express.Router();

function convertirPerfil(usuario) {
  return {
    uid: usuario.uid,
    nombreCompleto: usuario.nombre_completo,
    apodo: usuario.nombre_apodo,
    rol: usuario.rol
  };
}

function limpiarApodo(apodo) {
  return apodo?.trim() || null;
}

function nombreValido(nombre) {
  return typeof nombre === 'string'
    && nombre.trim().length >= 3
    && nombre.trim().length <= 100;
}

router.get(
  '/',
  verificarTokenFirebase,
  cargarUsuario,
  (req, res) => {
    return res.json(convertirPerfil(req.usuario));
  }
);

router.post('/', verificarTokenFirebase, async (req, res) => {
  const { nombreCompleto, apodo } = req.body;

  if (!nombreValido(nombreCompleto)) {
    return res.status(400).json({
      ok: false,
      mensaje: 'El nombre completo debe tener entre 3 y 100 caracteres',
      codigo: 'nombre_completo_invalido'
    });
  }

  try {
    const resultado = await pool.query(
      `
        INSERT INTO usuarios (uid, nombre_completo, nombre_apodo)
        VALUES ($1, $2, $3)
        RETURNING uid, nombre_completo, nombre_apodo, rol
      `,
      [
        req.auth.uid,
        nombreCompleto.trim(),
        limpiarApodo(apodo)
      ]
    );

    return res.status(201).json(convertirPerfil(resultado.rows[0]));
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({
        ok: false,
        mensaje: 'El perfil ya existe',
        codigo: 'perfil_existente'
      });
    }

    console.error('Error al crear el perfil:', error.message);

    return res.status(503).json({
      ok: false,
      mensaje: 'No fue posible crear el perfil'
    });
  }
});

router.patch(
  '/',
  verificarTokenFirebase,
  cargarUsuario,
  async (req, res) => {
    const { nombreCompleto, apodo } = req.body;

    const nuevoNombre = nombreCompleto === undefined
      ? req.usuario.nombre_completo
      : nombreCompleto;

    if (!nombreValido(nuevoNombre)) {
      return res.status(400).json({
        ok: false,
        mensaje: 'El nombre completo debe tener entre 3 y 100 caracteres',
        codigo: 'nombre_completo_invalido'
      });
    }

    const nuevoApodo = apodo === undefined
      ? req.usuario.nombre_apodo
      : limpiarApodo(apodo);

    try {
      const resultado = await pool.query(
        `
          UPDATE usuarios
          SET nombre_completo = $1,
              nombre_apodo = $2
          WHERE uid = $3
          RETURNING uid, nombre_completo, nombre_apodo, rol
        `,
        [
          nuevoNombre.trim(),
          nuevoApodo,
          req.auth.uid
        ]
      );

      return res.json(convertirPerfil(resultado.rows[0]));
    } catch (error) {
      console.error('Error al actualizar el perfil:', error.message);

      return res.status(503).json({
        ok: false,
        mensaje: 'No fue posible actualizar el perfil'
      });
    }
  }
);

module.exports = router;