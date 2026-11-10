import { fallar, responder } from './simulacion/datosDePrueba.js'
import {
  armarContenido,
  cambiarCursoPrueba,
  crearCategoriaPrueba,
  crearCursoPrueba,
  eliminarCategoriaPrueba,
  eliminarCursoPrueba,
  ordenarCategoriasPrueba,
  renombrarCategoriaPrueba,
} from './simulacion/contenidoEditorDePrueba.js'


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

// fechaCierre es opcional: si no se manda, queda en null. Responde el detalle del curso.
// Real: return solicitarApi('/cursos', { metodo: 'POST', datos: { idCategoria, titulo, descripcion, fechaCierre } })
export async function crearCurso(datos, usuario) {
  return resolver(crearCursoPrueba(datos, usuario))
}

// cambios: titulo, descripcion, fechaCierre, estadoPublicacion o idCategoria (solo admin).
// Responde el detalle del curso.
// Real: return solicitarApi(`/cursos/${idCurso}`, { metodo: 'PATCH', datos: cambios })
export async function actualizarCurso(idCurso, cambios, usuario) {
  return resolver(cambiarCursoPrueba(idCurso, cambios, usuario))
}

export function cambiarEstadoCurso(idCurso, estadoPublicacion, usuario) {
  return actualizarCurso(idCurso, { estadoPublicacion }, usuario)
}

export function moverCurso(idCurso, idCategoria, usuario) {
  return actualizarCurso(idCurso, { idCategoria }, usuario)
}

// 204 → undefined (se borró). 200 → { idCurso, estadoPublicacion: 'retirado', resultado: 'retirado' }
// Real: return solicitarApi(`/cursos/${idCurso}`, { metodo: 'DELETE' })
export async function eliminarCurso(idCurso, usuario) {
  return resolver(eliminarCursoPrueba(idCurso, usuario))
}

// Responde { idCategoria, nombre, orden }
// Real: return solicitarApi('/categorias', { metodo: 'POST', datos: { nombre } })
export async function crearCategoria(nombre, usuario) {
  return resolver(crearCategoriaPrueba({ nombre }, usuario))
}

// Solo cambia el nombre (el orden va por PUT /categorias/orden). Responde { idCategoria, nombre, orden }
// Real: return solicitarApi(`/categorias/${idCategoria}`, { metodo: 'PATCH', datos: { nombre } })
export async function renombrarCategoria(idCategoria, nombre, usuario) {
  return resolver(renombrarCategoriaPrueba(idCategoria, { nombre }, usuario))
}

// La posición en la lista es el orden. Siempre la lista completa, sin faltantes ni repetidos.
// Responde [{ idCategoria, orden }]; la pantalla después vuelve a pedir GET /api/contenido.
// Real: return solicitarApi('/categorias/orden', { metodo: 'PUT', datos: { idsCategorias } })
export async function ordenarCategorias(idsCategorias, usuario) {
  return resolver(ordenarCategoriasPrueba({ idsCategorias }, usuario))
}

// Real: return solicitarApi(`/categorias/${idCategoria}`, { metodo: 'DELETE' })
export async function eliminarCategoria(idCategoria, usuario) {
  return resolver(eliminarCategoriaPrueba(idCategoria, usuario))
}
