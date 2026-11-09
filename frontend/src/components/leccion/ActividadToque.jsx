import { clasesOpcion, useRespuesta } from '../../hooks/useRespuesta.js'
import { BotonContinuar, MensajesRespuesta } from './RespuestaActividad.jsx'
import './Actividades.css'

function ActividadToque({ actividad, guardando, onCompletar }) {
  const respuesta = useRespuesta(actividad.correcta)
  const { acerto, ultimaIncorrecta, elegir } = respuesta

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
                    className={clasesOpcion('simulador__boton', { esCorrectaElegida, esIncorrectaElegida })}
                    onClick={() => elegir(opcion.id)}
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

      <MensajesRespuesta {...respuesta} mensajeAcierto={actividad.mensajeAcierto} pista={actividad.pista} />

      {acerto && <BotonContinuar guardando={guardando} onCompletar={onCompletar} />}
    </div>
  )
}

export default ActividadToque
