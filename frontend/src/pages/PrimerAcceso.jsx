import { useEffect, useId, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import Encabezado from '../components/Encabezado.jsx'
import PiePagina from '../components/PiePagina.jsx'
import { useSesion } from '../context/SesionContext.jsx'
import { rutaDeInicio } from '../utils/rutaDeInicio.js'
import './PrimerAcceso.css'

const LARGO_MAXIMO = 30

function PrimerAcceso() {
  const { usuario, guardarNombre, cerrarSesion } = useSesion()
  const [nombre, setNombre] = useState(usuario.nombre ?? '')
  const navigate = useNavigate()
  const tituloRef = useRef(null)
  const id = useId()

  const nombreLimpio = nombre.trim()
  const saludo = nombreLimpio ? `¡Hola, ${nombreLimpio}!` : '¡Hola!'

  
  useEffect(() => {
    tituloRef.current?.focus()
  }, [])

  function continuar(nombreElegido) {
    // TODO (backend): guardar el nombre también en la base de datos
    guardarNombre(nombreElegido)
    navigate(rutaDeInicio({ ...usuario, primerAcceso: false }), { replace: true })
  }

  function manejarEnvio(evento) {
    evento.preventDefault()
    continuar(nombreLimpio)
  }


  function entrarConOtroNumero() {
    cerrarSesion()
    navigate('/acceso', { replace: true })
  }

  return (
    <div className="vt-page">
      <a className="vt-skip-link" href="#contenido">
        Saltar al contenido
      </a>

      <Encabezado variante="personalizacion" />

      <main id="contenido" className="vt-main">
        <div className="vt-container personalizacion">
          <button type="button" className="vt-back-link" onClick={entrarConOtroNumero}>
            <span className="vt-icon" aria-hidden="true">
              arrow_back
            </span>
            Entrar con otro número
          </button>

          <form className="vt-stack vt-stack-lg" onSubmit={manejarEnvio} noValidate>
            <div className="vt-stack vt-stack-sm">
              <p className="personalizacion__paso vt-label-md vt-text-action">
                <span className="vt-icon" aria-hidden="true">
                  badge
                </span>
                Último paso (opcional): personaliza tu saludo
              </p>
              <h1 ref={tituloRef} tabIndex={-1} className="vt-headline-xl">
                ¿Cómo quieres que te llamemos?
              </h1>
              <p className="vt-text-muted">Lo verás en tu pantalla de inicio. Puedes cambiarlo después.</p>
            </div>

            <div className="vt-field">
              <label className="vt-field-label" htmlFor={`${id}-nombre`}>
                Tu nombre o apodo (opcional)
              </label>
              <input
                id={`${id}-nombre`}
                className="vt-input"
                type="text"
                autoComplete="given-name"
                placeholder="Rosa"
                maxLength={LARGO_MAXIMO}
                value={nombre}
                onChange={(evento) => setNombre(evento.target.value)}
                aria-describedby={`${id}-ayuda`}
              />
              <p id={`${id}-ayuda`} className="vt-field-help">
                <span className="vt-icon" aria-hidden="true">
                  info
                </span>
                Por ejemplo: Rosa, Don Carlos o Tere. Solo se usará para saludarte en la plataforma.
              </p>
            </div>

            {/* Se actualiza mientras la persona escribe */}
            <div className="vt-alert vt-alert-info vt-alert-soft">
              <span className="vt-avatar" aria-hidden="true">
                <span className="vt-icon">waving_hand</span>
              </span>
              <div className="vt-alert__content">
                <p>Vista previa de saludo:</p>
                <p className="vt-text-action">
                  <strong>{saludo}</strong> Bienvenido(a) a tu espacio digital.
                </p>
              </div>
            </div>

            <div className="vt-stack vt-stack-sm">
              <button type="submit" className="vt-btn vt-btn-primary vt-btn-block">
                Guardar y continuar
                <span className="vt-icon" aria-hidden="true">
                  arrow_forward
                </span>
              </button>
              <button
                type="button"
                className="vt-btn vt-btn-secondary vt-btn-block"
                onClick={() => continuar('')}
              >
                Omitir este paso
              </button>
            </div>
          </form>

          <aside className="vt-alert vt-alert-info vt-alert-soft">
            <span className="vt-icon vt-text-success" aria-hidden="true">
              verified_user
            </span>
            <p className="vt-alert__content">
              <strong>
                Piloto Viva Tech 2026 - Prácticas simuladas sin datos bancarios reales ni dinero
                real. Aquí puedes aprender a tu propio ritmo y sin ningún riesgo.
              </strong>
            </p>
          </aside>
        </div>
      </main>

      <PiePagina />
    </div>
  )
}

export default PrimerAcceso
