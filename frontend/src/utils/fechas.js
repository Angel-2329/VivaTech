const formatoMexico = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Mexico_City',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

export function hoyEnMexico(ahora = new Date()) {
  const partes = Object.fromEntries(formatoMexico.formatToParts(ahora).map((parte) => [parte.type, parte.value]))
  return `${partes.year}-${partes.month}-${partes.day}`
}

export function esFechaCalendario(valor) {
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false
  const fecha = new Date(`${valor}T00:00:00Z`)
  return !Number.isNaN(fecha.getTime()) && fecha.toISOString().slice(0, 10) === valor
}


export function textoFecha(valor) {
  if (!esFechaCalendario(valor)) return ''
  const [anio, mes, dia] = valor.split('-').map(Number)
  const anioActual = Number(hoyEnMexico().slice(0, 4))
  return `${dia} de ${MESES[mes - 1]}${anio === anioActual ? '' : ` de ${anio}`}`
}

export function yaCerro(fechaCierre) {
  return esFechaCalendario(fechaCierre) && fechaCierre < hoyEnMexico()
}
