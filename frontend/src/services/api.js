import { auth } from '../config/firebase.js'

function crearError(mensaje, estado, codigo) {
  return Object.assign(new Error(mensaje), {
    estado,
    codigo,
  })
}

export async function solicitarApi(
  ruta,
  { metodo = 'GET', datos, signal } = {}
) {
  const urlBase = import.meta.env.VITE_API_URL?.trim()

  if (!urlBase) {
    throw crearError(
      'Falta configurar la dirección de la API',
      0,
      'api_no_configurada'
    )
  }

  await auth.authStateReady()

  const usuarioFirebase = auth.currentUser

  if (!usuarioFirebase) {
    throw crearError(
      'Necesitas iniciar sesión para continuar',
      401,
      'sesion_requerida'
    )
  }

  const token = await usuarioFirebase.getIdToken()

  const headers = {
    Authorization: `Bearer ${token}`,
  }

  if (datos !== undefined) {
    headers['Content-Type'] = 'application/json'
  }

  let respuesta

  try {
    respuesta = await fetch(
      `${urlBase.replace(/\/+$/, '')}/${ruta.replace(/^\/+/, '')}`,
      {
        method: metodo,
        headers,
        body: datos === undefined ? undefined : JSON.stringify(datos),
        signal,
      }
    )
  } catch (error) {
    if (error.name === 'AbortError') {
      throw error
    }

    throw crearError(
      'No pudimos conectar con Viva Tech. Revisa tu conexión e inténtalo nuevamente',
      0,
      'error_conexion'
    )
  }

  const cuerpo = await respuesta.json().catch(() => null)

  if (!respuesta.ok) {
    throw crearError(
      cuerpo?.mensaje || 'No se pudo completar la solicitud',
      respuesta.status,
      cuerpo?.codigo
    )
  }

  if (cuerpo === null) {
    throw crearError(
      'El servidor devolvió una respuesta inesperada',
      respuesta.status,
      'respuesta_invalida'
    )
  }

  return cuerpo
}