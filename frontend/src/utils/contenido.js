import { esFechaCalendario, hoyEnMexico } from './fechas.js'

export const LIMITES = {
  nombreCategoria: 60,
  tituloCurso: 100,
  descripcionCurso: 300,
}

export const ESTADO_CURSO = {
  borrador: { texto: 'Borrador', clase: 'vt-badge vt-badge-warning', icono: 'edit_note' },
  publicado: { texto: 'Publicado', clase: 'vt-badge vt-badge-success', icono: 'public' },
  retirado: { texto: 'Retirado', clase: 'vt-badge vt-badge-neutral', icono: 'archive' },
}


export function revisarTexto(valor, maximo, queEs) {
  const largo = Array.from(valor.trim()).length
  if (largo === 0) return `Escribe ${queEs}.`
  if (largo > maximo) return `${mayuscula(queEs)} puede tener hasta ${maximo} caracteres. Ahora tiene ${largo}.`
  return ''
}


export function revisarFechaCierre(valor) {
  if (!valor) return ''
  if (!esFechaCalendario(valor)) return 'Escribe una fecha completa: día, mes y año.'
  if (valor < hoyEnMexico()) return 'La fecha debe ser de hoy en adelante.'
  return ''
}

function mayuscula(texto) {
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}
