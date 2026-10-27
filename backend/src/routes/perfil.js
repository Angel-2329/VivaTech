const express = require('express');
const pool = require('../config/database');
const verificarTokenFirebase = require('../middlewares/verificar-token-firebase');
const cargarUsuario = require('../middlewares/cargar-usuario');

const router = express.Router();

function validarCuerpo(req, res, next) {
  if (
    req.body === null
    || typeof req.body !== 'object'
    || Array.isArray(req.body)
  ) {
    return res.status(400).json({
      ok: false,
      mensaje: 'Envía los datos del perfil como un objeto JSON',
      codigo: 'cuerpo_invalido'
    });
  }

  return next();
}

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

function apodoValido(apodo) {
  return apodo === undefined
    || apodo === null
    || (
      typeof apodo === 'string'
      && apodo.trim().length <= 30
    );
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

router.post('/', verificarTokenFirebase, validarCuerpo, async (req, res) => {
  const { nombreCompleto, apodo } = req.body;

  if (!nombreValido(nombreCompleto)) {
    return res.status(400).json({
      ok: false,
      mensaje: 'El nombre completo debe tener entre 3 y 100 caracteres',
      codigo: 'nombre_completo_invalido'
    });
  }

if (!apodoValido(apodo)) {
  return res.status(400).json({
    ok: false,
    mensaje: 'El apodo debe ser texto de hasta 30 caracteres o null',
    codigo: 'apodo_invalido'
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
  validarCuerpo,
  async (req, res) => {
    const { nombreCompleto, apodo } = req.body;

    const cambiarNombre = nombreCompleto !== undefined;
    const cambiarApodo = apodo !== undefined;

    if (!cambiarNombre && !cambiarApodo) {
      return res.status(400).json({
        ok: false,
        mensaje: 'Envía el nombre completo o el apodo para actualizar el perfil',
        codigo: 'sin_campos_actualizables'
      });
    }

    if (cambiarNombre && !nombreValido(nombreCompleto)) {
      return res.status(400).json({
        ok: false,
        mensaje: 'El nombre completo debe tener entre 3 y 100 caracteres',
        codigo: 'nombre_completo_invalido'
      });
    }

    if (!apodoValido(apodo)) {
      return res.status(400).json({
        ok: false,
        mensaje: 'El apodo debe ser texto de hasta 30 caracteres o null',
        codigo: 'apodo_invalido'
      });
    }

    try {
      const resultado = await pool.query(
        `
          UPDATE usuarios
          SET nombre_completo = CASE
                WHEN $1::boolean THEN $2::varchar
                ELSE nombre_completo
              END,
              nombre_apodo = CASE
                WHEN $3::boolean THEN $4::varchar
                ELSE nombre_apodo
              END
          WHERE uid = $5
            AND activo = true
          RETURNING uid, nombre_completo, nombre_apodo, rol
        `,
        [
          cambiarNombre,
          cambiarNombre ? nombreCompleto.trim() : null,
          cambiarApodo,
          cambiarApodo ? limpiarApodo(apodo) : null,
          req.auth.uid
        ]
      );

      if (resultado.rowCount === 0) {
        return res.status(409).json({
          ok: false,
          mensaje: 'El perfil cambió o ya no está disponible. Consulta tu perfil nuevamente',
          codigo: 'perfil_no_actualizado'
        });
      }

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