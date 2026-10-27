import { useState } from 'react'
import { Navigate } from 'react-router'
import Encabezado from '../components/Encabezado.jsx'
import PiePagina from '../components/PiePagina.jsx'
import PasoTelefono from '../components/acceso/PasoTelefono.jsx'
import PasoCodigo from '../components/acceso/PasoCodigo.jsx'
import { useSesion } from '../context/SesionContext.jsx'
import { rutaDeInicio } from '../utils/rutaDeInicio.js'
import EstadoSesion from '../components/EstadoSesion.jsx'
import './Acceso.css'


function PasoIndicador({ numero, titulo, estado }) {
  const esActual = estado === 'actual'
  const esListo = estado === 'listo'
  const textoEstado = esActual ? 'Paso actual' : esListo ? 'Listo' : 'Pendiente'

  return (
    <li
      className={esListo ? 'vt-stepper__item is-completed' : 'vt-stepper__item'}
      aria-current={esActual ? 'step' : undefined}
    >
      <span className="vt-step-number" aria-hidden="true">
        {esListo ? <span className="vt-icon">check</span> : numero}
      </span>
      <span>
        <strong>{titulo}</strong>
        <span className="vt-body-sm">{textoEstado}</span>
      </span>
    </li>
  )
}

function Acceso() {
  const {
    usuario,
    cargando,
    errorSesion,
    mensajeSesion,
  } = useSesion()
  const [paso, setPaso] = useState(1)
  const [telefono, setTelefono] = useState('')
  const [moverFoco, setMoverFoco] = useState(false)
  const [confirmacion, setConfirmacion] = useState(null)
  const [aceptaAviso, setAceptaAviso] = useState(false)

  if (cargando || errorSesion) {
    return <EstadoSesion />
  }

  if (usuario) return <Navigate to={rutaDeInicio(usuario)} replace />

  function irAlPasoCodigo(numero, nuevaConfirmacion) {
    setTelefono(numero)
    setConfirmacion(nuevaConfirmacion)
    setPaso(2)
    setMoverFoco(true)
  }

  function regresarAlPasoTelefono() {
    setConfirmacion(null)
    setPaso(1)
    setMoverFoco(true)
  }


  return (
    <div className="vt-page">
      <a className="vt-skip-link" href="#contenido">
        Saltar al contenido
      </a>

      <Encabezado />

      <main id="contenido" className="vt-main">
        <div className="vt-container acceso">
          {mensajeSesion && (
            <div className="vt-alert vt-alert-error" role="alert">
              <p>{mensajeSesion}</p>
            </div>
          )}
          <div className="vt-stack vt-stack-sm acceso__intro">
            <h1 className="vt-headline-xl">Entra a Viva Tech</h1>
            <p className="vt-body-lg vt-text-muted">
              Solo necesitas tu número de celular. No usamos contraseñas.
            </p>
          </div>

          <section className="vt-card vt-stack vt-stack-lg acceso__tarjeta" aria-labelledby="titulo-paso">
            <ol className="vt-stepper" aria-label="Pasos para entrar">
              <PasoIndicador numero={1} titulo="Tu número" estado={paso === 1 ? 'actual' : 'listo'} />
              <PasoIndicador numero={2} titulo="Código" estado={paso === 2 ? 'actual' : 'pendiente'} />
            </ol>

            {paso === 1 ? (
              <PasoTelefono
                telefonoInicial={telefono}
                aceptaAviso={aceptaAviso}
                onCambiarAceptacion={setAceptaAviso}
                enfocarTitulo={moverFoco}
                onContinuar={irAlPasoCodigo}
              />
            ) : (
              <PasoCodigo
                telefono={telefono}
                confirmacion={confirmacion}
                onConfirmacionActualizada={setConfirmacion}
                enfocarTitulo={moverFoco}
                onCambiarNumero={regresarAlPasoTelefono}
              />
            )}
          </section>

          <aside className="vt-alert vt-alert-info acceso__tarjeta">
            <span className="vt-icon" aria-hidden="true">
              support_agent
            </span>
            <div className="vt-alert__content">
              <p className="vt-alert__title">¿Necesitas ayuda con tu teléfono?</p>
              <p>Pide apoyo a tu maestra o maestro de Viva Tech. Te acompañará paso a paso.</p>
            </div>
          </aside>
        </div>
      </main>

      <PiePagina />
    </div>
  )
}

export default Acceso
