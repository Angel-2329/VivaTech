import { useEffect, useState } from 'react'
import { Link } from 'react-router'

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

function Encabezado() {
  const [escala, setEscala] = useState(leerEscalaGuardada)
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

  return (
    <header className="vt-header">
      <Link className="vt-header__brand" to="/">
        <span className="vt-header__logo" aria-hidden="true">
          V
        </span>
        <span className="vt-header__name">
          Viva Tech
          <small>Capacitación Digital</small>
        </span>
      </Link>

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
    </header>
  )
}

export default Encabezado
