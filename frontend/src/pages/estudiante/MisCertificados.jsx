import { Link } from 'react-router'
import PlantillaPanel from '../../components/panel/PlantillaPanel.jsx'
import { EstadoCarga, EstadoError, EstadoVacio } from '../../components/panel/EstadosCarga.jsx'
import { useDatos } from '../../hooks/useDatos.js'
import { listarMisCertificados } from '../../services/certificadosService.js'
import { fechaLarga } from '../../utils/certificados.js'
import '../../components/certificado/Certificado.css'

function MisCertificados() {
  const { datos: certificados, cargando, error, reintentar } = useDatos(listarMisCertificados)

  return (
    <PlantillaPanel
      titulo="Mis certificados"
      descripcion="Los certificados de los cursos que terminaste."
      regresarA="/estudiante"
      textoRegresar="Regresar al inicio"
    >
      {cargando && <EstadoCarga texto="Cargando tus certificados…" />}
      {error && <EstadoError error={error} onReintentar={reintentar} />}

      {certificados?.length === 0 && (
        <EstadoVacio icono="workspace_premium" titulo="Aún no tienes certificados">
          <p>Cuando termines un curso, presiona "Obtener certificado" en Mis cursos.</p>
          <div>
            <Link className="vt-btn vt-btn-primary" to="/estudiante/cursos">
              Ir a Mis cursos
            </Link>
          </div>
        </EstadoVacio>
      )}

      {certificados?.length > 0 && (
        <ul className="vt-grid-auto mis-certificados" aria-label="Mis certificados">
          {certificados.map((certificado) => (
            <li key={certificado.idCertificado} className="vt-card vt-stack vt-stack-sm">
              <span className="vt-category-icon is-warning" aria-hidden="true">
                <span className="vt-icon">workspace_premium</span>
              </span>
              <h2 className="vt-headline-sm">{certificado.tituloCurso}</h2>
              <p className="vt-body-sm vt-text-muted">
                Emitido el {fechaLarga(certificado.fechaEmision)} · Folio {certificado.folio}
              </p>
              <div>
                <Link className="vt-btn vt-btn-secondary vt-btn-sm" to={`/estudiante/certificados/${certificado.idCertificado}`}>
                  Ver certificado
                  <span className="vt-visually-hidden"> de {certificado.tituloCurso}</span>
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </PlantillaPanel>
  )
}

export default MisCertificados
