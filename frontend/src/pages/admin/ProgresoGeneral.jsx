import { useCallback, useId, useState } from 'react'
import BarraAvance from '../../components/panel/BarraAvance.jsx'
import PlantillaPanel from '../../components/panel/PlantillaPanel.jsx'
import Paginacion from '../../components/panel/Paginacion.jsx'
import { EstadoCarga, EstadoError, EstadoVacio } from '../../components/panel/EstadosCarga.jsx'
import { useDatos } from '../../hooks/useDatos.js'
import { obtenerProgresoGeneral } from '../../services/adminService.js'
import { formatearFecha } from '../../utils/formato.js'
import './Admin.css'

const ESTUDIANTES_POR_PAGINA = 20

function ProgresoGeneral() {
  const id = useId()
  const [texto, setTexto] = useState('')
  const [criterios, setCriterios] = useState({ buscar: '' })
  const [pagina, setPagina] = useState(0)

  const cargar = useCallback(() => obtenerProgresoGeneral(criterios.buscar, {
    limite: ESTUDIANTES_POR_PAGINA + 1,
    desplazamiento: pagina * ESTUDIANTES_POR_PAGINA,
  }), [criterios, pagina])
  const { datos: resultados, cargando, error, reintentar } = useDatos(cargar)
  const estudiantes = resultados?.slice(0, ESTUDIANTES_POR_PAGINA)
  const haySiguiente = (resultados?.length ?? 0) > ESTUDIANTES_POR_PAGINA

  function manejarBusqueda(evento) {
    evento.preventDefault()
    setPagina(0)
    setCriterios({ buscar: texto.trim() })
  }

  return (
    <PlantillaPanel
      titulo="Progreso general"
      descripcion="Avance de todos los estudiantes de Viva Tech."
      regresarA="/admin"
      textoRegresar="Regresar al inicio"
    >
      <form className="vt-card vt-toolbar buscador" onSubmit={manejarBusqueda} role="search">
        <div className="vt-field">
          <label className="vt-field-label" htmlFor={`${id}-buscar`}>
            Buscar estudiante por nombre
          </label>
          <input
            id={`${id}-buscar`}
            className="vt-input"
            type="search"
            maxLength={100}
            value={texto}
            onChange={(evento) => setTexto(evento.target.value)}
          />
        </div>
        <button type="submit" className="vt-btn vt-btn-primary buscador__boton">
          <span className="vt-icon" aria-hidden="true">
            search
          </span>
          Buscar
        </button>
      </form>

      {cargando && <EstadoCarga texto="Cargando el progreso…" />}
      {error && <EstadoError error={error} onReintentar={reintentar} />}

      {estudiantes?.length === 0 && (
        <EstadoVacio icono="person_search" titulo="No encontramos estudiantes">
          <p>Revisa el nombre o deja el campo vacío para ver a todos.</p>
        </EstadoVacio>
      )}

      {estudiantes?.length > 0 && (
        <div className="vt-table-wrap">
          <table className="vt-table vt-table-responsive">
            <caption className="vt-visually-hidden">Progreso de los estudiantes</caption>
            <thead>
              <tr>
                <th scope="col">Estudiante</th>
                <th scope="col">Grupos</th>
                <th scope="col">Avance</th>
                <th scope="col">Última actividad</th>
              </tr>
            </thead>
            <tbody>
              {estudiantes.map((estudiante) => (
                <tr key={estudiante.uid}>
                  <td data-label="Estudiante">
                    <strong>{estudiante.nombreCompleto}</strong>
                    <span className={estudiante.activo ? 'vt-badge vt-badge-success' : 'vt-badge vt-badge-neutral'}>
                      {estudiante.activo ? 'Cuenta activa' : 'Cuenta desactivada'}
                    </span>
                  </td>
                  <td data-label="Grupos">
                    {estudiante.grupos.length > 0 ? estudiante.grupos.join(', ') : 'Sin grupo'}
                  </td>
                  <td data-label="Avance" className="admin__avance">
                    <BarraAvance
                      pequena
                      completadas={estudiante.leccionesCompletadas}
                      total={estudiante.totalLeccionesPublicadas}
                    />
                  </td>
                  <td data-label="Última actividad">
                    {formatearFecha(estudiante.ultimaActividad, 'Sin actividad registrada')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Paginacion
        pagina={pagina}
        haySiguiente={haySiguiente}
        cargando={cargando}
        onCambiar={setPagina}
        etiqueta="Páginas de progreso de estudiantes"
      />
    </PlantillaPanel>
  )
}

export default ProgresoGeneral
