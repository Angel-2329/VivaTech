import { solicitarApi } from './api.js'

export function listarGrupos({ signal } = {}) {
  return solicitarApi('/grupos', { signal })
}

export function crearGrupo({ nombre }) {
  return solicitarApi('/grupos', {
    metodo: 'POST',
    datos: { nombre },
  })
}

export function renombrarGrupo(idGrupo, { nombre }) {
  return solicitarApi(`/grupos/${encodeURIComponent(idGrupo)}`, {
    metodo: 'PATCH',
    datos: { nombre },
  })
}

export function eliminarGrupo(idGrupo) {
  return solicitarApi(`/grupos/${encodeURIComponent(idGrupo)}`, {
    metodo: 'DELETE',
  })
}

export function obtenerGrupo(idGrupo, { signal } = {}) {
  return solicitarApi(`/grupos/${encodeURIComponent(idGrupo)}`, { signal })
}

export function agregarEstudiante(idGrupo, uid) {
  return solicitarApi(`/grupos/${encodeURIComponent(idGrupo)}/estudiantes`, {
    metodo: 'POST',
    datos: { uid },
  })
}

export function retirarEstudiante(idGrupo, uid) {
  return solicitarApi(
    `/grupos/${encodeURIComponent(idGrupo)}/estudiantes/${encodeURIComponent(uid)}`,
    { metodo: 'DELETE' }
  )
}

export function asignarMaestro(idGrupo, uid) {
  return solicitarApi(`/grupos/${encodeURIComponent(idGrupo)}/maestros`, {
    metodo: 'POST',
    datos: { uid },
  })
}

export function retirarMaestro(idGrupo, uid) {
  return solicitarApi(
    `/grupos/${encodeURIComponent(idGrupo)}/maestros/${encodeURIComponent(uid)}`,
    { metodo: 'DELETE' }
  )
}

export function buscarEstudiantes(
  texto = '',
  { limite = 50, desplazamiento = 0, signal } = {}
) {
  const parametros = new URLSearchParams({
    buscar: texto,
    limite: String(limite),
    desplazamiento: String(desplazamiento),
  })

  return solicitarApi(`/estudiantes?${parametros}`, { signal })
}
