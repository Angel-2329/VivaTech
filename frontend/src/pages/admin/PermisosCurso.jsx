import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router'
import BuscadorPersonas from '../../components/grupos/BuscadorPersonas.jsx'
import DialogoConfirmacion from '../../components/panel/DialogoConfirmacion.jsx'
import PlantillaPanel from '../../components/panel/PlantillaPanel.jsx'
import { EstadoCarga, EstadoError, MensajeExito } from '../../components/panel/EstadosCarga.jsx'
import { useDatos } from '../../hooks/useDatos.js'
import {
  buscarCuentas,
  darPermisoEditor,
  obtenerEditoresCurso,
  quitarPermisoEditor,
} from '../../services/adminService.js'
import { obtenerCursoEditor } from '../../services/contenidoService.js'
import { ESTADO_CURSO } from '../../utils/contenido.js'
import { textoInstante } from '../../utils/fechas.js'
import '../contenido/Contenido.css'

const ERRORES_PERMISO = {
  es_autor: 'Esta persona creó el curso, así que ya puede editarlo. Elige a otro maestro.',
  usuario_no_maestro: 'Solo se puede dar permiso a un maestro con la cuenta activa.',
  usuario_no_encontrado: 'No encontramos esa cuenta. Vuelve a buscar al maestro.',
  curso_retirado: 'Este curso fue retirado y ya no admite permisos nuevos.',
  curso_no_encontrado: 'Este curso ya no existe. Regresa a Contenido.',
}

function buscarMaestros(texto, opciones = {}) {
  return buscarCuentas({ ...opciones, buscar: texto, rol: 'maestro' })
}

function mensajeDeError(error, textoGeneral) {
  return ERRORES_PERMISO[error?.codigo] ?? (error?.message || textoGeneral)
}

function PermisosCurso() {
  const { idCurso } = useParams()

  const cargar = useCallback(
    () => Promise.all([obtenerCursoEditor(idCurso), obtenerEditoresCurso(idCurso)])
      .then(([curso, editores]) => ({ curso, editores })),
    [idCurso],
  )
  const { datos, cargando, error, reintentar, setDatos } = useDatos(cargar)

  const [mensaje, setMensaje] = useState('')
  const [procesando, setProcesando] = useState(false)
  const [porQuitar, setPorQuitar] = useState(null)
  const [errorQuitar, setErrorQuitar] = useState('')
  const mensajeRef = useRef(null)
  const focoPendienteRef = useRef(null)

  useEffect(() => {
    const destino = focoPendienteRef.current?.current
    if (!destino) return
    destino.focus()
    focoPendienteRef.current = null
  })

  const curso = datos?.curso
  const editores = datos?.editores ?? []
  const retirado = curso?.estadoPublicacion === 'retirado'

  async function manejarDarPermiso(maestro) {
    setMensaje('')
    let editor
    try {
      editor = await darPermisoEditor(idCurso, maestro.uid)
    } catch (errorAlDar) {
            throw new Error(mensajeDeError(errorAlDar, 'No pudimos dar el permiso. Inténtalo otra vez.'), { cause: errorAlDar }) }
    setDatos((anterior) => ({
      ...anterior,
      editores: [...anterior.editores.filter((actual) => actual.uid !== editor.uid), editor]
        .sort((a, b) => a.nombreCompleto.localeCompare(b.nombreCompleto, 'es')),
    }))
    setMensaje(`${editor.nombreCompleto} ya puede editar las lecciones y los pasos de "${curso.titulo}".`)
    focoPendienteRef.current = mensajeRef
  }

  function pedirQuitar(editor) {
    if (procesando) return
    setErrorQuitar('')
    setPorQuitar(editor)
  }

  async function confirmarQuitar() {
    if (!porQuitar || procesando) return
    setProcesando(true)
    setErrorQuitar('')
    try {
      await quitarPermisoEditor(idCurso, porQuitar.uid)
      setDatos((anterior) => ({
        ...anterior,
        editores: anterior.editores.filter((actual) => actual.uid !== porQuitar.uid),
      }))
      setMensaje(`${porQuitar.nombreCompleto} ya no puede editar "${curso.titulo}".`)
      focoPendienteRef.current = mensajeRef
      setPorQuitar(null)
    } catch (errorAlQuitar) {
      setErrorQuitar(mensajeDeError(errorAlQuitar, 'No pudimos quitar el permiso. Inténtalo otra vez.'))
    } finally {
      setProcesando(false)
    }
  }

  return (
    <PlantillaPanel
      titulo="Permisos de edición"
      descripcion={curso ? `Curso: ${curso.titulo}` : undefined}
      regresarA="/admin/contenido"
      textoRegresar="Regresar a Contenido"
    >
      {cargando && <EstadoCarga texto="Cargando los permisos del curso…" />}
      {error && (
        <EstadoError
          error={{ ...error, message: mensajeDeError(error, error.message) }}
          onReintentar={reintentar}
          titulo="No pudimos abrir los permisos"
        />
      )}

      {curso && (
        <>
          <div className="vt-stack vt-stack-sm">
            <p className="vt-cluster">
              <span className={ESTADO_CURSO[curso.estadoPublicacion].clase}>
                <span className="vt-icon" aria-hidden="true">
                  {ESTADO_CURSO[curso.estadoPublicacion].icono}
                </span>
                {ESTADO_CURSO[curso.estadoPublicacion].texto}
              </span>
              <span className="vt-body-sm vt-text-muted">Creado por {curso.creadoPor}</span>
            </p>
            <div className="vt-alert vt-alert-info vt-alert-soft">
              <span className="vt-icon" aria-hidden="true">
                info
              </span>
              <p className="vt-alert__content">
                Un maestro con permiso puede editar las lecciones y los pasos de este curso. No puede publicarlo,
                regresarlo a borrador, eliminarlo, moverlo de categoría, cambiar la fecha de cierre ni dar permisos.
              </p>
            </div>
          </div>

          <MensajeExito texto={mensaje} enfoqueRef={mensajeRef} />

          <section className="vt-card vt-stack" aria-labelledby="titulo-con-permiso">
            <h2 id="titulo-con-permiso" className="vt-headline-sm">
              Maestros con permiso
            </h2>

            {editores.length === 0 ? (
              <p className="vt-text-muted">Nadie más tiene permiso. Solo quien lo creó y los administradores pueden editarlo.</p>
            ) : (
              <ul className="vt-lesson-list">
                {editores.map((editor) => (
                  <li key={editor.uid} className="vt-lesson">
                    <div className="vt-lesson__body">
                      <p className="vt-lesson__title">{editor.nombreCompleto}</p>
                      <p className="vt-lesson__meta">
                        Permiso desde el {textoInstante(editor.fechaOtorgamiento)}. Lo dio {editor.otorgadoPor}.
                      </p>
                      {!editor.activo && (
                        <p className="vt-lesson__meta">
                          <span className="vt-badge vt-badge-warning">
                            <span className="vt-icon" aria-hidden="true">
                              warning
                            </span>
                            Cuenta desactivada o ya no es maestro: por ahora no puede editar
                          </span>
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      className="vt-btn vt-btn-danger-soft vt-btn-sm"
                      onClick={() => pedirQuitar(editor)}
                      disabled={procesando}
                    >
                      Quitar permiso
                      <span className="vt-visually-hidden"> a {editor.nombreCompleto}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {retirado ? (
            <div className="vt-alert vt-alert-info">
              <span className="vt-icon" aria-hidden="true">
                lock
              </span>
              <p className="vt-alert__content">Este curso fue retirado: ya no se pueden dar permisos nuevos.</p>
            </div>
          ) : (
            <section className="vt-card vt-stack" aria-labelledby="titulo-dar-permiso">
              <h2 id="titulo-dar-permiso" className="vt-headline-sm">
                Dar permiso a un maestro
              </h2>
              <BuscadorPersonas
                etiqueta="Buscar maestro por nombre"
                buscar={buscarMaestros}
                yaAsignados={editores.map((editor) => editor.uid)}
                textoAgregar="Dar permiso"
                textoAsignado="Ya tiene permiso"
                onAgregar={manejarDarPermiso}
                bloqueado={procesando}
              />
            </section>
          )}
        </>
      )}

      <DialogoConfirmacion
        abierto={porQuitar !== null}
        titulo={porQuitar ? `¿Quitar el permiso a ${porQuitar.nombreCompleto}?` : ''}
        textoConfirmar="Sí, quitar permiso"
        peligro
        procesando={procesando}
        error={errorQuitar}
        onConfirmar={confirmarQuitar}
        onCancelar={() => setPorQuitar(null)}
      >
        <p>Ya no podrá editar las lecciones ni los pasos de este curso. Puedes volver a darle permiso cuando quieras.</p>
      </DialogoConfirmacion>
    </PlantillaPanel>
  )
}

export default PermisosCurso
