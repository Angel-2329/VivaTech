import { useEffect, useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router'
import { useSesion } from '../context/SesionContext.jsx'
import { nombreParaSaludo } from '../utils/nombreParaSaludo.js'
import { MENU_POR_ROL } from '../utils/menuPorRol.js'

const ESCALAS = ['100', '115', '130']
const CLAVE_GUARDADO = 'vt-escala-texto'

function leerEscalaGuardada() {
  try {
    const guardada = localStorage.getItem(CLAVE_GUARDADO)
    return ESCALAS.includes(guardada) ? guardada : '100'
  } catch {
    return '100'
  }
}

function Encabezado({ variante = 'acceso' }) {
  const [escala, setEscala] = useState(leerEscalaGuardada)
  const [saliendo, setSaliendo] = useState(false)
  const [errorSalida, setErrorSalida] = useState('')
  const { usuario, cerrarSesion } = useSesion()
  const navigate = useNavigate()

  const posicion = ESCALAS.indexOf(escala)
  const esLaMasChica = posicion === 0
  const esLaMasGrande = posicion === ESCALAS.length - 1

  useEffect(() => {
    document.documentElement.dataset.vtFontScale = escala
    try {
      localStorage.setItem(CLAVE_GUARDADO, escala)
    } catch {
      // Si el navegador no permite guardar, la escala funciona igual mientras la página esté abierta
    }
  }, [escala])

  function reducirTexto() {
    if (!esLaMasChica) setEscala(ESCALAS[posicion - 1])
  }

  function aumentarTexto() {
    if (!esLaMasGrande) setEscala(ESCALAS[posicion + 1])
  }

  async function salir() {
    if (saliendo) return

    setErrorSalida('')
    setSaliendo(true)

    try {
      await cerrarSesion()
      navigate('/acceso', { replace: true })
    } catch {
      setErrorSalida(
        'No pudimos cerrar la sesión. Inténtalo nuevamente.'
      )
    } finally {
      setSaliendo(false)
    }
  }

  const mostrarUsuario = variante !== 'acceso' && usuario
  const conSesion = variante === 'sesion' && usuario
  const nombre = nombreParaSaludo(usuario)
  const menu = MENU_POR_ROL[usuario?.rol] ?? []

  return (
    <header className="vt-header">
      <div className="vt-cluster">
        <Link className="vt-header__brand" to="/">
          <span className="vt-header__logo" aria-hidden="true">
            V
          </span>
          <span className="vt-header__name">
            Viva Tech
            <small>Capacitación Digital</small>
          </span>
        </Link>

        {conSesion && menu.length > 0 && (
          <nav className="vt-nav" aria-label="Menú principal">
            {menu.map((opcion) => (
              <NavLink
                key={opcion.ruta}
                className="vt-nav-link"
                to={opcion.ruta}
                end={opcion.exacta}
              >
                {opcion.texto}
              </NavLink>
            ))}
          </nav>
        )}
      </div>

      <div className="vt-header__actions">
        <div className="vt-font-controls" role="group" aria-label="Tamaño del texto">
          <button
            type="button"
            className="vt-btn vt-btn-secondary vt-btn-sm"
            onClick={reducirTexto}
            aria-disabled={esLaMasChica}
          >
            A− Reducir texto
          </button>
          <button
            type="button"
            className="vt-btn vt-btn-secondary vt-btn-sm"
            onClick={aumentarTexto}
            aria-disabled={esLaMasGrande}
          >
            A+ Aumentar texto
          </button>
        </div>

        {mostrarUsuario && (
          <span className="vt-user-chip">
            <span className="vt-avatar" aria-hidden="true">
              {nombre ? nombre[0].toUpperCase() : <span className="vt-icon">person</span>}
            </span>
            {conSesion && (nombre || 'Mi cuenta')}
          </span>
        )}

        {conSesion && (
          <div className="vt-stack vt-stack-sm">
            <button
              type="button"
              className="vt-btn vt-btn-secondary vt-btn-sm"
              onClick={salir}
              disabled={saliendo}
              aria-busy={saliendo}
            >
              {saliendo ? 'Cerrando sesión…' : 'Cerrar sesión'}
            </button>

            {errorSalida && (
              <p role="alert">{errorSalida}</p>
            )}
          </div>
        )}
      </div>
    </header>
  )
}

export default Encabezado
