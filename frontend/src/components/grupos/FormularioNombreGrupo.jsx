import { useId, useRef, useState } from 'react'

const LARGO_MINIMO = 3
const LARGO_MAXIMO = 60


function FormularioNombreGrupo({
  etiqueta,
  textoBoton,
  valorInicial = '',
  onGuardar,
  onCancelar,
  limpiarAlGuardar = false,
}) {
  const [nombre, setNombre] = useState(valorInicial)
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  const campoRef = useRef(null)
  const id = useId()

  async function manejarEnvio(evento) {
    evento.preventDefault()
    if (guardando) return

    const nombreLimpio = nombre.trim().replace(/\s+/g, ' ')

    if (nombreLimpio.length < LARGO_MINIMO) {
      setError(`Escribe un nombre de al menos ${LARGO_MINIMO} letras.`)
      campoRef.current?.focus()
      return
    }

    setError('')
    setGuardando(true)

    try {
      await onGuardar(nombreLimpio)
      if (limpiarAlGuardar) setNombre('')
    } catch (errorAlGuardar) {
      setError(errorAlGuardar.message || 'No pudimos guardar el nombre. Inténtalo nuevamente.')
      campoRef.current?.focus()
    } finally {
      setGuardando(false)
    }
  }

  return (
    <form className="vt-stack vt-stack-sm" onSubmit={manejarEnvio} noValidate>
      <div className="vt-field">
        <label className="vt-field-label" htmlFor={`${id}-nombre`}>
          {etiqueta}
        </label>
        <input
          ref={campoRef}
          id={`${id}-nombre`}
          className="vt-input"
          type="text"
          maxLength={LARGO_MAXIMO}
          value={nombre}
          readOnly={guardando}
          onChange={(evento) => {
            setNombre(evento.target.value)
            if (error) setError('')
          }}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
        />
        {error && (
          <p id={`${id}-error`} className="vt-field-error" role="alert">
            <span className="vt-icon" aria-hidden="true">
              error
            </span>
            {error}
          </p>
        )}
      </div>

      <div className="vt-cluster">
        <button type="submit" className="vt-btn vt-btn-primary" disabled={guardando} aria-busy={guardando}>
          {guardando ? 'Guardando…' : textoBoton}
        </button>
        {onCancelar && (
          <button type="button" className="vt-btn vt-btn-secondary" onClick={onCancelar} disabled={guardando}>
            Cancelar
          </button>
        )}
      </div>
    </form>
  )
}

export default FormularioNombreGrupo
