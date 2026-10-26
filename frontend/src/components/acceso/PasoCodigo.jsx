import { useEffect, useId, useRef, useState } from 'react'
import {
  crearVerificadorRecaptcha,
  enviarCodigoFirebase,
  confirmarCodigoFirebase,
} from '../../services/firebaseAuthService.js'

const SEGUNDOS_PARA_REENVIAR = 60

function formatearTelefono(telefono) {
  return `${telefono.slice(0, 3)} ${telefono.slice(3, 6)} ${telefono.slice(6)}`
}

function formatearTiempo(segundos) {
  const minutos = Math.floor(segundos / 60)
  const resto = String(segundos % 60).padStart(2, '0')
  return `${minutos}:${resto}`
}

function mensajeDeError(error) {
  const mensajes = {
    'auth/invalid-verification-code':
      'El código no coincide. Revísalo e inténtalo nuevamente.',
    'auth/code-expired':
      'El código dejó de estar disponible. Solicita uno nuevo.',
    'auth/session-expired':
      'La solicitud caducó. Solicita un código nuevo.',
    'auth/too-many-requests':
      'Se hicieron varios intentos. Espera unos minutos antes de volver a intentar.',
    'auth/network-request-failed':
      'No pudimos conectarnos. Revisa tu conexión e inténtalo nuevamente.',
    'auth/quota-exceeded':
      'El servicio no está disponible por el momento. Intenta más tarde.',
    'auth/captcha-check-failed':
      'No pudimos completar la verificación de seguridad. Inténtalo nuevamente.',
  }

  return mensajes[error.code] ||
    'No pudimos completar la solicitud. Inténtalo nuevamente o pide apoyo.'
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
  const [reenviando, setReenviando] = useState(false)
  const [identidadConfirmada, setIdentidadConfirmada] = useState(false)

  const tituloRef = useRef(null)
  const codigoRef = useRef(null)
  const recaptchaContenedorRef = useRef(null)
  const recaptchaVerificadorRef = useRef(null)
  const solicitudEnCursoRef = useRef(false)
  const id = useId()

  const ocupado = revisando || reenviando
  const esPrueba = import.meta.env.DEV &&
    import.meta.env.VITE_FIREBASE_AUTH_TESTING === 'true' &&
    ['localhost', '127.0.0.1'].includes(window.location.hostname)

  useEffect(() => {
    if (enfocarTitulo) tituloRef.current?.focus()
  }, [enfocarTitulo])

  useEffect(() => {
    if (segundos === 0 || identidadConfirmada) return

    const temporizador = setTimeout(() => {
      setSegundos((valor) => Math.max(0, valor - 1))
    }, 1000)

    return () => clearTimeout(temporizador)
  }, [segundos, identidadConfirmada])

  useEffect(() => {
    return () => {
      if (recaptchaVerificadorRef.current) {
        recaptchaVerificadorRef.current.clear()
        recaptchaVerificadorRef.current = null
      }
    }
  }, [])

  function manejarCambioCodigo(evento) {
    setCodigo(evento.target.value.replace(/\D/g, '').slice(0, 6))
    setError('')
  }

  async function manejarEnvio(evento) {
    evento.preventDefault()

    if (solicitudEnCursoRef.current || identidadConfirmada) return

    setError('')
    setMensaje('')

    if (codigo.length !== 6) {
      setError('Escribe los 6 números del código.')
      codigoRef.current?.focus()
      return
    }

    if (!confirmacion) {
      setError('Regresa al paso del teléfono y solicita un código nuevo.')
      return
    }

    solicitudEnCursoRef.current = true
    setRevisando(true)

    try {
      await confirmarCodigoFirebase(confirmacion, codigo)
      setCodigo('')
      setIdentidadConfirmada(true)
      setMensaje(
        'Firebase confirmó tu identidad. La conexión con el perfil y el panel todavía está pendiente.'
      )
    } catch (errorFirebase) {
      setError(mensajeDeError(errorFirebase))
      codigoRef.current?.focus()
    } finally {
      solicitudEnCursoRef.current = false
      setRevisando(false)
    }
  }

  async function reenviarCodigo() {
    if (
      segundos > 0 ||
      solicitudEnCursoRef.current ||
      identidadConfirmada
    ) return

    solicitudEnCursoRef.current = true
    setReenviando(true)
    setError('')
    setMensaje('')

    try {
      if (!recaptchaVerificadorRef.current) {
        recaptchaVerificadorRef.current = crearVerificadorRecaptcha(
          recaptchaContenedorRef.current
        )
      }

      const nuevaConfirmacion = await enviarCodigoFirebase(
        telefono,
        recaptchaVerificadorRef.current
      )

      onConfirmacionActualizada(nuevaConfirmacion)
      setCodigo('')
      setSegundos(SEGUNDOS_PARA_REENVIAR)
      setMensaje(
        esPrueba
          ? 'Solicitud de prueba preparada. Usa el código configurado en Firebase; no se envió un SMS real.'
          : 'Solicitamos un código nuevo. Revisa tus mensajes.'
      )
    } catch (errorFirebase) {
      setError(mensajeDeError(errorFirebase))
    } finally {
      if (recaptchaVerificadorRef.current) {
        recaptchaVerificadorRef.current.clear()
        recaptchaVerificadorRef.current = null
      }

      solicitudEnCursoRef.current = false
      setReenviando(false)
    }
  }

  return (
    <form
      className="vt-stack vt-stack-lg"
      onSubmit={manejarEnvio}
      noValidate
    >
      <h2
        id="titulo-paso"
        ref={tituloRef}
        tabIndex={-1}
        className="vt-headline-md"
      >
        Paso 2: Escribe tu código de seguridad
      </h2>

      <div className="vt-alert vt-alert-info vt-alert-soft">
        <div className="vt-alert__content">
          <p>
            {esPrueba ? 'Teléfono de prueba: ' : 'Teléfono: '}
            <strong>+52 {formatearTelefono(telefono)}</strong>
          </p>
          <button
            type="button"
            className="vt-btn vt-btn-ghost vt-btn-sm acceso__cambiar"
            onClick={onCambiarNumero}
            disabled={ocupado || identidadConfirmada}
          >
            Cambiar número
          </button>
        </div>
      </div>

      <div className="vt-field">
        <label className="vt-field-label" htmlFor={`${id}-codigo`}>
          Código de seguridad (6 números)
        </label>
        <p id={`${id}-ayuda`} className="vt-field-help">
          {esPrueba
            ? 'Usa el código configurado para este teléfono de prueba en Firebase. No recibirás un SMS.'
            : 'Revisa la aplicación de mensajes de texto de tu celular.'}
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
          readOnly={ocupado || identidadConfirmada}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={`${id}-ayuda${error ? ` ${id}-error` : ''}`}
        />
        {error && (
          <p id={`${id}-error`} className="vt-field-error" role="alert">
            {error}
          </p>
        )}
      </div>

      <div ref={recaptchaContenedorRef} />

      <div className="vt-resend">
        {!identidadConfirmada && segundos > 0 && (
          <p>
            Puedes pedir otro código en{' '}
            <span className="vt-resend__timer">
              {formatearTiempo(segundos)}
            </span>
          </p>
        )}
        <button
          type="button"
          className="vt-btn vt-btn-outline vt-btn-sm"
          onClick={reenviarCodigo}
          disabled={segundos > 0 || ocupado || identidadConfirmada}
          aria-busy={reenviando}
        >
          {reenviando ? 'Solicitando código…' : 'Reenviar código'}
        </button>
      </div>

      <div role="status" aria-atomic="true">
        {mensaje && <p>{mensaje}</p>}
      </div>

      <button
        type="submit"
        className="vt-btn vt-btn-primary vt-btn-block"
        disabled={ocupado || identidadConfirmada || !confirmacion}
        aria-busy={revisando}
      >
        {identidadConfirmada
          ? 'Identidad confirmada'
          : revisando
            ? 'Revisando código…'
            : 'Confirmar código'}
      </button>
    </form>
  )
}

export default PasoCodigo