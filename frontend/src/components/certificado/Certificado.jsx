import { useId } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { fechaLarga, urlVerificacion } from '../../utils/certificados.js'
import './Certificado.css'


function Certificado({ certificado }) {
  const enlaceVerificacion = urlVerificacion(certificado.codigoVerificacion)
  const anio = new Date(certificado.fechaEmision).getFullYear()

  return (
    <article className="vt-certificate certificado" aria-labelledby="certificado-titulo">
      <div className="certificado__marco">
        <header className="certificado__encabezado">
          <span className="certificado__logo" aria-hidden="true">
            <span className="vt-icon">school</span>
          </span>
          <div className="certificado__institucion">
            <p className="certificado__marca">Viva Tech</p>
            <p className="certificado__lema">Alfabetización digital</p>
          </div>
          <p className="certificado__folio">
            <span className="vt-visually-hidden">Folio: </span>
            {certificado.folio}
          </p>
        </header>

        <div className="certificado__cuerpo">
          <h2 id="certificado-titulo" className="certificado__titulo">
            Certificado
            <span className="certificado__subtitulo">de finalización</span>
          </h2>

          <p className="certificado__adorno" aria-hidden="true">
            <span />
            <span className="certificado__rombo" />
            <span />
          </p>

          <p className="certificado__frase">Se otorga a</p>
          <p className="certificado__nombre">{certificado.nombreCompleto}</p>
          <p className="certificado__frase">por completar el curso</p>
          <p className="certificado__curso">{certificado.tituloCurso}</p>
        </div>

        {certificado.lecciones?.length > 0 && (
          <section className="certificado__lecciones" aria-labelledby="certificado-lecciones">
            <h3 id="certificado-lecciones" className="certificado__etiqueta">
              Lecciones completadas
            </h3>
            <ul>
              {certificado.lecciones.map((leccion, posicion) => (
                <li key={posicion}>
                  <span className="vt-icon" aria-hidden="true">
                    check_circle
                  </span>
                  {leccion.titulo}
                </li>
              ))}
            </ul>
          </section>
        )}

        <footer className="certificado__pie">
          <dl className="certificado__datos">
            <div>
              <dt>Terminó el curso</dt>
              <dd>{fechaLarga(certificado.fechaFinalizacionCurso)}</dd>
            </div>
            <div>
              <dt>Fecha de emisión</dt>
              <dd>{fechaLarga(certificado.fechaEmision)}</dd>
            </div>
            <div>
              <dt>Folio</dt>
              <dd className="certificado__folio-dato">{certificado.folio}</dd>
            </div>
          </dl>

          <Sello anio={anio} />

          <figure className="certificado__qr">
            <QRCodeSVG
              value={enlaceVerificacion}
              size={112}
              level="M"
              marginSize={1}
              title={`Código QR para verificar el certificado ${certificado.folio}`}
            />
            <figcaption>Escanea para verificar</figcaption>
          </figure>
        </footer>

        <p className="certificado__aviso">
          Constancia de participación sin validez oficial. Para comprobar que es auténtico, escanea el código QR o entra
          a la página de verificación.
        </p>
      </div>
    </article>
  )
}


function Sello({ anio }) {
  const idCirculo = useId()

  return (
    <svg className="certificado__sello" viewBox="0 0 120 120" aria-hidden="true" focusable="false">
      <defs>
        <path id={idCirculo} d="M60,60 m-45,0 a45,45 0 1,1 90,0 a45,45 0 1,1 -90,0" />
      </defs>
      <circle className="certificado__sello-fondo" cx="60" cy="60" r="57" />
      <circle className="certificado__sello-linea" cx="60" cy="60" r="53" />
      <text className="certificado__sello-texto">
        <textPath href={`#${idCirculo}`} textLength="280" lengthAdjust="spacingAndGlyphs">
          VIVA TECH · CURSO COMPLETADO · VIVA TECH · CURSO COMPLETADO ·
        </textPath>
      </text>
      <circle className="certificado__sello-centro" cx="60" cy="60" r="33" />
      <path className="certificado__sello-palomita" d="M45 58 l10 10 l21 -22" />
      <text className="certificado__sello-anio" x="60" y="86" textAnchor="middle">
        {anio}
      </text>
    </svg>
  )
}

export default Certificado
