/* eslint-disable react-refresh/only-export-components */
// Guarda quién entró (teléfono, nombre, rol) para que TODAS las pantallas lo puedan leer.

import { createContext, useContext, useState } from 'react'

const SesionContext = createContext(null)
const CLAVE_GUARDADO = 'vt-sesion'

function leerSesionGuardada() {
  try {
    return JSON.parse(localStorage.getItem(CLAVE_GUARDADO))
  } catch {
    return null
  }
}

export function SesionProvider({ children }) {
  const [usuario, setUsuario] = useState(leerSesionGuardada)

  function guardar(nuevoUsuario) {
    setUsuario(nuevoUsuario)
    try {
      if (nuevoUsuario) localStorage.setItem(CLAVE_GUARDADO, JSON.stringify(nuevoUsuario))
      else localStorage.removeItem(CLAVE_GUARDADO)
    } catch {
      // Si el navegador no deja guardar, la sesión dura mientras la página esté abierta
    }
  }

  const valor = {
    usuario,
    iniciarSesion: (datos) => guardar(datos),
    // nombre puede ir vacío si la persona eligió "Omitir este paso"
    guardarNombre: (nombre) => guardar({ ...usuario, nombre, primerAcceso: false }),
    cerrarSesion: () => guardar(null),
  }

  return <SesionContext.Provider value={valor}>{children}</SesionContext.Provider>
}

export function useSesion() {
  return useContext(SesionContext)
}
