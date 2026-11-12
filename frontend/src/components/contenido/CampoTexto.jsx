import { useId } from 'react'

function CampoTexto({ etiqueta, valor, onCambiar, maximo, error, multilinea = false, deshabilitado, campoRef, id: idPropio }) {
  const idGenerado = useId()
  const id = idPropio ?? idGenerado
  const largo = Array.from(valor.trim()).length
  const Control = multilinea ? 'textarea' : 'input'

  return (
    <div className="vt-field">
      <label className="vt-field-label" htmlFor={id}>
        {etiqueta}
      </label>
      <p id={`${id}-ayuda`} className="vt-field-help">
        Hasta {maximo} caracteres · llevas {largo}
      </p>
      <Control
        ref={campoRef}
        id={id}
        className={multilinea ? 'vt-textarea' : 'vt-input'}
        type={multilinea ? undefined : 'text'}
        rows={multilinea ? 3 : undefined}
        value={valor}
        disabled={deshabilitado}
        onChange={(evento) => onCambiar(evento.target.value)}
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
  )
}

export default CampoTexto
