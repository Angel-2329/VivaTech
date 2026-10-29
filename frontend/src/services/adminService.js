// SIMULACIÓN de las funciones del administrador.
// buscarCuentas, cambiarRol y cambiarActivo ya existen en la API real;

import {
  TOTAL_LECCIONES_PUBLICADAS,
  avancePorEstudiante,
  buscarCuenta,
  coincide,
  cuentas,
  fallar,
  grupos,
  responder,
} from './simulacion/datosDePrueba.js'

const ROLES = ['estudiante', 'maestro', 'administrador']

// GET /api/admin/usuarios?buscar=&rol=
export function buscarCuentas({ buscar = '', rol = '' } = {}) {
  const resultado = cuentas
    .filter((cuenta) => !rol || cuenta.rol === rol)
    .filter((cuenta) => coincide(cuenta.nombreCompleto, buscar))

  return responder(resultado)
}

function participaEnGrupos(uid) {
  return grupos.some((grupo) => grupo.maestros.includes(uid) || grupo.estudiantes.includes(uid))
}

// PATCH /api/admin/usuarios/:uid/rol
export function cambiarRol(uid, rol) {
  const cuenta = buscarCuenta(uid)
  if (!cuenta) return fallar('No existe la cuenta solicitada', 404, 'usuario_no_encontrado')
  if (!ROLES.includes(rol)) return fallar('El rol no es válido', 400, 'rol_invalido')
  if (participaEnGrupos(uid)) {
    return fallar(
      'Primero retira a la persona de los grupos donde participa antes de cambiar su rol',
      409,
      'usuario_en_grupos'
    )
  }

  cuenta.rol = rol
  return responder(cuenta)
}

// PATCH /api/admin/usuarios/:uid/activo
export function cambiarActivo(uid, activo) {
  const cuenta = buscarCuenta(uid)
  if (!cuenta) return fallar('No existe la cuenta solicitada', 404, 'usuario_no_encontrado')

  cuenta.activo = activo
  return responder(cuenta)
}

// GET /api/admin/resumen
export function obtenerResumen() {
  const estudiantes = cuentas.filter((cuenta) => cuenta.rol === 'estudiante')

  return responder({
    totalEstudiantes: estudiantes.length,
    totalMaestros: cuentas.filter((cuenta) => cuenta.rol === 'maestro').length,
    totalGrupos: grupos.length,
    totalLeccionesPublicadas: TOTAL_LECCIONES_PUBLICADAS,
    leccionesCompletadas: estudiantes.reduce(
      (suma, { uid }) => suma + (avancePorEstudiante[uid]?.leccionesCompletadas ?? 0),
      0
    ),
  })
}

// GET /api/admin/progreso?buscar=
export function obtenerProgresoGeneral(texto = '') {
  const resultado = cuentas
    .filter((cuenta) => cuenta.rol === 'estudiante')
    .filter((cuenta) => coincide(cuenta.nombreCompleto, texto))
    .map(({ uid, nombreCompleto }) => ({
      uid,
      nombreCompleto,
      grupos: grupos.filter((grupo) => grupo.estudiantes.includes(uid)).map((grupo) => grupo.nombre),
      leccionesCompletadas: avancePorEstudiante[uid]?.leccionesCompletadas ?? 0,
      totalLeccionesPublicadas: TOTAL_LECCIONES_PUBLICADAS,
      ultimaActividad: avancePorEstudiante[uid]?.ultimaActividad ?? null,
    }))

  return responder(resultado)
}
