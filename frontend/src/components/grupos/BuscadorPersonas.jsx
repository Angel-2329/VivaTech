import { useCallback, useId, useRef, useState } from 'react'
import { useDatos } from '../../hooks/useDatos.js'
import Paginacion from '../panel/Paginacion.jsx'

const PERSONAS_POR_PAGINA = 20

function BuscadorPersonas({
  etiqueta,
  buscar,
  yaAsignados,
  textoAgregar = 'Agregar',
  onAgregar,
  bloqueado = false,
}) {
  const [texto, setTexto] = useState('')
  const [criterios, setCriterios] = useState(null)
  const [pagina, setPagina] = useState(0)
  const [agregando, setAgregando] = useState(null)
  const [errorAgregar, setErrorAgregar] = useState('')
  const operacionRef = useRef(false)
  const id = useId()

  const cargar = useCallback(() => {
    if (criterios === null) return Promise.resolve(null)

    return buscar(criterios.buscar, {
      limite: PERSONAS_POR_PAGINA + 1,
      desplazamiento: pagina * PERSONAS_POR_PAGINA,
    })
  }, [buscar, criterios, pagina])
  const { datos, cargando, error: errorBusqueda, reintentar } = useDatos(cargar)
  const buscando = criterios !== null && cargando
  const ocupado = buscando || bloqueado || agregando !== null
  const resultados = datos
    ?.slice(0, PERSONAS_POR_PAGINA)
    .filter((persona) => persona.activo !== false)
  const haySiguiente = (datos?.length ?? 0) > PERSONAS_POR_PAGINA
  const error = errorAgregar || errorBusqueda?.message

  function manejarBusqueda(evento) {
    evento.preventDefault()
    if (ocupado || operacionRef.current) return
    setErrorAgregar('')
    setPagina(0)
    setCriterios({ buscar: texto.trim() })
  }

  function cambiarPagina(nuevaPagina) {
    if (ocupado || operacionRef.current) return
    setErrorAgregar('')
    setPagina(nuevaPagina)
  }

  async function manejarAgregar(persona) {
    if (
      ocupado
      || operacionRef.current
      || yaAsignados.includes(persona.uid)
      || persona.activo === false
    ) return

    operacionRef.current = true
    setAgregando(persona.uid)
    setErrorAgregar('')

    try {
      await onAgregar(persona)
    } catch (errorAlAgregar) {
      setErrorAgregar(errorAlAgregar.message || 'No pudimos agregar a esta persona. Inténtalo nuevamente.')
    } finally {
      operacionRef.current = false
      setAgregando(null)
    }
  }

  return (
    <div className="vt-stack">
      <form className="vt-toolbar buscador" onSubmit={manejarBusqueda} role="search">
        <div className="vt-field">
          <label className="vt-field-label" htmlFor={`${id}-texto`}>
            {etiqueta}
          </label>
          <p id={`${id}-ayuda`} className="vt-field-help">
            Escribe parte del nombre o déjalo vacío para consultar las cuentas activas. Los resultados se muestran por páginas.
          </p>
          <input
            id={`${id}-texto`}
            className="vt-input"
            type="search"
            maxLength={100}
            disabled={ocupado}
            value={texto}
            onChange={(evento) => setTexto(evento.target.value)}
            aria-describedby={`${id}-ayuda`}
          />
        </div>
        <button type="submit" className="vt-btn vt-btn-secondary buscador__boton" disabled={ocupado} aria-busy={buscando}>
          <span className="vt-icon" aria-hidden="true">
            search
          </span>
          {buscando ? 'Buscando…' : 'Buscar'}
        </button>
      </form>

      {error && (
        <div className="vt-alert vt-alert-error" role="alert">
          <span className="vt-icon" aria-hidden="true">
            error
          </span>
          <p className="vt-alert__content">{error}</p>
        </div>
      )}

      {errorBusqueda && (
        <button
          type="button"
          className="vt-btn vt-btn-secondary vt-btn-sm"
          disabled={ocupado}
          onClick={() => {
            setErrorAgregar('')
            reintentar()
          }}
        >
          Reintentar búsqueda
        </button>
      )}

      <div role="status">
        {buscando && <p className="vt-text-muted">Buscando personas…</p>}
        {datos?.length === 0 && <p className="vt-text-muted">No encontramos a nadie con ese nombre en esta página.</p>}
        {datos?.length > 0 && resultados?.length === 0 && (
          <p className="vt-text-muted">
            No hay cuentas activas en esta página. Revisa las otras páginas o cambia la búsqueda.
          </p>
        )}
        {resultados?.length > 0 && (
          <p className="vt-visually-hidden">{resultados.length} personas disponibles en esta página</p>
        )}
      </div>

      {resultados?.length > 0 && (
        <ul className="vt-lesson-list" aria-label="Resultados de la búsqueda">
          {resultados.map((persona) => {
            const asignado = yaAsignados.includes(persona.uid)

            return (
              <li key={persona.uid} className="vt-lesson">
                <div className="vt-lesson__body">
                  <p className="vt-lesson__title">{persona.nombreCompleto}</p>
                  {persona.apodo && <p className="vt-lesson__meta">Le dicen: {persona.apodo}</p>}
                </div>

                {asignado ? (
                  <span className="vt-badge vt-badge-success">
                    <span className="vt-icon" aria-hidden="true">
                      check
                    </span>
                    Ya está en el grupo
                  </span>
                ) : (
                  <button
                    type="button"
                    className="vt-btn vt-btn-primary vt-btn-sm"
                    onClick={() => manejarAgregar(persona)}
                    disabled={ocupado}
                    aria-busy={agregando === persona.uid}
                  >
                    {agregando === persona.uid ? 'Agregando…' : textoAgregar}
                    <span className="vt-visually-hidden"> a {persona.nombreCompleto}</span>
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {criterios !== null && (
        <Paginacion
          pagina={pagina}
          haySiguiente={haySiguiente}
          cargando={ocupado}
          onCambiar={cambiarPagina}
          etiqueta={`Páginas de ${etiqueta.toLowerCase()}`}
        />
      )}
    </div>
  )
}

export default BuscadorPersonas
