import { useState } from 'react'
import PasoLeccion from '../leccion/PasoLeccion.jsx'
import '../../pages/estudiante/Leccion.css'


function VistaPreviaPaso({ paso, numero }) {
  const [vuelta, setVuelta] = useState(0)
  const [completado, setCompletado] = useState(false)

  return (
    <section className="vt-stack vt-stack-sm editor__vista-previa" aria-labelledby="titulo-paso">
      <div className="vt-cluster vt-cluster-between">
        <h4 id="titulo-paso" className="vt-label-lg">
          Vista previa del paso {numero}: así lo ve el alumno
        </h4>
        <button
          type="button"
          className="vt-btn vt-btn-ghost vt-btn-sm"
          onClick={() => {
            setVuelta((actual) => actual + 1)
            setCompletado(false)
          }}
        >
          <span className="vt-icon" aria-hidden="true">
            replay
          </span>
          Reiniciar vista previa
        </button>
      </div>

      <PasoLeccion
        key={vuelta}
        paso={{ ...paso, idPaso: `vista-previa-${vuelta}` }}
        guardando={false}
        onCompletar={() => setCompletado(true)}
      />

      <p className="vt-body-sm vt-text-muted" role="status">
        {completado ? 'Así termina el paso. En la vista previa no se guarda ningún avance.' : ''}
      </p>
    </section>
  )
}

export default VistaPreviaPaso
