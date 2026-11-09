import { useState } from 'react'
import './Actividades.css'

function ActividadToque({ actividad, guardando, onCompletar }) {
  const [acerto, setAcerto] = useState(false)
  const [ultimaIncorrecta, setUltimaIncorrecta] = useState(null)
  const [intentosFallidos, setIntentosFallidos] = useState(0)

  function tocar(opcion) {
    if (acerto) return

    if (opcion.id === actividad.correcta) {
      setAcerto(true)
      setUltimaIncorrecta(null)
    } else {
      setUltimaIncorrecta(opcion.id)
      setIntentosFallidos((numero) => numero + 1)
    }
  }

  return (
    <div className="vt-stack">
      <div className="vt-simulator simulador">
        <p className="vt-simulator__titlebar">
          <span className="vt-cluster">
            <span className="vt-icon" aria-hidden="true">
              smartphone
            </span>
            {actividad.pantalla?.titulo}
          </span>
        </p>
        <p className="vt-simulator__notice">
          <span className="vt-icon" aria-hidden="true">
            school
          </span>
          Práctica: no es la aplicación real de tu banco
        </p>

        <div className="vt-simulator__content vt-stack">
          {actividad.pantalla?.subtitulo && (
            <p className="vt-headline-sm">{actividad.pantalla.subtitulo}</p>
          )}

          <ul className="simulador__opciones" aria-label="Botones de la pantalla de práctica">
            {actividad.opciones.map((opcion) => {
              const esCorrectaElegida = acerto && opcion.id === actividad.correcta
              const esIncorrectaElegida = opcion.id === ultimaIncorrecta

              return (
                <li key={opcion.id}>
                  <button
                    type="button"
                    className={[
                      'simulador__boton',
                      esCorrectaElegida && 'vt-sim-highlight is-correcta',
                      esIncorrectaElegida && 'is-incorrecta',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => tocar(opcion)}
                    aria-disabled={acerto && !esCorrectaElegida ? 'true' : undefined}
                  >
                    {opcion.icono && (
                      <span className="vt-icon" aria-hidden="true">
                        {opcion.icono}
                      </span>
                    )}
                    <span className="simulador__texto">{opcion.texto}</span>
                    {esCorrectaElegida && (
                      <span className="vt-icon simulador__marca" aria-hidden="true">
                        check_circle
                      </span>
                    )}
                    {esCorrectaElegida && <span className="vt-visually-hidden"> (correcto)</span>}
                    {esIncorrectaElegida && <span className="vt-visually-hidden"> (no es este)</span>}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      </div>

      {/* Los mensajes se anuncian a los lectores de pantalla */}
      <div aria-live="polite">
        {acerto && (
          <div className="vt-alert vt-alert-success">
            <span className="vt-icon" aria-hidden="true">
              check_circle
            </span>
            <p className="vt-alert__content">{actividad.mensajeAcierto}</p>
          </div>
        )}

        {!acerto && ultimaIncorrecta && (
          <div key={intentosFallidos} className="vt-alert vt-alert-warning">
            <span className="vt-icon" aria-hidden="true">
              lightbulb
            </span>
            <div className="vt-alert__content">
              <p className="vt-alert__title">Ese no es. Inténtalo otra vez</p>
              <p>{actividad.pista}</p>
            </div>
          </div>
        )}
      </div>

      {acerto && (
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
      )}
    </div>
  )
}

export default ActividadToque
