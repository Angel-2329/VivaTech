import { useRef, useState } from 'react'
import CampoFechaCierre from './CampoFechaCierre.jsx'
import { revisarFechaCierre } from '../../utils/contenido.js'


function FormularioFechaCierre({ curso, onGuardar, onCancelar }) {
  const [fecha, setFecha] = useState(curso.fechaCierre ?? '')
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  const campoRef = useRef(null)

  async function guardar(nuevaFecha) {
    const problema = revisarFechaCierre(nuevaFecha)
    if (problema) {
      setError(problema)
      campoRef.current?.focus()
      return
    }

    setError('')
    setGuardando(true)
    try {
      await onGuardar(nuevaFecha || null)
    } catch (errorAlGuardar) {
      setError(errorAlGuardar.message || 'No pudimos guardar la fecha. Inténtalo otra vez.')
      setGuardando(false)
      campoRef.current?.focus()
    }
  }

  return (
    <form
      className="vt-card vt-card-subtle vt-stack vt-stack-sm"
      onSubmit={(evento) => {
        evento.preventDefault()
        if (!guardando) guardar(fecha)
      }}
      noValidate
    >
      <CampoFechaCierre
        valor={fecha}
        onCambiar={(valor) => {
          setFecha(valor)
          if (error) setError('')
        }}
        error={error}
        campoRef={campoRef}
        deshabilitado={guardando}
      />
      <div className="vt-cluster">
        <button type="submit" className="vt-btn vt-btn-primary vt-btn-sm" disabled={guardando} aria-busy={guardando}>
          {guardando ? 'Guardando…' : 'Guardar fecha'}
        </button>
        {curso.fechaCierre && (
          <button type="button" className="vt-btn vt-btn-outline vt-btn-sm" onClick={() => guardar('')} disabled={guardando}>
            Quitar fecha
          </button>
        )}
        <button type="button" className="vt-btn vt-btn-secondary vt-btn-sm" onClick={onCancelar} disabled={guardando}>
          Cancelar
        </button>
      </div>
    </form>
  )
}

export default FormularioFechaCierre
