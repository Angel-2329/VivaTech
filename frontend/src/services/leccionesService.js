// SERVICIO SIMULADO de lecciones (Sprint 4, tarea 3.23.1).
import { fallar, responder } from './simulacion/datosDePrueba.js'
import { armarLeccion, registrarPaso } from './simulacion/progresoDePrueba.js'

// Real: return solicitarApi(`/lecciones/${idLeccion}`)
export async function obtenerLeccion(idLeccion) {
  const leccion = armarLeccion(String(idLeccion))

  if (!leccion) {
    return fallar('No encontramos esta lección', 404, 'leccion_no_encontrada')
  }

  return responder(leccion)
}

// Real: return solicitarApi(`/lecciones/${idLeccion}/progreso`, { metodo: 'PUT', datos: { idPaso } })
export async function guardarPaso(idLeccion, idPaso) {
  const resultado = registrarPaso(String(idLeccion), String(idPaso))
 //Prueba de error al guardar
 // if (!globalThis.yaFallo) { globalThis.yaFallo = true; return fallar('Sin internet', 0, 'error_conexion') }

  if (resultado.error) {
    const { mensaje, estado, codigo } = resultado.error
    return fallar(mensaje, estado, codigo)
  }

  return responder(resultado.respuesta)
}
