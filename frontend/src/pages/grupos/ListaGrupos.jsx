import { useState } from 'react'
import { Link } from 'react-router'
import FormularioNombreGrupo from '../../components/grupos/FormularioNombreGrupo.jsx'
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
import { crearGrupo, eliminarGrupo, listarGrupos, renombrarGrupo } from '../../services/gruposService.js'
import { plural } from '../../utils/formato.js'
import './Grupos.css'


function ListaGrupos() {
  const { usuario } = useSesion()
  const esAdmin = usuario.rol === 'administrador'
  const rutaBase = esAdmin ? '/admin/grupos' : '/maestro/grupos'

  const { datos: grupos, cargando, error, reintentar, setDatos } = useDatos(listarGrupos)
  const [mensaje, setMensaje] = useState('')

  const [grupoAEliminar, setGrupoAEliminar] = useState(null)
  const [eliminando, setEliminando] = useState(false)
  const [errorEliminar, setErrorEliminar] = useState('')

  async function manejarCrear(nombre) {
    const grupo = await crearGrupo({ nombre })
    setDatos((anteriores) => [...anteriores, grupo])
    setMensaje(`Se creó el grupo "${grupo.nombre}".`)
  }

  async function manejarRenombrar(idGrupo, nombre) {
    const grupo = await renombrarGrupo(idGrupo, { nombre })
    setDatos((anteriores) =>
      anteriores.map((actual) => (actual.idGrupo === idGrupo ? grupo : actual))
    )
    setMensaje(`El grupo ahora se llama "${grupo.nombre}".`)
  }

  function abrirEliminar(grupo) {
    setErrorEliminar('')
    setGrupoAEliminar(grupo)
  }

  async function confirmarEliminar() {
    setEliminando(true)
    setErrorEliminar('')

    try {
      await eliminarGrupo(grupoAEliminar.idGrupo)
      setDatos((anteriores) => anteriores.filter((actual) => actual.idGrupo !== grupoAEliminar.idGrupo))
      setMensaje(`Se eliminó el grupo "${grupoAEliminar.nombre}".`)
      setGrupoAEliminar(null)
    } catch (errorAlEliminar) {
      setErrorEliminar(errorAlEliminar.message)
    } finally {
      setEliminando(false)
    }
  }

  const tieneEstudiantes = grupoAEliminar?.totalEstudiantes > 0

  return (
    <PlantillaPanel
      titulo={esAdmin ? 'Grupos' : 'Mis grupos'}
      descripcion={
        esAdmin
          ? 'Todos los grupos de Viva Tech. Entra a cada uno para asignar maestros y estudiantes.'
          : 'Entra a un grupo para agregar estudiantes y ver su avance.'
      }
      regresarA={esAdmin ? '/admin' : undefined}
      textoRegresar="Regresar al inicio"
    >
      <section className="vt-card vt-stack" aria-labelledby="titulo-crear-grupo">
        <h2 id="titulo-crear-grupo" className="vt-headline-sm">
          Crear grupo
        </h2>
        <FormularioNombreGrupo
          etiqueta="Nombre del nuevo grupo"
          textoBoton="Crear grupo"
          onGuardar={manejarCrear}
          limpiarAlGuardar
        />
      </section>

      <MensajeExito texto={mensaje} />

      {cargando && <EstadoCarga texto="Cargando grupos…" />}
      {error && <EstadoError error={error} onReintentar={reintentar} />}

      {grupos?.length === 0 && (
        <EstadoVacio icono="groups" titulo="Todavía no hay grupos">
          <p>Crea el primero con el formulario de arriba.</p>
        </EstadoVacio>
      )}

      {grupos?.length > 0 && (
        <ul className="vt-grid-auto grupos__lista" aria-label="Grupos">
          {grupos.map((grupo) => (
            <TarjetaGrupo
              key={grupo.idGrupo}
              grupo={grupo}
              rutaDetalle={`${rutaBase}/${grupo.idGrupo}`}
              onRenombrar={(nombre) => manejarRenombrar(grupo.idGrupo, nombre)}
              onEliminar={() => abrirEliminar(grupo)}
            />
          ))}
        </ul>
      )}

      <DialogoConfirmacion
        abierto={grupoAEliminar !== null}
        titulo={
          tieneEstudiantes
            ? `Todavía no puedes eliminar "${grupoAEliminar?.nombre}"`
            : `¿Eliminar el grupo "${grupoAEliminar?.nombre}"?`
        }
        textoConfirmar={tieneEstudiantes ? undefined : 'Sí, eliminar'}
        peligro
        procesando={eliminando}
        error={errorEliminar}
        onConfirmar={confirmarEliminar}
        onCancelar={() => setGrupoAEliminar(null)}
      >
        {tieneEstudiantes ? (
          <p>
            Tiene {plural(grupoAEliminar.totalEstudiantes, 'estudiante', 'estudiantes')}. Primero
            retíralos desde "Ver grupo".
          </p>
        ) : (
          <p>El grupo desaparecerá de la lista. Esta acción no se puede deshacer.</p>
        )}
      </DialogoConfirmacion>
    </PlantillaPanel>
  )
}

function TarjetaGrupo({ grupo, rutaDetalle, onRenombrar, onEliminar }) {
  const [editando, setEditando] = useState(false)

  async function guardarNombre(nombre) {
    await onRenombrar(nombre)
    setEditando(false)
  }

  const nombresMaestros = grupo.maestros.map((maestro) => maestro.nombreCompleto).join(', ')

  return (
    <li className="vt-card vt-stack">
      {editando ? (
        <FormularioNombreGrupo
          etiqueta={`Nuevo nombre para "${grupo.nombre}"`}
          textoBoton="Guardar nombre"
          valorInicial={grupo.nombre}
          onGuardar={guardarNombre}
          onCancelar={() => setEditando(false)}
        />
      ) : (
        <>
          <div className="vt-stack vt-stack-sm">
            <h2 className="vt-headline-sm">{grupo.nombre}</h2>
            <p className="vt-cluster vt-body-sm">
              <span className="vt-icon" aria-hidden="true">
                group
              </span>
              {plural(grupo.totalEstudiantes, 'estudiante', 'estudiantes')}
            </p>
            <p className="vt-body-sm vt-text-muted">
              {nombresMaestros ? `Maestros: ${nombresMaestros}` : 'Sin maestro asignado'}
            </p>
          </div>

          <div className="vt-cluster">
            <Link className="vt-btn vt-btn-primary vt-btn-sm" to={rutaDetalle}>
              Ver grupo
              <span className="vt-visually-hidden"> {grupo.nombre}</span>
            </Link>
            <button type="button" className="vt-btn vt-btn-secondary vt-btn-sm" onClick={() => setEditando(true)}>
              Cambiar nombre
              <span className="vt-visually-hidden"> de {grupo.nombre}</span>
            </button>
            <button type="button" className="vt-btn vt-btn-danger-soft vt-btn-sm" onClick={onEliminar}>
              Eliminar
              <span className="vt-visually-hidden"> {grupo.nombre}</span>
            </button>
          </div>
        </>
      )}
    </li>
  )
}

export default ListaGrupos
