import { useEffect, useRef } from 'react'
import { Link } from 'react-router'
import Encabezado from '../components/Encabezado.jsx'
import PiePagina from '../components/PiePagina.jsx'
import './AvisoPrivacidad.css'


const ULTIMA_ACTUALIZACION = '26 de octubre de 2026'

function AvisoPrivacidad() {
  const tituloRef = useRef(null)

  useEffect(() => {
    tituloRef.current?.focus()
  }, [])

  return (
    <div className="vt-page">
      <a className="vt-skip-link" href="#contenido">
        Saltar al contenido
      </a>

      <Encabezado />

      <main id="contenido" className="vt-main">
        <div className="vt-container aviso">
          <Link className="vt-back-link" to="/acceso">
            <span className="vt-icon" aria-hidden="true">
              arrow_back
            </span>
            Regresar
          </Link>

          <article className="vt-card vt-stack vt-stack-lg">
            <header className="vt-stack vt-stack-sm">
              <h1 ref={tituloRef} tabIndex={-1} className="vt-headline-xl">
                Aviso de Privacidad
              </h1>
              <p className="vt-text-muted">Última actualización: {ULTIMA_ACTUALIZACION}</p>
            </header>

            <section className="vt-stack vt-stack-sm" aria-labelledby="aviso-responsable">
              <h2 id="aviso-responsable" className="vt-headline-sm">
                ¿Quién cuida tus datos?
              </h2>
              <p>
                El equipo de Viva Tech, plataforma educativa del Instituto Tecnológico de Oaxaca.
              </p>
            </section>

            <section className="vt-stack vt-stack-sm" aria-labelledby="aviso-datos">
              <h2 id="aviso-datos" className="vt-headline-sm">
                ¿Qué datos usamos?
              </h2>
              <ul className="aviso__lista">
                <li>
                  <strong>Tu número de celular.</strong> Solo sirve para enviarte el código de
                  acceso. Lo guarda el servicio de acceso de Firebase (Google); Viva Tech no lo
                  guarda en su base de datos.
                </li>
                <li>
                  <strong>Tu nombre completo.</strong> Aparece en tus certificados y permite que tu
                  maestra o maestro te encuentre.
                </li>
                <li>
                  <strong>Tu apodo, si eliges uno.</strong> Solo se usa para saludarte.
                </li>
                <li>
                  <strong>Tu avance.</strong> Las lecciones que empiezas y terminas.
                </li>
                <li>
                  <strong>Tus certificados.</strong> Los cursos que concluyes.
                </li>
              </ul>
              <p>
                No pedimos contraseñas, datos bancarios ni dinero. Las prácticas son simuladas.
              </p>
            </section>

            <section className="vt-stack vt-stack-sm" aria-labelledby="aviso-para-que">
              <h2 id="aviso-para-que" className="vt-headline-sm">
                ¿Para qué los usamos?
              </h2>
              <ul className="aviso__lista">
                <li>Para que puedas entrar a la plataforma.</li>
                <li>Para guardar tu avance y que tu maestra o maestro te acompañe.</li>
                <li>Para generar tus certificados.</li>
              </ul>
            </section>

            <section className="vt-stack vt-stack-sm" aria-labelledby="aviso-certificado">
              <h2 id="aviso-certificado" className="vt-headline-sm">
                ¿Quién puede ver tu certificado?
              </h2>
              <p>
                Cualquier persona que tenga el enlace o escanee el código QR de tu certificado.
                Esa página muestra tu nombre completo, el curso, sus lecciones, las fechas y el
                folio. Nunca muestra tu número de celular.
              </p>
            </section>

            <section className="vt-stack vt-stack-sm" aria-labelledby="aviso-derechos">
              <h2 id="aviso-derechos" className="vt-headline-sm">
                ¿Cómo puedes ver, corregir o borrar tus datos?
              </h2>
              <p>
                Tienes derecho a conocer qué datos tenemos, corregirlos, pedir que dejemos de
                usarlos o que los eliminemos (derechos ARCO). Para hacerlo, pide apoyo a tu maestra
                o maestro de Viva Tech.
              </p>
            </section>
          </article>

          <Link className="vt-btn vt-btn-primary aviso__regresar" to="/acceso">
            <span className="vt-icon" aria-hidden="true">
              arrow_back
            </span>
            Regresar
          </Link>
        </div>
      </main>

      <PiePagina />
    </div>
  )
}

export default AvisoPrivacidad
