import { useCallback, useEffect, useRef } from 'react'
import { useParams } from 'react-router'
import Encabezado from '../components/Encabezado.jsx'
import PiePagina from '../components/PiePagina.jsx'
import { EstadoCarga, EstadoError } from '../components/panel/EstadosCarga.jsx'
import { useDatos } from '../hooks/useDatos.js'
import { verificarCertificado } from '../services/certificadosService.js'
import { fechaLarga } from '../utils/certificados.js'
import '../components/certificado/Certificado.css'


function VerificarCertificado() {
  const { codigo } = useParams()
  const cargar = useCallback(() => verificarCertificado(codigo), [codigo])
  const { datos, cargando, error, reintentar } = useDatos(cargar)
  const tituloRef = useRef(null)

  // 404 o 400: el código no corresponde a ningún certificado
  const noValido = error && (error.estado === 404 || error.estado === 400)

  useEffect(() => {
    if (!cargando) tituloRef.current?.focus()
  }, [cargando])

  return (
    <div className="vt-page">
      <a className="vt-skip-link" href="#contenido">
        Saltar al contenido
      </a>

      <Encabezado />

      <main id="contenido" className="vt-main">
        <div className="vt-container vt-stack vt-stack-lg verificar">
          {cargando && <EstadoCarga texto="Verificando el certificado…" />}

          {datos && (
            <>
              <div className="vt-verify-status">
                <span className="vt-icon vt-text-success verificar__icono" aria-hidden="true">
                  verified
                </span>
                <div className="vt-stack vt-stack-sm">
                  <h1 ref={tituloRef} tabIndex={-1} className="vt-headline-lg">
                    Certificado verificado
                  </h1>
                  <p>Este certificado fue emitido por Viva Tech.</p>
                </div>
              </div>

              <dl className="vt-meta-list vt-meta-list-boxed">
                <div>
                  <dt>Nombre</dt>
                  <dd>{datos.nombreCompleto}</dd>
                </div>
                <div>
                  <dt>Curso</dt>
                  <dd>{datos.tituloCurso}</dd>
                </div>
                <div>
                  <dt>Terminó el curso</dt>
                  <dd>{fechaLarga(datos.fechaFinalizacionCurso)}</dd>
                </div>
                <div>
                  <dt>Fecha de emisión</dt>
                  <dd>{fechaLarga(datos.fechaEmision)}</dd>
                </div>
                <div>
                  <dt>Folio</dt>
                  <dd className="verificar__folio">{datos.folio}</dd>
                </div>
              </dl>

              {datos.lecciones?.length > 0 && (
                <section className="vt-stack vt-stack-sm" aria-labelledby="verificar-lecciones">
                  <h2 id="verificar-lecciones" className="vt-label-lg">
                    Lecciones completadas
                  </h2>
                  <ul className="verificar__lecciones">
                    {datos.lecciones.map((leccion, posicion) => (
                      <li key={posicion}>{leccion.titulo}</li>
                    ))}
                  </ul>
                </section>
              )}

              <p className="vt-body-sm vt-text-muted">
                Constancia de participación en un curso de alfabetización digital, sin validez oficial.
              </p>
            </>
          )}

          {noValido && (
            <div className="vt-verify-status is-invalid">
              <span className="vt-icon verificar__icono" aria-hidden="true">
                gpp_bad
              </span>
              <div className="vt-stack vt-stack-sm">
                <h1 ref={tituloRef} tabIndex={-1} className="vt-headline-lg">
                  Este certificado no es válido
                </h1>
                <p>
                  No encontramos ningún certificado de Viva Tech con este código. Revisa que el enlace esté completo o
                  vuelve a escanear el código QR.
                </p>
              </div>
            </div>
          )}

          {error && !noValido && (
            <>
              <h1 ref={tituloRef} tabIndex={-1} className="vt-headline-lg">
                Verificar certificado
              </h1>
              <EstadoError error={error} onReintentar={reintentar} titulo="No pudimos verificar el certificado" />
            </>
          )}
        </div>
      </main>

      <PiePagina />
    </div>
  )
}

export default VerificarCertificado
