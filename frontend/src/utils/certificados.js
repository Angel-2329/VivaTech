export function urlPublica() {
  const configurada = import.meta.env?.VITE_URL_PUBLICA?.trim()
  return (configurada || window.location.origin).replace(/\/+$/, '')
}

export function urlVerificacion(codigoVerificacion) {
  return `${urlPublica()}/verificar/${encodeURIComponent(codigoVerificacion)}`
}

const formatoMesAnio = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Mexico_City',
  year: 'numeric',
  month: 'numeric',
})

// "Agregar a mi perfil de LinkedIn": formulario de licencias y certificaciones
export function urlAgregarLinkedIn(certificado) {
  const partes = Object.fromEntries(
    formatoMesAnio.formatToParts(new Date(certificado.fechaEmision)).map((parte) => [parte.type, parte.value]),
  )
  const valores = {
    startTask: 'CERTIFICATION_NAME',
    name: certificado.tituloCurso,
    organizationName: 'Viva Tech',
    issueYear: partes.year,
    issueMonth: partes.month,
    certUrl: urlVerificacion(certificado.codigoVerificacion),
    certId: certificado.folio,
  }
  const consulta = Object.entries(valores)
    .map(([clave, valor]) => `${clave}=${encodeURIComponent(valor)}`)
    .join('&')
  return `https://www.linkedin.com/profile/add?${consulta}`
}

// "Compartir en LinkedIn": publica la página de verificación
export function urlCompartirLinkedIn(certificado) {
  return `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(
    urlVerificacion(certificado.codigoVerificacion),
  )}`
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
