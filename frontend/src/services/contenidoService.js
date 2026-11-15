import { solicitarApi } from './api.js'

// Real: return solicitarApi('/contenido')
export async function obtenerContenido() {
  return solicitarApi('/contenido')
}


// Real: return solicitarApi('/cursos', { metodo: 'POST', datos: { idCategoria, titulo, descripcion, fechaCierre } })
export async function crearCurso(datos) {
  return solicitarApi('/cursos', { metodo: 'POST', datos })
}


// Real: return solicitarApi(`/cursos/${idCurso}`, { metodo: 'PATCH', datos: cambios })
export async function actualizarCurso(idCurso, cambios) {
  return solicitarApi(`/cursos/${encodeURIComponent(idCurso)}`, { metodo: 'PATCH', datos: cambios })
}

export function cambiarEstadoCurso(idCurso, estadoPublicacion) {
  return actualizarCurso(idCurso, { estadoPublicacion })
}

export function moverCurso(idCurso, idCategoria) {
  return actualizarCurso(idCurso, { idCategoria })
}

// 204 → undefined (se borró). 200 → { idCurso, estadoPublicacion: 'retirado', resultado: 'retirado' }
// Real: return solicitarApi(`/cursos/${idCurso}`, { metodo: 'DELETE' })
export async function eliminarCurso(idCurso) {
  return solicitarApi(`/cursos/${encodeURIComponent(idCurso)}`, { metodo: 'DELETE' })
}

// Responde { idCategoria, nombre, orden }
// Real: return solicitarApi('/categorias', { metodo: 'POST', datos: { nombre } })
export async function crearCategoria(nombre) {
  return solicitarApi('/categorias', { metodo: 'POST', datos: { nombre } })
}

// Solo cambia el nombre (el orden va por PUT /categorias/orden). Responde { idCategoria, nombre, orden }
// Real: return solicitarApi(`/categorias/${idCategoria}`, { metodo: 'PATCH', datos: { nombre } })
export async function renombrarCategoria(idCategoria, nombre) {
  return solicitarApi(`/categorias/${encodeURIComponent(idCategoria)}`, { metodo: 'PATCH', datos: { nombre } })
}


// Real: return solicitarApi('/categorias/orden', { metodo: 'PUT', datos: { idsCategorias } })
export async function ordenarCategorias(idsCategorias) {
  return solicitarApi('/categorias/orden', { metodo: 'PUT', datos: { idsCategorias } })
}

// Real: return solicitarApi(`/categorias/${idCategoria}`, { metodo: 'DELETE' })
export async function eliminarCategoria(idCategoria) {
  return solicitarApi(`/categorias/${encodeURIComponent(idCategoria)}`, { metodo: 'DELETE' })
}



// 200 detalle del curso con lecciones y pasos (ajenos y retirados con puedeEditar: false)
// Real: return solicitarApi(`/contenido/cursos/${idCurso}`)
export async function obtenerCursoEditor(idCurso) {
  return solicitarApi(`/contenido/cursos/${encodeURIComponent(idCurso)}`)
}

// datos: { titulo, objetivo, duracionEstimadaMinutos } → 201 lección creada
// Real: return solicitarApi(`/cursos/${idCurso}/lecciones`, { metodo: 'POST', datos })
export async function crearLeccion(idCurso, datos) {
  return solicitarApi(`/cursos/${encodeURIComponent(idCurso)}/lecciones`, { metodo: 'POST', datos })
}

// cambios: solo los campos que cambian. En publicados, solo titulo y objetivo. → 200 lección
// Real: return solicitarApi(`/lecciones/${idLeccion}`, { metodo: 'PATCH', datos: cambios })
export async function actualizarLeccion(idLeccion, cambios) {
  return solicitarApi(`/lecciones/${encodeURIComponent(idLeccion)}`, { metodo: 'PATCH', datos: cambios })
}

// 204 sin cuerpo
// Real: return solicitarApi(`/lecciones/${idLeccion}`, { metodo: 'DELETE' })
export async function eliminarLeccion(idLeccion) {
  return solicitarApi(`/lecciones/${encodeURIComponent(idLeccion)}`, { metodo: 'DELETE' })
}

// Lista completa, sin faltantes ni repetidos → 200 [{ idLeccion, orden }]
// Real: return solicitarApi(`/cursos/${idCurso}/orden-lecciones`, { metodo: 'PUT', datos: { idsLecciones } })
export async function ordenarLecciones(idCurso, idsLecciones) {
  return solicitarApi(`/cursos/${encodeURIComponent(idCurso)}/orden-lecciones`, { metodo: 'PUT', datos: { idsLecciones } })
}

// paso: { instruccion, recursos, actividad }, el formato de docs/contenido/README.md → 201 paso creado
// Real: return solicitarApi(`/lecciones/${idLeccion}/pasos`, { metodo: 'POST', datos: paso })
export async function crearPaso(idLeccion, paso) {
  return solicitarApi(`/lecciones/${encodeURIComponent(idLeccion)}/pasos`, { metodo: 'POST', datos: paso })
}

// Se manda el paso completo; en publicados el backend compara y solo acepta cambios de texto → 200 paso
// Real: return solicitarApi(`/pasos/${idPaso}`, { metodo: 'PATCH', datos: paso })
export async function actualizarPaso(idPaso, paso) {
  return solicitarApi(`/pasos/${encodeURIComponent(idPaso)}`, { metodo: 'PATCH', datos: paso })
}

// 204 sin cuerpo
// Real: return solicitarApi(`/pasos/${idPaso}`, { metodo: 'DELETE' })
export async function eliminarPaso(idPaso) {
  return solicitarApi(`/pasos/${encodeURIComponent(idPaso)}`, { metodo: 'DELETE' })
}

// → 200 [{ idPaso, orden }]
// Real: return solicitarApi(`/lecciones/${idLeccion}/orden-pasos`, { metodo: 'PUT', datos: { idsPasos } })
export async function ordenarPasos(idLeccion, idsPasos) {
  return solicitarApi(`/lecciones/${encodeURIComponent(idLeccion)}/orden-pasos`, { metodo: 'PUT', datos: { idsPasos } })
}
