import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import PlantillaPanel from '../../components/panel/PlantillaPanel.jsx'
import { EstadoCarga, EstadoError, EstadoVacio } from '../../components/panel/EstadosCarga.jsx'
import IndicadorPasos from '../../components/leccion/IndicadorPasos.jsx'
import LeccionTerminada from '../../components/leccion/LeccionTerminada.jsx'
import PasoLeccion from '../../components/leccion/PasoLeccion.jsx'
import { useDatos } from '../../hooks/useDatos.js'
import { obtenerMisCursos } from '../../services/cursosService.js'
import { guardarPaso, obtenerLeccion } from '../../services/leccionesService.js'
import { todosLosCursos } from '../../utils/cursos.js'
import { mensajeDeAvance, mensajeErrorAlGuardar, sePuedeReintentar } from '../../utils/mensajesLeccion.js'
import './Leccion.css'


const ERRORES_SIN_REINTENTO = {
  curso_cerrado: {
    icono: 'event_busy',
    titulo: 'Este curso cerró y ya no puedes empezarlo',
    texto: 'Pregunta a tu maestra o maestro si el curso se abrirá otra vez.',
  },
  curso_retirado: {
    icono: 'archive',
    titulo: 'Este curso fue retirado',
    texto: 'Sus lecciones ya no están disponibles. Tu avance sigue guardado en Mis cursos.',
  },
  leccion_no_encontrada: {
    icono: 'search_off',
    titulo: 'No encontramos esta lección',
    texto: 'Puede que el enlace esté incompleto. Búscala en Mis cursos.',
  },
}

function buscarErrorConocido(error) {
  if (ERRORES_SIN_REINTENTO[error.codigo]) return ERRORES_SIN_REINTENTO[error.codigo]
  if (error.estado === 404) return ERRORES_SIN_REINTENTO.leccion_no_encontrada
  return null
}

function Leccion() {
  const { idLeccion } = useParams()
  const cargarLeccion = useCallback(() => obtenerLeccion(idLeccion), [idLeccion])
  const { datos: leccion, cargando, error, reintentar } = useDatos(cargarLeccion)

  const errorConocido = error ? buscarErrorConocido(error) : null

  return (
    <PlantillaPanel
      titulo={leccion?.titulo ?? 'Lección'}
      descripcion={leccion ? `Curso: ${leccion.tituloCurso}` : undefined}
      regresarA="/estudiante/cursos"
      textoRegresar="Salir de la lección"
    >
      {cargando && <EstadoCarga texto="Cargando la lección…" />}

      {errorConocido && (
        <EstadoVacio icono={errorConocido.icono} titulo={errorConocido.titulo}>
          <p>{errorConocido.texto}</p>
          <div>
            <Link className="vt-btn vt-btn-primary" to="/estudiante/cursos">
              Ir a Mis cursos
            </Link>
          </div>
        </EstadoVacio>
      )}

      {error && !errorConocido && (
        <EstadoError error={error} onReintentar={reintentar} titulo="No pudimos abrir la lección" />
      )}

      {/* key: si cambia la lección, el recorrido empieza de nuevo */}
      {leccion && <RecorridoLeccion key={leccion.idLeccion} leccion={leccion} />}
    </PlantillaPanel>
  )
}


function posicionInicial(leccion) {
  const posicion = leccion.pasos.findIndex((paso) => paso.idPaso === leccion.progreso.idPasoParaContinuar)
  return posicion === -1 ? 0 : posicion
}

function RecorridoLeccion({ leccion }) {
  const [posicion, setPosicion] = useState(() => posicionInicial(leccion))
  const [progreso, setProgreso] = useState(leccion.progreso)
  const [guardando, setGuardando] = useState(false)
  const [errorGuardado, setErrorGuardado] = useState(null)
  const [mensajeAvance, setMensajeAvance] = useState(null)
  const [terminada, setTerminada] = useState(null)

  const tituloPasoRef = useRef(null)
  const enfocarPaso = useRef(false)

  useEffect(() => {
    if (enfocarPaso.current) {
      enfocarPaso.current = false
      tituloPasoRef.current?.focus()
    }
  }, [posicion, terminada])

  const total = leccion.pasos.length
  const paso = leccion.pasos[posicion]
  const esPrimero = posicion === 0
  const esUltimo = posicion === total - 1
  const pasoHecho = posicion < progreso.pasosCompletados

  function irAlPaso(nuevaPosicion) {
    setErrorGuardado(null)
    setMensajeAvance(null)
    enfocarPaso.current = true
    setPosicion(nuevaPosicion)
  }

  function repasar() {
    setTerminada(null)
    irAlPaso(0)
  }

  
  async function completarPaso() {
    setGuardando(true)
    setErrorGuardado(null)

    try {
      const respuesta = await guardarPaso(leccion.idLeccion, paso.idPaso)
      setProgreso(respuesta)

      if (esUltimo && respuesta.leccionCompletada) {
        const certificado = respuesta.cursoCompletado ? await buscarCertificado(leccion.idCurso) : null
        setTerminada({ cursoCompletado: respuesta.cursoCompletado, certificado })
      } else if (!esUltimo) {
        setMensajeAvance(mensajeDeAvance(posicion))
        enfocarPaso.current = true
        setPosicion(posicion + 1)
      }
    } catch (error) {
      setErrorGuardado(error)
    } finally {
      setGuardando(false)
    }
  }

  if (total === 0) {
    return (
      <EstadoVacio icono="hourglass_empty" titulo="Esta lección todavía no tiene pasos">
        <p>Vuelve más tarde o elige otra lección en Mis cursos.</p>
      </EstadoVacio>
    )
  }

  if (terminada) {
    return (
      <LeccionTerminada
        leccion={leccion}
        cursoCompletado={terminada.cursoCompletado}
        certificado={terminada.certificado}
        onRepasar={repasar}
      />
    )
  }

  return (
    <div className="vt-stack vt-stack-lg">
      <p className="vt-body-md vt-text-muted">
        <strong>Lo que vas a aprender:</strong> {leccion.objetivo} · {leccion.duracionEstimadaMinutos} min
      </p>

      <IndicadorPasos
        total={total}
        posicion={posicion}
        completados={progreso.pasosCompletados}
        mensaje={mensajeAvance}
        tituloRef={tituloPasoRef}
      />

      <PasoLeccion paso={paso} guardando={guardando} onCompletar={completarPaso} />

      {errorGuardado && (
        <div className="vt-alert vt-alert-error" role="alert">
          <span className="vt-icon" aria-hidden="true">
            error
          </span>
          <div className="vt-alert__content vt-stack vt-stack-sm">
            <p className="vt-alert__title">No pudimos guardar este paso</p>
            <p>{mensajeErrorAlGuardar(errorGuardado)}</p>
            {sePuedeReintentar(errorGuardado) && (
              <>
                <p>Lo que hiciste no se borra.</p>
                <div>
                  <button
                    type="button"
                    className="vt-btn vt-btn-secondary vt-btn-sm"
                    onClick={completarPaso}
                    disabled={guardando}
                  >
                    <span className="vt-icon" aria-hidden="true">
                      refresh
                    </span>
                    Intentar de nuevo
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <nav className="vt-lesson-nav" aria-label="Pasos de la lección">
        <div className="vt-lesson-nav__inner">
          <button
            type="button"
            className="vt-btn vt-btn-outline"
            onClick={() => irAlPaso(posicion - 1)}
            disabled={esPrimero || guardando}
          >
            <span className="vt-icon" aria-hidden="true">
              arrow_back
            </span>
            Paso anterior
          </button>

          {!pasoHecho && !esUltimo && (
            <p className="vt-btn-hint leccion__ayuda">Termina este paso para pasar al siguiente</p>
          )}

          <button
            type="button"
            className="vt-btn vt-btn-secondary"
            onClick={() => irAlPaso(posicion + 1)}
            disabled={esUltimo || !pasoHecho || guardando}
          >
            Paso siguiente
            <span className="vt-icon" aria-hidden="true">
              arrow_forward
            </span>
          </button>
        </div>
      </nav>
    </div>
  )
}


async function buscarCertificado(idCurso) {
  try {
    const categorias = await obtenerMisCursos()
    const curso = todosLosCursos(categorias).find((actual) => actual.idCurso === idCurso)
    return curso?.certificado ?? null
  } catch {
    return null
  }
}

export default Leccion
