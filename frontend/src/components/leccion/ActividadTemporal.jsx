// TEMPORAL (tarea 3.23.2)
const NOMBRE_ACTIVIDAD = {
  lectura: 'Lectura',
  toque: 'Toca el botón correcto',
  opcion: 'Elige la respuesta correcta',
}

function ActividadTemporal({ actividad, guardando, onCompletar }) {
  return (
    <div className="vt-alert vt-alert-info">
      <span className="vt-icon" aria-hidden="true">
        construction
      </span>
      <div className="vt-alert__content vt-stack vt-stack-sm">
        <p className="vt-alert__title">Actividad: {NOMBRE_ACTIVIDAD[actividad?.tipo] ?? 'sin tipo'}</p>
        <p>Esta actividad se arma en las siguientes tareas. Por ahora el botón marca el paso como hecho.</p>
        <div>
          <button
            type="button"
            className="vt-btn vt-btn-primary"
            onClick={onCompletar}
            disabled={guardando}
            aria-busy={guardando}
          >
            {guardando ? 'Guardando…' : 'Marcar paso como hecho'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ActividadTemporal
