import { useCallback, useState } from 'react'
import { useParams } from 'react-router'
import BuscadorPersonas from '../../components/grupos/BuscadorPersonas.jsx'
import BarraAvance from '../../components/panel/BarraAvance.jsx'
import DialogoConfirmacion from '../../components/panel/DialogoConfirmacion.jsx'
import PlantillaPanel from '../../components/panel/PlantillaPanel.jsx'
import {
  EstadoCarga,
  EstadoError,
  EstadoVacio,
  MensajeExito,
} from '../../components/panel/EstadosCarga.jsx'
import { useSesion } from '../../context/SesionContext.jsx'
import { useDatos } from '../../hooks/useDatos.js'
import { buscarCuentas } from '../../services/adminService.js'
import {
  agregarEstudiante,
  asignarMaestro,
  buscarEstudiantes,
  obtenerGrupo,
  retirarEstudiante,
  retirarMaestro,
} from '../../services/gruposService.js'
import { formatearFecha, ordenarPorNombre, plural } from '../../utils/formato.js'
import './Grupos.css'


function buscarMaestros(texto) {
  return buscarCuentas({ buscar: texto, rol: 'maestro' }).then((cuentas) =>
    cuentas.filter((cuenta) => cuenta.activo)
  )
}


function DetalleGrupo() {
  const { idGrupo } = useParams()
  const { usuario } = useSesion()
  const esAdmin = usuario.rol === 'administrador'

  const cargar = useCallback(() => obtenerGrupo(idGrupo), [idGrupo])
  const { datos: grupo, cargando, error, reintentar, setDatos } = useDatos(cargar)
  const [mensaje, setMensaje] = useState('')

  const [aRetirar, setARetirar] = useState(null)
  const [retirando, setRetirando] = useState(false)
  const [errorRetirar, setErrorRetirar] = useState('')

  async function manejarAgregarEstudiante(persona) {
    const nuevo = await agregarEstudiante(grupo.idGrupo, persona.uid)
    setDatos((anterior) => ({ ...anterior, estudiantes: [...anterior.estudiantes, nuevo] }))
    setMensaje(`Se agregó a ${nuevo.nombreCompleto} al grupo.`)
  }

  async function manejarAsignarMaestro(persona) {
    const nuevo = await asignarMaestro(grupo.idGrupo, persona.uid)
    setDatos((anterior) => ({ ...anterior, maestros: [...anterior.maestros, nuevo] }))
    setMensaje(`Se asignó a ${nuevo.nombreCompleto} como maestro del grupo.`)
  }

  function abrirRetirar(tipo, persona) {
    setErrorRetirar('')
    setARetirar({ tipo, uid: persona.uid, nombreCompleto: persona.nombreCompleto })
  }

  async function confirmarRetirar() {
    setRetirando(true)
    setErrorRetirar('')

    const esEstudiante = aRetirar.tipo === 'estudiante'
    const lista = esEstudiante ? 'estudiantes' : 'maestros'

    try {
      if (esEstudiante) await retirarEstudiante(grupo.idGrupo, aRetirar.uid)
      else await retirarMaestro(grupo.idGrupo, aRetirar.uid)

      setDatos((anterior) => ({
        ...anterior,
        [lista]: anterior[lista].filter((persona) => persona.uid !== aRetirar.uid),
      }))
      setMensaje(`Se retiró a ${aRetirar.nombreCompleto} del grupo.`)
      setARetirar(null)
    } catch (errorAlRetirar) {
      setErrorRetirar(errorAlRetirar.message)
    } finally {
      setRetirando(false)
    }
  }

  const rutaLista = esAdmin ? '/admin/grupos' : '/maestro'
  const noExiste = error?.estado === 404

  return (
    <PlantillaPanel
      titulo={grupo?.nombre ?? 'Grupo'}
      descripcion={grupo ? plural(grupo.estudiantes.length, 'estudiante', 'estudiantes') : undefined}
      regresarA={rutaLista}
      textoRegresar={esAdmin ? 'Regresar a Grupos' : 'Regresar a Mis grupos'}
    >
      {cargando && <EstadoCarga texto="Cargando el grupo…" />}
      {error && (
        <EstadoError
          error={noExiste ? { message: 'Puede que lo hayan eliminado. Regresa a la lista de grupos.' } : error}
          titulo={noExiste ? 'No encontramos este grupo' : undefined}
          onReintentar={noExiste ? undefined : reintentar}
        />
      )}

      {grupo && (
        <>
          <MensajeExito texto={mensaje} />

          {grupo.totalLeccionesPublicadas === 0 && (
            <div className="vt-alert vt-alert-info">
              <span className="vt-icon" aria-hidden="true">
                info
              </span>
              <p className="vt-alert__content">
                Todavía no hay lecciones publicadas; el avance aparecerá cuando las haya.
              </p>
            </div>
          )}

          <TablaEstudiantes
            grupo={grupo}
            onRetirar={(estudiante) => abrirRetirar('estudiante', estudiante)}
          />

          <section className="vt-card vt-stack" aria-labelledby="titulo-agregar">
            <h2 id="titulo-agregar" className="vt-headline-sm">
              Agregar estudiante
            </h2>
            <BuscadorPersonas
              etiqueta="Buscar estudiante por nombre"
              buscar={buscarEstudiantes}
              yaAsignados={grupo.estudiantes.map((estudiante) => estudiante.uid)}
              onAgregar={manejarAgregarEstudiante}
            />
          </section>

          {esAdmin && (
            <SeccionMaestros
              grupo={grupo}
              onAsignar={manejarAsignarMaestro}
              onRetirar={(maestro) => abrirRetirar('maestro', maestro)}
            />
          )}

          <DialogoConfirmacion
            abierto={aRetirar !== null}
            titulo={aRetirar ? `¿Retirar a ${aRetirar.nombreCompleto} de ${grupo.nombre}?` : ''}
            textoConfirmar="Sí, retirar"
            peligro
            procesando={retirando}
            error={errorRetirar}
            onConfirmar={confirmarRetirar}
            onCancelar={() => setARetirar(null)}
          >
            {aRetirar?.tipo === 'maestro' ? (
              <p>Ya no podrá ver este grupo ni el avance de sus estudiantes.</p>
            ) : (
              <p>Su avance no se borra. Puedes volver a agregarlo cuando quieras.</p>
            )}
          </DialogoConfirmacion>
        </>
      )}
    </PlantillaPanel>
  )
}

function TablaEstudiantes({ grupo, onRetirar }) {
  if (grupo.estudiantes.length === 0) {
    return (
      <EstadoVacio icono="group_add" titulo="Este grupo todavía no tiene estudiantes">
        <p>Búscalos por su nombre en la sección de abajo para agregarlos.</p>
      </EstadoVacio>
    )
  }

  return (
    <section className="vt-stack" aria-labelledby="titulo-estudiantes">
      <h2 id="titulo-estudiantes" className="vt-headline-md">
        Estudiantes y su avance
      </h2>
      <div className="vt-table-wrap">
        <table className="vt-table vt-table-responsive">
          <caption className="vt-visually-hidden">Estudiantes del grupo {grupo.nombre}</caption>
          <thead>
            <tr>
              <th scope="col">Estudiante</th>
              <th scope="col">Avance</th>
              <th scope="col">Última actividad</th>
              <th scope="col">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {ordenarPorNombre(grupo.estudiantes).map((estudiante) => (
              <tr key={estudiante.uid}>
                <td data-label="Estudiante">
                  <strong>{estudiante.nombreCompleto}</strong>
                  {estudiante.apodo && (
                    <span className="vt-text-muted"> ({estudiante.apodo})</span>
                  )}
                </td>
                <td data-label="Avance" className="grupos__avance">
                  <BarraAvance
                    pequena
                    completadas={estudiante.leccionesCompletadas}
                    total={grupo.totalLeccionesPublicadas}
                  />
                </td>
                <td data-label="Última actividad">
                  {formatearFecha(estudiante.ultimaActividad, 'Sin empezar')}
                </td>
                <td data-label="Acciones">
                  <button
                    type="button"
                    className="vt-btn vt-btn-danger-soft vt-btn-sm"
                    onClick={() => onRetirar(estudiante)}
                  >
                    Retirar
                    <span className="vt-visually-hidden"> a {estudiante.nombreCompleto}</span>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function SeccionMaestros({ grupo, onAsignar, onRetirar }) {
  return (
    <section className="vt-card vt-stack" aria-labelledby="titulo-maestros">
      <h2 id="titulo-maestros" className="vt-headline-sm">
        Maestros del grupo
      </h2>

      {grupo.maestros.length === 0 ? (
        <p className="vt-text-muted">Este grupo todavía no tiene maestro asignado.</p>
      ) : (
        <ul className="vt-lesson-list">
          {grupo.maestros.map((maestro) => (
            <li key={maestro.uid} className="vt-lesson">
              <p className="vt-lesson__body vt-lesson__title">{maestro.nombreCompleto}</p>
              <button
                type="button"
                className="vt-btn vt-btn-danger-soft vt-btn-sm"
                onClick={() => onRetirar(maestro)}
              >
                Retirar
                <span className="vt-visually-hidden"> a {maestro.nombreCompleto}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <BuscadorPersonas
        etiqueta="Buscar maestro por nombre"
        buscar={buscarMaestros}
        yaAsignados={grupo.maestros.map((maestro) => maestro.uid)}
        textoAgregar="Asignar"
        onAgregar={onAsignar}
      />
    </section>
  )
}

export default DetalleGrupo
