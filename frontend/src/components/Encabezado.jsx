import { useEffect, useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router'
import { useSesion } from '../context/SesionContext.jsx'
import { rutaDeInicio } from '../utils/rutaDeInicio.js'

const ESCALAS = ['90', '100', '115', '130']
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

  function salir() {
    cerrarSesion()
    navigate('/acceso', { replace: true })
  }

  const mostrarUsuario = variante !== 'acceso' && usuario
  const conSesion = variante === 'sesion' && usuario
  const nombre = usuario?.nombre

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

        {conSesion && (
          <nav className="vt-nav" aria-label="Menú principal">
            <NavLink className="vt-nav-link" to={rutaDeInicio({ ...usuario, primerAcceso: false })} end>
              Inicio
            </NavLink>
            {/* TODO: crear la pantalla "Mis cursos" (por ahora regresa al inicio) */}
            {usuario.rol === 'estudiante' && (
              <NavLink className="vt-nav-link" to="/estudiante/cursos">
                Mis cursos
              </NavLink>
            )}
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
          <button type="button" className="vt-btn vt-btn-secondary vt-btn-sm" onClick={salir}>
            Cerrar sesión
          </button>
        )}
      </div>
    </header>
  )
}

export default Encabezado
