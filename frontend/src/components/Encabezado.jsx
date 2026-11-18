import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { useSesion } from '../context/SesionContext.jsx'
import { nombreParaSaludo } from '../utils/nombreParaSaludo.js'
import { MENU_POR_ROL, estaActiva } from '../utils/menuPorRol.js'
import MenuCuenta from './MenuCuenta.jsx'
import './Encabezado.css'

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
  const { pathname } = useLocation()

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
    <header className="vt-header vt-encabezado">
      <Link className="vt-header__brand vt-encabezado__marca" to="/">
        <span className="vt-header__logo" aria-hidden="true">
          V
        </span>
        <span className="vt-header__name">
          Viva Tech
          <small>Capacitación Digital</small>
        </span>
      </Link>

      {conSesion && menu.length > 0 && (
        <nav className="vt-nav vt-encabezado__menu" aria-label="Menú principal">
          {menu.map((opcion) => {
            const activa = estaActiva(opcion, pathname)
            return (
              <Link
                key={opcion.ruta}
                className="vt-nav-link"
                to={opcion.ruta}
                aria-current={activa ? 'page' : undefined}
              >
                {opcion.texto}
              </Link>
            )
          })}
        </nav>
      )}

      <div className="vt-header__actions vt-encabezado__acciones">
        <div className="vt-font-controls" role="group" aria-label="Tamaño del texto">
          <button
            type="button"
            className="vt-btn vt-btn-secondary vt-btn-sm"
            onClick={reducirTexto}
            aria-disabled={esLaMasChica}
          >
            <span aria-hidden="true">A−</span>
            <span className="vt-encabezado__texto-largo">Reducir texto</span>
          </button>
          <button
            type="button"
            className="vt-btn vt-btn-secondary vt-btn-sm"
            onClick={aumentarTexto}
            aria-disabled={esLaMasGrande}
          >
            <span aria-hidden="true">A+</span>
            <span className="vt-encabezado__texto-largo">Aumentar texto</span>
          </button>
        </div>

        {conSesion ? (
          <MenuCuenta
            nombre={nombre}
            rol={usuario.rol}
            saliendo={saliendo}
            errorSalida={errorSalida}
            onSalir={salir}
          />
        ) : (
          mostrarUsuario && (
            <span className="vt-user-chip">
              <span className="vt-avatar" aria-hidden="true">
                {nombre ? nombre[0].toUpperCase() : <span className="vt-icon">person</span>}
              </span>
            </span>
          )
        )}
      </div>
    </header>
  )
}

export default Encabezado
