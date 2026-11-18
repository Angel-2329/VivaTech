import { solicitarApi } from './api.js'

export function obtenerMisCursos() {
  return solicitarApi('/mis-cursos')
}
