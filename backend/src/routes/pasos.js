const express = require('express');
const verificarTokenFirebase = require('../middlewares/verificar-token-firebase');
const cargarUsuario = require('../middlewares/cargar-usuario');
const requiereRol = require('../middlewares/requiere-rol');
const { ErrorReglaCurso } = require('../services/reglas-cursos');
const { editarPaso, eliminarPaso } = require('../services/editor-lecciones-pasos');

const router = express.Router();
router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
router.use(verificarTokenFirebase, cargarUsuario, requiereRol('maestro', 'administrador'));

async function responder(res, operacion, estado) {
  try {
    const resultado = await operacion();
    if (estado === 204) return res.status(204).end();
    return res.status(estado).json(resultado);
  } catch (error) {
    if (error instanceof ErrorReglaCurso) {
      const cuerpo = { ok: false, mensaje: error.message, codigo: error.codigo };
      if (Array.isArray(error.errores)) cuerpo.errores = error.errores.map(({ ruta, codigo, mensaje }) => ({ ruta, codigo, mensaje }));
      return res.status(error.estado).json(cuerpo);
    }
    console.error('No fue posible completar la escritura del paso');
    return res.status(503).json({ ok: false, mensaje: 'No fue posible guardar el contenido. Intenta más tarde', codigo: 'operacion_contenido_no_disponible' });
  }
}

router.patch('/:idPaso', (req, res) => responder(res, () => editarPaso(req.usuario, req.params.idPaso, req.body), 200));
router.delete('/:idPaso', (req, res) => responder(res, () => eliminarPaso(req.usuario, req.params.idPaso), 204));

module.exports = router;
