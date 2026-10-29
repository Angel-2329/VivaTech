import { useEffect, useRef } from 'react'
import Encabezado from '../Encabezado.jsx'
import PiePagina from '../PiePagina.jsx'
import BotonRegresar from './BotonRegresar.jsx'
import './Panel.css'


function PlantillaPanel({ titulo, descripcion, regresarA, textoRegresar, children }) {
  const tituloRef = useRef(null)


  useEffect(() => {
    tituloRef.current?.focus()
  }, [titulo])

  return (
    <div className="vt-page">
      <a className="vt-skip-link" href="#contenido">
        Saltar al contenido
      </a>

      <Encabezado variante="sesion" />

      <main id="contenido" className="vt-main">
        <div className="vt-container vt-stack vt-stack-lg">
          {regresarA && <BotonRegresar a={regresarA} texto={textoRegresar} />}

          <div className="vt-stack vt-stack-sm">
            <h1 ref={tituloRef} tabIndex={-1} className="vt-headline-xl">
              {titulo}
            </h1>
            {descripcion && <p className="vt-body-lg vt-text-muted">{descripcion}</p>}
          </div>

          {children}
        </div>
      </main>

      <PiePagina />
    </div>
  )
}

export default PlantillaPanel
