export function plural(cantidad, singular, plural) {
  return `${cantidad} ${cantidad === 1 ? singular : plural}`
}

const formatoFecha = new Intl.DateTimeFormat('es-MX', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})


export function formatearFecha(fechaIso, textoSiNoHay = '—') {
  if (!fechaIso) return textoSiNoHay

  const fecha = new Date(fechaIso)
  if (Number.isNaN(fecha.getTime())) return textoSiNoHay

  return formatoFecha.format(fecha)
}


export function ordenarPorNombre(personas) {
  return [...personas].sort((a, b) =>
    a.nombreCompleto.localeCompare(b.nombreCompleto, 'es', { sensitivity: 'base' })
  )
}

export const NOMBRE_DEL_ROL = {
  estudiante: 'Estudiante',
  maestro: 'Maestro',
  administrador: 'Administrador',
}
