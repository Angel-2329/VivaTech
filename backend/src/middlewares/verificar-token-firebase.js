const firebaseAuth = require('../config/firebase');

const erroresDeToken = new Set([
  'auth/argument-error',
  'auth/invalid-argument',
  'auth/invalid-id-token',
  'auth/id-token-expired'
]);

async function verificarTokenFirebase(req, res, next) {
  const authorization = req.get('authorization');

  const coincidencia =
    typeof authorization === 'string'
      ? /^Bearer ([^\s,]+)$/i.exec(authorization)
      : null;

  if (!coincidencia) {
    return res.status(401).json({
      ok: false,
      mensaje: 'Se requiere un token de autenticación válido'
    });
  }

  let tokenVerificado;

  try {
    tokenVerificado = await firebaseAuth.verifyIdToken(
      coincidencia[1]
    );
  } catch (error) {
    if (erroresDeToken.has(error.code)) {
      return res.status(401).json({
        ok: false,
        mensaje: 'El token de autenticación no es válido o ha caducado'
      });
    }

    console.error(
      'No fue posible verificar la autenticación con Firebase'
    );

    return res.status(503).json({
      ok: false,
      mensaje: 'No fue posible verificar la sesión. Intenta más tarde'
    });
  }

  req.auth = tokenVerificado;

  return next();
}

module.exports = verificarTokenFirebase;