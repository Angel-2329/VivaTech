import { useId, useState } from 'react'

function BuscadorPersonas({ etiqueta, buscar, yaAsignados, textoAgregar = 'Agregar', onAgregar }) {
  const [texto, setTexto] = useState('')
  const [resultados, setResultados] = useState(null)
  const [buscando, setBuscando] = useState(false)
  const [agregando, setAgregando] = useState(null)
  const [error, setError] = useState('')
  const id = useId()

  async function manejarBusqueda(evento) {
    evento.preventDefault()
    if (buscando) return

    setBuscando(true)
    setError('')

    try {
      setResultados(await buscar(texto.trim()))
    } catch (errorAlBuscar) {
      setError(errorAlBuscar.message || 'No pudimos buscar. Inténtalo nuevamente.')
    } finally {
      setBuscando(false)
    }
  }

  async function manejarAgregar(persona) {
    setAgregando(persona.uid)
    setError('')

    try {
      await onAgregar(persona)
    } catch (errorAlAgregar) {
      setError(errorAlAgregar.message || 'No pudimos agregar a esta persona. Inténtalo nuevamente.')
    } finally {
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
            Escribe parte del nombre o déjalo vacío para ver a todos.
          </p>
          <input
            id={`${id}-texto`}
            className="vt-input"
            type="search"
            value={texto}
            onChange={(evento) => setTexto(evento.target.value)}
            aria-describedby={`${id}-ayuda`}
          />
        </div>
        <button type="submit" className="vt-btn vt-btn-secondary buscador__boton" disabled={buscando} aria-busy={buscando}>
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

      <div role="status">
        {resultados?.length === 0 && <p className="vt-text-muted">No encontramos a nadie con ese nombre.</p>}
        {resultados?.length > 0 && <p className="vt-visually-hidden">{resultados.length} resultados</p>}
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
                    disabled={agregando !== null}
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
    </div>
  )
}

export default BuscadorPersonas
