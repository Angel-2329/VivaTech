const express = require('express');
const verificarTokenFirebase = require('../middlewares/verificar-token-firebase');
const cargarUsuario = require('../middlewares/cargar-usuario');
const requiereRol = require('../middlewares/requiere-rol');
const { ErrorReglaCurso } = require('../services/reglas-cursos');
const { crearCurso, editarCurso } = require('../services/cursos');
const { eliminarCurso } = require('../services/retiro-cursos');
const { crearLeccion, reordenarLecciones } = require('../services/editor-lecciones-pasos');

const router = express.Router();
const permisosEditor = [verificarTokenFirebase, cargarUsuario, requiereRol('maestro', 'administrador')];

router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

async function responder(res, operacion, estado) {
  try {
    const resultado = await operacion();
    const estadoFinal = typeof estado === 'function' ? estado(resultado) : estado;
    if (estadoFinal === 204) return res.status(204).end();
    return res.status(estadoFinal).json(resultado);
  } catch (error) {
    if (error instanceof ErrorReglaCurso) {
      const cuerpo = { ok: false, mensaje: error.message, codigo: error.codigo };
      if (Array.isArray(error.errores)) {
        cuerpo.errores = error.errores.map(({ ruta, codigo, mensaje }) => ({ ruta, codigo, mensaje }));
      }
      return res.status(error.estado).json(cuerpo);
    }
    console.error('No fue posible completar la operación de cursos');
    return res.status(503).json({
      ok: false,
      mensaje: 'No fue posible completar la operación de cursos. Intenta más tarde',
      codigo: 'operacion_cursos_no_disponible'
    });
  }
}

router.post('/', ...permisosEditor, (req, res) => responder(
  res, () => crearCurso(req.usuario, req.body), 201
));

router.patch('/:idCurso', ...permisosEditor, (req, res) => responder(
  res, () => editarCurso(req.usuario, req.params.idCurso, req.body), 200
));

router.delete('/:idCurso', ...permisosEditor, (req, res) => responder(
  res, () => eliminarCurso(req.usuario, req.params.idCurso), (resultado) => resultado === null ? 204 : 200
));

router.post('/:idCurso/lecciones', ...permisosEditor, (req, res) => responder(
  res, () => crearLeccion(req.usuario, req.params.idCurso, req.body), 201
));

router.put('/:idCurso/orden-lecciones', ...permisosEditor, (req, res) => responder(
  res, () => reordenarLecciones(req.usuario, req.params.idCurso, req.body), 200
));

module.exports = router;
