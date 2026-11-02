export function EstadoCarga({ texto = 'Cargando…' }) {
  return (
    <div className="vt-card vt-card-subtle" role="status">
      <p className="vt-cluster">
        <span className="vt-icon" aria-hidden="true">
          hourglass_top
        </span>
        {texto}
      </p>
    </div>
  )
}

export function EstadoError({ error, onReintentar, titulo = 'No pudimos cargar la información' }) {
  return (
    <div className="vt-alert vt-alert-error" role="alert">
      <span className="vt-icon" aria-hidden="true">
        error
      </span>
      <div className="vt-alert__content vt-stack vt-stack-sm">
        <p className="vt-alert__title">{titulo}</p>
        <p>{error?.message || 'Revisa tu conexión e inténtalo nuevamente.'}</p>
        {onReintentar && (
          <button type="button" className="vt-btn vt-btn-secondary vt-btn-sm" onClick={onReintentar}>
            <span className="vt-icon" aria-hidden="true">
              refresh
            </span>
            Intentar de nuevo
          </button>
        )}
      </div>
    </div>
  )
}

export function EstadoVacio({ icono = 'inbox', titulo, children }) {
  return (
    <div className="vt-card vt-card-subtle vt-stack vt-stack-sm">
      <p className="vt-cluster vt-headline-sm">
        <span className="vt-icon" aria-hidden="true">
          {icono}
        </span>
        {titulo}
      </p>
      {children}
    </div>
  )
}


export function MensajeExito({ texto }) {
  return (
    <div role="status">
      {texto && (
        <div className="vt-alert vt-alert-success">
          <span className="vt-icon" aria-hidden="true">
            check_circle
          </span>
          <p className="vt-alert__content">{texto}</p>
        </div>
      )}
    </div>
  )
}
