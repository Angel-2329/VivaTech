import { useEffect, useId, useRef, useState } from 'react'
import { Link } from 'react-router'
import FotoPerfil from './FotoPerfil.jsx'
import { NOMBRE_DEL_ROL } from '../utils/formato.js'


function MenuCuenta({ nombre, rol, usuario, saliendo, errorSalida, onSalir }) {
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
        <FotoPerfil
          uid={usuario?.uid}
          nombre={nombre}
          tieneFoto={usuario?.tieneFoto}
          fotoActualizada={usuario?.fotoActualizada}
        />
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

        <Link
          className="vt-btn vt-btn-ghost vt-btn-sm vt-cuenta__salir"
          to="/mi-perfil"
          onClick={() => setAbierto(false)}
        >
          <span className="vt-icon" aria-hidden="true">
            account_circle
          </span>
          Mi perfil
        </Link>

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
