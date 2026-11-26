import { useEffect, useId, useRef, useState } from 'react'
import DialogoConfirmacion from '../panel/DialogoConfirmacion.jsx'
import { cambiarTelefono } from '../../services/adminService.js'
import { NOMBRE_DEL_ROL } from '../../utils/formato.js'
import {
  DIGITOS_TELEFONO,
  formatearTelefono,
  limpiarTelefono,
  telefonoCompleto,
  telefonoInternacional,
} from '../../utils/telefono.js'

const ERRORES_DEL_CAMPO = {
  telefono_invalido: 'Escribe los 10 dígitos del número nuevo, sin la lada +52.',
  telefono_sin_cambios: 'Ese ya es el número de esta cuenta. Escribe uno distinto.',
  telefono_en_uso: 'Ese número ya lo usa otra cuenta de Viva Tech. Revísalo con la persona.',
}

const ERRORES_GENERALES = {
  cambio_propio_no_permitido: 'Tu propio número no se cambia desde aquí.',
  usuario_no_encontrado: 'Esta cuenta ya no existe. Cierra este aviso y vuelve a buscarla.',
  identidad_no_disponible: 'No pudimos comunicarnos con el servicio de acceso. El número no cambió. Inténtalo en unos minutos.',
}

function DialogoCambioTelefono({ cuenta, onCerrar, onCambiado }) {
  const [telefono, setTelefono] = useState('')
  const [etapa, setEtapa] = useState('escribir')
  const [errorCampo, setErrorCampo] = useState('')
  const [errorGeneral, setErrorGeneral] = useState('')
  const [guardando, setGuardando] = useState(false)
  const campoRef = useRef(null)
  const confirmacionRef = useRef(null)
  const id = useId()

  useEffect(() => {
    if (etapa === 'confirmar') confirmacionRef.current?.focus()
    else campoRef.current?.focus()
  }, [etapa, errorCampo])

  function manejarCambio(evento) {
    setTelefono(limpiarTelefono(evento.target.value))
    if (errorCampo) setErrorCampo('')
    if (errorGeneral) setErrorGeneral('')
  }

  function revisarNumero(evento) {
    evento?.preventDefault()
    if (!telefonoCompleto(telefono)) {
      setErrorCampo(`El número debe tener ${DIGITOS_TELEFONO} dígitos. Llevas ${telefono.length}.`)
      campoRef.current?.focus()
      return
    }
    setErrorGeneral('')
    setEtapa('confirmar')
  }

  function corregirNumero() {
    setEtapa('escribir')
    setErrorGeneral('')
  }

  async function confirmarCambio() {
    if (guardando) return
    setGuardando(true)
    setErrorGeneral('')

    try {
      await cambiarTelefono(cuenta.uid, telefonoInternacional(telefono))
      onCambiado(`El número de ${cuenta.nombreCompleto} ahora es +52 ${formatearTelefono(telefono)}. La próxima vez entrará con ese número.`)
    } catch (error) {
      if (ERRORES_DEL_CAMPO[error.codigo]) {
        setEtapa('escribir')
        setErrorCampo(ERRORES_DEL_CAMPO[error.codigo])
      } else if (error.estado === 503 && !error.codigo) {
        setErrorGeneral(
          'No pudimos confirmar el cambio. Es posible que el número sí haya cambiado; revísalo antes de intentar de nuevo.',
        )
      } else {
        setErrorGeneral(
          ERRORES_GENERALES[error.codigo] ?? (error.message || 'No pudimos cambiar el número. Inténtalo otra vez.'),
        )
      }
      setGuardando(false)
    }
  }

  const escribiendo = etapa === 'escribir'

  return (
    <DialogoConfirmacion
      abierto
      titulo={`Cambiar el teléfono de ${cuenta.nombreCompleto}`}
      textoConfirmar={escribiendo ? 'Continuar' : 'Sí, cambiar teléfono'}
      procesando={guardando}
      error={errorGeneral}
      onConfirmar={escribiendo ? revisarNumero : confirmarCambio}
      onCancelar={onCerrar}
    >
      <dl className="admin__resumen vt-stack vt-stack-sm">
        <div>
          <dt className="vt-text-muted">Nombre</dt>
          <dd>
            <strong>{cuenta.nombreCompleto}</strong>
          </dd>
        </div>
        <div>
          <dt className="vt-text-muted">Apodo</dt>
          <dd>{cuenta.apodo || 'Sin apodo'}</dd>
        </div>
        <div>
          <dt className="vt-text-muted">Rol</dt>
          <dd>{NOMBRE_DEL_ROL[cuenta.rol]}</dd>
        </div>
        <div>
          <dt className="vt-text-muted">Estado de la cuenta</dt>
          <dd>{cuenta.activo ? 'Activa' : 'Desactivada'}</dd>
        </div>
      </dl>

      {escribiendo ? (
        <form className="vt-field" onSubmit={revisarNumero} noValidate>
          <label className="vt-field-label" htmlFor={`${id}-telefono`}>
            Número nuevo (10 dígitos)
          </label>
          <p id={`${id}-ayuda`} className="vt-field-help">
            Confirma el número con la persona antes de cambiarlo. Con ese número entrará a Viva Tech. Ejemplo: 951 123 4567.
          </p>
          <div className="vt-input-group" data-invalid={errorCampo ? 'true' : undefined}>
            <span className="vt-input-group__addon" aria-hidden="true">
              MX +52
            </span>
            <input
              ref={campoRef}
              id={`${id}-telefono`}
              className="vt-input"
              type="tel"
              inputMode="numeric"
              autoComplete="off"
              value={telefono}
              onChange={manejarCambio}
              aria-invalid={errorCampo ? 'true' : undefined}
              aria-describedby={`${id}-ayuda ${id}-contador${errorCampo ? ` ${id}-error` : ''}`}
            />
          </div>
          <p id={`${id}-contador`} className="vt-field-counter">
            {telefono.length} de {DIGITOS_TELEFONO} números escritos
          </p>
          {errorCampo && (
            <p id={`${id}-error`} className="vt-field-error" role="alert">
              <span className="vt-icon" aria-hidden="true">
                error
              </span>
              {errorCampo}
            </p>
          )}
        </form>
      ) : (
        <div className="vt-stack vt-stack-sm">
          <p ref={confirmacionRef} tabIndex={-1}>
            ¿El número nuevo es <strong>+52 {formatearTelefono(telefono)}</strong>? El número anterior dejará de
            funcionar para entrar.
          </p>
          <div>
            <button type="button" className="vt-btn vt-btn-ghost vt-btn-sm" onClick={corregirNumero} disabled={guardando}>
              <span className="vt-icon" aria-hidden="true">
                edit
              </span>
              Corregir número
            </button>
          </div>
        </div>
      )}
    </DialogoConfirmacion>
  )
}

export default DialogoCambioTelefono
