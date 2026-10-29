// SIMULACIÓN de grupos y asignaciones.
import {
  TOTAL_LECCIONES_PUBLICADAS,
  avancePorEstudiante,
  buscarCuenta,
  coincide,
  cuentas,
  fallar,
  grupos,
  nuevoIdGrupo,
  responder,
} from './simulacion/datosDePrueba.js'

function maestroResumido(uid) {
  const { nombreCompleto } = buscarCuenta(uid)
  return { uid, nombreCompleto }
}

function estudianteDeGrupo(uid) {
  const { nombreCompleto, apodo } = buscarCuenta(uid)
  const avance = avancePorEstudiante[uid] ?? { leccionesCompletadas: 0, ultimaActividad: null }
  return { uid, nombreCompleto, apodo, ...avance }
}


function aGrupo(grupo) {
  return {
    idGrupo: grupo.idGrupo,
    nombre: grupo.nombre,
    totalEstudiantes: grupo.estudiantes.length,
    maestros: grupo.maestros.map(maestroResumido),
  }
}

function buscarGrupo(idGrupo) {
  return grupos.find((grupo) => grupo.idGrupo === Number(idGrupo))
}

function nombreValido(nombre) {
  return typeof nombre === 'string' && nombre.trim().length >= 3 && nombre.trim().length <= 60
}

const ERROR_NOMBRE = ['El nombre del grupo debe tener entre 3 y 60 caracteres', 400, 'nombre_grupo_invalido']
const ERROR_NO_ENCONTRADO = ['No encontramos este grupo', 404, 'grupo_no_encontrado']

// GET /api/grupos
export function listarGrupos() {
  return responder(grupos.map(aGrupo))
}

// POST /api/grupos
export function crearGrupo({ nombre }) {
  if (!nombreValido(nombre)) return fallar(...ERROR_NOMBRE)

  const grupo = { idGrupo: nuevoIdGrupo(), nombre: nombre.trim(), maestros: [], estudiantes: [] }
  grupos.push(grupo)
  return responder(aGrupo(grupo))
}

// PATCH /api/grupos/:idGrupo
export function renombrarGrupo(idGrupo, { nombre }) {
  const grupo = buscarGrupo(idGrupo)
  if (!grupo) return fallar(...ERROR_NO_ENCONTRADO)
  if (!nombreValido(nombre)) return fallar(...ERROR_NOMBRE)

  grupo.nombre = nombre.trim()
  return responder(aGrupo(grupo))
}

// DELETE /api/grupos/:idGrupo
export function eliminarGrupo(idGrupo) {
  const grupo = buscarGrupo(idGrupo)
  if (!grupo) return fallar(...ERROR_NO_ENCONTRADO)
  if (grupo.estudiantes.length > 0) {
    return fallar(
      'Primero retira a los estudiantes de este grupo',
      409,
      'grupo_con_participantes'
    )
  }

  grupos.splice(grupos.indexOf(grupo), 1)
  return responder(undefined)
}

// GET /api/grupos/:idGrupo
export function obtenerGrupo(idGrupo) {
  const grupo = buscarGrupo(idGrupo)
  if (!grupo) return fallar(...ERROR_NO_ENCONTRADO)

  return responder({
    idGrupo: grupo.idGrupo,
    nombre: grupo.nombre,
    totalLeccionesPublicadas: TOTAL_LECCIONES_PUBLICADAS,
    maestros: grupo.maestros.map(maestroResumido),
    estudiantes: grupo.estudiantes.map(estudianteDeGrupo),
  })
}

// POST /api/grupos/:idGrupo/estudiantes
export function agregarEstudiante(idGrupo, uid) {
  const grupo = buscarGrupo(idGrupo)
  if (!grupo) return fallar(...ERROR_NO_ENCONTRADO)

  const cuenta = buscarCuenta(uid)
  if (!cuenta || cuenta.rol !== 'estudiante' || !cuenta.activo) {
    return fallar('Solo se pueden agregar estudiantes con cuenta activa', 400, 'usuario_no_es_estudiante')
  }
  if (grupo.estudiantes.includes(uid)) {
    return fallar('Esta persona ya está en el grupo', 409, 'estudiante_ya_asignado')
  }

  grupo.estudiantes.push(uid)
  return responder(estudianteDeGrupo(uid))
}

// DELETE /api/grupos/:idGrupo/estudiantes/:uid
export function retirarEstudiante(idGrupo, uid) {
  const grupo = buscarGrupo(idGrupo)
  if (!grupo || !grupo.estudiantes.includes(uid)) {
    return fallar('Esta persona ya no está en el grupo', 404, 'asignacion_no_encontrada')
  }

  grupo.estudiantes = grupo.estudiantes.filter((actual) => actual !== uid)
  return responder(undefined)
}

// POST /api/grupos/:idGrupo/maestros (solo administrador)
export function asignarMaestro(idGrupo, uid) {
  const grupo = buscarGrupo(idGrupo)
  if (!grupo) return fallar(...ERROR_NO_ENCONTRADO)

  const cuenta = buscarCuenta(uid)
  if (!cuenta || cuenta.rol !== 'maestro' || !cuenta.activo) {
    return fallar('Solo se pueden asignar maestros con cuenta activa', 400, 'usuario_no_es_maestro')
  }
  if (grupo.maestros.includes(uid)) {
    return fallar('Este maestro ya está asignado al grupo', 409, 'maestro_ya_asignado')
  }

  grupo.maestros.push(uid)
  return responder(maestroResumido(uid))
}

// DELETE /api/grupos/:idGrupo/maestros/:uid (solo administrador)
export function retirarMaestro(idGrupo, uid) {
  const grupo = buscarGrupo(idGrupo)
  if (!grupo || !grupo.maestros.includes(uid)) {
    return fallar('Este maestro ya no está en el grupo', 404, 'asignacion_no_encontrada')
  }

  grupo.maestros = grupo.maestros.filter((actual) => actual !== uid)
  return responder(undefined)
}

// GET /api/estudiantes?buscar= (ya existe en la API)
export function buscarEstudiantes(texto = '') {
  const resultado = cuentas
    .filter((cuenta) => cuenta.rol === 'estudiante' && cuenta.activo)
    .filter((cuenta) => coincide(cuenta.nombreCompleto, texto))
    .map(({ uid, nombreCompleto, apodo }) => ({ uid, nombreCompleto, apodo }))

  return responder(resultado)
}
