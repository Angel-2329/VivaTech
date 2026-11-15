import { useRespuesta } from '../../hooks/useRespuesta.js'
import BotonesApp from '../simulador/BotonesApp.jsx'
import EncabezadoAppBanco from '../simulador/EncabezadoAppBanco.jsx'
import TelefonoSimulado from '../simulador/TelefonoSimulado.jsx'
import { BotonContinuar, MensajesRespuesta } from './RespuestaActividad.jsx'
import './Actividades.css'


function ActividadToque({ actividad, guardando, onCompletar }) {
  const respuesta = useRespuesta(actividad.correcta)
  const { acerto, ultimaIncorrecta, intentosFallidos, elegir } = respuesta
  const titulo = actividad.pantalla?.titulo ?? 'Banco Ejemplo'

  let aviso = null
  if (acerto) {
    aviso = (
      <p className="app-banco__aviso is-correcto" aria-hidden="true">
        <span className="vt-icon">check_circle</span>
        ¡Correcto!
      </p>
    )
  } else if (ultimaIncorrecta) {
    aviso = (
      <p key={intentosFallidos} className="app-banco__aviso is-incorrecto" aria-hidden="true">
        <span className="vt-icon">info</span>
        Ese no es. Intenta otra vez
      </p>
    )
  }

  return (
    <div className="vt-stack">
      <TelefonoSimulado etiqueta={`Pantalla de práctica: ${titulo}`} aviso={aviso}>
        <EncabezadoAppBanco titulo={titulo} />
        <div className="app-banco__contenido">
          {actividad.pantalla?.subtitulo && <p className="app-banco__subtitulo">{actividad.pantalla.subtitulo}</p>}
          <BotonesApp
            opciones={actividad.opciones}
            correcta={actividad.correcta}
            acerto={acerto}
            ultimaIncorrecta={ultimaIncorrecta}
            intentosFallidos={intentosFallidos}
            onElegir={elegir}
          />
        </div>
      </TelefonoSimulado>

      <MensajesRespuesta {...respuesta} mensajeAcierto={actividad.mensajeAcierto} pista={actividad.pista} />

      {acerto && <BotonContinuar guardando={guardando} onCompletar={onCompletar} />}
    </div>
  )
}

export default ActividadToque
