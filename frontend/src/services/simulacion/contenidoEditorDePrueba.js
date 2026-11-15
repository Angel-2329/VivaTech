import { CATEGORIAS } from './contenidoDePrueba.js'
import { armarMisCursos } from './progresoDePrueba.js'
import { CURSO_RETIRADO, FECHAS_CIERRE } from './estadoCursosDePrueba.js'
import { esFechaCalendario, hoyEnMexico } from '../../utils/fechas.js'
import { extraerIdVideo } from '../../utils/youtube.js'
import {
  MAX_LECCIONES,
  MAX_PASOS,
  estructuraPaso,
  limpiarPaso,
  problemaParaPublicar,
  validarLeccion,
  validarPaso,
} from '../../utils/pasos.js'


const YO = '__yo__'
const ADMIN = { uid: 'admin-demo', nombreCompleto: 'Administración Viva Tech' }
const OTRA_MAESTRA = { uid: 'maestra-demo', nombreCompleto: 'Laura Pérez Gómez' }

let siguienteIdCategoria = 3
let siguienteIdCurso = 15
let siguienteIdLeccion = 90
let siguienteIdPaso = 900

function leccionDePrueba(titulo) {
  return {
    idLeccion: String(siguienteIdLeccion++),
    titulo,
    objetivo: 'Lección de ejemplo para probar el editor.',
    duracionEstimadaMinutos: 5,
    pasos: [],
  }
}

const categorias = CATEGORIAS.map((categoria, posicion) => ({
  idCategoria: categoria.idCategoria,
  nombre: categoria.nombre,
  orden: posicion + 1,
}))

const cursos = [
  ...CATEGORIAS.flatMap((categoria) =>
    categoria.cursos.map((curso, posicion) => ({
      idCurso: curso.idCurso,
      idCategoria: categoria.idCategoria,
      orden: posicion + 1,
      titulo: curso.titulo,
      descripcion: curso.descripcion,
      estadoPublicacion: 'publicado',
      fechaCierre: FECHAS_CIERRE[curso.idCurso] ?? null,
      autor: ADMIN,
      lecciones: structuredClone(curso.lecciones),
      avanceFijo: null,
    })),
  ),
  {
    idCurso: '12',
    idCategoria: '2',
    orden: 2,
    titulo: 'Hacer compras en línea con seguridad',
    descripcion: 'Aprende a revisar una tienda en línea antes de pagar y a guardar tu comprobante.',
    estadoPublicacion: 'borrador',
    fechaCierre: null,
    autor: { uid: YO },
    lecciones: [leccionDePrueba('Revisar que la tienda sea confiable'), leccionDePrueba('Pagar y guardar el comprobante')],
    avanceFijo: false,
  },
  {
    idCurso: CURSO_RETIRADO.idCurso,
    idCategoria: CURSO_RETIRADO.idCategoria,
    orden: 2,
    titulo: CURSO_RETIRADO.titulo,
    descripcion: CURSO_RETIRADO.descripcion,
    estadoPublicacion: 'retirado',
    fechaCierre: null,
    autor: { uid: YO },
    lecciones: [],
    avanceFijo: true,
  },
  {
    idCurso: '14',
    idCategoria: '2',
    orden: 3,
    titulo: 'Recargar saldo al celular',
    descripcion: 'Recarga tiempo aire desde la aplicación de tu banco.',
    estadoPublicacion: 'borrador',
    fechaCierre: null,
    autor: OTRA_MAESTRA,
    lecciones: [leccionDePrueba('Elegir el monto de la recarga')],
    avanceFijo: false,
  },
]

function error(mensaje, estado, codigo) {
  return { error: { mensaje, estado, codigo } }
}

function esAutor(curso, usuario) {
  return curso.autor.uid === YO || curso.autor.uid === usuario.uid
}


function tieneAvance(curso) {
  if (curso.avanceFijo !== null) return curso.avanceFijo
  const delAlumno = armarMisCursos()
    .flatMap((categoria) => categoria.cursos)
    .find((actual) => actual.idCurso === curso.idCurso)
  return Boolean(delAlumno?.lecciones.some((leccion) => leccion.estado !== 'pendiente'))
}

function puedeEditar(curso, usuario) {
  if (curso.estadoPublicacion === 'retirado') return false
  return usuario.rol === 'administrador' || esAutor(curso, usuario)
}


function resumenCurso(curso, usuario) {
  const autor = curso.autor.uid === YO ? usuario : curso.autor
  return {
    idCurso: curso.idCurso,
    idCategoria: curso.idCategoria,
    orden: curso.orden,
    titulo: curso.titulo,
    descripcion: curso.descripcion,
    estadoPublicacion: curso.estadoPublicacion,
    fechaCierre: curso.fechaCierre,
    creadoPor: autor.nombreCompleto,
    puedeEditar: puedeEditar(curso, usuario),
    tieneAvance: tieneAvance(curso),
    totalLecciones: curso.lecciones.length,
  }
}



function detalleCurso(curso, usuario) {
  return {
    ...resumenCurso(curso, usuario),
    lecciones: curso.lecciones.map((leccion, posicion) => ({
      ...leccion,
      orden: posicion + 1,
      pasos: leccion.pasos.map((paso, numero) => ({ ...paso, orden: numero + 1 })),
    })),
  }
}

function resumenCategoria(categoria) {
  return { idCategoria: categoria.idCategoria, nombre: categoria.nombre, orden: categoria.orden }
}

function ordenarCategorias() {
  categorias.sort((a, b) => a.orden - b.orden)
}

function siguienteOrden(idCategoria) {
  const ordenes = cursos.filter((curso) => curso.idCategoria === idCategoria).map((curso) => curso.orden)
  return Math.max(0, ...ordenes) + 1
}

function existeCategoria(idCategoria) {
  return categorias.some((categoria) => categoria.idCategoria === idCategoria)
}

function nombreRepetido(nombre, excepto) {
  return categorias.some(
    (categoria) => categoria !== excepto && categoria.nombre.toLowerCase() === nombre.toLowerCase(),
  )
}


function buscarCurso(idCurso, usuario, { permitirRetirado = false } = {}) {
  const curso = cursos.find((actual) => actual.idCurso === idCurso)
  if (!curso) return { fallo: error('El curso no existe', 404, 'curso_no_encontrado') }
  if (usuario.rol === 'maestro' && !esAutor(curso, usuario)) {
    return { fallo: error('Solo puedes modificar los cursos que tú creaste', 403, 'curso_ajeno') }
  }
  if (curso.estadoPublicacion === 'retirado' && !permitirRetirado) {
    return { fallo: error('Un curso retirado es de solo lectura', 409, 'curso_retirado') }
  }
  return { curso }
}


function fechaInvalida(fechaCierre) {
  if (fechaCierre === null) return null
  if (!esFechaCalendario(fechaCierre) || fechaCierre < hoyEnMexico()) {
    return error('La fecha de cierre debe ser de hoy en adelante', 400, 'fecha_cierre_invalida')
  }
  return null
}

function soloAdministrador(usuario) {
  return usuario.rol === 'administrador'
    ? null
    : error('Solo un administrador puede hacer este cambio', 403, 'rol_no_autorizado')
}



export function armarContenido(usuario) {
  ordenarCategorias()
  return categorias.map((categoria) => ({
    ...resumenCategoria(categoria),
    cursos: cursos
      .filter((curso) => curso.idCategoria === categoria.idCategoria)
      .sort((a, b) => a.orden - b.orden)
      .map((curso) => resumenCurso(curso, usuario)),
  }))
}

// POST /api/cursos
export function crearCursoPrueba({ idCategoria, titulo, descripcion, fechaCierre = null }, usuario) {
  if (!existeCategoria(idCategoria)) return error('La categoría no existe', 404, 'categoria_no_encontrada')
  const fechaMal = fechaInvalida(fechaCierre)
  if (fechaMal) return fechaMal

  const curso = {
    idCurso: String(siguienteIdCurso++),
    idCategoria,
    orden: siguienteOrden(idCategoria),
    titulo,
    descripcion,
    estadoPublicacion: 'borrador',
    fechaCierre,
    autor: { uid: usuario.uid, nombreCompleto: usuario.nombreCompleto },
    lecciones: [],
    avanceFijo: false,
  }
  cursos.push(curso)
  return { respuesta: detalleCurso(curso, usuario) }
}

// PATCH /api/cursos/:idCurso
export function cambiarCursoPrueba(idCurso, cambios, usuario) {
  const { curso, fallo } = buscarCurso(idCurso, usuario)
  if (fallo) return fallo
  if (cambios.fechaCierre !== undefined) {
    const fechaMal = fechaInvalida(cambios.fechaCierre)
    if (fechaMal) return fechaMal
  }

  if (cambios.idCategoria !== undefined && cambios.idCategoria !== curso.idCategoria) {
    const sinPermiso = soloAdministrador(usuario)
    if (sinPermiso) return sinPermiso
    if (!existeCategoria(cambios.idCategoria)) return error('La categoría no existe', 404, 'categoria_no_encontrada')
    curso.idCategoria = cambios.idCategoria
    curso.orden = siguienteOrden(cambios.idCategoria)
  }

  if (cambios.estadoPublicacion === 'publicado') {
    
    if (curso.lecciones.length === 0) {
      return error('Agrega al menos una lección antes de publicar el curso', 409, 'curso_sin_lecciones')
    }
    // De 1 a 10 lecciones, de 3 a 8 pasos cada una y al menos una práctica
    const problema = problemaParaPublicar(curso.lecciones)
    if (problema) return error(problema, 409, 'contenido_incompleto')
    curso.estadoPublicacion = 'publicado'
  }

  if (cambios.estadoPublicacion === 'borrador') {
    if (tieneAvance(curso)) {
      return error('El curso no puede volver a borrador porque tiene avance registrado', 409, 'curso_con_avance')
    }
    curso.estadoPublicacion = 'borrador'
  }

  if (cambios.titulo !== undefined) curso.titulo = cambios.titulo
  if (cambios.descripcion !== undefined) curso.descripcion = cambios.descripcion
  if (cambios.fechaCierre !== undefined) curso.fechaCierre = cambios.fechaCierre

  return { respuesta: detalleCurso(curso, usuario) }
}

// DELETE /api/cursos/:idCurso
// Sin avance: 204 sin cuerpo (respuesta undefined). Con avance o ya retirado: 200 con el retiro.
export function eliminarCursoPrueba(idCurso, usuario) {
  const { curso, fallo } = buscarCurso(idCurso, usuario, { permitirRetirado: true })
  if (fallo) return fallo

  const retiro = { idCurso: curso.idCurso, estadoPublicacion: 'retirado', resultado: 'retirado' }

  if (curso.estadoPublicacion === 'retirado') return { respuesta: retiro }

  if (tieneAvance(curso)) {
    curso.estadoPublicacion = 'retirado'
    curso.lecciones = []
    curso.avanceFijo = true
    return { respuesta: retiro }
  }

  cursos.splice(cursos.indexOf(curso), 1)
  return { respuesta: undefined }
}

// POST /api/categorias
export function crearCategoriaPrueba({ nombre }, usuario) {
  const sinPermiso = soloAdministrador(usuario)
  if (sinPermiso) return sinPermiso
  if (nombreRepetido(nombre)) return error('Ya existe una categoría con ese nombre', 409, 'categoria_duplicada')

  const categoria = { idCategoria: String(siguienteIdCategoria++), nombre, orden: categorias.length + 1 }
  categorias.push(categoria)
  return { respuesta: resumenCategoria(categoria) }
}

// PATCH /api/categorias/:idCategoria con { nombre }
export function renombrarCategoriaPrueba(idCategoria, { nombre }, usuario) {
  const sinPermiso = soloAdministrador(usuario)
  if (sinPermiso) return sinPermiso
  const categoria = categorias.find((actual) => actual.idCategoria === idCategoria)
  if (!categoria) return error('La categoría no existe', 404, 'categoria_no_encontrada')
  if (nombreRepetido(nombre, categoria)) return error('Ya existe una categoría con ese nombre', 409, 'categoria_duplicada')

  categoria.nombre = nombre
  return { respuesta: resumenCategoria(categoria) }
}

// PUT /api/categorias/orden con { idsCategorias }: la lista completa, sin faltantes ni repetidos.
// Responde solo [{ idCategoria, orden }], sin nombres ni cursos.
export function ordenarCategoriasPrueba({ idsCategorias }, usuario) {
  const sinPermiso = soloAdministrador(usuario)
  if (sinPermiso) return sinPermiso

  const completa =
    Array.isArray(idsCategorias) &&
    idsCategorias.length === categorias.length &&
    new Set(idsCategorias).size === idsCategorias.length &&
    idsCategorias.every(existeCategoria)
  if (!completa) {
    return error('El nuevo orden debe incluir todas las categorías una sola vez', 400, 'orden_invalido')
  }

  idsCategorias.forEach((id, posicion) => {
    categorias.find((categoria) => categoria.idCategoria === id).orden = posicion + 1
  })
  ordenarCategorias()
  return { respuesta: categorias.map(({ idCategoria, orden }) => ({ idCategoria, orden })) }
}

// DELETE /api/categorias/:idCategoria
export function eliminarCategoriaPrueba(idCategoria, usuario) {
  const sinPermiso = soloAdministrador(usuario)
  if (sinPermiso) return sinPermiso
  const categoria = categorias.find((actual) => actual.idCategoria === idCategoria)
  if (!categoria) return error('La categoría no existe', 404, 'categoria_no_encontrada')
  // Cuenta también los retirados, aunque tengan 0 lecciones
  if (cursos.some((curso) => curso.idCategoria === idCategoria)) {
    return error('La categoría tiene cursos, aunque sean retirados', 409, 'categoria_con_cursos')
  }

  categorias.splice(categorias.indexOf(categoria), 1)
  categorias.forEach((actual, posicion) => {
    actual.orden = posicion + 1
  })
  return { respuesta: undefined }
}

function errorDetallado(mensaje, estado, codigo, errores) {
  return { error: { mensaje, estado, codigo, errores } }
}

// Agregar, quitar o reordenar no se permite en publicados ni con avance (igual que validarCambioEstructural)
function cambioEstructural(curso) {
  if (curso.estadoPublicacion === 'publicado') {
    return error('Un curso publicado solo permite las correcciones autorizadas', 409, 'curso_publicado')
  }
  if (tieneAvance(curso)) {
    return error('No se puede cambiar la estructura de un curso con avance registrado', 409, 'curso_con_avance')
  }
  return null
}

// 400 contenido_invalido con el desglose { ruta, codigo, mensaje } que manda el backend
function datosInvalidos(errores, recurso) {
  const lista = Object.entries(errores).map(([ruta, mensaje]) => ({
    ruta: `${recurso}.${ruta.replace(/\.(\d+)/g, '[$1]')}`,
    codigo: 'contenido_invalido',
    mensaje,
  }))
  return lista.length ? errorDetallado('Revisa los datos del contenido', 400, 'contenido_invalido', lista) : null
}


function convertirVideos(paso) {
  for (const recurso of paso.recursos) {
    if (recurso.tipo !== 'video') continue
    if (recurso.url !== undefined && recurso.idVideo !== undefined) {
      return { fallo: error('Manda el enlace o el idVideo, no los dos', 400, 'video_invalido') }
    }
    if (recurso.url !== undefined) {
      const idVideo = extraerIdVideo(recurso.url)
      if (!idVideo) return { fallo: error('El enlace no es de un video de YouTube', 400, 'video_invalido') }
      const { titulo } = recurso
      for (const clave of Object.keys(recurso)) delete recurso[clave]
      Object.assign(recurso, { tipo: 'video', plataforma: 'youtube', idVideo, titulo })
    }
  }
  return { paso }
}

function ubicarLeccion(idLeccion) {
  for (const curso of cursos) {
    const leccion = curso.lecciones.find((actual) => actual.idLeccion === idLeccion)
    if (leccion) return { curso, leccion }
  }
  return null
}

function ubicarPaso(idPaso) {
  for (const curso of cursos) {
    for (const leccion of curso.lecciones) {
      const paso = leccion.pasos.find((actual) => actual.idPaso === idPaso)
      if (paso) return { curso, leccion, paso }
    }
  }
  return null
}

function listaCompleta(ids, elementos, campo) {
  return (
    Array.isArray(ids) &&
    ids.length === elementos.length &&
    new Set(ids).size === ids.length &&
    ids.every((id) => elementos.some((elemento) => elemento[campo] === id))
  )
}

function reordenar(elementos, ids, campo) {
  const copia = ids.map((id) => elementos.find((elemento) => elemento[campo] === id))
  elementos.splice(0, elementos.length, ...copia)
}

function leccionRespuesta(curso, leccion) {
  return {
    ...leccion,
    orden: curso.lecciones.indexOf(leccion) + 1,
    pasos: leccion.pasos.map((paso, numero) => ({ ...paso, orden: numero + 1 })),
  }
}

function pasoRespuesta(leccion, paso) {
  return { ...paso, orden: leccion.pasos.indexOf(paso) + 1 }
}

// GET /api/contenido/cursos/:idCurso → 200 detalle (también ajenos y retirados, de solo lectura)
export function armarCursoEditor(idCurso, usuario) {
  const curso = cursos.find((actual) => actual.idCurso === idCurso)
  if (!curso) return error('El curso no existe', 404, 'curso_no_encontrado')
  return { respuesta: detalleCurso(curso, usuario) }
}

// POST /api/cursos/:idCurso/lecciones → 201 lección creada
export function crearLeccionPrueba(idCurso, datos, usuario) {
  const { curso, fallo } = buscarCurso(idCurso, usuario)
  if (fallo) return fallo
  const bloqueo = cambioEstructural(curso)
  if (bloqueo) return bloqueo
  if (curso.lecciones.length >= MAX_LECCIONES) {
    return error(`Un curso puede tener hasta ${MAX_LECCIONES} lecciones`, 409, 'limite_lecciones')
  }
  const invalido = datosInvalidos(validarLeccion(datos), 'leccion')
  if (invalido) return invalido

  const leccion = {
    idLeccion: String(siguienteIdLeccion++),
    titulo: datos.titulo.trim(),
    objetivo: datos.objetivo.trim(),
    duracionEstimadaMinutos: Number(datos.duracionEstimadaMinutos),
    pasos: [],
  }
  curso.lecciones.push(leccion)
  return { respuesta: leccionRespuesta(curso, leccion) }
}

// PATCH /api/lecciones/:idLeccion → 200 lección actualizada. Se mandan solo los campos que cambian.
// En publicados (o con avance) solo se corrigen título y objetivo; la duración no.
export function actualizarLeccionPrueba(idLeccion, cambios, usuario) {
  const ubicada = ubicarLeccion(idLeccion)
  if (!ubicada) return error('La lección no existe', 404, 'leccion_no_encontrada')
  const { curso, leccion } = ubicada
  const { fallo } = buscarCurso(curso.idCurso, usuario)
  if (fallo) return fallo

  const cambiaDuracion =
    cambios.duracionEstimadaMinutos !== undefined &&
    Number(cambios.duracionEstimadaMinutos) !== leccion.duracionEstimadaMinutos
  if (cambiaDuracion && cambioEstructural(curso)) {
    return error('En este curso solo se corrigen el título y el objetivo de la lección', 409, 'curso_publicado')
  }

  const resultado = { ...leccion, ...cambios }
  const invalido = datosInvalidos(validarLeccion(resultado), 'leccion')
  if (invalido) return invalido

  if (cambios.titulo !== undefined) leccion.titulo = cambios.titulo.trim()
  if (cambios.objetivo !== undefined) leccion.objetivo = cambios.objetivo.trim()
  if (cambios.duracionEstimadaMinutos !== undefined) {
    leccion.duracionEstimadaMinutos = Number(cambios.duracionEstimadaMinutos)
  }
  return { respuesta: leccionRespuesta(curso, leccion) }
}

// DELETE /api/lecciones/:idLeccion → 204 sin cuerpo
export function eliminarLeccionPrueba(idLeccion, usuario) {
  const ubicada = ubicarLeccion(idLeccion)
  if (!ubicada) return error('La lección no existe', 404, 'leccion_no_encontrada')
  const { fallo } = buscarCurso(ubicada.curso.idCurso, usuario)
  if (fallo) return fallo
  const bloqueo = cambioEstructural(ubicada.curso)
  if (bloqueo) return bloqueo

  ubicada.curso.lecciones.splice(ubicada.curso.lecciones.indexOf(ubicada.leccion), 1)
  return { respuesta: undefined }
}

// PUT /api/cursos/:idCurso/orden-lecciones con { idsLecciones } → 200 [{ idLeccion, orden }]
export function ordenarLeccionesPrueba(idCurso, { idsLecciones }, usuario) {
  const { curso, fallo } = buscarCurso(idCurso, usuario)
  if (fallo) return fallo
  const bloqueo = cambioEstructural(curso)
  if (bloqueo) return bloqueo
  if (!listaCompleta(idsLecciones, curso.lecciones, 'idLeccion')) {
    return error('El nuevo orden debe incluir todas las lecciones una sola vez', 400, 'orden_invalido')
  }

  reordenar(curso.lecciones, idsLecciones, 'idLeccion')
  return { respuesta: curso.lecciones.map((leccion, posicion) => ({ idLeccion: leccion.idLeccion, orden: posicion + 1 })) }
}

// POST /api/lecciones/:idLeccion/pasos → 201 paso creado
export function crearPasoPrueba(idLeccion, paso, usuario) {
  const ubicada = ubicarLeccion(idLeccion)
  if (!ubicada) return error('La lección no existe', 404, 'leccion_no_encontrada')
  const { fallo } = buscarCurso(ubicada.curso.idCurso, usuario)
  if (fallo) return fallo
  const bloqueo = cambioEstructural(ubicada.curso)
  if (bloqueo) return bloqueo
  if (ubicada.leccion.pasos.length >= MAX_PASOS) {
    return error(`Una lección puede tener hasta ${MAX_PASOS} pasos`, 409, 'limite_pasos')
  }
  const convertido = convertirVideos(limpiarPaso(paso))
  if (convertido.fallo) return convertido.fallo
  const invalido = datosInvalidos(validarPaso(convertido.paso), 'paso')
  if (invalido) return invalido

  const nuevo = { idPaso: String(siguienteIdPaso++), ...convertido.paso }
  ubicada.leccion.pasos.push(nuevo)
  return { respuesta: pasoRespuesta(ubicada.leccion, nuevo) }
}

// PATCH /api/pasos/:idPaso → 200 paso actualizado.
// En publicados (o con avance) el backend compara: solo se aceptan cambios de texto.
export function actualizarPasoPrueba(idPaso, paso, usuario) {
  const ubicado = ubicarPaso(idPaso)
  if (!ubicado) return error('El paso no existe', 404, 'paso_no_encontrado')
  const { fallo } = buscarCurso(ubicado.curso.idCurso, usuario)
  if (fallo) return fallo
  const convertido = convertirVideos(limpiarPaso(paso))
  if (convertido.fallo) return convertido.fallo
  const limpio = convertido.paso
  const invalido = datosInvalidos(validarPaso(limpio), 'paso')
  if (invalido) return invalido

  if (cambioEstructural(ubicado.curso) && estructuraPaso(limpio) !== estructuraPaso(ubicado.paso)) {
    return error(
      'En este curso solo puedes corregir textos: no se cambia el tipo, los recursos, las opciones ni la respuesta correcta',
      409,
      'curso_publicado',
    )
  }

  Object.assign(ubicado.paso, limpio)
  return { respuesta: pasoRespuesta(ubicado.leccion, ubicado.paso) }
}

// DELETE /api/pasos/:idPaso → 204 sin cuerpo
export function eliminarPasoPrueba(idPaso, usuario) {
  const ubicado = ubicarPaso(idPaso)
  if (!ubicado) return error('El paso no existe', 404, 'paso_no_encontrado')
  const { fallo } = buscarCurso(ubicado.curso.idCurso, usuario)
  if (fallo) return fallo
  const bloqueo = cambioEstructural(ubicado.curso)
  if (bloqueo) return bloqueo

  ubicado.leccion.pasos.splice(ubicado.leccion.pasos.indexOf(ubicado.paso), 1)
  return { respuesta: undefined }
}

// PUT /api/lecciones/:idLeccion/orden-pasos con { idsPasos } → 200 [{ idPaso, orden }]
export function ordenarPasosPrueba(idLeccion, { idsPasos }, usuario) {
  const ubicada = ubicarLeccion(idLeccion)
  if (!ubicada) return error('La lección no existe', 404, 'leccion_no_encontrada')
  const { fallo } = buscarCurso(ubicada.curso.idCurso, usuario)
  if (fallo) return fallo
  const bloqueo = cambioEstructural(ubicada.curso)
  if (bloqueo) return bloqueo
  if (!listaCompleta(idsPasos, ubicada.leccion.pasos, 'idPaso')) {
    return error('El nuevo orden debe incluir todos los pasos una sola vez', 400, 'orden_invalido')
  }

  reordenar(ubicada.leccion.pasos, idsPasos, 'idPaso')
  return { respuesta: ubicada.leccion.pasos.map((paso, posicion) => ({ idPaso: paso.idPaso, orden: posicion + 1 })) }
}
