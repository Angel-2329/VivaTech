function crearError(mensaje, estado, codigo) {
  return Object.assign(new Error(mensaje), { estado, codigo })
}

export async function solicitarApiPublica(ruta, { signal } = {}) {
  const urlBase = import.meta.env.VITE_API_URL?.trim()

  if (!urlBase) {
    throw crearError('Falta configurar la dirección de la API', 0, 'api_no_configurada')
  }

  let respuesta
  try {
    respuesta = await fetch(`${urlBase.replace(/\/+$/, '')}/${ruta.replace(/^\/+/, '')}`, { signal })
  } catch (error) {
    if (error.name === 'AbortError') throw error
    throw crearError(
      'No pudimos conectar con Viva Tech. Revisa tu conexión e inténtalo nuevamente',
      0,
      'error_conexion',
    )
  }

  const cuerpo = await respuesta.json().catch(() => null)

  if (!respuesta.ok) {
    throw crearError(cuerpo?.mensaje || 'No se pudo completar la solicitud', respuesta.status, cuerpo?.codigo)
  }

  return cuerpo
}
