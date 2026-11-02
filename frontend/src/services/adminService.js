import { solicitarApi } from './api.js'

export function buscarCuentas({
  buscar = '',
  rol = '',
  limite = 50,
  desplazamiento = 0,
  signal,
} = {}) {
  const parametros = new URLSearchParams({
    buscar,
    rol,
    limite: String(limite),
    desplazamiento: String(desplazamiento),
  })

  return solicitarApi(`/admin/usuarios?${parametros}`, { signal })
}

export function cambiarRol(uid, rol) {
  return solicitarApi(`/admin/usuarios/${encodeURIComponent(uid)}/rol`, {
    metodo: 'PATCH',
    datos: { rol },
  })
}

export function cambiarActivo(uid, activo) {
  return solicitarApi(`/admin/usuarios/${encodeURIComponent(uid)}/activo`, {
    metodo: 'PATCH',
    datos: { activo },
  })
}

export function obtenerResumen({ signal } = {}) {
  return solicitarApi('/admin/resumen', { signal })
}

export function obtenerProgresoGeneral(
  texto = '',
  { limite = 50, desplazamiento = 0, signal } = {}
) {
  const parametros = new URLSearchParams({
    buscar: texto,
    limite: String(limite),
    desplazamiento: String(desplazamiento),
  })

  return solicitarApi(`/admin/progreso?${parametros}`, { signal })
}
