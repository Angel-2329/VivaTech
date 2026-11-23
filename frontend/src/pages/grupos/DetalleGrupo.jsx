import { useCallback, useEffect, useRef, useState } from 'react'
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
  retirarEstudiantesSeleccionados,
  retirarMaestro,
  retirarTodosLosEstudiantes,
} from '../../services/gruposService.js'
import { formatearFecha, ordenarPorNombre, plural } from '../../utils/formato.js'
import './Grupos.css'


function buscarMaestros(texto, opciones = {}) {
  return buscarCuentas({ ...opciones, buscar: texto, rol: 'maestro' })
}

const MAXIMO_NOMBRES = 5
const MAXIMO_SELECCION = 100
const ERROR_RETIRO_MASIVO = 'No pudimos quitar a los estudiantes. Nadie fue retirado del grupo. Inténtalo otra vez.'

function textoEstudiantes(cantidad) {
  return plural(cantidad, 'estudiante', 'estudiantes')
}


function DetalleGrupo() {
  const { idGrupo } = useParams()
  const { usuario } = useSesion()
  const esAdmin = usuario.rol === 'administrador'

  const cargar = useCallback(() => obtenerGrupo(idGrupo), [idGrupo])
  const { datos: grupo, cargando, error, reintentar, setDatos } = useDatos(cargar)
  const [mensaje, setMensaje] = useState('')
  const [procesandoParticipante, setProcesandoParticipante] = useState(false)
  const operacionRef = useRef(false)

  const [aRetirar, setARetirar] = useState(null)
  const [retirando, setRetirando] = useState(false)
  const [errorRetirar, setErrorRetirar] = useState('')

  const [marcados, setMarcados] = useState([])
  const [retiroMasivo, setRetiroMasivo] = useState(null)
  const [errorMasivo, setErrorMasivo] = useState('')
  const tituloEstudiantesRef = useRef(null)
  const enfocarEstudiantes = useRef(false)

  const seleccionados = grupo ? grupo.estudiantes.filter((estudiante) => marcados.includes(estudiante.uid)) : []

  useEffect(() => {
    if (enfocarEstudiantes.current) {
      enfocarEstudiantes.current = false
      tituloEstudiantesRef.current?.focus()
    }
  }, [grupo])

  function alternarMarcado(uid) {
    setMarcados((anteriores) =>
      anteriores.includes(uid) ? anteriores.filter((actual) => actual !== uid) : [...anteriores, uid]
    )
  }

  function abrirRetiroMasivo(tipo) {
    if (operacionRef.current) return
    if (tipo === 'seleccion' && (seleccionados.length === 0 || seleccionados.length > MAXIMO_SELECCION)) return
    setErrorMasivo('')
    setRetiroMasivo({
      tipo,
      personas: tipo === 'seleccion' ? ordenarPorNombre(seleccionados) : grupo.estudiantes,
    })
  }

  async function confirmarRetiroMasivo() {
    if (operacionRef.current || !retiroMasivo) return
    setRetirando(true)
    setErrorMasivo('')

    try {
      await ejecutarCambioParticipante(async () => {
        let texto
        if (retiroMasivo.tipo === 'todos') {
          const { retirados } = await retirarTodosLosEstudiantes(grupo.idGrupo)
          setDatos((anterior) => anterior?.idGrupo === grupo.idGrupo ? { ...anterior, estudiantes: [] } : anterior)
          texto = `Se retiró a ${textoEstudiantes(retirados)} del grupo. Sus cuentas y su avance se conservan.`
        } else {
          const uids = retiroMasivo.personas.map((persona) => persona.uid)
          const { retirados, noEstaban } = await retirarEstudiantesSeleccionados(grupo.idGrupo, uids)
          setDatos((anterior) => anterior?.idGrupo === grupo.idGrupo ? {
            ...anterior,
            estudiantes: anterior.estudiantes.filter(
              (estudiante) => !retirados.includes(estudiante.uid) && !noEstaban.includes(estudiante.uid)
            ),
          } : anterior)
          texto = `Se quitó del grupo a ${textoEstudiantes(retirados.length)}. Sus cuentas y su avance se conservan.`
          if (noEstaban.length > 0) {
            texto += ` ${textoEstudiantes(noEstaban.length)} ya no ${noEstaban.length === 1 ? 'estaba' : 'estaban'} en el grupo.`
          }
        }

        setMarcados([])
        setRetiroMasivo(null)
        enfocarEstudiantes.current = true
        setMensaje(texto)
      })
    } catch (errorAlRetirar) {
      setErrorMasivo(errorAlRetirar.estado === 404 ? errorAlRetirar.message : ERROR_RETIRO_MASIVO)
    } finally {
      setRetirando(false)
    }
  }

  async function ejecutarCambioParticipante(accion) {
    if (operacionRef.current) {
      throw new Error('Espera a que termine la operación en curso.')
    }

    operacionRef.current = true
    setProcesandoParticipante(true)
    setMensaje('')

    try {
      return await accion()
    } finally {
      operacionRef.current = false
      setProcesandoParticipante(false)
    }
  }

  async function manejarAgregarEstudiante(persona) {
    return ejecutarCambioParticipante(async () => {
      const nuevo = await agregarEstudiante(grupo.idGrupo, persona.uid)
      setDatos((anterior) => anterior?.idGrupo === grupo.idGrupo ? {
        ...anterior,
        estudiantes: [
          ...anterior.estudiantes.filter((actual) => actual.uid !== nuevo.uid),
          nuevo,
        ],
      } : anterior)
      setMensaje(`Se agregó a ${nuevo.nombreCompleto} al grupo.`)
    })
  }

  async function manejarAsignarMaestro(persona) {
    return ejecutarCambioParticipante(async () => {
      const nuevo = await asignarMaestro(grupo.idGrupo, persona.uid)
      setDatos((anterior) => anterior?.idGrupo === grupo.idGrupo ? {
        ...anterior,
        maestros: [
          ...anterior.maestros.filter((actual) => actual.uid !== nuevo.uid),
          nuevo,
        ],
      } : anterior)
      setMensaje(`Se asignó a ${nuevo.nombreCompleto} como maestro del grupo.`)
    })
  }

  function abrirRetirar(tipo, persona) {
    if (operacionRef.current) return
    setErrorRetirar('')
    setARetirar({ tipo, uid: persona.uid, nombreCompleto: persona.nombreCompleto })
  }

  async function confirmarRetirar() {
    if (operacionRef.current || !aRetirar) return
    setRetirando(true)
    setErrorRetirar('')

    const esEstudiante = aRetirar.tipo === 'estudiante'
    const lista = esEstudiante ? 'estudiantes' : 'maestros'

    try {
      await ejecutarCambioParticipante(async () => {
        if (esEstudiante) await retirarEstudiante(grupo.idGrupo, aRetirar.uid)
        else await retirarMaestro(grupo.idGrupo, aRetirar.uid)

        setDatos((anterior) => anterior?.idGrupo === grupo.idGrupo ? {
          ...anterior,
          [lista]: anterior[lista].filter((persona) => persona.uid !== aRetirar.uid),
        } : anterior)
        setMensaje(`Se retiró a ${aRetirar.nombreCompleto} del grupo.`)
        setARetirar(null)
      })
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
            procesando={procesandoParticipante}
            onRetirar={(estudiante) => abrirRetirar('estudiante', estudiante)}
            marcados={marcados}
            totalSeleccionados={seleccionados.length}
            onMarcar={alternarMarcado}
            onQuitarSeleccionados={() => abrirRetiroMasivo('seleccion')}
            onRetirarTodos={() => abrirRetiroMasivo('todos')}
            tituloRef={tituloEstudiantesRef}
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
              bloqueado={procesandoParticipante}
            />
          </section>

          {esAdmin && (
            <SeccionMaestros
              grupo={grupo}
              procesando={procesandoParticipante}
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

          <DialogoConfirmacion
            abierto={retiroMasivo !== null}
            titulo={
              retiroMasivo?.tipo === 'todos'
                ? `¿Retirar a todos los estudiantes de ${grupo.nombre}?`
                : `¿Quitar a ${textoEstudiantes(retiroMasivo?.personas.length ?? 0)} de ${grupo.nombre}?`
            }
            textoConfirmar={retiroMasivo?.tipo === 'todos' ? 'Sí, retirar a todos' : 'Sí, quitar del grupo'}
            peligro
            procesando={retirando}
            error={errorMasivo}
            onConfirmar={confirmarRetiroMasivo}
            onCancelar={() => setRetiroMasivo(null)}
          >
            {retiroMasivo && <TextoRetiroMasivo retiro={retiroMasivo} nombreGrupo={grupo.nombre} />}
          </DialogoConfirmacion>
        </>
      )}
    </PlantillaPanel>
  )
}

function TextoRetiroMasivo({ retiro, nombreGrupo }) {
  const total = retiro.personas.length
  const visibles = retiro.personas.slice(0, MAXIMO_NOMBRES)

  return (
    <>
      <p>
        {retiro.tipo === 'todos'
          ? `Vas a quitar a ${textoEstudiantes(total)} del grupo ${nombreGrupo}. Sus cuentas y su avance se conservan. El grupo no se borra.`
          : `Vas a quitar a ${textoEstudiantes(total)} del grupo ${nombreGrupo}. Sus cuentas y su avance se conservan.`}
      </p>
      {retiro.tipo === 'seleccion' && (
        <ul className="grupos__nombres">
          {visibles.map((persona) => (
            <li key={persona.uid}>{persona.nombreCompleto}</li>
          ))}
          {total > MAXIMO_NOMBRES && <li>y {total - MAXIMO_NOMBRES} más</li>}
        </ul>
      )}
    </>
  )
}

function TablaEstudiantes({
  grupo,
  onRetirar,
  procesando,
  marcados,
  totalSeleccionados,
  onMarcar,
  onQuitarSeleccionados,
  onRetirarTodos,
  tituloRef,
}) {
  const sinSeleccion = totalSeleccionados === 0
  const excedeSeleccion = totalSeleccionados > MAXIMO_SELECCION

  return (
    <section className="vt-stack" aria-labelledby="titulo-estudiantes">
      <h2 id="titulo-estudiantes" ref={tituloRef} tabIndex={-1} className="vt-headline-md">
        Estudiantes y su avance
      </h2>

      {grupo.estudiantes.length === 0 ? (
        <EstadoVacio icono="group_add" titulo="Este grupo todavía no tiene estudiantes">
          <p>Búscalos por su nombre en la sección de abajo para agregarlos.</p>
        </EstadoVacio>
      ) : (
        <>
          <div className="vt-toolbar grupos__acciones-masivas">
            <button
              type="button"
              className="vt-btn vt-btn-danger-soft"
              onClick={onQuitarSeleccionados}
              aria-disabled={sinSeleccion || excedeSeleccion || procesando}
            >
              <span className="vt-icon" aria-hidden="true">
                group_remove
              </span>
              Quitar del grupo ({totalSeleccionados})
            </button>
            <button
              type="button"
              className="vt-btn vt-btn-outline"
              onClick={onRetirarTodos}
              aria-disabled={procesando}
            >
              Retirar a todos
            </button>
          </div>
          {excedeSeleccion && (
            <p className="vt-field-error" role="alert">
              <span className="vt-icon" aria-hidden="true">
                error
              </span>
              Puedes quitar hasta {MAXIMO_SELECCION} estudiantes a la vez. Desmarca algunos o usa «Retirar a todos».
            </p>
          )}
          <p className="vt-body-sm vt-text-muted">
            Marca las casillas de los estudiantes que quieres quitar del grupo. Sus cuentas y su avance se conservan.
          </p>

          <div className="vt-table-wrap">
            <table className="vt-table vt-table-responsive">
              <caption className="vt-visually-hidden">Estudiantes del grupo {grupo.nombre}</caption>
              <thead>
                <tr>
                  <th scope="col">
                    <span className="vt-visually-hidden">Seleccionar</span>
                  </th>
                  <th scope="col">Estudiante</th>
                  <th scope="col">Avance</th>
                  <th scope="col">Última actividad</th>
                  <th scope="col">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {ordenarPorNombre(grupo.estudiantes).map((estudiante) => (
                  <tr key={estudiante.uid}>
                    <td data-label="Seleccionar" className="grupos__casilla">
                      <label className="vt-check">
                        <input
                          type="checkbox"
                          checked={marcados.includes(estudiante.uid)}
                          onChange={() => onMarcar(estudiante.uid)}
                          disabled={procesando}
                        />
                        <span className="vt-visually-hidden">Seleccionar a {estudiante.nombreCompleto}</span>
                      </label>
                    </td>
                    <td data-label="Estudiante">
                      <strong>{estudiante.nombreCompleto}</strong>
                      <span className={estudiante.activo ? 'vt-badge vt-badge-success' : 'vt-badge vt-badge-neutral'}>
                        {estudiante.activo ? 'Cuenta activa' : 'Cuenta desactivada'}
                      </span>
                      {estudiante.apodo && <span className="vt-text-muted"> ({estudiante.apodo})</span>}
                    </td>
                    <td data-label="Avance" className="grupos__avance">
                      <BarraAvance
                        pequena
                        nombre={`Avance de ${estudiante.nombreCompleto}`}
                        completadas={estudiante.leccionesCompletadas}
                        total={grupo.totalLeccionesPublicadas}
                      />
                    </td>
                    <td data-label="Última actividad">
                      {formatearFecha(estudiante.ultimaActividad, 'Sin actividad registrada')}
                    </td>
                    <td data-label="Acciones">
                      <button
                        type="button"
                        className="vt-btn vt-btn-danger-soft vt-btn-sm"
                        onClick={() => onRetirar(estudiante)}
                        disabled={procesando}
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
        </>
      )}
    </section>
  )
}

function SeccionMaestros({ grupo, onAsignar, onRetirar, procesando }) {
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
                disabled={procesando}
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
        bloqueado={procesando}
      />
    </section>
  )
}

export default DetalleGrupo
