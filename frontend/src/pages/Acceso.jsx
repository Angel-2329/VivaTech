import { useState } from 'react'
import Encabezado from '../components/Encabezado.jsx'
import PiePagina from '../components/PiePagina.jsx'
import PasoTelefono from '../components/acceso/PasoTelefono.jsx'
import PasoCodigo from '../components/acceso/PasoCodigo.jsx'
import './Acceso.css'

function Acceso() {
  const [paso, setPaso] = useState(1)
  const [telefono, setTelefono] = useState('')
  const [moverFoco, setMoverFoco] = useState(false)

  function irAlPasoCodigo(numero) {
    setTelefono(numero)
    setPaso(2)
    setMoverFoco(true)
  }

  function regresarAlPasoTelefono() {
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
          <div className="vt-stack acceso__intro">
            <span className="vt-badge vt-badge-primary acceso__insignia">
              <span className="vt-icon" aria-hidden="true">
                verified_user
              </span>
              Acceso protegido y sin contraseñas
            </span>
            <h1 className="vt-headline-xl">
              Bienvenida(o) a tu espacio de aprendizaje digital Viva Tech
            </h1>
            <p className="vt-body-lg vt-text-muted">
              Aprende a usar la tecnología a tu propio ritmo, de forma fácil, segura y guiada
              paso a paso.
            </p>
          </div>

          <section className="vt-card vt-stack vt-stack-lg acceso__tarjeta" aria-labelledby="titulo-paso">
            <ol className="vt-stepper" aria-label="Pasos para entrar">
              <li
                className={paso > 1 ? 'vt-stepper__item is-completed' : 'vt-stepper__item'}
                aria-current={paso === 1 ? 'step' : undefined}
              >
                <span className="vt-step-number" aria-hidden="true">
                  1
                </span>
                <strong>Tu teléfono</strong>
              </li>
              <li className="vt-stepper__item" aria-current={paso === 2 ? 'step' : undefined}>
                <span className="vt-step-number" aria-hidden="true">
                  2
                </span>
                <strong>Código SMS</strong>
              </li>
            </ol>

            {paso === 1 ? (
              <PasoTelefono
                telefonoInicial={telefono}
                enfocarTitulo={moverFoco}
                onContinuar={irAlPasoCodigo}
              />
            ) : (
              <PasoCodigo
                telefono={telefono}
                enfocarTitulo={moverFoco}
                onCambiarNumero={regresarAlPasoTelefono}
              />
            )}
          </section>

          <aside className="vt-alert vt-alert-info acceso__tarjeta">
            <span className="vt-icon" aria-hidden="true">
              shield
            </span>
            <div className="vt-alert__content">
              <p className="vt-alert__title">Tu tranquilidad es nuestra prioridad</p>
              <p>
                Solo usamos tu número para que puedas entrar. No lo compartimos ni te enviaremos
                publicidad.
              </p>
            </div>
          </aside>
        </div>
      </main>

      <PiePagina />
    </div>
  )
}

export default Acceso
