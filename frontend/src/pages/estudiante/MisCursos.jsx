import { Link } from 'react-router'
import BarraAvance from '../../components/panel/BarraAvance.jsx'
import PlantillaPanel from '../../components/panel/PlantillaPanel.jsx'
import { EstadoCarga, EstadoError, EstadoVacio } from '../../components/panel/EstadosCarga.jsx'
import { useDatos } from '../../hooks/useDatos.js'
import { obtenerMisCursos } from '../../services/cursosService.js'
import { TEXTO_BOTON_LECCION, TEXTO_ESTADO_LECCION, contarCompletadas, rutaLeccion } from '../../utils/cursos.js'
import { plural } from '../../utils/formato.js'
import './Estudiante.css'


const ICONOS = ['account_balance', 'receipt_long']

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


function MisCursos() {
  const { datos: categorias, cargando, error, reintentar } = useDatos(obtenerMisCursos)

  return (
    <PlantillaPanel
      titulo="Mis cursos"
      descripcion="Elige una categoría para ver sus cursos y lecciones."
      regresarA="/estudiante"
      textoRegresar="Regresar al inicio"
    >
      {cargando && <EstadoCarga texto="Cargando tus cursos…" />}
      {error && <EstadoError error={error} onReintentar={reintentar} />}

      {categorias?.length === 0 && (
        <EstadoVacio icono="menu_book" titulo="Todavía no hay cursos disponibles">
          <p>Tu maestra o maestro te avisará cuando haya cursos nuevos.</p>
        </EstadoVacio>
      )}

      {categorias?.length > 0 && (
        <div>
          {categorias.map((categoria, posicion) => (
            <Categoria
              key={categoria.idCategoria}
              categoria={categoria}
              icono={ICONOS[posicion % ICONOS.length]}
              abiertaAlInicio={posicion === 0}
            />
          ))}
        </div>
      )}
    </PlantillaPanel>
  )
}

function Categoria({ categoria, icono, abiertaAlInicio }) {
  return (
    <details className="vt-accordion" open={abiertaAlInicio}>
      <summary className="vt-accordion__summary">
        <span className="vt-category-icon" aria-hidden="true">
          <span className="vt-icon">{icono}</span>
        </span>
        <span className="vt-accordion__title mis-cursos__categoria">
          <span className="vt-headline-sm">{categoria.nombre}</span>
          <span className="vt-body-sm vt-text-muted">
            {plural(categoria.cursos.length, 'curso', 'cursos')}
          </span>
        </span>
        <span className="vt-accordion__toggle" aria-hidden="true">
          <span className="is-closed">Mostrar cursos</span>
          <span className="is-open">Ocultar cursos</span>
          <span className="vt-icon">expand_more</span>
        </span>
      </summary>

      <div className="vt-accordion__content">
        {categoria.cursos.map((curso) => (
          <Curso key={curso.idCurso} curso={curso} />
        ))}
      </div>
    </details>
  )
}

function Curso({ curso }) {
  const minutos = curso.lecciones.reduce((suma, leccion) => suma + leccion.duracionEstimadaMinutos, 0)

  return (
    <section className="vt-card vt-card-flat vt-stack" aria-labelledby={`curso-${curso.idCurso}`}>
      <div className="vt-stack vt-stack-sm">
        <h2 id={`curso-${curso.idCurso}`} className="vt-headline-md">
          {curso.titulo}
        </h2>
        <p>{curso.descripcion}</p>
        <p className="vt-body-sm vt-text-muted">
          {plural(curso.lecciones.length, 'lección', 'lecciones')} · {minutos} min en total
        </p>
      </div>

      <BarraAvance completadas={contarCompletadas(curso.lecciones)} total={curso.lecciones.length} />

      <ol className="vt-lesson-list" aria-label={`Lecciones de ${curso.titulo}`}>
        {curso.lecciones.map((leccion, posicion) => (
          <li
            key={leccion.idLeccion}
            className={leccion.estado === 'en_progreso' ? 'vt-lesson is-current' : 'vt-lesson'}
          >
            <span
              className={
                leccion.estado === 'completada'
                  ? 'mis-cursos__numero is-completada'
                  : 'mis-cursos__numero'
              }
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
                <span className={CLASE_INSIGNIA[leccion.estado]}>
                  {TEXTO_ESTADO_LECCION[leccion.estado]}
                </span>
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
    </section>
  )
}

export default MisCursos
