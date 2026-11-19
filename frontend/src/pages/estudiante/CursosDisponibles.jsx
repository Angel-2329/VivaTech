import { Link } from 'react-router'
import BarraAvance from '../../components/panel/BarraAvance.jsx'
import PlantillaPanel from '../../components/panel/PlantillaPanel.jsx'
import { EstadoCarga, EstadoError, EstadoVacio } from '../../components/panel/EstadosCarga.jsx'
import { useDatos } from '../../hooks/useDatos.js'
import { obtenerCursosDisponibles } from '../../services/cursosService.js'
import { RUTA_TERMINADOS, rutaLeccion, textoDuracion } from '../../utils/cursos.js'
import { textoFecha } from '../../utils/fechas.js'
import { plural } from '../../utils/formato.js'
import './Estudiante.css'

const ICONOS = ['account_balance', 'receipt_long']

function CursosDisponibles() {
  const { datos: categorias, cargando, error, reintentar } = useDatos(obtenerCursosDisponibles)

  return (
    <PlantillaPanel
      titulo="Cursos disponibles"
      descripcion="Elige un curso para empezar. Puedes tomar cualquiera y avanzar a tu ritmo."
      regresarA="/estudiante"
      textoRegresar="Regresar al inicio"
    >
      {cargando && <EstadoCarga texto="Cargando los cursos…" />}
      {error && <EstadoError error={error} onReintentar={reintentar} />}

      {categorias?.length === 0 && (
        <EstadoVacio icono="menu_book" titulo="Todavía no hay cursos publicados">
          <p>Vuelve pronto.</p>
        </EstadoVacio>
      )}

      {categorias?.map((categoria, posicion) => (
        <section key={categoria.idCategoria} className="vt-stack" aria-labelledby={`categoria-${categoria.idCategoria}`}>
          <div className="vt-cluster">
            <span className="vt-category-icon" aria-hidden="true">
              <span className="vt-icon">{ICONOS[posicion % ICONOS.length]}</span>
            </span>
            <div>
              <h2 id={`categoria-${categoria.idCategoria}`} className="vt-headline-md">
                {categoria.nombre}
              </h2>
              <p className="vt-body-sm vt-text-muted">{plural(categoria.cursos.length, 'curso', 'cursos')}</p>
            </div>
          </div>

          <ul className="vt-grid-auto cursos__lista">
            {categoria.cursos.map((curso) => (
              <li key={curso.idCurso}>
                <TarjetaCatalogo curso={curso} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </PlantillaPanel>
  )
}

function TarjetaCatalogo({ curso }) {
  return (
    <article className="vt-card vt-card-flat vt-stack cursos__tarjeta" aria-labelledby={`curso-${curso.idCurso}`}>
      <div className="vt-stack vt-stack-sm">
        {curso.estado === 'en_curso' && (
          <p>
            <span className="vt-badge vt-badge-primary">En curso</span>
          </p>
        )}
        {curso.estado === 'terminado' && (
          <p>
            <span className="vt-badge vt-badge-success">
              <span className="vt-icon" aria-hidden="true">
                check_circle
              </span>
              Terminado
            </span>
          </p>
        )}

        <h3 id={`curso-${curso.idCurso}`} className="vt-headline-sm">
          {curso.titulo}
        </h3>
        <p>{curso.descripcion}</p>
        <p className="vt-body-sm vt-text-muted">{textoDuracion(curso)}</p>

        {curso.fechaCierre && !curso.cerrado && (
          <p className="vt-cluster vt-body-sm">
            <span className="vt-icon" aria-hidden="true">
              event
            </span>
            Disponible hasta el {textoFecha(curso.fechaCierre)}
          </p>
        )}
      </div>

      {curso.cerrado && (
        <div className="vt-alert vt-alert-warning">
          <span className="vt-icon" aria-hidden="true">
            event_busy
          </span>
          <p className="vt-alert__content">Este curso cerró, pero puedes terminarlo.</p>
        </div>
      )}

      {curso.estado === 'en_curso' && (
        <BarraAvance completadas={curso.leccionesCompletadas} total={curso.totalLecciones} pequena />
      )}

      <div className="cursos__acciones">
        <BotonCatalogo curso={curso} />
      </div>
    </article>
  )
}

function BotonCatalogo({ curso }) {
  if (curso.estado === 'terminado') {
    return (
      <Link className="vt-btn vt-btn-outline" to={RUTA_TERMINADOS}>
        Ver en Mis cursos
        <span className="vt-visually-hidden">: {curso.titulo}</span>
      </Link>
    )
  }

  if (!curso.siguienteLeccion) return null

  const empezar = curso.estado === 'sin_empezar'

  return (
    <Link
      className={empezar ? 'vt-btn vt-btn-primary' : 'vt-btn vt-btn-secondary'}
      to={rutaLeccion(curso.siguienteLeccion.idLeccion)}
    >
      {empezar ? 'Empezar curso' : 'Continuar'}
      <span className="vt-visually-hidden">: {curso.titulo}</span>
      <span className="vt-icon" aria-hidden="true">
        arrow_forward
      </span>
    </Link>
  )
}

export default CursosDisponibles
