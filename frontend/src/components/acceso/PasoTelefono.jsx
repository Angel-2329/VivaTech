import { useEffect, useId, useRef, useState } from 'react'
import { enviarCodigo } from '../../services/authService.js'

const DIGITOS_TELEFONO = 10

// Deja solo los números. Si la persona pega "+52 951 123 4567", quita el +52.
function limpiarTelefono(texto) {
  const sinLada = texto.trim().startsWith('+52') ? texto.trim().slice(3) : texto
  return sinLada.replace(/\D/g, '').slice(0, DIGITOS_TELEFONO)
}

function PasoTelefono({ telefonoInicial, enfocarTitulo, onContinuar }) {
  const [telefono, setTelefono] = useState(telefonoInicial)
  // Si regresa desde el paso 2, ya había aceptado el aviso
  const [aceptaAviso, setAceptaAviso] = useState(telefonoInicial !== '')
  const [errores, setErrores] = useState({})
  const [enviando, setEnviando] = useState(false)

  const tituloRef = useRef(null)
  const telefonoRef = useRef(null)
  const avisoRef = useRef(null)
  const id = useId()

  const telefonoCompleto = telefono.length === DIGITOS_TELEFONO

  useEffect(() => {
    if (enfocarTitulo) tituloRef.current?.focus()
  }, [enfocarTitulo])

  function manejarCambioTelefono(evento) {
    setTelefono(limpiarTelefono(evento.target.value))
    if (errores.telefono) setErrores({ ...errores, telefono: undefined })
  }

  function manejarCambioAviso(evento) {
    setAceptaAviso(evento.target.checked)
    if (errores.aviso) setErrores({ ...errores, aviso: undefined })
  }

  async function manejarEnvio(evento) {
    evento.preventDefault()
    if (enviando) return

    const nuevosErrores = {}
    if (!telefonoCompleto) {
      nuevosErrores.telefono = `Escribe los 10 números de tu celular. Llevas ${telefono.length}.`
    }
    if (!aceptaAviso) {
      nuevosErrores.aviso = 'Para continuar, marca la casilla del Aviso de Privacidad.'
    }
    setErrores(nuevosErrores)

    if (nuevosErrores.telefono) {
      telefonoRef.current?.focus()
      return
    }
    if (nuevosErrores.aviso) {
      avisoRef.current?.focus()
      return
    }

    setEnviando(true)
    const resultado = await enviarCodigo(telefono)
    setEnviando(false)

    if (!resultado.ok) {
      setErrores({ telefono: resultado.mensaje })
      telefonoRef.current?.focus()
      return
    }

    onContinuar(telefono)
  }

  return (
    <form className="vt-stack vt-stack-lg" onSubmit={manejarEnvio} noValidate>
      <h2 id="titulo-paso" ref={tituloRef} tabIndex={-1} className="vt-headline-md">
        Paso 1: Escribe tu número de celular
      </h2>

      <div className="vt-field">
        <label className="vt-field-label" htmlFor={`${id}-telefono`}>
          Número de celular (10 dígitos)
          <span className="vt-field-required">Obligatorio</span>
        </label>
        <p id={`${id}-ayuda`} className="vt-field-help">
          Usa el número donde puedas recibir mensajes de texto (SMS) en este momento. Ejemplo:
          951 123 4567.
        </p>

        <div className="vt-input-group" data-invalid={errores.telefono ? 'true' : undefined}>
          <span className="vt-input-group__addon" aria-hidden="true">
            MX +52
          </span>
          <input
            ref={telefonoRef}
            id={`${id}-telefono`}
            className="vt-input"
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            value={telefono}
            onChange={manejarCambioTelefono}
            aria-invalid={errores.telefono ? 'true' : undefined}
            aria-describedby={`${id}-ayuda ${id}-estado${errores.telefono ? ` ${id}-error` : ''}`}
          />
        </div>

        {telefonoCompleto ? (
          <p id={`${id}-estado`} className="vt-field-success">
            <span className="vt-icon" aria-hidden="true">
              check_circle
            </span>
            Número completo
          </p>
        ) : (
          <p id={`${id}-estado`} className="vt-field-counter">
            {telefono.length} de 10 números escritos
          </p>
        )}

        {errores.telefono && (
          <p id={`${id}-error`} className="vt-field-error" role="alert">
            <span className="vt-icon" aria-hidden="true">
              error
            </span>
            {errores.telefono}
          </p>
        )}
      </div>

      <div className="vt-stack vt-stack-sm">
        <label className="vt-check acceso__aviso" htmlFor={`${id}-aviso`}>
          <input
            ref={avisoRef}
            id={`${id}-aviso`}
            type="checkbox"
            checked={aceptaAviso}
            onChange={manejarCambioAviso}
            aria-invalid={errores.aviso ? 'true' : undefined}
            aria-describedby={errores.aviso ? `${id}-error-aviso` : undefined}
          />
          {/* TODO: convertir en enlaces cuando existan las páginas del Aviso y los Términos */}
          <span>
            He leído y acepto el Aviso de Privacidad y los Términos de Servicio de Viva Tech.
          </span>
        </label>

        {errores.aviso && (
          <p id={`${id}-error-aviso`} className="vt-field-error" role="alert">
            <span className="vt-icon" aria-hidden="true">
              error
            </span>
            {errores.aviso}
          </p>
        )}
      </div>

      <div className="vt-stack vt-stack-sm">
        <button
          type="submit"
          className="vt-btn vt-btn-primary vt-btn-block"
          aria-busy={enviando}
          aria-disabled={enviando}
          aria-describedby={`${id}-nota`}
        >
          {enviando ? 'Enviando código…' : 'Enviar código por SMS'}
          <span className="vt-icon" aria-hidden="true">
            arrow_forward
          </span>
        </button>
        <p id={`${id}-nota`} className="vt-field-help acceso__nota">
          <span className="vt-icon" aria-hidden="true">
            sms
          </span>
          Te llegará un mensaje con 6 números. Puede tardar hasta un minuto.
        </p>
      </div>
    </form>
  )
}

export default PasoTelefono
