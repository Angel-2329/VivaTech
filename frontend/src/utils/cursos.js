import { plural } from './formato.js'

export const RUTA_CURSOS_DISPONIBLES = '/estudiante/cursos-disponibles'
export const RUTA_MIS_CURSOS = '/estudiante/mis-cursos'
export const RUTA_EN_CURSO = '/estudiante/mis-cursos/en-curso'
export const RUTA_TERMINADOS = '/estudiante/mis-cursos/terminados'

export const TEXTO_ESTADO_LECCION = {
  completada: 'Terminada',
  en_progreso: 'En curso',
  pendiente: 'Sin empezar',
}

export const TEXTO_BOTON_LECCION = {
  pendiente: 'Empezar',
  en_progreso: 'Continuar',
  completada: 'Repasar',
}

export function rutaLeccion(idLeccion) {
  return `/estudiante/lecciones/${idLeccion}`
}

export function textoDuracion(curso) {
  const lecciones = plural(curso.totalLecciones, 'lección', 'lecciones')
  return curso.duracionTotalMinutos ? `${lecciones} · ${curso.duracionTotalMinutos} min aprox.` : lecciones
}
