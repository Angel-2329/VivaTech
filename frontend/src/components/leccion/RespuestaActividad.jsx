export function MensajesRespuesta({ acerto, ultimaIncorrecta, intentosFallidos, mensajeAcierto, pista }) {
  return (
    <div aria-live="polite">
      {acerto && (
        <div className="vt-alert vt-alert-success">
          <span className="vt-icon" aria-hidden="true">
            check_circle
          </span>
          <p className="vt-alert__content">{mensajeAcierto}</p>
        </div>
      )}

      {!acerto && ultimaIncorrecta && (
        <div key={intentosFallidos} className="vt-alert vt-alert-warning">
          <span className="vt-icon" aria-hidden="true">
            lightbulb
          </span>
          <div className="vt-alert__content">
            <p className="vt-alert__title">Esa no es. Inténtalo otra vez</p>
            <p>{pista}</p>
          </div>
        </div>
      )}
    </div>
  )
}

export function BotonContinuar({ guardando, onCompletar }) {
  return (
    <div>
      <button
        type="button"
        className="vt-btn vt-btn-primary"
        onClick={onCompletar}
        disabled={guardando}
        aria-busy={guardando}
      >
        {guardando ? 'Guardando…' : 'Continuar'}
        {!guardando && (
          <span className="vt-icon" aria-hidden="true">
            arrow_forward
          </span>
        )}
      </button>
    </div>
  )
}
