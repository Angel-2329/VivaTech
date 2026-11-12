import { fallar, responder } from './simulacion/datosDePrueba.js'
import {
  actualizarLeccionPrueba,
  actualizarPasoPrueba,
  armarContenido,
  armarCursoEditor,
  cambiarCursoPrueba,
  crearCategoriaPrueba,
  crearCursoPrueba,
  crearLeccionPrueba,
  crearPasoPrueba,
  eliminarCategoriaPrueba,
  eliminarCursoPrueba,
  eliminarLeccionPrueba,
  eliminarPasoPrueba,
  ordenarCategoriasPrueba,
  ordenarLeccionesPrueba,
  ordenarPasosPrueba,
  renombrarCategoriaPrueba,
} from './simulacion/contenidoEditorDePrueba.js'


function resolver(resultado) {
  if (resultado.error) {
    const { mensaje, estado, codigo, errores } = resultado.error
    return fallar(mensaje, estado, codigo, errores)
  }
  return responder(resultado.respuesta)
}

// Real: return solicitarApi('/contenido')
export async function obtenerContenido(usuario) {
  return responder(armarContenido(usuario))
}


// Real: return solicitarApi('/cursos', { metodo: 'POST', datos: { idCategoria, titulo, descripcion, fechaCierre } })
export async function crearCurso(datos, usuario) {
  return resolver(crearCursoPrueba(datos, usuario))
}


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


// Real: return solicitarApi('/categorias/orden', { metodo: 'PUT', datos: { idsCategorias } })
export async function ordenarCategorias(idsCategorias, usuario) {
  return resolver(ordenarCategoriasPrueba({ idsCategorias }, usuario))
}

// Real: return solicitarApi(`/categorias/${idCategoria}`, { metodo: 'DELETE' })
export async function eliminarCategoria(idCategoria, usuario) {
  return resolver(eliminarCategoriaPrueba(idCategoria, usuario))
}



// 200 detalle del curso con lecciones y pasos (ajenos y retirados con puedeEditar: false)
// Real: return solicitarApi(`/contenido/cursos/${idCurso}`)
export async function obtenerCursoEditor(idCurso, usuario) {
  return resolver(armarCursoEditor(String(idCurso), usuario))
}

// datos: { titulo, objetivo, duracionEstimadaMinutos } → 201 lección creada
// Real: return solicitarApi(`/cursos/${idCurso}/lecciones`, { metodo: 'POST', datos })
export async function crearLeccion(idCurso, datos, usuario) {
  return resolver(crearLeccionPrueba(idCurso, datos, usuario))
}

// cambios: solo los campos que cambian. En publicados, solo titulo y objetivo. → 200 lección
// Real: return solicitarApi(`/lecciones/${idLeccion}`, { metodo: 'PATCH', datos: cambios })
export async function actualizarLeccion(idLeccion, cambios, usuario) {
  return resolver(actualizarLeccionPrueba(idLeccion, cambios, usuario))
}

// 204 sin cuerpo
// Real: return solicitarApi(`/lecciones/${idLeccion}`, { metodo: 'DELETE' })
export async function eliminarLeccion(idLeccion, usuario) {
  return resolver(eliminarLeccionPrueba(idLeccion, usuario))
}

// Lista completa, sin faltantes ni repetidos → 200 [{ idLeccion, orden }]
// Real: return solicitarApi(`/cursos/${idCurso}/orden-lecciones`, { metodo: 'PUT', datos: { idsLecciones } })
export async function ordenarLecciones(idCurso, idsLecciones, usuario) {
  return resolver(ordenarLeccionesPrueba(idCurso, { idsLecciones }, usuario))
}

// paso: { instruccion, recursos, actividad }, el formato de docs/contenido/README.md → 201 paso creado
// Real: return solicitarApi(`/lecciones/${idLeccion}/pasos`, { metodo: 'POST', datos: paso })
export async function crearPaso(idLeccion, paso, usuario) {
  return resolver(crearPasoPrueba(idLeccion, paso, usuario))
}

// Se manda el paso completo; en publicados el backend compara y solo acepta cambios de texto → 200 paso
// Real: return solicitarApi(`/pasos/${idPaso}`, { metodo: 'PATCH', datos: paso })
export async function actualizarPaso(idPaso, paso, usuario) {
  return resolver(actualizarPasoPrueba(idPaso, paso, usuario))
}

// 204 sin cuerpo
// Real: return solicitarApi(`/pasos/${idPaso}`, { metodo: 'DELETE' })
export async function eliminarPaso(idPaso, usuario) {
  return resolver(eliminarPasoPrueba(idPaso, usuario))
}

// → 200 [{ idPaso, orden }]
// Real: return solicitarApi(`/lecciones/${idLeccion}/orden-pasos`, { metodo: 'PUT', datos: { idsPasos } })
export async function ordenarPasos(idLeccion, idsPasos, usuario) {
  return resolver(ordenarPasosPrueba(idLeccion, { idsPasos }, usuario))
}
