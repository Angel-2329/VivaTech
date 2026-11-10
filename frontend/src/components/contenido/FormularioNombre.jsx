import { useRef, useState } from 'react'
import CampoTexto from './CampoTexto.jsx'
import { LIMITES, revisarTexto } from '../../utils/contenido.js'


function FormularioNombre({ etiqueta, textoBoton, valorInicial = '', onGuardar, onCancelar, limpiarAlGuardar, deshabilitado }) {
  const [nombre, setNombre] = useState(valorInicial)
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  const campoRef = useRef(null)

  async function enviar(evento) {
    evento.preventDefault()
    if (guardando || deshabilitado) return

    const problema = revisarTexto(nombre, LIMITES.nombreCategoria, 'el nombre de la categoría')
    if (problema) {
      setError(problema)
      campoRef.current?.focus()
      return
    }

    setError('')
    setGuardando(true)
    try {
      await onGuardar(nombre.trim())
      if (limpiarAlGuardar) setNombre('')
    } catch (errorAlGuardar) {
      setError(errorAlGuardar.message || 'No pudimos guardar el nombre. Inténtalo otra vez.')
      campoRef.current?.focus()
    } finally {
      setGuardando(false)
    }
  }

  return (
    <form className="vt-stack vt-stack-sm" onSubmit={enviar} noValidate>
      <CampoTexto
        etiqueta={etiqueta}
        valor={nombre}
        onCambiar={(valor) => {
          setNombre(valor)
          if (error) setError('')
        }}
        maximo={LIMITES.nombreCategoria}
        error={error}
        deshabilitado={deshabilitado}
        campoRef={campoRef}
      />
      <div className="vt-cluster">
        <button type="submit" className="vt-btn vt-btn-primary" disabled={guardando || deshabilitado} aria-busy={guardando}>
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

export default FormularioNombre
