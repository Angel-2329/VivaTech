const express = require('express');
const verificarTokenFirebase = require('../middlewares/verificar-token-firebase');
const cargarUsuario = require('../middlewares/cargar-usuario');
const requiereRol = require('../middlewares/requiere-rol');
const {
  ErrorOperacionGrupo,
  listarGrupos,
  crearGrupo,
  renombrarGrupo,
  eliminarGrupo,
  obtenerDetalleGrupo,
  asignarEstudiante,
  retirarEstudiante,
  retirarTodosEstudiantes,
  retirarEstudiantesSeleccionados,
  asignarMaestro,
  retirarMaestro
} = require('../services/grupos');

const MAXIMO_SELECCION = 100;

const router = express.Router();

function validarIdGrupo(req, res, next) {
  const { idGrupo } = req.params;
  const maximo = '9223372036854775807';

  if (
    !/^[1-9][0-9]{0,18}$/.test(idGrupo)
    || (idGrupo.length === maximo.length && idGrupo > maximo)
  ) {
    return res.status(400).json({
      ok: false,
      mensaje: 'El identificador del grupo no es válido',
      codigo: 'id_grupo_invalido'
    });
  }

  return next();
}

function validarNombre(req, res, next) {
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

  const nombre = typeof req.body.nombre === 'string'
    ? req.body.nombre.trim()
    : '';
  const longitud = Array.from(nombre).length;

  if (longitud < 1 || longitud > 100) {
    return res.status(400).json({
      ok: false,
      mensaje: 'El nombre del grupo debe tener entre 1 y 100 caracteres',
      codigo: 'nombre_grupo_invalido'
    });
  }

  req.nombreGrupo = nombre;
  return next();
}

function validarUidParticipante(req, res, next) {
  if (
    req.method === 'POST'
    && (
      req.body === null
      || typeof req.body !== 'object'
      || Array.isArray(req.body)
    )
  ) {
    return res.status(400).json({
      ok: false,
      mensaje: 'Envía los datos como un objeto JSON',
      codigo: 'cuerpo_invalido'
    });
  }

  const uid = req.method === 'POST' ? req.body.uid : req.params.uid;

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

  req.uidParticipante = uid;
  return next();
}

function esUidValido(uid) {
  return typeof uid === 'string'
    && uid.length <= 128
    && uid.trim().length > 0;
}

function validarSeleccion(req, res, next) {
  const uids = req.body !== null
    && typeof req.body === 'object'
    && !Array.isArray(req.body)
    ? req.body.uids
    : undefined;

  if (
    !Array.isArray(uids)
    || uids.length < 1
    || uids.length > MAXIMO_SELECCION
    || !uids.every(esUidValido)
  ) {
    return res.status(400).json({
      ok: false,
      mensaje: `Selecciona entre 1 y ${MAXIMO_SELECCION} estudiantes válidos`,
      codigo: 'seleccion_invalida'
    });
  }

  req.uidsSeleccion = [...new Set(uids)];
  return next();
}

function responderError(error, res) {
  if (error instanceof ErrorOperacionGrupo) {
    return res.status(error.estado).json({
      ok: false,
      mensaje: error.message,
      codigo: error.codigo
    });
  }

  console.error('No fue posible completar la operación de grupos');

  return res.status(503).json({
    ok: false,
    mensaje: 'No fue posible completar la operación de grupos',
    codigo: 'operacion_grupos_no_disponible'
  });
}

router.use(
  verificarTokenFirebase,
  cargarUsuario,
  requiereRol('maestro', 'administrador')
);

router.get('/', async (req, res) => {
  try {
    const grupos = await listarGrupos(req.auth.uid);
    return res.json(grupos);
  } catch (error) {
    return responderError(error, res);
  }
});

router.post('/', validarNombre, async (req, res) => {
  try {
    const grupo = await crearGrupo(req.auth.uid, req.nombreGrupo);
    return res.status(201).json(grupo);
  } catch (error) {
    return responderError(error, res);
  }
});

router.patch('/:idGrupo', validarIdGrupo, validarNombre, async (req, res) => {
  try {
    const grupo = await renombrarGrupo(
      req.auth.uid,
      req.params.idGrupo,
      req.nombreGrupo
    );
    return res.json(grupo);
  } catch (error) {
    return responderError(error, res);
  }
});

router.delete('/:idGrupo', validarIdGrupo, async (req, res) => {
  try {
    await eliminarGrupo(req.auth.uid, req.params.idGrupo);
    return res.status(204).end();
  } catch (error) {
    return responderError(error, res);
  }
});

router.get('/:idGrupo', validarIdGrupo, async (req, res) => {
  try {
    const grupo = await obtenerDetalleGrupo(req.auth.uid, req.params.idGrupo);
    return res.json(grupo);
  } catch (error) {
    return responderError(error, res);
  }
});

router.post(
  '/:idGrupo/estudiantes',
  validarIdGrupo,
  validarUidParticipante,
  async (req, res) => {
    try {
      const estudiante = await asignarEstudiante(
        req.auth.uid,
        req.params.idGrupo,
        req.uidParticipante
      );
      return res.status(201).json(estudiante);
    } catch (error) {
      return responderError(error, res);
    }
  }
);

router.delete(
  '/:idGrupo/estudiantes',
  validarIdGrupo,
  async (req, res) => {
    if (req.path.endsWith('/')) {
      return res.status(400).json({
        ok: false,
        mensaje: 'El identificador de la cuenta no es válido',
        codigo: 'uid_invalido'
      });
    }

    try {
      const resultado = await retirarTodosEstudiantes(
        req.auth.uid,
        req.params.idGrupo
      );
      return res.json(resultado);
    } catch (error) {
      return responderError(error, res);
    }
  }
);

router.post(
  '/:idGrupo/estudiantes/retiros',
  validarIdGrupo,
  validarSeleccion,
  async (req, res) => {
    try {
      const resultado = await retirarEstudiantesSeleccionados(
        req.auth.uid,
        req.params.idGrupo,
        req.uidsSeleccion
      );
      return res.json(resultado);
    } catch (error) {
      return responderError(error, res);
    }
  }
);

router.delete(
  '/:idGrupo/estudiantes/:uid',
  validarIdGrupo,
  validarUidParticipante,
  async (req, res) => {
    try {
      await retirarEstudiante(
        req.auth.uid,
        req.params.idGrupo,
        req.uidParticipante
      );
      return res.status(204).end();
    } catch (error) {
      return responderError(error, res);
    }
  }
);

router.post(
  '/:idGrupo/maestros',
  requiereRol('administrador'),
  validarIdGrupo,
  validarUidParticipante,
  async (req, res) => {
    try {
      const maestro = await asignarMaestro(
        req.auth.uid,
        req.params.idGrupo,
        req.uidParticipante
      );
      return res.status(201).json(maestro);
    } catch (error) {
      return responderError(error, res);
    }
  }
);

router.delete(
  '/:idGrupo/maestros/:uid',
  requiereRol('administrador'),
  validarIdGrupo,
  validarUidParticipante,
  async (req, res) => {
    try {
      await retirarMaestro(
        req.auth.uid,
        req.params.idGrupo,
        req.uidParticipante
      );
      return res.status(204).end();
    } catch (error) {
      return responderError(error, res);
    }
  }
);

module.exports = router;
