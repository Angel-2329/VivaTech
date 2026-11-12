// AVANCE SIMULADO del alumno con sesión (Sprint 4, tarea 3.23.1).
import { CATEGORIAS } from './contenidoDePrueba.js'
import { CURSO_RETIRADO, FECHAS_CIERRE, estadoSegunFecha } from './estadoCursosDePrueba.js'


const progresos = new Map([
  ['21', { estado: 'completada', idUltimoPasoCompletado: '106', fechaFinalizacion: '2026-11-03T17:30:00.000Z' }],
  ['22', { estado: 'en_progreso', idUltimoPasoCompletado: '108', fechaFinalizacion: null }],
])

const certificados = new Map()

function buscarLeccion(idLeccion) {
  for (const categoria of CATEGORIAS) {
    for (const curso of categoria.cursos) {
      const posicion = curso.lecciones.findIndex((leccion) => leccion.idLeccion === idLeccion)
      if (posicion !== -1) {
        return { curso, leccion: curso.lecciones[posicion], posicion }
      }
    }
  }
  return null
}

function estadoDe(idLeccion) {
  return progresos.get(idLeccion)?.estado ?? 'pendiente'
}

function cursoCompletado(curso) {
  return curso.lecciones.length > 0 && curso.lecciones.every((leccion) => estadoDe(leccion.idLeccion) === 'completada')
}

function resumenProgreso(leccion) {
  const guardado = progresos.get(leccion.idLeccion)
  const totalPasos = leccion.pasos.length

  if (!guardado) {
    return {
      estado: 'pendiente',
      idUltimoPasoCompletado: null,
      idPasoParaContinuar: leccion.pasos[0]?.idPaso ?? null,
      pasosCompletados: 0,
      totalPasos,
      fechaFinalizacion: null,
    }
  }

  if (guardado.estado === 'completada') {
    return {
      estado: 'completada',
      idUltimoPasoCompletado: guardado.idUltimoPasoCompletado,
      idPasoParaContinuar: null,
      pasosCompletados: totalPasos,
      totalPasos,
      fechaFinalizacion: guardado.fechaFinalizacion,
    }
  }

  const pasosCompletados = leccion.pasos.findIndex((paso) => paso.idPaso === guardado.idUltimoPasoCompletado) + 1

  return {
    estado: 'en_progreso',
    idUltimoPasoCompletado: guardado.idUltimoPasoCompletado,
    idPasoParaContinuar: leccion.pasos[pasosCompletados]?.idPaso ?? null,
    pasosCompletados,
    totalPasos,
    fechaFinalizacion: null,
  }
}

function tieneAvance(curso) {
  return curso.lecciones.some((leccion) => estadoDe(leccion.idLeccion) !== 'pendiente')
}

function resumenCursoAlumno(curso) {
  const fechaCierre = FECHAS_CIERRE[curso.idCurso] ?? null
  return {
    idCurso: curso.idCurso,
    titulo: curso.titulo,
    descripcion: curso.descripcion,
    estadoCurso: estadoSegunFecha(fechaCierre),
    fechaCierre,
    cursoCompletado: cursoCompletado(curso),
    certificado: certificados.get(curso.idCurso) ?? null,
    lecciones: curso.lecciones.map((leccion) => ({
      idLeccion: leccion.idLeccion,
      titulo: leccion.titulo,
      duracionEstimadaMinutos: leccion.duracionEstimadaMinutos,
      estado: estadoDe(leccion.idLeccion),
    })),
  }
}

// Un curso retirado llega solo con su resumen y lecciones: []
function resumenCursoRetirado() {
  return {
    idCurso: CURSO_RETIRADO.idCurso,
    titulo: CURSO_RETIRADO.titulo,
    descripcion: CURSO_RETIRADO.descripcion,
    estadoCurso: 'retirado',
    fechaCierre: null,
    cursoCompletado: CURSO_RETIRADO.cursoCompletado,
    certificado: certificados.get(CURSO_RETIRADO.idCurso) ?? null,
    lecciones: [],
  }
}

// GET /api/mis-cursos
// Un curso cerrado solo aparece si el alumno ya tiene avance en él.
export function armarMisCursos() {
  return CATEGORIAS.map((categoria) => {
    const cursos = categoria.cursos
      .filter((curso) => estadoSegunFecha(FECHAS_CIERRE[curso.idCurso]) !== 'cerrado' || tieneAvance(curso))
      .map(resumenCursoAlumno)

    if (CURSO_RETIRADO.idCategoria === categoria.idCategoria) cursos.push(resumenCursoRetirado())

    return { idCategoria: categoria.idCategoria, nombre: categoria.nombre, cursos }
  }).filter((categoria) => categoria.cursos.length > 0)
}

// GET /api/lecciones/:idLeccion  (null si no existe)
export function armarLeccion(idLeccion) {
  const encontrada = buscarLeccion(idLeccion)
  if (!encontrada) return null

  const { curso, leccion, posicion } = encontrada
  const siguiente = curso.lecciones[posicion + 1]

  return {
    idLeccion: leccion.idLeccion,
    idCurso: curso.idCurso,
    tituloCurso: curso.titulo,
    titulo: leccion.titulo,
    objetivo: leccion.objetivo,
    duracionEstimadaMinutos: leccion.duracionEstimadaMinutos,
    progreso: resumenProgreso(leccion),
    siguienteLeccion: siguiente ? { idLeccion: siguiente.idLeccion, titulo: siguiente.titulo } : null,
    pasos: leccion.pasos,
  }
}

// PUT /api/lecciones/:idLeccion/progreso
// Devuelve { respuesta } si se aceptó, o { error: { mensaje, estado, codigo } }.
export function registrarPaso(idLeccion, idPaso) {
  const encontrada = buscarLeccion(idLeccion)
  if (!encontrada) {
    return { error: { mensaje: 'No encontramos esta lección', estado: 404, codigo: 'leccion_no_encontrada' } }
  }

  const { curso, leccion } = encontrada
  const posicionPaso = leccion.pasos.findIndex((paso) => paso.idPaso === idPaso)
  if (posicionPaso === -1) {
    return { error: { mensaje: 'Ese paso no pertenece a esta lección', estado: 400, codigo: 'paso_invalido' } }
  }

  const antes = resumenProgreso(leccion)

  // Solo se acepta el siguiente paso pendiente o uno que ya estaba hecho.
  if (posicionPaso > antes.pasosCompletados) {
    return {
      error: { mensaje: 'Completa el paso anterior para continuar.', estado: 409, codigo: 'paso_fuera_de_secuencia' },
    }
  }

  // Paso nuevo de una lección sin terminar: avanza. Si es el último, la completa.
  if (antes.estado !== 'completada' && posicionPaso === antes.pasosCompletados) {
    const esUltimo = posicionPaso === leccion.pasos.length - 1
    progresos.set(leccion.idLeccion, {
      estado: esUltimo ? 'completada' : 'en_progreso',
      idUltimoPasoCompletado: idPaso,
      fechaFinalizacion: esUltimo ? new Date().toISOString() : null,
    })
  }

  const despues = resumenProgreso(leccion)

  return {
    respuesta: {
      idLeccion: leccion.idLeccion,
      ...despues,
      leccionCompletada: despues.estado === 'completada',
      cursoCompletado: cursoCompletado(curso),
    },
  }
}
