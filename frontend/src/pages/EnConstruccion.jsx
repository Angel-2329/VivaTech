
import Encabezado from '../components/Encabezado.jsx'
import PiePagina from '../components/PiePagina.jsx'
import { useSesion } from '../context/SesionContext.jsx'
import { nombreParaSaludo } from '../utils/nombreParaSaludo.js'

function EnConstruccion({ titulo }) {
  const { usuario } = useSesion()
  const nombre = nombreParaSaludo(usuario)
  const saludo = nombre ? `¡Hola, ${nombre}!` : '¡Hola!'

  return (
    <div className="vt-page">
      <Encabezado variante="sesion" />
      <main id="contenido" className="vt-main">
        <div className="vt-container vt-stack">
          <h1 className="vt-headline-xl">{saludo}</h1>
          <p className="vt-body-lg vt-text-muted">
            {titulo}: pantalla en construcción. Entraste con el rol <strong>{usuario.rol}</strong>.
          </p>
        </div>
      </main>
      <PiePagina />
    </div>
  )
}

export default EnConstruccion
