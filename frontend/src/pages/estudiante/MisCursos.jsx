import { Link } from 'react-router'
import BotonCertificado from '../../components/certificado/BotonCertificado.jsx'
import ListaLecciones from '../../components/cursos/ListaLecciones.jsx'
import BarraAvance from '../../components/panel/BarraAvance.jsx'
import PlantillaPanel from '../../components/panel/PlantillaPanel.jsx'
import { EstadoCarga, EstadoError, EstadoVacio } from '../../components/panel/EstadosCarga.jsx'
import { useDatos } from '../../hooks/useDatos.js'
import { obtenerCursosEnCurso, obtenerCursosTerminados } from '../../services/cursosService.js'
import { RUTA_CURSOS_DISPONIBLES, RUTA_EN_CURSO, RUTA_TERMINADOS, rutaLeccion } from '../../utils/cursos.js'
import { textoFecha, textoInstante } from '../../utils/fechas.js'
import './Estudiante.css'

const SECCIONES = {
  'en-curso': {
    texto: 'En curso',
    ruta: RUTA_EN_CURSO,
    descripcion: 'Los cursos que empezaste y todavía no terminas.',
    cargar: obtenerCursosEnCurso,
    textoCarga: 'Cargando tus cursos en curso…',
  },
  terminados: {
    texto: 'Terminados',
    ruta: RUTA_TERMINADOS,
    descripcion: 'Los cursos que ya completaste. Puedes repasarlos cuando quieras.',
    cargar: obtenerCursosTerminados,
    textoCarga: 'Cargando tus cursos terminados…',
  },
}

function MisCursos({ seccion }) {
  const actual = SECCIONES[seccion]
  const { datos: cursos, cargando, error, reintentar } = useDatos(actual.cargar)

  return (
    <PlantillaPanel titulo="Mis cursos" descripcion={actual.descripcion} regresarA="/estudiante" textoRegresar="Regresar al inicio">
      <nav className="vt-tabs mis-cursos__secciones" aria-label="Secciones de Mis cursos">
        {Object.entries(SECCIONES).map(([clave, opcion]) => (
          <Link key={clave} className="vt-tab" to={opcion.ruta} aria-current={clave === seccion ? 'page' : undefined}>
            {opcion.texto}
          </Link>
        ))}
      </nav>

      {cargando && <EstadoCarga texto={actual.textoCarga} />}
      {error && <EstadoError error={error} onReintentar={reintentar} />}

      {cursos?.length === 0 && seccion === 'en-curso' && (
        <EstadoVacio icono="menu_book" titulo="Aún no empiezas ningún curso">
          <div>
            <Link className="vt-btn vt-btn-primary" to={RUTA_CURSOS_DISPONIBLES}>
              Ver cursos disponibles
            </Link>
          </div>
        </EstadoVacio>
      )}

      {cursos?.length === 0 && seccion === 'terminados' && (
        <EstadoVacio icono="workspace_premium" titulo="Todavía no terminas ningún curso">
          <p>Cuando completes todas sus lecciones, aparecerá aquí.</p>
        </EstadoVacio>
      )}

      {cursos?.length > 0 && (
        <ul className="vt-stack mis-cursos__lista">
          {cursos.map((curso) => (
            <li key={curso.idCurso}>
              {seccion === 'en-curso' ? <CursoEnCurso curso={curso} /> : <CursoTerminado curso={curso} />}
            </li>
          ))}
        </ul>
      )}
    </PlantillaPanel>
  )
}

function CursoEnCurso({ curso }) {
  return (
    <article className="vt-card vt-card-flat vt-stack" aria-labelledby={`curso-${curso.idCurso}`}>
      <div className="vt-stack vt-stack-sm">
        <p className="vt-eyebrow">{curso.categoria.nombre}</p>
        <h2 id={`curso-${curso.idCurso}`} className="vt-headline-md">
          {curso.titulo}
        </h2>
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

      <BarraAvance completadas={curso.leccionesCompletadas} total={curso.totalLecciones} />

      {curso.siguienteLeccion && (
        <div className="mis-cursos__siguiente">
          <p>
            <span className="vt-text-muted">Siguiente: </span>
            <strong>{curso.siguienteLeccion.titulo}</strong>
          </p>
          <Link className="vt-btn vt-btn-primary" to={rutaLeccion(curso.siguienteLeccion.idLeccion)}>
            Continuar
            <span className="vt-visually-hidden">: {curso.titulo}</span>
            <span className="vt-icon" aria-hidden="true">
              arrow_forward
            </span>
          </Link>
        </div>
      )}

      <ListaLecciones curso={curso} />
    </article>
  )
}

function CursoTerminado({ curso }) {
  const primeraLeccion = curso.lecciones[0]

  return (
    <article className="vt-card vt-card-flat vt-stack" aria-labelledby={`curso-${curso.idCurso}`}>
      <div className="vt-stack vt-stack-sm">
        <p className="vt-eyebrow">{curso.categoria.nombre}</p>
        <h2 id={`curso-${curso.idCurso}`} className="vt-headline-md">
          {curso.titulo}
        </h2>
        <p className="vt-cluster">
          {curso.retirado ? (
            <span className="vt-badge vt-badge-neutral">
              <span className="vt-icon" aria-hidden="true">
                archive
              </span>
              Retirado
            </span>
          ) : (
            <span className="vt-badge vt-badge-success">
              <span className="vt-icon" aria-hidden="true">
                check_circle
              </span>
              Terminado
            </span>
          )}
          {curso.fechaFinalizacion && (
            <span className="vt-body-sm">Terminado el {textoInstante(curso.fechaFinalizacion)}</span>
          )}
        </p>
        {curso.certificado && <p className="vt-body-sm vt-text-muted">Folio {curso.certificado.folio}</p>}
      </div>

      {curso.retirado && (
        <p className="vt-text-muted">
          {curso.certificado
            ? 'Este curso ya no está disponible. Tu certificado sigue siendo válido.'
            : 'Este curso ya no está disponible. Todavía puedes obtener tu certificado.'}
        </p>
      )}

      <div className="cursos__acciones">
        <BotonCertificado idCurso={curso.idCurso} tituloCurso={curso.titulo} certificado={curso.certificado} />

        {!curso.retirado && primeraLeccion && (
          <Link className="vt-btn vt-btn-outline" to={rutaLeccion(primeraLeccion.idLeccion)}>
            <span className="vt-icon" aria-hidden="true">
              replay
            </span>
            Volver a practicar
            <span className="vt-visually-hidden">: {curso.titulo}</span>
          </Link>
        )}
      </div>

      {!curso.retirado && curso.lecciones.length > 0 && <ListaLecciones curso={curso} />}
    </article>
  )
}

export default MisCursos
