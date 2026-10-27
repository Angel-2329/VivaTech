import { solicitarApi } from './api.js'

export function obtenerPerfil({ signal } = {}) {
  return solicitarApi('/perfil', { signal })
}

export async function guardarPerfil({ nombreCompleto, apodo }) {
  try {
    const usuario = await solicitarApi('/perfil', {
      metodo: 'POST',
      datos: {
        nombreCompleto,
        apodo,
      },
    })

    return {
      ok: true,
      usuario,
    }
  } catch (error) {
    return {
      ok: false,
      mensaje: error.estado !== undefined
        ? error.message
        : 'No pudimos guardar tu perfil. Inténtalo nuevamente',
      codigo: error.codigo,
      estado: error.estado,
    }
  }
}