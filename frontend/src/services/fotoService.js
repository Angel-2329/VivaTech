import { solicitarApi } from './api.js'

export function subirFotoPerfil(foto) {
  const formulario = new FormData()
  formulario.append('foto', foto, 'foto.jpg')
  return solicitarApi('/perfil/foto', { metodo: 'PUT', datos: formulario })
}

export function quitarFotoPerfil() {
  return solicitarApi('/perfil/foto', { metodo: 'DELETE' })
}

export function obtenerFotoUsuario(uid, { signal } = {}) {
  return solicitarApi(`/usuarios/${encodeURIComponent(uid)}/foto`, { signal, formato: 'blob' })
}
