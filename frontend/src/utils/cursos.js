export const TEXTO_ESTADO_LECCION = {
  completada: 'Terminada',
  en_progreso: 'En curso',
  pendiente: 'Sin empezar',
}


export const TEXTO_BOTON_LECCION = {
  pendiente: 'Empezar',
  en_progreso: 'Continuar',
  completada: 'Repasar',
}

export function rutaLeccion(idLeccion) {
  return `/estudiante/lecciones/${idLeccion}`
}

export function contarCompletadas(lecciones) {
  return lecciones.filter((leccion) => leccion.estado === 'completada').length
}


export function todosLosCursos(categorias) {
  return categorias.flatMap((categoria) => categoria.cursos)
}


export function cursosVigentes(categorias) {
  return todosLosCursos(categorias).filter((curso) => curso.estadoCurso !== 'retirado')
}

export function siguienteLeccion(categorias) {
  const cursos = cursosVigentes(categorias)

  for (const estado of ['en_progreso', 'pendiente']) {
    for (const curso of cursos) {
      const leccion = curso.lecciones.find((actual) => actual.estado === estado)
      if (leccion) return { curso, leccion }
    }
  }

  return null
}
