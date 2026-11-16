const express = require('express');
const { ErrorReglaCurso } = require('../services/reglas-cursos');
const { verificarCertificado } = require('../services/certificados');

// Ruta pública: no usa autenticación y solo expone la instantánea mínima del certificado.
const router = express.Router();
router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
router.get('/verificar/:codigo', async (req, res) => {
  try {
    return res.json(await verificarCertificado(req.params.codigo));
  } catch (error) {
    if (error instanceof ErrorReglaCurso) {
      return res.status(error.estado).json({ ok: false, mensaje: error.message, codigo: error.codigo });
    }
    console.error('No fue posible verificar el certificado');
    return res.status(503).json({ ok: false, mensaje: 'No fue posible verificar el certificado. Intenta más tarde', codigo: 'verificacion_no_disponible' });
  }
});

module.exports = router;
