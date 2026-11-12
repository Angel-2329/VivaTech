import { urlReproductor } from '../../utils/youtube.js'
import './VideoYouTube.css'


function VideoYouTube({ idVideo, titulo }) {
  return (
    <figure className="video-youtube vt-stack vt-stack-sm">
      <div className="video-youtube__marco">
        <iframe
          src={urlReproductor(idVideo)}
          title={`Video: ${titulo}`}
          loading="lazy"
          allow="accelerometer; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
      <figcaption className="vt-cluster vt-body-sm video-youtube__aviso">
        <span className="vt-icon" aria-hidden="true">
          signal_cellular_alt
        </span>
        <span>Este video usa datos de internet. Puedes continuar sin verlo.</span>
      </figcaption>
    </figure>
  )
}

export default VideoYouTube
