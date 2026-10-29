import { Link } from 'react-router'
import PlantillaPanel from '../../components/panel/PlantillaPanel.jsx'
import { EstadoCarga, EstadoError } from '../../components/panel/EstadosCarga.jsx'
import { useSesion } from '../../context/SesionContext.jsx'
import { useDatos } from '../../hooks/useDatos.js'
import { obtenerMisCursos } from '../../services/cursosService.js'
import { siguienteLeccion, todosLosCursos } from '../../utils/cursos.js'
import { plural } from '../../utils/formato.js'
import { nombreParaSaludo } from '../../utils/nombreParaSaludo.js'
import './Estudiante.css'


function InicioEstudiante() {
  const { usuario } = useSesion()
  const { datos: categorias, cargando, error, reintentar } = useDatos(obtenerMisCursos)

  const nombre = nombreParaSaludo(usuario)

  return (
    <PlantillaPanel
      titulo={nombre ? `¡Hola, ${nombre}!` : '¡Hola!'}
      descripcion="Qué gusto verte. Cada lección toma menos de 15 minutos y puedes pausar cuando quieras."
    >
      {cargando && <EstadoCarga texto="Cargando tus cursos…" />}
      {error && <EstadoError error={error} onReintentar={reintentar} />}
      {categorias && <ResumenAlumno categorias={categorias} />}
    </PlantillaPanel>
  )
}

function ResumenAlumno({ categorias }) {
  const cursos = todosLosCursos(categorias)
  const cursosIniciados = cursos.filter((curso) =>
    curso.lecciones.some((leccion) => leccion.estado !== 'pendiente')
  ).length
  const siguiente = siguienteLeccion(categorias)
  const continuar = siguiente?.leccion.estado === 'en_progreso'

  return (
    <>
      
      <section className="vt-card vt-card-highlight vt-stack" aria-labelledby="titulo-siguiente">
        {siguiente ? (
          <>
            <p className="vt-eyebrow">
              {continuar ? 'Continúa donde te quedaste' : 'Empieza tu primera lección'}
            </p>
            <div className="vt-stack vt-stack-sm">
              <h2 id="titulo-siguiente" className="vt-headline-md">
                {siguiente.leccion.titulo}
              </h2>
              <p className="vt-text-muted">
                Curso: {siguiente.curso.titulo} · {siguiente.leccion.duracionEstimadaMinutos} min
              </p>
            </div>
            <Link className="vt-btn vt-btn-primary" to="/estudiante/cursos">
              Ver en Mis cursos
              <span className="vt-icon" aria-hidden="true">
                arrow_forward
              </span>
            </Link>
          </>
        ) : (
          <>
            <h2 id="titulo-siguiente" className="vt-headline-md">
              ¡Terminaste todas tus lecciones!
            </h2>
            <p>Puedes repasarlas cuando quieras desde Mis cursos.</p>
          </>
        )}
      </section>

      <div className="vt-grid-auto">
        <Link className="vt-card vt-card-interactive vt-stack vt-stack-sm inicio-alumno__acceso" to="/estudiante/cursos">
          <span className="vt-category-icon" aria-hidden="true">
            <span className="vt-icon">menu_book</span>
          </span>
          <span className="vt-headline-sm">Mis cursos</span>
          <span className="vt-text-muted">
            {cursosIniciados} de {plural(cursos.length, 'curso iniciado', 'cursos iniciados')}
          </span>
        </Link>

        <section className="vt-card vt-stack vt-stack-sm" aria-labelledby="titulo-certificados">
          <span className="vt-category-icon is-warning" aria-hidden="true">
            <span className="vt-icon">workspace_premium</span>
          </span>
          <h2 id="titulo-certificados" className="vt-headline-sm">
            Mis certificados
          </h2>
          <p className="vt-text-muted">
            Aún no tienes certificados. Los obtendrás al terminar un curso.
          </p>
        </section>
      </div>

      <aside className="vt-alert vt-alert-info vt-alert-soft">
        <span className="vt-icon vt-text-success" aria-hidden="true">
          verified_user
        </span>
        <p className="vt-alert__content">
          Las prácticas son simuladas: aquí no se usan datos bancarios ni dinero real.
        </p>
      </aside>
    </>
  )
}

export default InicioEstudiante
