import VideoYouTube from './VideoYouTube.jsx'
import { esIdVideo } from '../../utils/youtube.js'

function RecursosPaso({ recursos }) {
  if (!recursos?.length) return null

  return recursos.map((recurso, posicion) => <Recurso key={posicion} recurso={recurso} />)
}

function Recurso({ recurso }) {
  // Solo llega en pasos de lectura; si el ID no es válido no se muestra nada
  if (recurso.tipo === 'video') {
    return esIdVideo(recurso.idVideo) ? <VideoYouTube idVideo={recurso.idVideo} titulo={recurso.titulo} /> : null
  }

  if (recurso.tipo === 'icono') {
    if (!recurso.alt?.trim()) {
      return (
        <span className="vt-category-icon leccion__icono" aria-hidden="true">
          <span className="vt-icon">{recurso.nombre}</span>
        </span>
      )
    }

    return (
      <span className="vt-category-icon leccion__icono" role="img" aria-label={recurso.alt}>
        <span className="vt-icon" aria-hidden="true">
          {recurso.nombre}
        </span>
      </span>
    )
  }

  if (recurso.tipo === 'lista') {
    return (
      <ul className="leccion__lista vt-body-lg">
        {recurso.elementos.map((elemento) => (
          <li key={elemento}>{elemento}</li>
        ))}
      </ul>
    )
  }

  if (recurso.tipo === 'aviso') {
    return (
      <div className="vt-alert vt-alert-warning">
        <span className="vt-icon" aria-hidden="true">
          shield
        </span>
        <p className="vt-alert__content">
          <strong>Importante: </strong>
          {recurso.texto}
        </p>
      </div>
    )
  }

  
  return null
}

export default RecursosPaso
