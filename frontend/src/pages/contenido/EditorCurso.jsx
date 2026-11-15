import { useCallback, useRef, useState } from 'react'
import { useParams } from 'react-router'
import FormularioLeccion from '../../components/contenido/FormularioLeccion.jsx'
import LeccionEditor from '../../components/contenido/LeccionEditor.jsx'
import DialogoConfirmacion from '../../components/panel/DialogoConfirmacion.jsx'
import PlantillaPanel from '../../components/panel/PlantillaPanel.jsx'
import { EstadoCarga, EstadoError, EstadoVacio, MensajeExito } from '../../components/panel/EstadosCarga.jsx'
import { useSesion } from '../../context/SesionContext.jsx'
import { useDatos } from '../../hooks/useDatos.js'
import {
  actualizarLeccion,
  actualizarPaso,
  crearLeccion,
  crearPaso,
  eliminarLeccion,
  eliminarPaso,
  obtenerCursoEditor,
  ordenarLecciones,
  ordenarPasos,
} from '../../services/contenidoService.js'
import { ESTADO_CURSO } from '../../utils/contenido.js'
import { MAX_LECCIONES } from '../../utils/pasos.js'
import './Contenido.css'


function moverId(ids, id, nuevaPosicion) {
  const sinElemento = ids.filter((actual) => actual !== id)
  sinElemento.splice(nuevaPosicion, 0, id)
  return sinElemento
}

// /maestro/contenido/cursos/:idCurso y /admin/contenido/cursos/:idCurso
function EditorCurso() {
  const { idCurso } = useParams()
  const { usuario } = useSesion()
  const rutaContenido = usuario.rol === 'administrador' ? '/admin/contenido' : '/maestro/contenido'

  const cargarCurso = useCallback(() => obtenerCursoEditor(idCurso, usuario), [idCurso, usuario])
  const { datos: curso, cargando, error, reintentar, setDatos } = useDatos(cargarCurso)

  const [mensaje, setMensaje] = useState('')
  const [recargaFallo, setRecargaFallo] = useState(false)
  const [modificando, setModificando] = useState(false)
  const [agregandoLeccion, setAgregandoLeccion] = useState(false)
  const [dialogo, setDialogo] = useState(null)
  const [procesandoDialogo, setProcesandoDialogo] = useState(false)
  const [errorDialogo, setErrorDialogo] = useState('')
  const operacionRef = useRef(false)

  const bloqueado = cargando || modificando

  
  async function ejecutar(accion, textoExito) {
    if (operacionRef.current) return
    operacionRef.current = true
    setModificando(true)
    setMensaje('')
    setRecargaFallo(false)

    try {
      await accion()
      setMensaje(textoExito)
      try {
        setDatos(await obtenerCursoEditor(idCurso, usuario))
      } catch {
        setRecargaFallo(true)
      }
    } finally {
      operacionRef.current = false
      setModificando(false)
    }
  }

  
  async function ejecutarOrden(accion, textoExito) {
    try {
      await ejecutar(accion, textoExito)
    } catch (errorAlMover) {
      setErrorDialogo('')
      setDialogo({ titulo: 'No pudimos cambiar el orden', contenido: <p>{errorAlMover.message}</p> })
    }
  }

  async function confirmarDialogo() {
    if (!dialogo?.accion) return
    setProcesandoDialogo(true)
    setErrorDialogo('')
    try {
      await ejecutar(dialogo.accion, dialogo.textoExito)
      setDialogo(null)
    } catch (errorAccion) {
      setErrorDialogo(errorAccion.message || 'No pudimos hacer el cambio. Inténtalo otra vez.')
    } finally {
      setProcesandoDialogo(false)
    }
  }

  if (cargando || error || !curso) {
    return (
      <PlantillaPanel titulo="Editar lecciones" regresarA={rutaContenido} textoRegresar="Regresar a Contenido">
        {cargando && <EstadoCarga texto="Cargando el curso…" />}
        {error && <EstadoError error={error} onReintentar={reintentar} titulo="No pudimos abrir el curso" />}
      </PlantillaPanel>
    )
  }

  const estado = ESTADO_CURSO[curso.estadoPublicacion]
  const soloLectura = !curso.puedeEditar
  const publicado = curso.estadoPublicacion === 'publicado'
  // Igual que el backend: en publicados o con avance solo se corrigen textos
  const estructuraBloqueada = soloLectura || publicado || curso.tieneAvance
  const idsLecciones = curso.lecciones.map((leccion) => leccion.idLeccion)

  return (
    <PlantillaPanel
      titulo={curso.titulo}
      descripcion="Lecciones y pasos del curso"
      regresarA={rutaContenido}
      textoRegresar="Regresar a Contenido"
    >
      <p className="vt-cluster">
        <span className={estado.clase}>
          <span className="vt-icon" aria-hidden="true">
            {estado.icono}
          </span>
          {estado.texto}
        </span>
        <span className="vt-body-sm vt-text-muted">Creado por {curso.creadoPor}</span>
      </p>

      <AvisoEdicion curso={curso} soloLectura={soloLectura} estructuraBloqueada={estructuraBloqueada} />

      <MensajeExito texto={mensaje} />

      {recargaFallo && (
        <div className="vt-alert vt-alert-warning" role="alert">
          <span className="vt-icon" aria-hidden="true">
            sync_problem
          </span>
          <div className="vt-alert__content vt-stack vt-stack-sm">
            <p>El cambio se guardó, pero no pudimos actualizar la lista.</p>
            <div>
              <button type="button" className="vt-btn vt-btn-secondary vt-btn-sm" onClick={reintentar}>
                Volver a cargar
              </button>
            </div>
          </div>
        </div>
      )}

      {curso.lecciones.length === 0 ? (
        <EstadoVacio icono="menu_book" titulo="Este curso todavía no tiene lecciones">
          {!estructuraBloqueada && <p>Agrega la primera con el botón "Agregar lección".</p>}
        </EstadoVacio>
      ) : (
        <ol className="vt-stack editor__lecciones" aria-label="Lecciones del curso">
          {curso.lecciones.map((leccion, posicion) => (
            <LeccionEditor
              key={leccion.idLeccion}
              leccion={leccion}
              posicion={posicion}
              totalLecciones={curso.lecciones.length}
              soloLectura={soloLectura}
              estructuraBloqueada={estructuraBloqueada}
              bloqueado={bloqueado}
              onGuardarLeccion={(actual, datos) =>
                ejecutar(() => actualizarLeccion(actual.idLeccion, datos, usuario), `Se guardó la lección "${datos.titulo ?? actual.titulo}".`)
              }
              onMoverLeccion={(actual, nuevaPosicion) =>
                ejecutarOrden(
                  () => ordenarLecciones(curso.idCurso, moverId(idsLecciones, actual.idLeccion, nuevaPosicion), usuario),
                  `"${actual.titulo}" ahora es la lección ${nuevaPosicion + 1}.`,
                )
              }
              onEliminarLeccion={(actual) => {
                setErrorDialogo('')
                setDialogo({
                  titulo: `¿Eliminar la lección "${actual.titulo}"?`,
                  contenido: <p>Se borrarán también sus {actual.pasos.length} pasos. Esta acción no se puede deshacer.</p>,
                  textoConfirmar: 'Sí, eliminar',
                  peligro: true,
                  accion: () => eliminarLeccion(actual.idLeccion, usuario),
                  textoExito: `Se eliminó la lección "${actual.titulo}".`,
                })
              }}
              onCrearPaso={(actual, paso) =>
                ejecutar(() => crearPaso(actual.idLeccion, paso, usuario), `Se agregó un paso a "${actual.titulo}".`)
              }
              onGuardarPaso={(paso, datos) => ejecutar(() => actualizarPaso(paso.idPaso, datos, usuario), 'Se guardó el paso.')}
              onMoverPaso={(actual, paso, nuevaPosicion) =>
                ejecutarOrden(
                  () =>
                    ordenarPasos(
                      actual.idLeccion,
                      moverId(
                        actual.pasos.map((elemento) => elemento.idPaso),
                        paso.idPaso,
                        nuevaPosicion,
                      ),
                      usuario,
                    ),
                  `El paso ahora es el número ${nuevaPosicion + 1}.`,
                )
              }
              onEliminarPaso={(actual, paso, numero) => {
                setErrorDialogo('')
                setDialogo({
                  titulo: `¿Eliminar el paso ${numero + 1} de "${actual.titulo}"?`,
                  contenido: <p>Esta acción no se puede deshacer.</p>,
                  textoConfirmar: 'Sí, eliminar',
                  peligro: true,
                  accion: () => eliminarPaso(paso.idPaso, usuario),
                  textoExito: `Se eliminó el paso ${numero + 1}.`,
                })
              }}
            />
          ))}
        </ol>
      )}

      {!estructuraBloqueada && !agregandoLeccion && (
        <div className="vt-stack vt-stack-sm">
          <div>
            <button
              type="button"
              className="vt-btn vt-btn-primary"
              onClick={() => setAgregandoLeccion(true)}
              disabled={bloqueado || curso.lecciones.length >= MAX_LECCIONES}
            >
              <span className="vt-icon" aria-hidden="true">
                add
              </span>
              Agregar lección
            </button>
          </div>
          {curso.lecciones.length >= MAX_LECCIONES && (
            <p className="vt-btn-hint">Un curso puede tener hasta {MAX_LECCIONES} lecciones.</p>
          )}
        </div>
      )}

      {agregandoLeccion && (
        <section className="vt-stack vt-stack-sm" aria-labelledby="titulo-nueva-leccion">
          <h2 id="titulo-nueva-leccion" className="vt-headline-sm">
            Nueva lección
          </h2>
          <FormularioLeccion
            textoBoton="Agregar lección"
            onGuardar={async (datos) => {
              await ejecutar(() => crearLeccion(curso.idCurso, datos, usuario), `Se agregó la lección "${datos.titulo}".`)
              setAgregandoLeccion(false)
            }}
            onCancelar={() => setAgregandoLeccion(false)}
          />
        </section>
      )}

      <DialogoConfirmacion
        abierto={dialogo !== null}
        titulo={dialogo?.titulo}
        textoConfirmar={dialogo?.textoConfirmar}
        peligro={dialogo?.peligro}
        procesando={procesandoDialogo}
        error={errorDialogo}
        onConfirmar={confirmarDialogo}
        onCancelar={() => setDialogo(null)}
      >
        {dialogo?.contenido}
      </DialogoConfirmacion>
    </PlantillaPanel>
  )
}

function AvisoEdicion({ curso, soloLectura, estructuraBloqueada }) {
  let texto = ''
  if (curso.estadoPublicacion === 'retirado') {
    texto = 'Este curso fue retirado y es de solo lectura.'
  } else if (soloLectura) {
    texto = 'Solo quien creó este curso o un administrador puede editarlo. Aquí puedes ver sus lecciones y pasos.'
  } else if (curso.estadoPublicacion === 'publicado') {
    texto =
      'Este curso está publicado: puedes corregir textos, pero no agregar, quitar ni reordenar lecciones o pasos, ni cambiar el tipo de paso, las opciones o la respuesta correcta. Para eso hay que regresarlo a borrador desde Contenido, y solo se puede si nadie tiene avance.'
  } else if (estructuraBloqueada) {
    texto = 'Este curso ya tiene avance de alumnos: solo puedes corregir textos.'
  }

  if (!texto) {
    return (
      <p className="vt-body-sm vt-text-muted">
        Para publicar, cada lección necesita de 3 a 8 pasos y al menos una práctica. Puedes publicar desde Contenido.
      </p>
    )
  }

  return (
    <div className="vt-alert vt-alert-info">
      <span className="vt-icon" aria-hidden="true">
        lock
      </span>
      <p className="vt-alert__content">{texto}</p>
    </div>
  )
}

export default EditorCurso
