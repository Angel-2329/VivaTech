const express = require('express');
const pool = require('../config/database');
const verificarTokenFirebase = require('../middlewares/verificar-token-firebase');
const cargarUsuario = require('../middlewares/cargar-usuario');
const {
  normalizarNombrePersona,
  contarCaracteres,
  esNombrePersonaValido
} = require('../services/validar-texto');
const { COLUMNAS_FOTO } = require('../services/fotos-perfil');

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
    rol: usuario.rol,
    tieneFoto: usuario.tieneFoto === true,
    fotoActualizada: usuario.fotoActualizada ?? null
  };
}

const ERRORES = {
  nombreLongitud: {
    mensaje: 'El nombre completo debe tener entre 3 y 100 caracteres',
    codigo: 'nombre_completo_invalido'
  },
  nombreCaracteres: {
    mensaje: "El nombre solo puede tener letras, espacios, apóstrofo (') y guion (-).",
    codigo: 'nombre_invalido'
  },
  apodoLongitud: {
    mensaje: 'El apodo debe ser texto de hasta 30 caracteres o null',
    codigo: 'apodo_invalido'
  },
  apodoCaracteres: {
    mensaje: "El apodo solo puede tener letras, espacios, apóstrofo (') y guion (-).",
    codigo: 'apodo_invalido'
  }
};

function revisarNombre(nombre) {
  if (typeof nombre !== 'string') {
    return { error: ERRORES.nombreLongitud };
  }

  const valor = normalizarNombrePersona(nombre);
  const longitud = contarCaracteres(valor);

  if (longitud < 3 || longitud > 100) {
    return { error: ERRORES.nombreLongitud };
  }

  if (!esNombrePersonaValido(valor)) {
    return { error: ERRORES.nombreCaracteres };
  }

  return { valor };
}

function revisarApodo(apodo) {
  if (apodo === undefined || apodo === null) {
    return { valor: null };
  }

  if (typeof apodo !== 'string') {
    return { error: ERRORES.apodoLongitud };
  }

  const valor = normalizarNombrePersona(apodo);

  if (valor === '') {
    return { valor: null };
  }

  if (contarCaracteres(valor) > 30) {
    return { error: ERRORES.apodoLongitud };
  }

  if (!esNombrePersonaValido(valor)) {
    return { error: ERRORES.apodoCaracteres };
  }

  return { valor };
}

function responderInvalido(res, error) {
  return res.status(400).json({ ok: false, ...error });
}

router.get(
  '/',
  verificarTokenFirebase,
  cargarUsuario,
  async (req, res) => {
    try {
      const resultado = await pool.query(
        `
          SELECT ${COLUMNAS_FOTO}
          FROM usuarios
          WHERE uid = $1
        `,
        [req.usuario.uid]
      );

      return res.json(convertirPerfil({
        ...req.usuario,
        ...resultado.rows[0]
      }));
    } catch (error) {
      console.error('Error al consultar la foto del perfil:', error.message);

      return res.status(503).json({
        ok: false,
        mensaje: 'No fue posible consultar el perfil'
      });
    }
  }
);

router.post('/', verificarTokenFirebase, validarCuerpo, async (req, res) => {
  const { nombreCompleto, apodo } = req.body;

  const nombre = revisarNombre(nombreCompleto);

  if (nombre.error) {
    return responderInvalido(res, nombre.error);
  }

  const apodoRevisado = revisarApodo(apodo);

  if (apodoRevisado.error) {
    return responderInvalido(res, apodoRevisado.error);
  }

  try {
    const resultado = await pool.query(
      `
        INSERT INTO usuarios (uid, nombre_completo, nombre_apodo)
        VALUES ($1, $2, $3)
        RETURNING uid, nombre_completo, nombre_apodo, rol,
          ${COLUMNAS_FOTO}
      `,
      [
        req.auth.uid,
        nombre.valor,
        apodoRevisado.valor
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

    const nombre = cambiarNombre ? revisarNombre(nombreCompleto) : { valor: null };

    if (nombre.error) {
      return responderInvalido(res, nombre.error);
    }

    const apodoRevisado = revisarApodo(apodo);

    if (apodoRevisado.error) {
      return responderInvalido(res, apodoRevisado.error);
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
          RETURNING uid, nombre_completo, nombre_apodo, rol,
            ${COLUMNAS_FOTO}
        `,
        [
          cambiarNombre,
          nombre.valor,
          cambiarApodo,
          apodoRevisado.valor,
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