import { useCallback, useId, useState } from 'react'
import BarraAvance from '../../components/panel/BarraAvance.jsx'
import PlantillaPanel from '../../components/panel/PlantillaPanel.jsx'
import { EstadoCarga, EstadoError, EstadoVacio } from '../../components/panel/EstadosCarga.jsx'
import { useDatos } from '../../hooks/useDatos.js'
import { obtenerProgresoGeneral } from '../../services/adminService.js'
import { formatearFecha, ordenarPorNombre } from '../../utils/formato.js'
import './Admin.css'


function ProgresoGeneral() {
  const id = useId()
  const [texto, setTexto] = useState('')
  const [busqueda, setBusqueda] = useState('')

  const cargar = useCallback(() => obtenerProgresoGeneral(busqueda), [busqueda])
  const { datos: estudiantes, cargando, error, reintentar } = useDatos(cargar)

  function manejarBusqueda(evento) {
    evento.preventDefault()
    setBusqueda(texto.trim())
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
              {ordenarPorNombre(estudiantes).map((estudiante) => (
                <tr key={estudiante.uid}>
                  <td data-label="Estudiante">
                    <strong>{estudiante.nombreCompleto}</strong>
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
                    {formatearFecha(estudiante.ultimaActividad, 'Sin empezar')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PlantillaPanel>
  )
}

export default ProgresoGeneral
