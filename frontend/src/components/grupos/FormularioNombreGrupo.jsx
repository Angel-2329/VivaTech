import { useId, useRef, useState } from 'react'

const LARGO_MINIMO = 1
const LARGO_MAXIMO = 100


function FormularioNombreGrupo({
  etiqueta,
  textoBoton,
  valorInicial = '',
  onGuardar,
  onCancelar,
  limpiarAlGuardar = false,
  deshabilitado = false,
}) {
  const [nombre, setNombre] = useState(valorInicial)
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  const campoRef = useRef(null)
  const id = useId()

  async function manejarEnvio(evento) {
    evento.preventDefault()
    if (guardando || deshabilitado) return

    const nombreLimpio = nombre.trim()
    const longitud = Array.from(nombreLimpio).length

    if (longitud < LARGO_MINIMO || longitud > LARGO_MAXIMO) {
      setError(`El nombre del grupo debe tener entre ${LARGO_MINIMO} y ${LARGO_MAXIMO} caracteres.`)
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
        <p id={`${id}-ayuda`} className="vt-field-help">
          Escribe entre {LARGO_MINIMO} y {LARGO_MAXIMO} caracteres. No se cuentan los espacios al inicio y al final.
        </p>
        <input
          ref={campoRef}
          id={`${id}-nombre`}
          className="vt-input"
          type="text"
          disabled={deshabilitado}
          value={nombre}
          readOnly={guardando}
          onChange={(evento) => {
            setNombre(evento.target.value)
            if (error) setError('')
          }}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={`${id}-ayuda${error ? ` ${id}-error` : ''}`}
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
        <button type="submit" className="vt-btn vt-btn-primary" disabled={guardando || deshabilitado} aria-busy={guardando}>
          {guardando ? 'Guardando…' : textoBoton}
        </button>
        {onCancelar && (
          <button type="button" className="vt-btn vt-btn-secondary" onClick={onCancelar} disabled={guardando || deshabilitado}>
            Cancelar
          </button>
        )}
      </div>
    </form>
  )
}

export default FormularioNombreGrupo
