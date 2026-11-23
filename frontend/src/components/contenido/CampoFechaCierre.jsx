import { useId } from 'react'
import { hoyEnMexico } from '../../utils/fechas.js'


function CampoFechaCierre({ valor, onCambiar, error, campoRef, deshabilitado }) {
  const id = useId()

  return (
    <div className="vt-field">
      <label className="vt-field-label" htmlFor={id}>
        Disponible hasta (opcional)
      </label>
      <p id={`${id}-ayuda`} className="vt-field-help">
        Déjalo vacío si el curso no cierra. Después de esa fecha nadie nuevo puede empezarlo, pero quien ya empezó
        puede terminarlo.
      </p>
      <input
        ref={campoRef}
        id={id}
        className="vt-input contenido__fecha"
        type="date"
        min={hoyEnMexico()}
        value={valor}
        disabled={deshabilitado}
        onChange={(evento) => onCambiar(evento.target.value)}
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
  )
}

export default CampoFechaCierre
