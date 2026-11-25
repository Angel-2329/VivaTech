import { useId, useRef, useState } from 'react'
import { AYUDA_CARACTERES_GRUPO, LARGO_MAXIMO_GRUPO, revisarNombreGrupo } from '../../utils/validacionTexto.js'

const ERRORES_SERVIDOR = {
  grupo_duplicado: 'Ya existe un grupo con ese nombre. Usa otro, por ejemplo agrega el turno o el año.',
}

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

    const revision = revisarNombreGrupo(nombre)

    if (revision.error) {
      setError(revision.error)
      campoRef.current?.focus()
      return
    }

    const nombreLimpio = revision.valor

    setError('')
    setGuardando(true)

    try {
      await onGuardar(nombreLimpio)
      if (limpiarAlGuardar) setNombre('')
    } catch (errorAlGuardar) {
     
      setError(
        ERRORES_SERVIDOR[errorAlGuardar.codigo]
          ?? (errorAlGuardar.message || 'No pudimos guardar el nombre. Inténtalo nuevamente.'),
      )
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
          Escribe hasta {LARGO_MAXIMO_GRUPO} caracteres. {AYUDA_CARACTERES_GRUPO} Ejemplo: 3A Matutino (2026).
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
