import { fallar, responder } from './simulacion/datosDePrueba.js'
import {
  armarContenido,
  cambiarCategoriaPrueba,
  cambiarCursoPrueba,
  crearCategoriaPrueba,
  crearCursoPrueba,
  eliminarCategoriaPrueba,
  eliminarCursoPrueba,
} from './simulacion/contenidoEditorDePrueba.js'

// SIMULADO (3.23.9). En la unión cada función se cambia por solicitarApi.
// El parámetro "usuario" solo lo usa la simulación: el servidor real sabe
// quién eres por el token, así que en la versión real se quita.

function resolver(resultado) {
  if (resultado.error) {
    const { mensaje, estado, codigo } = resultado.error
    return fallar(mensaje, estado, codigo)
  }
  return responder(resultado.respuesta)
}

// Real: return solicitarApi('/contenido')
export async function obtenerContenido(usuario) {
  return responder(armarContenido(usuario))
}

// Real: return solicitarApi('/cursos', { metodo: 'POST', datos: { idCategoria, titulo, descripcion } })
export async function crearCurso(datos, usuario) {
  return resolver(crearCursoPrueba(datos, usuario))
}

// Real: return solicitarApi(`/cursos/${idCurso}`, { metodo: 'PATCH', datos: { estadoPublicacion } })
export async function cambiarEstadoCurso(idCurso, estadoPublicacion, usuario) {
  return resolver(cambiarCursoPrueba(idCurso, { estadoPublicacion }, usuario))
}

// Real: return solicitarApi(`/cursos/${idCurso}`, { metodo: 'PATCH', datos: { idCategoria } })
export async function moverCurso(idCurso, idCategoria, usuario) {
  return resolver(cambiarCursoPrueba(idCurso, { idCategoria }, usuario))
}

// Real: return solicitarApi(`/cursos/${idCurso}`, { metodo: 'DELETE' })
// Responde { resultado: 'eliminado' } o { resultado: 'retirado' } si había avance
export async function eliminarCurso(idCurso, usuario) {
  return resolver(eliminarCursoPrueba(idCurso, usuario))
}

// Real: return solicitarApi('/categorias', { metodo: 'POST', datos: { nombre } })
export async function crearCategoria(nombre, usuario) {
  return resolver(crearCategoriaPrueba({ nombre }, usuario))
}

// Real: return solicitarApi(`/categorias/${idCategoria}`, { metodo: 'PATCH', datos: { nombre } })
export async function renombrarCategoria(idCategoria, nombre, usuario) {
  return resolver(cambiarCategoriaPrueba(idCategoria, { nombre }, usuario))
}

// Real: return solicitarApi(`/categorias/${idCategoria}`, { metodo: 'PATCH', datos: { orden } })
export async function moverCategoria(idCategoria, orden, usuario) {
  return resolver(cambiarCategoriaPrueba(idCategoria, { orden }, usuario))
}

// Real: return solicitarApi(`/categorias/${idCategoria}`, { metodo: 'DELETE' })
export async function eliminarCategoria(idCategoria, usuario) {
  return resolver(eliminarCategoriaPrueba(idCategoria, usuario))
}
