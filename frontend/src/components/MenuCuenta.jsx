import { useEffect, useId, useRef, useState } from 'react'
import { NOMBRE_DEL_ROL } from '../utils/formato.js'


function MenuCuenta({ nombre, rol, saliendo, errorSalida, onSalir }) {
  const [abierto, setAbierto] = useState(false)
  const idPanel = useId()
  const contenedor = useRef(null)
  const boton = useRef(null)

  useEffect(() => {
    if (!abierto) return undefined

    function alPresionarTecla(evento) {
      if (evento.key === 'Escape') {
        setAbierto(false)
        boton.current?.focus()
      }
    }

    function alTocarFuera(evento) {
      if (!contenedor.current?.contains(evento.target)) setAbierto(false)
    }

    document.addEventListener('keydown', alPresionarTecla)
    document.addEventListener('pointerdown', alTocarFuera)
    return () => {
      document.removeEventListener('keydown', alPresionarTecla)
      document.removeEventListener('pointerdown', alTocarFuera)
    }
  }, [abierto])

  

  const inicial = nombre ? nombre[0].toUpperCase() : null
  const nombreVisible = nombre || 'Mi cuenta'

  return (
    <div className="vt-cuenta" ref={contenedor}>
      <button
        ref={boton}
        type="button"
        className="vt-cuenta__boton"
        aria-expanded={abierto}
        aria-controls={idPanel}
        onClick={() => setAbierto((actual) => !actual)}
      >
        <span className="vt-avatar" aria-hidden="true">
          {inicial ?? <span className="vt-icon">person</span>}
        </span>
        <span className="vt-cuenta__nombre">
          <span className="vt-visually-hidden">Mi cuenta: </span>
          {nombreVisible}
        </span>
        <span className="vt-icon vt-cuenta__flecha" aria-hidden="true">
          {abierto ? 'expand_less' : 'expand_more'}
        </span>
      </button>

      <div id={idPanel} className="vt-cuenta__panel" hidden={!abierto}>
        <p className="vt-cuenta__quien">
          <strong>{nombreVisible}</strong>
          {NOMBRE_DEL_ROL[rol] && <span className="vt-text-muted">{NOMBRE_DEL_ROL[rol]}</span>}
        </p>

        <button
          type="button"
          className="vt-btn vt-btn-secondary vt-btn-sm vt-cuenta__salir"
          onClick={onSalir}
          disabled={saliendo}
          aria-busy={saliendo}
        >
          <span className="vt-icon" aria-hidden="true">
            logout
          </span>
          {saliendo ? 'Cerrando sesión…' : 'Cerrar sesión'}
        </button>

        {errorSalida && (
          <p className="vt-cuenta__error" role="alert">
            {errorSalida}
          </p>
        )}
      </div>
    </div>
  )
}

export default MenuCuenta
