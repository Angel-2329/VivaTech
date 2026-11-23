import { Link } from 'react-router'
import { TEXTO_BOTON_LECCION, TEXTO_ESTADO_LECCION, rutaLeccion } from '../../utils/cursos.js'

const CLASE_INSIGNIA = {
  completada: 'vt-badge vt-badge-success',
  en_progreso: 'vt-badge vt-badge-primary',
  pendiente: 'vt-badge vt-badge-neutral',
}

const CLASE_BOTON = {
  en_progreso: 'vt-btn vt-btn-primary vt-btn-sm',
  pendiente: 'vt-btn vt-btn-secondary vt-btn-sm',
  completada: 'vt-btn vt-btn-outline vt-btn-sm',
}

function ListaLecciones({ curso }) {
  return (
    <details className="mis-cursos__lecciones">
      <summary className="vt-btn vt-btn-ghost vt-btn-sm">
        <span className="vt-icon" aria-hidden="true">
          list
        </span>
        Ver lecciones
        <span className="vt-visually-hidden"> de {curso.titulo}</span>
      </summary>

      <ol className="vt-lesson-list" aria-label={`Lecciones de ${curso.titulo}`}>
        {curso.lecciones.map((leccion, posicion) => (
          <li key={leccion.idLeccion} className={leccion.estado === 'en_progreso' ? 'vt-lesson is-current' : 'vt-lesson'}>
            <span
              className={leccion.estado === 'completada' ? 'mis-cursos__numero is-completada' : 'mis-cursos__numero'}
              aria-hidden="true"
            >
              {leccion.estado === 'completada' ? <span className="vt-icon">check</span> : posicion + 1}
            </span>

            <div className="vt-lesson__body">
              <p className="vt-lesson__title">
                <span className="vt-visually-hidden">Lección {posicion + 1}: </span>
                {leccion.titulo}
              </p>
              <p className="vt-lesson__meta">
                <span className={CLASE_INSIGNIA[leccion.estado]}>{TEXTO_ESTADO_LECCION[leccion.estado]}</span>
                <span>{leccion.duracionEstimadaMinutos} min</span>
              </p>
            </div>

            <Link className={CLASE_BOTON[leccion.estado]} to={rutaLeccion(leccion.idLeccion)}>
              {TEXTO_BOTON_LECCION[leccion.estado]}
              <span className="vt-visually-hidden">: {leccion.titulo}</span>
            </Link>
          </li>
        ))}
      </ol>
    </details>
  )
}

export default ListaLecciones
