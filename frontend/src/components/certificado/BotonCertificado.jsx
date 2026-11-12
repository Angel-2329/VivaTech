import { useId } from 'react'

// "Obtener certificado" o "Ver certificado".
// Desactivado hasta la 3.26.3, que hace la pantalla de certificados.
function BotonCertificado({ certificado }) {
  const id = useId()

  return (
    <span className="vt-stack vt-stack-sm">
      <button type="button" className="vt-btn vt-btn-success" disabled aria-describedby={`${id}-pronto`}>
        <span className="vt-icon" aria-hidden="true">
          workspace_premium
        </span>
        {certificado ? 'Ver certificado' : 'Obtener certificado'}
      </button>
      <span id={`${id}-pronto`} className="vt-btn-hint">
        Disponible pronto
      </span>
    </span>
  )
}

export default BotonCertificado
