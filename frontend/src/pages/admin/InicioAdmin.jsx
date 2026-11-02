import { Link } from 'react-router'
import PlantillaPanel from '../../components/panel/PlantillaPanel.jsx'
import { EstadoCarga, EstadoError } from '../../components/panel/EstadosCarga.jsx'
import { useSesion } from '../../context/SesionContext.jsx'
import { useDatos } from '../../hooks/useDatos.js'
import { obtenerResumen } from '../../services/adminService.js'
import { nombreParaSaludo } from '../../utils/nombreParaSaludo.js'
import './Admin.css'

const ACCESOS = [
  {
    ruta: '/admin/usuarios',
    icono: 'manage_accounts',
    titulo: 'Cuentas y roles',
    texto: 'Cambia el rol de una persona o desactiva su cuenta.',
  },
  {
    ruta: '/admin/grupos',
    icono: 'groups',
    titulo: 'Grupos',
    texto: 'Crea grupos y asigna maestros y estudiantes.',
  },
  {
    ruta: '/admin/progreso',
    icono: 'monitoring',
    titulo: 'Progreso general',
    texto: 'Consulta el avance de todos los estudiantes.',
  },
]


function InicioAdmin() {
  const { usuario } = useSesion()
  const { datos: resumen, cargando, error, reintentar } = useDatos(obtenerResumen)
  const nombre = nombreParaSaludo(usuario)

  return (
    <PlantillaPanel
      titulo={nombre ? `¡Hola, ${nombre}!` : '¡Hola!'}
      descripcion="Panel de administración de Viva Tech."
    >
      <section className="vt-stack" aria-labelledby="titulo-resumen">
        <h2 id="titulo-resumen" className="vt-headline-md">
          Resumen
        </h2>
        {cargando && <EstadoCarga texto="Cargando el resumen…" />}
        {error && <EstadoError error={error} onReintentar={reintentar} />}
        {resumen && (
          <dl className="vt-grid-auto admin__resumen">
            <Indicador etiqueta="Estudiantes en total" valor={resumen.totalEstudiantes} />
            <Indicador etiqueta="Estudiantes activos" valor={resumen.estudiantesActivos} />
            <Indicador etiqueta="Estudiantes desactivados" valor={resumen.estudiantesInactivos} />
            <Indicador etiqueta="Maestros en total" valor={resumen.totalMaestros} />
            <Indicador etiqueta="Maestros activos" valor={resumen.maestrosActivos} />
            <Indicador etiqueta="Maestros desactivados" valor={resumen.maestrosInactivos} />
            <Indicador etiqueta="Grupos" valor={resumen.totalGrupos} />
            <Indicador etiqueta="Lecciones publicadas" valor={resumen.totalLeccionesPublicadas} />
            <Indicador etiqueta="Lecciones completadas" valor={resumen.leccionesCompletadas} />
          </dl>
        )}
      </section>

      <nav aria-label="Secciones del administrador">
        <ul className="vt-grid-auto admin__accesos">
          {ACCESOS.map((acceso) => (
            <li key={acceso.ruta}>
              <Link className="vt-card vt-card-interactive vt-stack vt-stack-sm admin__acceso" to={acceso.ruta}>
                <span className="vt-category-icon" aria-hidden="true">
                  <span className="vt-icon">{acceso.icono}</span>
                </span>
                <span className="vt-headline-sm">{acceso.titulo}</span>
                <span className="vt-text-muted">{acceso.texto}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </PlantillaPanel>
  )
}

function Indicador({ etiqueta, valor }) {
  return (
    <div className="vt-stat">
      <dt className="vt-stat__label">{etiqueta}</dt>
      <dd className="vt-stat__value">{valor}</dd>
    </div>
  )
}

export default InicioAdmin
