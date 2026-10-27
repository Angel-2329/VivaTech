/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
import { onAuthStateChanged, signOut } from 'firebase/auth'
import { auth } from '../config/firebase.js'
import { obtenerPerfil } from '../services/perfilService.js'

const SesionContext = createContext(null)

const ROLES_VALIDOS = ['estudiante', 'maestro', 'administrador']

export function SesionProvider({ children }) {
  const [usuario, setUsuario] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [errorSesion, setErrorSesion] = useState('')
  const [mensajeSesion, setMensajeSesion] = useState('')

  const solicitudActual = useRef(0)

  const refrescarPerfil = useCallback(async () => {
    const solicitud = ++solicitudActual.current
    const identidad = auth.currentUser

    setUsuario(null)
    setCargando(true)
    setErrorSesion('')

    if (!identidad) {
      setCargando(false)
      return null
    }

    setMensajeSesion('')

    const sigueVigente = () =>
      solicitud === solicitudActual.current
      && auth.currentUser?.uid === identidad.uid

    try {
      const perfil = await obtenerPerfil()

      if (!sigueVigente()) return null

      if (
        perfil.uid !== identidad.uid
        || typeof perfil.nombreCompleto !== 'string'
        || !perfil.nombreCompleto.trim()
        || !ROLES_VALIDOS.includes(perfil.rol)
      ) {
        throw new Error('Respuesta de perfil inesperada')
      }

      setUsuario(perfil)
      setCargando(false)

      return perfil
    } catch (error) {
      if (!sigueVigente()) return null

      if (
        error.estado === 404
        && error.codigo === 'perfil_no_registrado'
      ) {
        const perfilPendiente = {
          uid: identidad.uid,
          nombreCompleto: null,
          apodo: null,
          rol: null,
        }

        setUsuario(perfilPendiente)
        setCargando(false)

        return perfilPendiente
      }

      if (
        error.estado === 403
        && error.codigo === 'cuenta_desactivada'
      ) {
        setMensajeSesion(
          'Tu cuenta está desactivada. Pide apoyo a tu maestra o maestro.'
        )

        try {
          await signOut(auth)
        } catch {
          if (sigueVigente()) {
            setErrorSesion(
              'No pudimos cerrar la sesión. Inténtalo nuevamente.'
            )
            setCargando(false)
          }
        }

        return null
      }

      setErrorSesion(
        'No pudimos consultar tu perfil. Revisa tu conexión e inténtalo nuevamente.'
      )
      setCargando(false)

      return null
    }
  }, [])

  useEffect(() => {
    try {
      localStorage.removeItem('vt-sesion')
    } catch {
      // La sesión real no depende de este almacenamiento manual.
    }

    const dejarDeObservar = onAuthStateChanged(
      auth,
      () => {
        void refrescarPerfil()
      },
      () => {
        solicitudActual.current += 1
        setUsuario(null)
        setCargando(false)
        setErrorSesion(
          'No pudimos recuperar tu sesión. Inténtalo nuevamente.'
        )
      }
    )

    return () => {
      solicitudActual.current += 1
      dejarDeObservar()
    }
  }, [refrescarPerfil])

  async function cerrarSesion() {
    await signOut(auth)

    solicitudActual.current += 1
    setUsuario(null)
    setErrorSesion('')
    setMensajeSesion('')
    setCargando(false)
  }

  return (
    <SesionContext.Provider
      value={{
        usuario,
        cargando,
        errorSesion,
        mensajeSesion,
        refrescarPerfil,
        cerrarSesion,
      }}
    >
      {children}
    </SesionContext.Provider>
  )
}

export function useSesion() {
  const contexto = useContext(SesionContext)

  if (!contexto) {
    throw new Error('useSesion debe utilizarse dentro de SesionProvider')
  }

  return contexto
}