import { solicitarApi } from './api.js'

export function obtenerCursosDisponibles() {
  return solicitarApi('/cursos-disponibles')
}

export function obtenerCursosEnCurso() {
  return solicitarApi('/mis-cursos/en-curso')
}

export function obtenerCursosTerminados() {
  return solicitarApi('/mis-cursos/terminados')
}
