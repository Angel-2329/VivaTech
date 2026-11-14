import { Link, useParams } from 'react-router'
import Certificado from '../../components/certificado/Certificado.jsx'
import PlantillaPanel from '../../components/panel/PlantillaPanel.jsx'
import { EstadoCarga, EstadoError, EstadoVacio } from '../../components/panel/EstadosCarga.jsx'
import { useDatos } from '../../hooks/useDatos.js'
import { listarMisCertificados } from '../../services/certificadosService.js'
import { urlAgregarLinkedIn, urlCompartirLinkedIn, urlVerificacion } from '../../utils/certificados.js'

function VistaCertificado() {
  const { idCertificado } = useParams()
  const { datos: certificados, cargando, error, reintentar } = useDatos(listarMisCertificados)
  const certificado = certificados?.find((actual) => actual.idCertificado === idCertificado) ?? null
  const noExiste = Boolean(certificados) && !certificado

  return (
    <PlantillaPanel
      titulo={certificado ? `Certificado: ${certificado.tituloCurso}` : 'Tu certificado'}
      regresarA="/estudiante/certificados"
      textoRegresar="Regresar a Mis certificados"
    >
      {cargando && <EstadoCarga texto="Cargando tu certificado…" />}

      {noExiste && (
        <EstadoVacio icono="search_off" titulo="No encontramos este certificado">
          <p>Revisa tus certificados en la lista.</p>
          <div>
            <Link className="vt-btn vt-btn-primary" to="/estudiante/certificados">
              Ir a Mis certificados
            </Link>
          </div>
        </EstadoVacio>
      )}
      {error && <EstadoError error={error} onReintentar={reintentar} />}

      {certificado && (
        <>
          <Certificado certificado={certificado} />

          <div className="vt-stack certificado__no-imprimir">
            <div className="vt-cluster">
              <button type="button" className="vt-btn vt-btn-primary" onClick={() => window.print()}>
                <span className="vt-icon" aria-hidden="true">
                  print
                </span>
                Imprimir o guardar como PDF
              </button>
              <Link className="vt-btn vt-btn-outline" to={`/verificar/${encodeURIComponent(certificado.codigoVerificacion)}`}>
                <span className="vt-icon" aria-hidden="true">
                  verified
                </span>
                Ver la página de verificación
              </Link>
            </div>
            <p className="vt-body-sm vt-text-muted">
              Para guardarlo como PDF, en la ventana de impresión elige "Guardar como PDF" en el destino.
            </p>

            <section className="vt-card vt-card-subtle vt-stack vt-stack-sm" aria-labelledby="titulo-linkedin">
              <h2 id="titulo-linkedin" className="vt-headline-sm">
                Compártelo en LinkedIn (opcional)
              </h2>
              <p>
                Es gratis. Si no tienes cuenta, LinkedIn te pedirá iniciar sesión y tú decides si sigues. Quien lo vea
                podrá comprobarlo en{' '}
                <span className="certificado__enlace">{urlVerificacion(certificado.codigoVerificacion)}</span>
              </p>
              <div className="vt-cluster">
                <a
                  className="vt-btn vt-btn-secondary"
                  href={urlAgregarLinkedIn(certificado)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Agregar a mi perfil de LinkedIn
                  <span className="vt-visually-hidden"> (se abre en una pestaña nueva)</span>
                  <span className="vt-icon" aria-hidden="true">
                    open_in_new
                  </span>
                </a>
                <a
                  className="vt-btn vt-btn-outline"
                  href={urlCompartirLinkedIn(certificado)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Compartir en LinkedIn
                  <span className="vt-visually-hidden"> (se abre en una pestaña nueva)</span>
                  <span className="vt-icon" aria-hidden="true">
                    open_in_new
                  </span>
                </a>
              </div>
            </section>
          </div>
        </>
      )}
    </PlantillaPanel>
  )
}

export default VistaCertificado
