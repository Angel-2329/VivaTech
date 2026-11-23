import { Link } from 'react-router'
import PlantillaPanel from '../../components/panel/PlantillaPanel.jsx'
import TarjetaMiGrupo from '../../components/panel/TarjetaMiGrupo.jsx'
import { EstadoCarga, EstadoError } from '../../components/panel/EstadosCarga.jsx'
import { useSesion } from '../../context/SesionContext.jsx'
import { useDatos } from '../../hooks/useDatos.js'
import { listarMisCertificados } from '../../services/certificadosService.js'
import { obtenerCursosEnCurso } from '../../services/cursosService.js'
import { obtenerMisGrupos } from '../../services/gruposService.js'
import { RUTA_CURSOS_DISPONIBLES, RUTA_MIS_CURSOS, rutaLeccion } from '../../utils/cursos.js'
import { plural } from '../../utils/formato.js'
import { nombreParaSaludo } from '../../utils/nombreParaSaludo.js'
import './Estudiante.css'

async function cargarInicio() {
  const [enCurso, certificados, grupos] = await Promise.all([
    obtenerCursosEnCurso(),
    listarMisCertificados(),
    obtenerMisGrupos().catch(() => null),
  ])
  return { enCurso, certificados, grupos }
}

function InicioEstudiante() {
  const { usuario } = useSesion()
  const { datos, cargando, error, reintentar } = useDatos(cargarInicio)

  const nombre = nombreParaSaludo(usuario)

  return (
    <PlantillaPanel
      titulo={nombre ? `¡Hola, ${nombre}!` : '¡Hola!'}
      descripcion="Qué gusto verte. Cada lección toma menos de 15 minutos y puedes pausar cuando quieras."
    >
      {cargando && <EstadoCarga texto="Cargando tu inicio…" />}
      {error && <EstadoError error={error} onReintentar={reintentar} />}
      {datos && <ResumenAlumno enCurso={datos.enCurso} certificados={datos.certificados} grupos={datos.grupos} />}
    </PlantillaPanel>
  )
}

function ResumenAlumno({ enCurso, certificados, grupos }) {
  const reciente = enCurso[0]

  return (
    <>
      <section className="vt-card vt-card-highlight vt-stack" aria-labelledby="titulo-siguiente">
        {reciente?.siguienteLeccion ? (
          <>
            <p className="vt-eyebrow">Continúa donde te quedaste</p>
            <div className="vt-stack vt-stack-sm">
              <h2 id="titulo-siguiente" className="vt-headline-md">
                {reciente.siguienteLeccion.titulo}
              </h2>
              <p className="vt-text-muted">
                Curso: {reciente.titulo} · {reciente.leccionesCompletadas} de{' '}
                {plural(reciente.totalLecciones, 'lección terminada', 'lecciones terminadas')}
              </p>
            </div>
            <div>
              <Link className="vt-btn vt-btn-primary" to={rutaLeccion(reciente.siguienteLeccion.idLeccion)}>
                Continuar lección
                <span className="vt-icon" aria-hidden="true">
                  arrow_forward
                </span>
              </Link>
            </div>
          </>
        ) : (
          <>
            <h2 id="titulo-siguiente" className="vt-headline-md">
              Empieza un curso
            </h2>
            <p>Elige uno de los cursos disponibles. Puedes tomar cualquiera y avanzar a tu ritmo.</p>
            <div>
              <Link className="vt-btn vt-btn-primary" to={RUTA_CURSOS_DISPONIBLES}>
                Ver cursos disponibles
                <span className="vt-icon" aria-hidden="true">
                  arrow_forward
                </span>
              </Link>
            </div>
          </>
        )}
      </section>

      <div className="vt-grid-auto">
        <Link className="vt-card vt-card-interactive vt-stack vt-stack-sm inicio-alumno__acceso" to={RUTA_CURSOS_DISPONIBLES}>
          <span className="vt-category-icon" aria-hidden="true">
            <span className="vt-icon">explore</span>
          </span>
          <span className="vt-headline-sm">Cursos disponibles</span>
          <span className="vt-text-muted">Todos los cursos que puedes tomar</span>
        </Link>

        <Link className="vt-card vt-card-interactive vt-stack vt-stack-sm inicio-alumno__acceso" to={RUTA_MIS_CURSOS}>
          <span className="vt-category-icon" aria-hidden="true">
            <span className="vt-icon">menu_book</span>
          </span>
          <span className="vt-headline-sm">Mis cursos</span>
          <span className="vt-text-muted">
            {enCurso.length > 0 ? plural(enCurso.length, 'curso en curso', 'cursos en curso') : 'Aún no empiezas ningún curso'}
          </span>
        </Link>

        <section className="vt-card vt-stack vt-stack-sm" aria-labelledby="titulo-certificados">
          <span className="vt-category-icon is-warning" aria-hidden="true">
            <span className="vt-icon">workspace_premium</span>
          </span>
          <h2 id="titulo-certificados" className="vt-headline-sm">
            Mis certificados
          </h2>
          {certificados.length > 0 ? (
            <>
              <p className="vt-text-muted">Tienes {plural(certificados.length, 'certificado', 'certificados')}.</p>
              <div>
                <Link className="vt-btn vt-btn-secondary vt-btn-sm" to="/estudiante/certificados">
                  Ver mis certificados
                </Link>
              </div>
            </>
          ) : (
            <p className="vt-text-muted">Aún no tienes certificados. Los obtendrás al terminar un curso.</p>
          )}
        </section>

        <TarjetaMiGrupo grupos={grupos} />
      </div>

      <aside className="vt-alert vt-alert-info vt-alert-soft">
        <span className="vt-icon vt-text-success" aria-hidden="true">
          verified_user
        </span>
        <p className="vt-alert__content">Las prácticas son simuladas: aquí no se usan datos bancarios ni dinero real.</p>
      </aside>
    </>
  )
}

export default InicioEstudiante
