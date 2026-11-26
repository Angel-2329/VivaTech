import { useEffect, useId, useRef, useState } from 'react'
import {
  confirmarCambioTelefono,
  crearVerificadorRecaptcha,
  enviarCodigoCambioTelefono,
  telefonoDeLaSesion,
} from '../../services/firebaseAuthService.js'
import { DIGITOS_TELEFONO, formatearTelefono, limpiarTelefono, telefonoCompleto } from '../../utils/telefono.js'

const LARGO_CODIGO = 6

const ERRORES_FIREBASE = {
  'auth/invalid-phone-number': 'Ese número no es válido. Revisa los 10 dígitos.',
  'auth/credential-already-in-use': 'Ese número ya lo usa otra cuenta de Viva Tech. Si es tuyo, pide apoyo a un administrador.',
  'auth/account-exists-with-different-credential': 'Ese número ya lo usa otra cuenta de Viva Tech. Si es tuyo, pide apoyo a un administrador.',
  'auth/invalid-verification-code': 'El código no coincide. Revisa el mensaje e inténtalo otra vez.',
  'auth/code-expired': 'El código venció. Pide uno nuevo.',
  'auth/session-expired': 'El código venció. Pide uno nuevo.',
  'auth/too-many-requests': 'Hubo demasiados intentos. Espera unos minutos antes de volver a intentar.',
  'auth/requires-recent-login': 'Por seguridad, cierra sesión, vuelve a entrar y después cambia tu número.',
  'auth/quota-exceeded': 'Por ahora no podemos enviar mensajes. Inténtalo más tarde.',
}

function sinLada(telefonoInternacional) {
  return telefonoInternacional?.startsWith('+52') ? telefonoInternacional.slice(3) : null
}

function CambioTelefonoPropio({ onCambiado, onLimpiarMensaje }) {
  const [telefonoActual, setTelefonoActual] = useState(() => sinLada(telefonoDeLaSesion()))
  const [etapa, setEtapa] = useState('ver')
  const [telefono, setTelefono] = useState('')
  const [codigo, setCodigo] = useState('')
  const [idVerificacion, setIdVerificacion] = useState(null)
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const campoTelefonoRef = useRef(null)
  const campoCodigoRef = useRef(null)
  const botonCambiarRef = useRef(null)
  const recaptchaRef = useRef(null)
  const verificadorRef = useRef(null)
  const activoRef = useRef(true)
  const volverAlBotonRef = useRef(false)
  const id = useId()

  useEffect(() => {
    activoRef.current = true
    return () => {
      activoRef.current = false
      verificadorRef.current?.clear()
      verificadorRef.current = null
    }
  }, [])

  useEffect(() => {
    if (etapa === 'numero') campoTelefonoRef.current?.focus()
    else if (etapa === 'codigo') campoCodigoRef.current?.focus()
    else if (volverAlBotonRef.current) {
      volverAlBotonRef.current = false
      botonCambiarRef.current?.focus()
    }
  }, [etapa])

  function limpiarVerificador() {
    verificadorRef.current?.clear()
    verificadorRef.current = null
  }

  function empezar() {
    onLimpiarMensaje()
    setError('')
    setCodigo('')
    setEtapa('numero')
  }

  function cancelar() {
    limpiarVerificador()
    setError('')
    setTelefono('')
    setCodigo('')
    setIdVerificacion(null)
    volverAlBotonRef.current = true
    setEtapa('ver')
  }

  async function enviarCodigo(evento) {
    evento.preventDefault()
    if (ocupado) return
    setError('')

    if (!telefonoCompleto(telefono)) {
      setError(`El número debe tener ${DIGITOS_TELEFONO} dígitos. Llevas ${telefono.length}.`)
      campoTelefonoRef.current?.focus()
      return
    }
    if (telefono === telefonoActual) {
      setError('Ese ya es tu número. Escribe el número nuevo.')
      campoTelefonoRef.current?.focus()
      return
    }

    setOcupado(true)
    try {
      limpiarVerificador()
      verificadorRef.current = crearVerificadorRecaptcha(recaptchaRef.current)
      const nuevoId = await enviarCodigoCambioTelefono(telefono, verificadorRef.current)
      if (!activoRef.current) return
      limpiarVerificador()
      setIdVerificacion(nuevoId)
      setCodigo('')
      setEtapa('codigo')
    } catch (errorFirebase) {
      if (!activoRef.current) return
      limpiarVerificador()
      setError(
        ERRORES_FIREBASE[errorFirebase.code]
          ?? 'No pudimos enviar el código. Revisa tu conexión y la verificación de seguridad e inténtalo otra vez.',
      )
      campoTelefonoRef.current?.focus()
    } finally {
      if (activoRef.current) setOcupado(false)
    }
  }

  async function confirmarCodigo(evento) {
    evento.preventDefault()
    if (ocupado) return
    setError('')

    if (codigo.length !== LARGO_CODIGO) {
      setError('El código tiene 6 números. Revisa el mensaje e inténtalo de nuevo.')
      campoCodigoRef.current?.focus()
      return
    }

    setOcupado(true)
    try {
      const nuevo = await confirmarCambioTelefono(idVerificacion, codigo)
      if (!activoRef.current) return
      const numero = sinLada(nuevo) ?? telefono
      setTelefonoActual(numero)
      setTelefono('')
      setCodigo('')
      setIdVerificacion(null)
      setEtapa('ver')
      onCambiado(`Listo. Tu número ahora es +52 ${formatearTelefono(numero)}. La próxima vez entra con ese número.`)
    } catch (errorFirebase) {
      if (!activoRef.current) return
      setError(
        ERRORES_FIREBASE[errorFirebase.code]
          ?? 'No pudimos cambiar tu número. Revisa tu conexión e inténtalo otra vez.',
      )
      campoCodigoRef.current?.focus()
    } finally {
      if (activoRef.current) setOcupado(false)
    }
  }

  const avisoError = error && (
    <p id={`${id}-error`} className="vt-field-error" role="alert">
      <span className="vt-icon" aria-hidden="true">
        error
      </span>
      {error}
    </p>
  )

  return (
    <section className="vt-card vt-stack" aria-labelledby={`${id}-titulo`}>
      <h2 id={`${id}-titulo`} className="vt-headline-sm">
        Número de celular
      </h2>
      <p>
        Entras a Viva Tech con:{' '}
        <strong>{telefonoActual ? `+52 ${formatearTelefono(telefonoActual)}` : 'número no disponible'}</strong>
      </p>

      {etapa === 'ver' && (
        <div>
          <button ref={botonCambiarRef} type="button" className="vt-btn vt-btn-secondary" onClick={empezar}>
            <span className="vt-icon" aria-hidden="true">
              phone_iphone
            </span>
            Cambiar mi número
          </button>
        </div>
      )}

      {etapa === 'numero' && (
        <form className="vt-stack" onSubmit={enviarCodigo} noValidate>
          <div className="vt-field">
            <label className="vt-field-label" htmlFor={`${id}-telefono`}>
              Número nuevo (10 dígitos)
            </label>
            <p id={`${id}-ayuda-telefono`} className="vt-field-help">
              Te enviaremos un código por mensaje a ese número para confirmar que es tuyo.
            </p>
            <div className="vt-input-group" data-invalid={error ? 'true' : undefined}>
              <span className="vt-input-group__addon" aria-hidden="true">
                MX +52
              </span>
              <input
                ref={campoTelefonoRef}
                id={`${id}-telefono`}
                className="vt-input"
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                value={telefono}
                onChange={(evento) => {
                  setTelefono(limpiarTelefono(evento.target.value))
                  if (error) setError('')
                }}
                aria-invalid={error ? 'true' : undefined}
                aria-describedby={`${id}-ayuda-telefono${error ? ` ${id}-error` : ''}`}
              />
            </div>
            {avisoError}
          </div>

          <div ref={recaptchaRef} />

          <div className="vt-cluster">
            <button type="submit" className="vt-btn vt-btn-primary" disabled={ocupado} aria-busy={ocupado}>
              {ocupado ? 'Enviando código…' : 'Enviarme el código'}
            </button>
            <button type="button" className="vt-btn vt-btn-ghost" onClick={cancelar} disabled={ocupado}>
              Cancelar
            </button>
          </div>
        </form>
      )}

      {etapa === 'codigo' && (
        <form className="vt-stack" onSubmit={confirmarCodigo} noValidate>
          <div className="vt-alert vt-alert-info vt-alert-soft">
            <span className="vt-icon" aria-hidden="true">
              sms
            </span>
            <p className="vt-alert__content">
              Te enviamos un código al <strong>+52 {formatearTelefono(telefono)}</strong>.
            </p>
          </div>
          <div className="vt-field">
            <label className="vt-field-label" htmlFor={`${id}-codigo`}>
              Código de 6 números
            </label>
            <input
              ref={campoCodigoRef}
              id={`${id}-codigo`}
              className="vt-input"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={LARGO_CODIGO}
              value={codigo}
              onChange={(evento) => {
                setCodigo(evento.target.value.replace(/\D/g, '').slice(0, LARGO_CODIGO))
                if (error) setError('')
              }}
              aria-invalid={error ? 'true' : undefined}
              aria-describedby={error ? `${id}-error` : undefined}
            />
            {avisoError}
          </div>
          <div className="vt-cluster">
            <button type="submit" className="vt-btn vt-btn-primary" disabled={ocupado} aria-busy={ocupado}>
              {ocupado ? 'Revisando…' : 'Confirmar cambio'}
            </button>
            <button
              type="button"
              className="vt-btn vt-btn-ghost"
              onClick={() => {
                setError('')
                setEtapa('numero')
              }}
              disabled={ocupado}
            >
              Corregir número o pedir otro código
            </button>
            <button type="button" className="vt-btn vt-btn-ghost" onClick={cancelar} disabled={ocupado}>
              Cancelar
            </button>
          </div>
        </form>
      )}
    </section>
  )
}

export default CambioTelefonoPropio
