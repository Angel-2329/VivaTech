import { revisarTexto } from './contenido.js'
import { esIdVideo, extraerIdVideo } from './youtube.js'

export const LIMITES_PASO = {
  titulo: 100,
  objetivo: 200,
  instruccion: 300,
  pregunta: 200,
  opcion: 100,
  pista: 200,
  mensajeAcierto: 150,
  tituloPantalla: 40,
  subtituloPantalla: 80,
  elementoLista: 150,
  aviso: 200,
  alt: 80,
  tituloVideo: 100,
}

export const MAX_LECCIONES = 10
export const MIN_PASOS_PUBLICAR = 3
export const MAX_PASOS = 8
export const MIN_OPCIONES = 2
export const MAX_OPCIONES = { toque: 6, opcion: 4 }
export const MIN_ELEMENTOS_LISTA = 2
export const MAX_ELEMENTOS_LISTA = 5

export const TIPOS_ACTIVIDAD = {
  lectura: 'Lectura (teoría)',
  toque: 'Toca el botón correcto',
  opcion: 'Elige la respuesta correcta',
}

export const TIPOS_RECURSO = {
  icono: 'Ícono',
  lista: 'Lista',
  aviso: 'Aviso importante',
  video: 'Video de YouTube',
}

// Un video por paso y solo en pasos de lectura (3.24.8)
export function puedeLlevarVideo(paso) {
  return paso.actividad.tipo === 'lectura' && !paso.recursos.some((recurso) => recurso.tipo === 'video')
}

// ---- Formas vacías ----

export function leccionVacia() {
  return { titulo: '', objetivo: '', duracionEstimadaMinutos: 5 }
}

export function pasoVacio() {
  return { instruccion: '', recursos: [], actividad: { tipo: 'lectura' } }
}

export function recursoVacio(tipo) {
  if (tipo === 'icono') return { tipo, nombre: '', alt: '' }
  if (tipo === 'lista') return { tipo, elementos: ['', ''] }
  // Video nuevo: el editor manda el enlace (url) y el backend guarda solo el idVideo
  if (tipo === 'video') return { tipo, url: '', titulo: '' }
  return { tipo: 'aviso', texto: '' }
}

// Los ID de opción los pone el editor: a, b, c… (el maestro no los escribe)
export function nuevoIdOpcion(opciones) {
  const usados = new Set(opciones.map((opcion) => opcion.id))
  for (const letra of 'abcdefghij') {
    if (!usados.has(letra)) return letra
  }
  let numero = opciones.length + 1
  while (usados.has(`op${numero}`)) numero++
  return `op${numero}`
}

function opcionesVacias(cantidad) {
  const opciones = []
  for (let i = 0; i < cantidad; i++) opciones.push({ id: nuevoIdOpcion(opciones), texto: '' })
  return opciones
}

// Al cambiar el tipo se conservan las opciones, la pista y el mensaje si sirven
export function cambiarTipoActividad(actividad, tipo) {
  if (tipo === 'lectura') return { tipo: 'lectura' }

  const anterior = actividad.tipo === 'lectura' ? null : actividad
  const opciones = (anterior?.opciones ?? opcionesVacias(3)).slice(0, MAX_OPCIONES[tipo])
  const correcta = opciones.some((opcion) => opcion.id === anterior?.correcta) ? anterior.correcta : ''
  const comunes = { opciones, correcta, pista: anterior?.pista ?? '', mensajeAcierto: anterior?.mensajeAcierto ?? '' }

  if (tipo === 'toque') {
    return { tipo, pantalla: anterior?.pantalla ?? { titulo: '', subtitulo: '' }, ...comunes }
  }
  return { tipo, pregunta: anterior?.pregunta ?? '', ...comunes }
}


function recortar(texto) {
  return typeof texto === 'string' ? texto.trim() : texto
}

// "youtu.be/abc" -> "https://youtu.be/abc", para mandar siempre el enlace completo
function conProtocolo(enlace) {
  return !enlace || /^https?:\/\//i.test(enlace) ? enlace : `https://${enlace}`
}


export function limpiarPaso(paso) {
  const recursos = paso.recursos.map((recurso) => {
    if (recurso.tipo === 'icono') return { tipo: 'icono', nombre: recortar(recurso.nombre), alt: recortar(recurso.alt) }
    if (recurso.tipo === 'lista') return { tipo: 'lista', elementos: recurso.elementos.map(recortar) }
    if (recurso.tipo === 'aviso') return { tipo: 'aviso', texto: recortar(recurso.texto) }
    // Nunca se mandan url e idVideo juntos: enlace nuevo con url, video existente con idVideo
    if (recurso.tipo === 'video') {
      if (recurso.url !== undefined) return { tipo: 'video', url: conProtocolo(recortar(recurso.url)), titulo: recortar(recurso.titulo) }
      return { tipo: 'video', plataforma: 'youtube', idVideo: recurso.idVideo, titulo: recortar(recurso.titulo) }
    }
    return recurso
  })

  const { actividad } = paso
  let limpia = { tipo: 'lectura' }

  if (actividad.tipo !== 'lectura') {
    limpia = {
      tipo: actividad.tipo,
      opciones: actividad.opciones.map((opcion) => {
        const nueva = { id: opcion.id, texto: recortar(opcion.texto) }
        if (actividad.tipo === 'toque' && recortar(opcion.icono)) nueva.icono = recortar(opcion.icono)
        return nueva
      }),
      correcta: actividad.correcta,
      pista: recortar(actividad.pista),
      mensajeAcierto: recortar(actividad.mensajeAcierto),
    }
    if (actividad.tipo === 'toque') {
      limpia.pantalla = { titulo: recortar(actividad.pantalla.titulo) }
      if (recortar(actividad.pantalla.subtitulo)) limpia.pantalla.subtitulo = recortar(actividad.pantalla.subtitulo)
    } else {
      limpia.pregunta = recortar(actividad.pregunta)
    }
  }

  return { instruccion: recortar(paso.instruccion), recursos, actividad: limpia }
}


export function validarLeccion({ titulo, objetivo, duracionEstimadaMinutos }) {
  const errores = {}
  const problemaTitulo = revisarTexto(titulo, LIMITES_PASO.titulo, 'el título de la lección')
  const problemaObjetivo = revisarTexto(objetivo, LIMITES_PASO.objetivo, 'lo que se va a aprender')
  if (problemaTitulo) errores.titulo = problemaTitulo
  if (problemaObjetivo) errores.objetivo = problemaObjetivo
  const minutos = Number(duracionEstimadaMinutos)
  if (!Number.isInteger(minutos) || minutos < 1 || minutos > 15) {
    errores.duracionEstimadaMinutos = 'La duración debe ser un número entero de 1 a 15 minutos.'
  }
  return errores
}

export function validarPaso(paso) {
  const errores = {}
  const revisar = (ruta, valor, maximo, queEs) => {
    const problema = revisarTexto(valor ?? '', maximo, queEs)
    if (problema) errores[ruta] = problema
  }

  revisar('instruccion', paso.instruccion, LIMITES_PASO.instruccion, 'el texto del paso')

  paso.recursos.forEach((recurso, posicion) => {
    const ruta = `recursos.${posicion}`
    if (recurso.tipo === 'icono') {
      if (!recortar(recurso.nombre)) errores[`${ruta}.nombre`] = 'Elige el ícono.'
      revisar(`${ruta}.alt`, recurso.alt, LIMITES_PASO.alt, 'qué muestra el ícono')
    }
    if (recurso.tipo === 'lista') {
      recurso.elementos.forEach((elemento, numero) => {
        revisar(`${ruta}.elementos.${numero}`, elemento, LIMITES_PASO.elementoLista, `el punto ${numero + 1} de la lista`)
      })
    }
    if (recurso.tipo === 'aviso') revisar(`${ruta}.texto`, recurso.texto, LIMITES_PASO.aviso, 'el aviso')
    if (recurso.tipo === 'video') {
      if (paso.actividad.tipo !== 'lectura') {
        errores[ruta] = 'El video solo se puede usar en pasos de lectura.'
      } else if (recurso.url !== undefined && !extraerIdVideo(recurso.url)) {
        errores[`${ruta}.url`] = recortar(recurso.url)
          ? 'Ese enlace no es de un video de YouTube. Cópialo desde el botón "Compartir" del video.'
          : 'Pega el enlace del video de YouTube.'
      } else if (recurso.url === undefined && !esIdVideo(recurso.idVideo)) {
        errores[`${ruta}.url`] = 'Este video no es válido. Usa "Cambiar enlace" y pega otro.'
      }
      revisar(`${ruta}.titulo`, recurso.titulo, LIMITES_PASO.tituloVideo, 'el título del video')
    }
  })
  if (paso.recursos.filter((recurso) => recurso.tipo === 'video').length > 1) {
    errores.recursos = 'Un paso puede tener solo un video.'
  }

  const { actividad } = paso
  if (actividad.tipo === 'lectura') return errores

  if (actividad.tipo === 'toque') {
    revisar('actividad.pantalla.titulo', actividad.pantalla?.titulo, LIMITES_PASO.tituloPantalla, 'el título de la pantalla')
    if (recortar(actividad.pantalla?.subtitulo)) {
      revisar('actividad.pantalla.subtitulo', actividad.pantalla.subtitulo, LIMITES_PASO.subtituloPantalla, 'el subtítulo')
    }
  } else {
    revisar('actividad.pregunta', actividad.pregunta, LIMITES_PASO.pregunta, 'la pregunta')
  }

  const maximo = MAX_OPCIONES[actividad.tipo]
  if (actividad.opciones.length < MIN_OPCIONES || actividad.opciones.length > maximo) {
    errores['actividad.opciones'] = `Debe haber de ${MIN_OPCIONES} a ${maximo} opciones.`
  }
  actividad.opciones.forEach((opcion, numero) => {
    revisar(`actividad.opciones.${numero}.texto`, opcion.texto, LIMITES_PASO.opcion, `el texto de la opción ${numero + 1}`)
  })
  if (!actividad.opciones.some((opcion) => opcion.id === actividad.correcta)) {
    errores['actividad.correcta'] = 'Marca cuál es la opción correcta.'
  }
  revisar('actividad.pista', actividad.pista, LIMITES_PASO.pista, 'la pista')
  revisar('actividad.mensajeAcierto', actividad.mensajeAcierto, LIMITES_PASO.mensajeAcierto, 'el mensaje de acierto')

  return errores
}

export function estructuraPaso(paso) {
  const { actividad } = paso
  return JSON.stringify({
    tipo: actividad.tipo,
    recursos: paso.recursos.map((recurso) => {
      if (recurso.tipo === 'lista') return `lista:${recurso.elementos.length}`
      if (recurso.tipo === 'video') return `video:${recurso.idVideo ?? `enlace:${recurso.url}`}`
      return `${recurso.tipo}:${recurso.nombre ?? ''}`
    }),
    opciones: actividad.opciones?.map((opcion) => `${opcion.id}:${opcion.icono ?? ''}`) ?? [],
    correcta: actividad.correcta ?? null,
    // Solo se corrigen subtítulos existentes: agregarlo o quitarlo cambia la estructura
    subtitulo: Boolean(actividad.pantalla?.subtitulo),
  })
}

export function rutaDelServidor(ruta) {
  return String(ruta ?? '')
    .replace(/^(paso|leccion)\.?/, '')
    .replace(/\[(\d+)\]/g, '.$1')
}

// Errores de 400 contenido_invalido convertidos a { rutaDelFormulario: mensaje }
export function erroresDelServidor(error) {
  if (!Array.isArray(error?.errores)) return {}
  return Object.fromEntries(
    error.errores
      .filter((detalle) => detalle?.ruta && detalle?.mensaje)
      .map((detalle) => [rutaDelServidor(detalle.ruta), detalle.mensaje]),
  )
}

// Para publicar: de 1 a 10 lecciones, cada una de 3 a 8 pasos y con al menos una práctica.
// Devuelve el primer problema en palabras sencillas, o '' si se puede publicar.
export function problemaParaPublicar(lecciones) {
  if (lecciones.length === 0) return 'Agrega al menos una lección antes de publicar el curso.'
  if (lecciones.length > MAX_LECCIONES) return `Un curso puede tener hasta ${MAX_LECCIONES} lecciones.`
  for (const leccion of lecciones) {
    if (leccion.pasos.length < MIN_PASOS_PUBLICAR) {
      return `La lección "${leccion.titulo}" necesita al menos ${MIN_PASOS_PUBLICAR} pasos.`
    }
    if (!leccion.pasos.some((paso) => paso.actividad.tipo !== 'lectura')) {
      return `La lección "${leccion.titulo}" necesita al menos una práctica (toque u opción).`
    }
  }
  return ''
}
