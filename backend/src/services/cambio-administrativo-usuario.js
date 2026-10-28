const pool = require('../config/database');

class ErrorOperacionUsuario extends Error {
  constructor(estado, mensaje, codigo) {
    super(mensaje);

    this.name = 'ErrorOperacionUsuario';
    this.estado = estado;
    this.codigo = codigo;
  }
}

async function ejecutarCambioAdministrativo(
  uidSolicitante,
  uidDestino,
  realizarCambio
) {
  if (uidSolicitante === uidDestino) {
    throw new ErrorOperacionUsuario(
      403,
      'No puedes modificar tu propio rol o estado desde esta operación',
      'modificacion_propia_no_permitida'
    );
  }

  const cliente = await pool.connect();
  let transaccionIniciada = false;
  let errorAlRevertir;

  try {
    await cliente.query('BEGIN');
    transaccionIniciada = true;

    const resultado = await cliente.query(
      `
        SELECT
          uid,
          nombre_completo AS "nombreCompleto",
          nombre_apodo AS apodo,
          rol,
          activo
        FROM usuarios
        WHERE uid IN ($1, $2)
        ORDER BY uid
        FOR UPDATE
      `,
      [uidSolicitante, uidDestino]
    );

    const solicitante = resultado.rows.find(
      (usuario) => usuario.uid === uidSolicitante
    );

    if (!solicitante) {
      throw new ErrorOperacionUsuario(
        404,
        'El perfil todavía no está registrado',
        'perfil_no_registrado'
      );
    }

    if (!solicitante.activo) {
      throw new ErrorOperacionUsuario(
        403,
        'La cuenta está desactivada',
        'cuenta_desactivada'
      );
    }

    if (solicitante.rol !== 'administrador') {
      throw new ErrorOperacionUsuario(
        403,
        'No tienes permisos para realizar esta acción',
        'rol_no_autorizado'
      );
    }

    const destinatario = resultado.rows.find(
      (usuario) => usuario.uid === uidDestino
    );

    if (!destinatario) {
      throw new ErrorOperacionUsuario(
        404,
        'No existe la cuenta solicitada',
        'usuario_no_encontrado'
      );
    }

    const usuarioActualizado = await realizarCambio(
      cliente,
      destinatario
    );

    await cliente.query('COMMIT');
    transaccionIniciada = false;

    return usuarioActualizado;
  } catch (error) {
    if (transaccionIniciada) {
      try {
        await cliente.query('ROLLBACK');
      } catch (errorRollback) {
        errorAlRevertir = errorRollback;

        console.error(
          'No fue posible confirmar la reversión de la operación administrativa'
        );
      }
    }

    throw error;
  } finally {
    cliente.release(errorAlRevertir);
  }
}

module.exports = {
  ErrorOperacionUsuario,
  ejecutarCambioAdministrativo
};