import { useEffect, useId, useRef } from 'react'

function DialogoConfirmacion({
  abierto,
  titulo,
  children,
  textoConfirmar,
  peligro = false,
  procesando = false,
  error = '',
  onConfirmar,
  onCancelar,
}) {
  const dialogoRef = useRef(null)
  const id = useId()

  useEffect(() => {
    const dialogo = dialogoRef.current
    if (!abierto || !dialogo) return undefined

    const elementoAnterior = document.activeElement
    if (!dialogo.open) dialogo.showModal()

    return () => {
      if (dialogo.open) dialogo.close()
      elementoAnterior?.focus?.()
    }
  }, [abierto])

  function manejarCancelacion(evento) {
    evento.preventDefault()
    if (!procesando) onCancelar()
  }

  return (
    <dialog
      ref={dialogoRef}
      className="vt-dialog"
      aria-labelledby={`${id}-titulo`}
      aria-describedby={`${id}-texto`}
      onCancel={manejarCancelacion}
    >
      <div className="vt-stack">
        <h2 id={`${id}-titulo`} className="vt-headline-md">
          {titulo}
        </h2>

        <div id={`${id}-texto`} className="vt-stack vt-stack-sm">
          {children}
        </div>

        {error && (
          <div className="vt-alert vt-alert-error" role="alert">
            <span className="vt-icon" aria-hidden="true">
              error
            </span>
            <p className="vt-alert__content">{error}</p>
          </div>
        )}

        <div className="vt-cluster">
          <button
            type="button"
            className="vt-btn vt-btn-secondary"
            onClick={onCancelar}
            disabled={procesando}
          >
            {textoConfirmar ? 'Cancelar' : 'Entendido'}
          </button>

          {textoConfirmar && (
            <button
              type="button"
              className={peligro ? 'vt-btn vt-btn-danger' : 'vt-btn vt-btn-primary'}
              onClick={onConfirmar}
              disabled={procesando}
              aria-busy={procesando}
            >
              {procesando ? 'Un momento…' : textoConfirmar}
            </button>
          )}
        </div>
      </div>
    </dialog>
  )
}

export default DialogoConfirmacion
