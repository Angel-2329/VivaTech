const express = require('express');
const verificarTokenFirebase = require('../middlewares/verificar-token-firebase');
const cargarUsuario = require('../middlewares/cargar-usuario');
const requiereRol = require('../middlewares/requiere-rol');
const { ErrorReglaCurso } = require('../services/reglas-cursos');
const { crearCategoria, renombrarCategoria, reordenarCategorias, eliminarCategoria } = require('../services/categorias');

const router = express.Router();

router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
router.use(verificarTokenFirebase, cargarUsuario, requiereRol('administrador'));

function validarCuerpo(req, res, campo) {
  if (req.body === null || typeof req.body !== 'object' || Array.isArray(req.body)) {
    res.status(400).json({ ok: false, mensaje: 'Envía los datos como un objeto JSON', codigo: 'cuerpo_invalido' });
    return false;
  }
  if (Object.keys(req.body).some((nombre) => nombre !== campo)) {
    res.status(400).json({ ok: false, mensaje: 'Envía únicamente los campos permitidos para esta operación', codigo: 'campos_invalidos' });
    return false;
  }
  return true;
}

async function responder(res, operacion, estado = 200) {
  try {
    const resultado = await operacion();
    if (estado === 204) return res.status(204).end();
    return res.status(estado).json(resultado);
  } catch (error) {
    if (error instanceof ErrorReglaCurso) {
      const cuerpo = { ok: false, mensaje: error.message, codigo: error.codigo };
      if (Array.isArray(error.errores)) {
        cuerpo.errores = error.errores.map(({ ruta, codigo, mensaje }) => ({ ruta, codigo, mensaje }));
      }
      return res.status(error.estado).json(cuerpo);
    }
    console.error('No fue posible completar la operación de categorías');
    return res.status(503).json({
      ok: false,
      mensaje: 'No fue posible completar la operación de categorías. Intenta más tarde',
      codigo: 'operacion_categorias_no_disponible'
    });
  }
}

router.post('/', (req, res) => {
  if (!validarCuerpo(req, res, 'nombre')) return;
  return responder(res, () => crearCategoria(req.usuario, req.body.nombre), 201);
});

router.patch('/:idCategoria', (req, res) => {
  if (!validarCuerpo(req, res, 'nombre')) return;
  return responder(res, () => renombrarCategoria(req.usuario, req.params.idCategoria, req.body.nombre));
});

router.put('/orden', (req, res) => {
  if (!validarCuerpo(req, res, 'idsCategorias')) return;
  return responder(res, () => reordenarCategorias(req.usuario, req.body.idsCategorias));
});

router.delete('/:idCategoria', (req, res) => responder(
  res, () => eliminarCategoria(req.usuario, req.params.idCategoria), 204
));

module.exports = router;
