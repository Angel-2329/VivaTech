import ActividadLectura from './ActividadLectura.jsx'
import ActividadTemporal from './ActividadTemporal.jsx'
import ActividadToque from './ActividadToque.jsx'
import RecursosPaso from './RecursosPaso.jsx'

function PasoLeccion({ paso, numero, guardando, onCompletar }) {
  const iconos = paso.recursos?.filter((recurso) => recurso.tipo === 'icono') ?? []
  const otrosRecursos = paso.recursos?.filter((recurso) => recurso.tipo !== 'icono') ?? []

  return (
    <section className="vt-card vt-stack leccion__paso" aria-labelledby={`paso-${paso.idPaso}`}>
      <h2 id={`paso-${paso.idPaso}`} className="vt-visually-hidden">
        Paso {numero}
      </h2>

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

  return <ActividadTemporal actividad={actividad} guardando={guardando} onCompletar={onCompletar} />
}

export default PasoLeccion
