// Paso de teoría: el alumno lee y presiona "Entendido, continuar".
// Al presionarlo se guarda el paso; avanza solo cuando responde el servidor.

function ActividadLectura({ guardando, onCompletar }) {
  return (
    <div>
      <button
        type="button"
        className="vt-btn vt-btn-primary"
        onClick={onCompletar}
        disabled={guardando}
        aria-busy={guardando}
      >
        {guardando ? 'Guardando…' : 'Entendido, continuar'}
        {!guardando && (
          <span className="vt-icon" aria-hidden="true">
            arrow_forward
          </span>
        )}
      </button>
    </div>
  )
}

export default ActividadLectura
