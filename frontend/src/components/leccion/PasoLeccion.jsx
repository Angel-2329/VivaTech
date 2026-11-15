import ActividadLectura from './ActividadLectura.jsx'
import ActividadOpcion from './ActividadOpcion.jsx'
import ActividadToque from './ActividadToque.jsx'
import RecursosPaso from './RecursosPaso.jsx'

function PasoLeccion({ paso, guardando, onCompletar }) {
  const iconos = paso.recursos?.filter((recurso) => recurso.tipo === 'icono') ?? []
  const otrosRecursos = paso.recursos?.filter((recurso) => recurso.tipo !== 'icono') ?? []

  return (
    <section className="vt-card vt-stack leccion__paso" aria-labelledby="titulo-paso">

      <div className="leccion__instruccion">
        <RecursosPaso recursos={iconos} />
        <p className="vt-body-lg">{paso.instruccion}</p>
      </div>

      <RecursosPaso recursos={otrosRecursos} />

      {/* key: cada paso empieza su actividad desde cero */}
      <Actividad key={paso.idPaso} actividad={paso.actividad} guardando={guardando} onCompletar={onCompletar} />
    </section>
  )
}


function Actividad({ actividad, guardando, onCompletar }) {
  if (actividad?.tipo === 'lectura') {
    return <ActividadLectura guardando={guardando} onCompletar={onCompletar} />
  }

  if (actividad?.tipo === 'toque') {
    return <ActividadToque actividad={actividad} guardando={guardando} onCompletar={onCompletar} />
  }

  if (actividad?.tipo === 'opcion') {
    return <ActividadOpcion actividad={actividad} guardando={guardando} onCompletar={onCompletar} />
  }

  return (
    <div className="vt-alert vt-alert-warning" role="alert">
      <span className="vt-icon" aria-hidden="true">
        warning
      </span>
      <p className="vt-alert__content">
        No pudimos mostrar esta actividad. Avísale a tu maestra o maestro.
      </p>
    </div>
  )
}

export default PasoLeccion
