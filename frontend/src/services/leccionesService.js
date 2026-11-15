import { solicitarApi } from './api.js'

export async function obtenerLeccion(idLeccion) {
  return solicitarApi(`/lecciones/${encodeURIComponent(idLeccion)}`)
}

export async function guardarPaso(idLeccion, idPaso) {
  return solicitarApi(`/lecciones/${encodeURIComponent(idLeccion)}/progreso`, {
    metodo: 'PUT',
    datos: { idPaso },
  })
}
