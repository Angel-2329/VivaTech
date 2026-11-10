import { CATEGORIAS } from './contenidoDePrueba.js'
import { armarMisCursos } from './progresoDePrueba.js'


const YO = '__yo__'
const ADMIN = { uid: 'admin-demo', nombreCompleto: 'Administración Viva Tech' }
const OTRA_MAESTRA = { uid: 'maestra-demo', nombreCompleto: 'Laura Pérez Gómez' }

let siguienteIdCategoria = 3
let siguienteIdCurso = 15

const categorias = CATEGORIAS.map((categoria, posicion) => ({
  idCategoria: categoria.idCategoria,
  nombre: categoria.nombre,
  orden: posicion + 1,
}))

const cursos = [
  ...CATEGORIAS.flatMap((categoria) =>
    categoria.cursos.map((curso) => ({
      idCurso: curso.idCurso,
      idCategoria: categoria.idCategoria,
      titulo: curso.titulo,
      descripcion: curso.descripcion,
      estadoPublicacion: 'publicado',
      fechaCierre: null,
      creadoPor: ADMIN,
      totalLecciones: curso.lecciones.length,
      avanceFijo: null,
    })),
  ),
  {
    idCurso: '12',
    idCategoria: '2',
    titulo: 'Hacer compras en línea con seguridad',
    descripcion: 'Aprende a revisar una tienda en línea antes de pagar y a guardar tu comprobante.',
    estadoPublicacion: 'borrador',
    fechaCierre: null,
    creadoPor: { uid: YO },
    totalLecciones: 2,
    avanceFijo: false,
  },
  {
    idCurso: '13',
    idCategoria: '1',
    titulo: 'Usar el cajero automático',
    descripcion: 'Retira efectivo y consulta tu saldo en el cajero sin prisas.',
    estadoPublicacion: 'retirado',
    fechaCierre: null,
    creadoPor: { uid: YO },
    totalLecciones: 0,
    avanceFijo: true,
  },
  {
    idCurso: '14',
    idCategoria: '2',
    titulo: 'Recargar saldo al celular',
    descripcion: 'Recarga tiempo aire desde la aplicación de tu banco.',
    estadoPublicacion: 'borrador',
    fechaCierre: null,
    creadoPor: OTRA_MAESTRA,
    totalLecciones: 1,
    avanceFijo: false,
  },
]

function error(mensaje, estado, codigo) {
  return { error: { mensaje, estado, codigo } }
}

function esAutor(curso, usuario) {
  return curso.creadoPor.uid === YO || curso.creadoPor.uid === usuario.uid
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

function cursoParaRespuesta(curso, usuario) {
  const autor = curso.creadoPor.uid === YO ? usuario : curso.creadoPor
  return {
    idCurso: curso.idCurso,
    idCategoria: curso.idCategoria,
    titulo: curso.titulo,
    descripcion: curso.descripcion,
    estadoPublicacion: curso.estadoPublicacion,
    fechaCierre: curso.fechaCierre,
    creadoPor: { uid: autor.uid, nombreCompleto: autor.nombreCompleto },
    puedeEditar: puedeEditar(curso, usuario),
    tieneAvance: tieneAvance(curso),
    totalLecciones: curso.totalLecciones,
  }
}

function categoriaParaRespuesta(categoria, usuario) {
  return {
    ...categoria,
    cursos: cursos
      .filter((curso) => curso.idCategoria === categoria.idCategoria)
      .map((curso) => cursoParaRespuesta(curso, usuario)),
  }
}

function ordenarCategorias() {
  categorias.sort((a, b) => a.orden - b.orden)
  categorias.forEach((categoria, posicion) => {
    categoria.orden = posicion + 1
  })
}

function buscarCursoEditable(idCurso, usuario) {
  const curso = cursos.find((actual) => actual.idCurso === idCurso)
  if (!curso) return { fallo: error('El curso no existe', 404, 'curso_no_encontrado') }
  if (usuario.rol === 'maestro' && !esAutor(curso, usuario)) {
    return { fallo: error('Solo puedes modificar los cursos que tú creaste', 403, 'curso_ajeno') }
  }
  if (curso.estadoPublicacion === 'retirado') {
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
  return categorias.map((categoria) => categoriaParaRespuesta(categoria, usuario))
}

export function crearCursoPrueba({ idCategoria, titulo, descripcion }, usuario) {
  if (!categorias.some((categoria) => categoria.idCategoria === idCategoria)) {
    return error('La categoría no existe', 404, 'categoria_no_encontrada')
  }
  const curso = {
    idCurso: String(siguienteIdCurso++),
    idCategoria,
    titulo,
    descripcion,
    estadoPublicacion: 'borrador',
    fechaCierre: null,
    creadoPor: { uid: usuario.uid, nombreCompleto: usuario.nombreCompleto },
    totalLecciones: 0,
    avanceFijo: false,
  }
  cursos.push(curso)
  return { respuesta: cursoParaRespuesta(curso, usuario) }
}

export function cambiarCursoPrueba(idCurso, cambios, usuario) {
  const { curso, fallo } = buscarCursoEditable(idCurso, usuario)
  if (fallo) return fallo

  if (cambios.idCategoria !== undefined) {
    const sinPermiso = soloAdministrador(usuario)
    if (sinPermiso) return sinPermiso
    if (!categorias.some((categoria) => categoria.idCategoria === cambios.idCategoria)) {
      return error('La categoría no existe', 404, 'categoria_no_encontrada')
    }
    curso.idCategoria = cambios.idCategoria
  }

  if (cambios.estadoPublicacion === 'publicado') {
    if (curso.totalLecciones === 0) {
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

  return { respuesta: cursoParaRespuesta(curso, usuario) }
}

export function eliminarCursoPrueba(idCurso, usuario) {
  const { curso, fallo } = buscarCursoEditable(idCurso, usuario)
  if (fallo) return fallo

  if (tieneAvance(curso)) {
    curso.estadoPublicacion = 'retirado'
    curso.totalLecciones = 0
    return { respuesta: { resultado: 'retirado' } }
  }

  cursos.splice(cursos.indexOf(curso), 1)
  return { respuesta: { resultado: 'eliminado' } }
}

export function crearCategoriaPrueba({ nombre }, usuario) {
  const sinPermiso = soloAdministrador(usuario)
  if (sinPermiso) return sinPermiso
  if (categorias.some((categoria) => categoria.nombre.toLowerCase() === nombre.toLowerCase())) {
    return error('Ya existe una categoría con ese nombre', 409, 'categoria_duplicada')
  }
  const categoria = { idCategoria: String(siguienteIdCategoria++), nombre, orden: categorias.length + 1 }
  categorias.push(categoria)
  return { respuesta: categoriaParaRespuesta(categoria, usuario) }
}

export function cambiarCategoriaPrueba(idCategoria, cambios, usuario) {
  const sinPermiso = soloAdministrador(usuario)
  if (sinPermiso) return sinPermiso
  const categoria = categorias.find((actual) => actual.idCategoria === idCategoria)
  if (!categoria) return error('La categoría no existe', 404, 'categoria_no_encontrada')

  if (cambios.nombre !== undefined) {
    const repetida = categorias.some(
      (otra) => otra !== categoria && otra.nombre.toLowerCase() === cambios.nombre.toLowerCase(),
    )
    if (repetida) return error('Ya existe una categoría con ese nombre', 409, 'categoria_duplicada')
    categoria.nombre = cambios.nombre
  }

 
  if (cambios.orden !== undefined) {
    const destino = Math.min(Math.max(cambios.orden, 1), categorias.length)
    ordenarCategorias()
    categorias.splice(categorias.indexOf(categoria), 1)
    categorias.splice(destino - 1, 0, categoria)
    categorias.forEach((actual, posicion) => {
      actual.orden = posicion + 1
    })
  }

  return { respuesta: categoriaParaRespuesta(categoria, usuario) }
}

export function eliminarCategoriaPrueba(idCategoria, usuario) {
  const sinPermiso = soloAdministrador(usuario)
  if (sinPermiso) return sinPermiso
  const categoria = categorias.find((actual) => actual.idCategoria === idCategoria)
  if (!categoria) return error('La categoría no existe', 404, 'categoria_no_encontrada')
  if (cursos.some((curso) => curso.idCategoria === idCategoria)) {
    return error('La categoría tiene cursos, aunque sean retirados', 409, 'categoria_con_cursos')
  }
  categorias.splice(categorias.indexOf(categoria), 1)
  ordenarCategorias()
  return { respuesta: null }
}
