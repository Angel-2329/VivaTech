// Bloqueo temporal hasta conectar la API real de certificados en el bloque 3.
// No mezclar progreso real con emisiones o verificaciones simuladas.
function rechazarOperacionPendiente() {
  throw Object.assign(
    new Error('Los certificados todavía no están disponibles en esta versión. Tu avance en los cursos sigue guardado.'),
    { estado: 503, codigo: 'certificados_pendientes_integracion' },
  )
}

export async function obtenerCertificado() {
  return rechazarOperacionPendiente()
}

export async function listarMisCertificados() {
  return rechazarOperacionPendiente()
}

// La futura consulta pública utilizará apiPublica.js, sin token.
export async function verificarCertificado() {
  return rechazarOperacionPendiente()
}
