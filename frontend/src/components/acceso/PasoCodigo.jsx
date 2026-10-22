import { useEffect, useId, useRef, useState } from 'react'

const LARGO_CODIGO = 6
const SEGUNDOS_PARA_REENVIAR = 60

// "9511234567" → "951 123 4567"
function formatearTelefono(telefono) {
  return `${telefono.slice(0, 3)} ${telefono.slice(3, 6)} ${telefono.slice(6)}`
}

// 60 → "1:00", 42 → "0:42"
function formatearTiempo(segundos) {
  const minutos = Math.floor(segundos / 60)
  const resto = String(segundos % 60).padStart(2, '0')
  return `${minutos}:${resto}`
}

function PasoCodigo({ telefono, enfocarTitulo, onCambiarNumero }) {
  const [codigo, setCodigo] = useState('')
  const [error, setError] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [segundos, setSegundos] = useState(SEGUNDOS_PARA_REENVIAR)

  const tituloRef = useRef(null)
  const codigoRef = useRef(null)
  const id = useId()

  useEffect(() => {
    if (enfocarTitulo) tituloRef.current?.focus()
  }, [enfocarTitulo])

  // Cuenta regresiva para poder pedir otro código
  useEffect(() => {
    if (segundos === 0) return
    const temporizador = setTimeout(() => setSegundos(segundos - 1), 1000)
    return () => clearTimeout(temporizador)
  }, [segundos])

  function manejarCambioCodigo(evento) {
    setCodigo(evento.target.value.replace(/\D/g, '').slice(0, LARGO_CODIGO))
    if (error) setError('')
  }

  function reenviarCodigo() {
    if (segundos > 0) return
    // TODO (Firebase): volver a enviar el SMS.
    setSegundos(SEGUNDOS_PARA_REENVIAR)
    setCodigo('')
    setMensaje('Te enviamos un código nuevo. Revisa tus mensajes.')
  }

  function manejarEnvio(evento) {
    evento.preventDefault()

    if (codigo.length !== LARGO_CODIGO) {
      setMensaje('')
      setError('El código tiene 6 números. Revisa el mensaje e inténtalo de nuevo.')
      codigoRef.current?.focus()
      return
    }

    // TODO (Firebase): confirmar el código y después ir a la pantalla que corresponda al rol.
    setMensaje('Simulación: el código tiene el formato correcto. La verificación real se conectará con Firebase.')
  }

  return (
    <form className="vt-stack vt-stack-lg" onSubmit={manejarEnvio} noValidate>
      <div className="vt-cluster vt-cluster-between">
        <p className="vt-field-success">
          <span className="vt-icon" aria-hidden="true">
            mark_email_read
          </span>
          Código enviado al +52 {formatearTelefono(telefono)}
        </p>
        <button type="button" className="vt-btn vt-btn-ghost vt-btn-sm" onClick={onCambiarNumero}>
          <span className="vt-icon" aria-hidden="true">
            edit
          </span>
          Cambiar número
        </button>
      </div>

      <h2 id="titulo-paso" ref={tituloRef} tabIndex={-1} className="vt-headline-md">
        Paso 2: Escribe el código que recibiste por mensaje
      </h2>

      <div className="vt-field">
        <label className="vt-field-label" htmlFor={`${id}-codigo`}>
          Código de seguridad (6 números)
        </label>
        <p id={`${id}-ayuda`} className="vt-field-help">
          Revisa la aplicación de mensajes de texto de tu celular.
        </p>
        <input
          ref={codigoRef}
          id={`${id}-codigo`}
          className="vt-input vt-otp-single"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          value={codigo}
          onChange={manejarCambioCodigo}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={`${id}-ayuda${error ? ` ${id}-error` : ''}`}
        />
        {error && (
          <p id={`${id}-error`} className="vt-field-error" role="alert">
            <span className="vt-icon" aria-hidden="true">
              error
            </span>
            {error}
          </p>
        )}
      </div>

      <div className="vt-resend">
        {segundos > 0 ? (
          <p>
            Puedes pedir otro código en{' '}
            <span className="vt-resend__timer">{formatearTiempo(segundos)}</span>
          </p>
        ) : (
          <p>¿No te llegó el mensaje?</p>
        )}
        <button
          type="button"
          className="vt-btn vt-btn-outline vt-btn-sm"
          onClick={reenviarCodigo}
          aria-disabled={segundos > 0}
        >
          Reenviar código
        </button>
      </div>

      {/* Zona que lee el lector de pantalla cuando aparece un aviso */}
      <div role="status">
        {mensaje && (
          <div className="vt-alert vt-alert-success">
            <span className="vt-icon" aria-hidden="true">
              check_circle
            </span>
            <p className="vt-alert__content">{mensaje}</p>
          </div>
        )}
      </div>

      <button type="submit" className="vt-btn vt-btn-success vt-btn-block">
        <span className="vt-icon" aria-hidden="true">
          lock_open
        </span>
        Confirmar y entrar a mi cuenta
      </button>
    </form>
  )
}

export default PasoCodigo
