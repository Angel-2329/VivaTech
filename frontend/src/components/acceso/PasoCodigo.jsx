import { useEffect, useId, useRef, useState } from 'react'
import {
  crearVerificadorRecaptcha,
  enviarCodigoFirebase,
  confirmarCodigoFirebase,
} from '../../services/firebaseAuthService.js'

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

function PasoCodigo({
  telefono,
  confirmacion,
  onConfirmacionActualizada,
  enfocarTitulo,
  onCambiarNumero,
}) {
  const [codigo, setCodigo] = useState('')
  const [error, setError] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [segundos, setSegundos] = useState(SEGUNDOS_PARA_REENVIAR)
  const [revisando, setRevisando] = useState(false)

  const tituloRef = useRef(null)
  const codigoRef = useRef(null)
  const recaptchaContenedorRef = useRef(null)
  const verificadorRef = useRef(null)
  const componenteActivoRef = useRef(true)
  const operacionEnCursoRef = useRef(false)
  const [reenviando, setReenviando] = useState(false)

  const ocupado = revisando || reenviando
  const id = useId()

  useEffect(() => {
    if (enfocarTitulo) tituloRef.current?.focus()
  }, [enfocarTitulo])

  useEffect(() => {
    componenteActivoRef.current = true

    return () => {
      componenteActivoRef.current = false
      verificadorRef.current?.clear()
      verificadorRef.current = null
    }
  }, [])

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

  async function reenviarCodigo() {
    if (segundos > 0 || operacionEnCursoRef.current) return

    operacionEnCursoRef.current = true
    setReenviando(true)
    setError('')
    setMensaje('')

    try {
      verificadorRef.current?.clear()
      verificadorRef.current = null

      const verificador = crearVerificadorRecaptcha(
        recaptchaContenedorRef.current
      )

      verificadorRef.current = verificador

      const nuevaConfirmacion = await enviarCodigoFirebase(
        telefono,
        verificador
      )

      if (!componenteActivoRef.current) return

      onConfirmacionActualizada(nuevaConfirmacion)
      setSegundos(SEGUNDOS_PARA_REENVIAR)
      setCodigo('')
      setMensaje('Te enviamos un código nuevo. Revisa tus mensajes.')
      codigoRef.current?.focus()
    } catch (errorFirebase) {
      if (!componenteActivoRef.current) return

      setError(
        errorFirebase.code === 'auth/too-many-requests'
          ? 'Hubo demasiados intentos. Espera un momento antes de volver a intentar.'
          : 'No pudimos reenviar el código. Revisa tu conexión e inténtalo nuevamente.'
      )
    } finally {
      operacionEnCursoRef.current = false

      if (componenteActivoRef.current) {
        setReenviando(false)
      }
    }
  }

  async function manejarEnvio(evento) {
    evento.preventDefault()
    if (operacionEnCursoRef.current) return

    setMensaje('')
    setError('')

    if (codigo.length !== LARGO_CODIGO) {
      setError(
        'El código tiene 6 números. Revisa el mensaje e inténtalo de nuevo.'
      )
      codigoRef.current?.focus()
      return
    }

    if (!confirmacion) {
      setError('Solicita nuevamente tu código para continuar.')
      return
    }

    operacionEnCursoRef.current = true
    setRevisando(true)

    try {
      await confirmarCodigoFirebase(confirmacion, codigo)

      // SesionContext observará la sesión de Firebase,
      // consultará el perfil y permitirá la navegación.
    } catch (errorFirebase) {
      if (!componenteActivoRef.current) return

      let mensajeError =
        'No pudimos confirmar el código. Revisa tu conexión e inténtalo nuevamente.'

      if (errorFirebase.code === 'auth/invalid-verification-code') {
        mensajeError =
          'El código no coincide. Revisa el mensaje e inténtalo otra vez.'
      } else if (
        errorFirebase.code === 'auth/code-expired'
        || errorFirebase.code === 'auth/session-expired'
      ) {
        mensajeError = 'El código venció. Solicita uno nuevo.'
      } else if (errorFirebase.code === 'auth/too-many-requests') {
        mensajeError =
          'Hubo demasiados intentos. Espera un momento antes de volver a intentar.'
      }

      setError(mensajeError)
      codigoRef.current?.focus()
    } finally {
      operacionEnCursoRef.current = false

      if (componenteActivoRef.current) {
        setRevisando(false)
      }
    }
  }

  return (
    <form className="vt-stack vt-stack-lg" onSubmit={manejarEnvio} noValidate>
      <h2 id="titulo-paso" ref={tituloRef} tabIndex={-1} className="vt-headline-md">
        Paso 2: Escribe tu código de seguridad
      </h2>

      {/* Se muestra el número completo para que la persona confirme que lo escribió bien */}
      <div className="vt-alert vt-alert-info vt-alert-soft">
        <span className="vt-icon" aria-hidden="true">
          sms
        </span>
        <div className="vt-alert__content">
          <p>
            Te enviamos un código al <strong>+52 {formatearTelefono(telefono)}</strong>
          </p>
          <button
            type="button"
            className="vt-btn vt-btn-ghost vt-btn-sm acceso__cambiar"
            onClick={onCambiarNumero}
            disabled={ocupado}
          >
            <span className="vt-icon" aria-hidden="true">
              edit
            </span>
            Cambiar número
          </button>
        </div>
      </div>

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
          readOnly={ocupado}
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

      <div ref={recaptchaContenedorRef} />

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
          disabled={segundos > 0 || ocupado}
          aria-disabled={segundos > 0 || ocupado}
          aria-busy={reenviando}
        >
          {reenviando ? 'Reenviando código…' : 'Reenviar código'}
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

      <button
        type="submit"
        className="vt-btn vt-btn-primary vt-btn-block"
        aria-busy={revisando}
        aria-disabled={ocupado}
        disabled={ocupado}
      >
        {revisando ? 'Revisando código…' : 'Confirmar y entrar'}
        <span className="vt-icon" aria-hidden="true">
          arrow_forward
        </span>
      </button>

      <div className="vt-alert vt-alert-soft acceso__protegido">
        <span className="vt-icon vt-text-success" aria-hidden="true">
          verified_user
        </span>
        <div className="vt-alert__content">
          <p className="vt-alert__title">Tus datos están protegidos</p>
          <p className="vt-body-sm">
            El código solo funciona una vez. Nunca te pediremos contraseñas ni datos de tu banco.
          </p>
        </div>
      </div>
    </form>
  )
}

export default PasoCodigo
