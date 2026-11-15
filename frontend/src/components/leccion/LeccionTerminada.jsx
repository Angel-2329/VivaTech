import { useEffect, useRef } from 'react'
import { Link } from 'react-router'
import BotonCertificado from '../certificado/BotonCertificado.jsx'


function LeccionTerminada({ leccion, cursoCompletado, certificado, onRepasar }) {
  const tituloRef = useRef(null)

  useEffect(() => {
    tituloRef.current?.focus()
  }, [])

  return (
    <section className="vt-card vt-card-highlight vt-stack vt-stack-lg" aria-labelledby="leccion-terminada">
      <div className="vt-success-hero">
        <span className="vt-success-hero__icon" aria-hidden="true">
          <span className="vt-icon">{cursoCompletado ? 'workspace_premium' : 'celebration'}</span>
        </span>
        <div className="vt-stack vt-stack-sm">
          <h2 id="leccion-terminada" ref={tituloRef} tabIndex={-1} className="vt-headline-lg">
            ¡Terminaste la lección!
          </h2>
          <p className="vt-body-lg">
            Completaste «{leccion.titulo}». Tu avance quedó guardado.
          </p>
          {cursoCompletado && (
            <p className="vt-body-lg">
              <strong>¡Felicidades! Terminaste todo el curso «{leccion.tituloCurso}».</strong>
            </p>
          )}
        </div>
      </div>

      <div className="leccion__acciones">
        
        {cursoCompletado && (
          <BotonCertificado idCurso={leccion.idCurso} tituloCurso={leccion.tituloCurso} certificado={certificado} />
        )}

        {leccion.siguienteLeccion && (
          <Link
            className={cursoCompletado ? 'vt-btn vt-btn-secondary' : 'vt-btn vt-btn-primary'}
            to={`/estudiante/lecciones/${leccion.siguienteLeccion.idLeccion}`}
          >
            Siguiente lección: {leccion.siguienteLeccion.titulo}
            <span className="vt-icon" aria-hidden="true">
              arrow_forward
            </span>
          </Link>
        )}

        <Link
          className={leccion.siguienteLeccion || cursoCompletado ? 'vt-btn vt-btn-outline' : 'vt-btn vt-btn-primary'}
          to="/estudiante/cursos"
        >
          Volver a Mis cursos
        </Link>

        <button type="button" className="vt-btn vt-btn-ghost" onClick={onRepasar}>
          <span className="vt-icon" aria-hidden="true">
            replay
          </span>
          Repasar la lección
        </button>
      </div>
    </section>
  )
}

export default LeccionTerminada
