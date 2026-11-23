import { useState } from 'react'
import './Simulador.css'

const formatoHora = new Intl.DateTimeFormat('es-MX', {
  timeZone: 'America/Mexico_City',
  hour: 'numeric',
  minute: '2-digit',
})


function TelefonoSimulado({ etiqueta, aviso, children }) {
  const [hora] = useState(() => formatoHora.format(new Date()))

  return (
    <section className="telefono" aria-label={etiqueta}>
      <div className="telefono__marco">
        <div className="telefono__barra-estado" aria-hidden="true">
          <span>{hora}</span>
          <span className="telefono__camara" />
          <span className="telefono__iconos">
            <span className="vt-icon">signal_cellular_alt</span>
            <span className="vt-icon">wifi</span>
            <span className="vt-icon">battery_full</span>
          </span>
        </div>

        <p className="telefono__practica">
          <span className="vt-icon" aria-hidden="true">
            school
          </span>
          Práctica: no es la aplicación real de tu banco
        </p>

        <div className="telefono__pantalla">
          {aviso}
          {children}
        </div>

        <div className="telefono__inicio" aria-hidden="true" />
      </div>
    </section>
  )
}

export default TelefonoSimulado
