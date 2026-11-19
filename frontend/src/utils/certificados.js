function esDireccionLocal(nombreHost) {
  const host = nombreHost.toLowerCase().replace(/^\[|\]$/g, '')
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return true
  if (host === '::1' || host === '0.0.0.0') return true
  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)) return true
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true
  return false
}

export function urlPublica() {
  //const configurada = import.meta.env?.VITE_URL_PUBLICA?.trim()
  const configurada = import.meta.env?.VITE_URL_PUBLICA?.trim() || globalThis.location?.origin
  if (!configurada) return null

  let url
  try {
    url = new URL(configurada)
  } catch {
    return null
  }

  if (url.protocol !== 'https:' || esDireccionLocal(url.hostname)) return null
  return url.origin
}

export function urlVerificacion(codigoVerificacion) {
  const base = urlPublica()
  if (!base || !codigoVerificacion) return null
  return `${base}/verificar/${encodeURIComponent(codigoVerificacion)}`
}

const formatoMesAnio = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Mexico_City',
  year: 'numeric',
  month: 'numeric',
})

export function urlAgregarLinkedIn(certificado) {
  const enlace = urlVerificacion(certificado.codigoVerificacion)
  if (!enlace) return null

  const partes = Object.fromEntries(
    formatoMesAnio.formatToParts(new Date(certificado.fechaEmision)).map((parte) => [parte.type, parte.value]),
  )
  const valores = {
    startTask: 'CERTIFICATION_NAME',
    name: certificado.tituloCurso,
    organizationName: 'Viva Tech',
    issueYear: partes.year,
    issueMonth: partes.month,
    certUrl: enlace,
    certId: certificado.folio,
  }
  const consulta = Object.entries(valores)
    .map(([clave, valor]) => `${clave}=${encodeURIComponent(valor)}`)
    .join('&')
  return `https://www.linkedin.com/profile/add?${consulta}`
}

export function urlCompartirLinkedIn(certificado) {
  const enlace = urlVerificacion(certificado.codigoVerificacion)
  if (!enlace) return null
  return `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(enlace)}`
}

const formatoFechaLarga = new Intl.DateTimeFormat('es-MX', {
  timeZone: 'America/Mexico_City',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

export function fechaLarga(fechaIso) {
  if (!fechaIso) return ''
  const fecha = new Date(fechaIso)
  return Number.isNaN(fecha.getTime()) ? '' : formatoFechaLarga.format(fecha)
}

const formatoAnio = new Intl.DateTimeFormat('es-MX', {
  timeZone: 'America/Mexico_City',
  year: 'numeric',
})

export function anioEmision(fechaIso) {
  if (!fechaIso) return ''
  const fecha = new Date(fechaIso)
  return Number.isNaN(fecha.getTime()) ? '' : formatoAnio.format(fecha)
}
