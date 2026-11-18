import { solicitarApi } from './api.js'
import { solicitarApiPublica } from './apiPublica.js'

function respuestaInvalida() {
  return Object.assign(new Error('El servidor devolvió una respuesta inesperada'), {
    estado: 0,
    codigo: 'respuesta_invalida',
  })
}

export function obtenerCertificado(idCurso) {
  return solicitarApi(`/cursos/${encodeURIComponent(idCurso)}/certificado`, { metodo: 'POST' })
}

function masRecientePrimero(a, b) {
  return (
    String(b.fechaEmision).localeCompare(String(a.fechaEmision)) ||
    String(b.folio).localeCompare(String(a.folio))
  )
}

export async function listarMisCertificados() {
  const certificados = await solicitarApi('/mis-certificados')
  if (!Array.isArray(certificados)) throw respuestaInvalida()
  return [...certificados].sort(masRecientePrimero)
}

export function verificarCertificado(codigo) {
  return solicitarApiPublica(`/certificados/verificar/${encodeURIComponent(codigo)}`)
}
