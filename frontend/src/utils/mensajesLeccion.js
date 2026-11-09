const MENSAJES_AVANCE = [
  '¡Muy bien! Tu avance quedó guardado',
  '¡Vas muy bien! Paso guardado',
  '¡Excelente! Sigue así',
]

export function mensajeDeAvance(numeroPaso) {
  return MENSAJES_AVANCE[numeroPaso % MENSAJES_AVANCE.length]
}

const ERRORES_AL_GUARDAR = {
  error_conexion: 'Parece que no hay internet. Revisa tu conexión y vuelve a intentarlo.',
  paso_fuera_de_secuencia: 'Primero termina el paso anterior. Regresa con "Paso anterior".',
  curso_cerrado: 'Este curso ya cerró y no se puede empezar. Pregunta a tu maestra o maestro.',
  curso_retirado: 'Este curso fue retirado y ya no se puede avanzar.',
  sesion_requerida: 'Tu sesión terminó. Vuelve a entrar para seguir con la lección.',
}

export function mensajeErrorAlGuardar(error) {
  return ERRORES_AL_GUARDAR[error?.codigo] ?? 'Algo falló al guardar. Espera un momento y vuelve a intentarlo.'
}


export function sePuedeReintentar(error) {
  return !['paso_fuera_de_secuencia', 'curso_cerrado', 'curso_retirado', 'sesion_requerida'].includes(
    error?.codigo,
  )
}
