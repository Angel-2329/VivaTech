const express = require('express');
const verificarTokenFirebase = require('../middlewares/verificar-token-firebase');
const cargarUsuario = require('../middlewares/cargar-usuario');
const requiereRol = require('../middlewares/requiere-rol');
const { ErrorReglaCurso } = require('../services/reglas-cursos');
const { listarEditores, otorgarPermiso, quitarPermiso } = require('../services/editores-curso');

const router = express.Router();

router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

router.use(verificarTokenFirebase, cargarUsuario, requiereRol('administrador'));

async function responder(res, operacion, estado) {
  try {
    const resultado = await operacion();
    if (estado === 204) return res.status(204).end();
    if (typeof estado === 'function') {
      const final = estado(resultado);
      return res.status(final.estado).json(final.cuerpo);
    }
    return res.status(estado).json(resultado);
  } catch (error) {
    if (error instanceof ErrorReglaCurso) {
      return res.status(error.estado).json({ ok: false, mensaje: error.message, codigo: error.codigo });
    }
    console.error('No fue posible completar la operación de permisos del curso');
    return res.status(503).json({
      ok: false,
      mensaje: 'No fue posible consultar o cambiar los permisos del curso. Intenta más tarde',
      codigo: 'permisos_curso_no_disponible'
    });
  }
}

router.get('/:idCurso/editores', (req, res) => responder(
  res, () => listarEditores(req.usuario, req.params.idCurso), 200
));

router.post('/:idCurso/editores', (req, res) => responder(
  res, () => otorgarPermiso(req.usuario, req.params.idCurso, req.body),
  ({ creado, editor }) => ({ estado: creado ? 201 : 200, cuerpo: editor })
));

router.delete('/:idCurso/editores/:uid', (req, res) => responder(
  res, () => quitarPermiso(req.usuario, req.params.idCurso, req.params.uid), 204
));

module.exports = router;
