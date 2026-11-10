import { CATEGORIAS } from './contenidoDePrueba.js'
import { armarMisCursos } from './progresoDePrueba.js'


const YO = '__yo__'
const ADMIN = { uid: 'admin-demo', nombreCompleto: 'Administración Viva Tech' }
const OTRA_MAESTRA = { uid: 'maestra-demo', nombreCompleto: 'Laura Pérez Gómez' }

let siguienteIdCategoria = 3
let siguienteIdCurso = 15
let siguienteIdLeccion = 90

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
      fechaCierre: null,
      autor: ADMIN,
      lecciones: curso.lecciones,
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
    idCurso: '13',
    idCategoria: '1',
    orden: 2,
    titulo: 'Usar el cajero automático',
    descripcion: 'Retira efectivo y consulta tu saldo en el cajero sin prisas.',
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
  return { ...resumenCurso(curso, usuario), lecciones: curso.lecciones }
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
