import { useSyncExternalStore } from 'react'
import './AvisoSinConexion.css'

function suscribirse(avisar) {
  window.addEventListener('online', avisar)
  window.addEventListener('offline', avisar)
  return () => {
    window.removeEventListener('online', avisar)
    window.removeEventListener('offline', avisar)
  }
}

const estaEnLinea = () => navigator.onLine
const enLineaEnServidor = () => true


function AvisoSinConexion() {
  const enLinea = useSyncExternalStore(suscribirse, estaEnLinea, enLineaEnServidor)

  return (
    <div className={enLinea ? 'vt-sin-conexion' : 'vt-sin-conexion is-visible'} role="status">
      {!enLinea && (
        <>
          <svg className="vt-sin-conexion__icono" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path
              fill="currentColor"
              d="M23.64 7c-.45-.34-4.93-4-11.64-4-1.5 0-2.89.19-4.15.48L18.18 13.8 23.64 7zm-6.6 8.22L3.27 1.44 2 2.72l2.05 2.06C1.91 5.76.59 6.82.36 7l11.63 14.49.01.01.01-.01 3.9-4.86 3.32 3.32 1.27-1.27-3.46-3.46z"
            />
          </svg>
          <p>
            <strong>Sin conexión a internet.</strong> Lo que ya guardaste no se pierde.
          </p>
        </>
      )}
    </div>
  )
}

export default AvisoSinConexion
