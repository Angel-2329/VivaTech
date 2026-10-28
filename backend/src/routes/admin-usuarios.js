const express = require('express');
const pool = require('../config/database');
const verificarTokenFirebase =
  require('../middlewares/verificar-token-firebase');
const cargarUsuario = require('../middlewares/cargar-usuario');
const requiereRol = require('../middlewares/requiere-rol');
const validarBusquedaUsuarios =
  require('../middlewares/validar-busqueda-usuarios');
const {
  ErrorOperacionUsuario,
  ejecutarCambioAdministrativo
} = require('../services/cambio-administrativo-usuario');

const router = express.Router();

function validarDestinoYCuerpo(req, res, next) {
  const uid = req.params.uid;

  if (
    typeof uid !== 'string'
    || uid.length > 128
    || uid.trim().length === 0
  ) {
    return res.status(400).json({
      ok: false,
      mensaje: 'El identificador de la cuenta no es válido',
      codigo: 'uid_invalido'
    });
  }

  if (
    req.body === null
    || typeof req.body !== 'object'
    || Array.isArray(req.body)
  ) {
    return res.status(400).json({
      ok: false,
      mensaje: 'Envía los datos como un objeto JSON',
      codigo: 'cuerpo_invalido'
    });
  }

  return next();
}

function responderErrorCambio(error, res) {
  if (error instanceof ErrorOperacionUsuario) {
    return res.status(error.estado).json({
      ok: false,
      mensaje: error.message,
      codigo: error.codigo
    });
  }

  console.error('No fue posible completar el cambio administrativo');

  return res.status(503).json({
    ok: false,
    mensaje: 'No fue posible actualizar la cuenta'
  });
}

router.use(
  verificarTokenFirebase,
  cargarUsuario,
  requiereRol('administrador')
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
          nombre_apodo AS apodo,
          rol,
          activo
        FROM usuarios
        WHERE strpos(
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
    console.error('No fue posible consultar las cuentas');

    return res.status(503).json({
      ok: false,
      mensaje: 'No fue posible consultar las cuentas'
    });
  }
});

router.patch('/:uid/rol', validarDestinoYCuerpo, async (req, res) => {
  const nuevoRol = req.body.rol;
  const rolesValidos = ['estudiante', 'maestro', 'administrador'];

  if (!rolesValidos.includes(nuevoRol)) {
    return res.status(400).json({
      ok: false,
      mensaje: 'El rol debe ser estudiante, maestro o administrador',
      codigo: 'rol_invalido'
    });
  }

  try {
    const usuario = await ejecutarCambioAdministrativo(
      req.auth.uid,
      req.params.uid,
      async (cliente, destinatario) => {
        if (destinatario.rol === nuevoRol) {
          return destinatario;
        }

        const participaciones = await cliente.query(
          `
            SELECT EXISTS (
              SELECT 1
              FROM grupo_estudiantes
              WHERE uid_estudiante = $1

              UNION ALL

              SELECT 1
              FROM grupo_maestros
              WHERE uid_maestro = $1
            ) AS "tieneGrupos"
          `,
          [destinatario.uid]
        );

        if (participaciones.rows[0].tieneGrupos) {
          throw new ErrorOperacionUsuario(
            409,
            'Primero retira a la persona de los grupos donde participa antes de cambiar su rol',
            'usuario_en_grupos'
          );
        }

        const resultado = await cliente.query(
          `
            UPDATE usuarios
            SET rol = $1
            WHERE uid = $2
            RETURNING
              uid,
              nombre_completo AS "nombreCompleto",
              nombre_apodo AS apodo,
              rol,
              activo
          `,
          [nuevoRol, destinatario.uid]
        );

        if (resultado.rowCount !== 1) {
          throw new ErrorOperacionUsuario(
            409,
            'No se pudo actualizar la cuenta solicitada',
            'usuario_no_actualizado'
          );
        }

        return resultado.rows[0];
      }
    );

    return res.json(usuario);
  } catch (error) {
    return responderErrorCambio(error, res);
  }
});

router.patch('/:uid/activo', validarDestinoYCuerpo, async (req, res) => {
  const nuevoActivo = req.body.activo;

  if (typeof nuevoActivo !== 'boolean') {
    return res.status(400).json({
      ok: false,
      mensaje: 'El estado activo debe ser true o false',
      codigo: 'activo_invalido'
    });
  }

  try {
    const usuario = await ejecutarCambioAdministrativo(
      req.auth.uid,
      req.params.uid,
      async (cliente, destinatario) => {
        if (destinatario.activo === nuevoActivo) {
          return destinatario;
        }

        const resultado = await cliente.query(
          `
            UPDATE usuarios
            SET activo = $1
            WHERE uid = $2
            RETURNING
              uid,
              nombre_completo AS "nombreCompleto",
              nombre_apodo AS apodo,
              rol,
              activo
          `,
          [nuevoActivo, destinatario.uid]
        );

        if (resultado.rowCount !== 1) {
          throw new ErrorOperacionUsuario(
            409,
            'No se pudo actualizar la cuenta solicitada',
            'usuario_no_actualizado'
          );
        }

        return resultado.rows[0];
      }
    );

    return res.json(usuario);
  } catch (error) {
    return responderErrorCambio(error, res);
  }
});

module.exports = router;