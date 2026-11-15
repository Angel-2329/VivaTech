import { useId } from 'react'
import { clasesOpcion, useRespuesta } from '../../hooks/useRespuesta.js'
import { BotonContinuar, MensajesRespuesta } from './RespuestaActividad.jsx'
import './Actividades.css'

const LETRAS = ['A', 'B', 'C', 'D']

function ActividadOpcion({ actividad, guardando, onCompletar }) {
  const idPregunta = useId()
  const respuesta = useRespuesta(actividad.correcta)
  const { acerto, ultimaIncorrecta, elegir } = respuesta

  return (
    <div className="vt-stack">
      <p id={idPregunta} className="vt-headline-sm">
        {actividad.pregunta}
      </p>

      <ul className="opciones" aria-labelledby={idPregunta}>
        {actividad.opciones.map((opcion, posicion) => {
          const esCorrectaElegida = acerto && opcion.id === actividad.correcta
          const esIncorrectaElegida = opcion.id === ultimaIncorrecta

          return (
            <li key={opcion.id}>
              <button
                type="button"
                className={clasesOpcion('opciones__boton', { esCorrectaElegida, esIncorrectaElegida })}
                onClick={() => elegir(opcion.id)}
                aria-disabled={acerto && !esCorrectaElegida ? 'true' : undefined}
              >
                <span className="opciones__letra" aria-hidden="true">
                  {esCorrectaElegida ? <span className="vt-icon">check</span> : LETRAS[posicion]}
                </span>
                <span className="opciones__texto">{opcion.texto}</span>
                {esCorrectaElegida && <span className="vt-visually-hidden"> (respuesta correcta)</span>}
                {esIncorrectaElegida && <span className="vt-visually-hidden"> (respuesta incorrecta)</span>}
              </button>
            </li>
          )
        })}
      </ul>

      <MensajesRespuesta {...respuesta} mensajeAcierto={actividad.mensajeAcierto} pista={actividad.pista} />

      {acerto && <BotonContinuar guardando={guardando} onCompletar={onCompletar} />}
    </div>
  )
}

export default ActividadOpcion
