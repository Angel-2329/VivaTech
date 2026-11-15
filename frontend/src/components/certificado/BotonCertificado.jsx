import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useSesion } from '../../context/SesionContext.jsx'
import { obtenerCertificado } from '../../services/certificadosService.js'


function BotonCertificado({ idCurso, tituloCurso, certificado }) {
  const { usuario } = useSesion()
  const navegar = useNavigate()
  const [obteniendo, setObteniendo] = useState(false)
  const [error, setError] = useState('')

  if (certificado) {
    return (
      <Link className="vt-btn vt-btn-success" to={`/estudiante/certificados/${certificado.idCertificado}`}>
        <span className="vt-icon" aria-hidden="true">
          workspace_premium
        </span>
        Ver certificado
        {tituloCurso && <span className="vt-visually-hidden"> de {tituloCurso}</span>}
      </Link>
    )
  }

  async function obtener() {
    if (obteniendo) return
    setObteniendo(true)
    setError('')
    try {
      const nuevo = await obtenerCertificado(idCurso, usuario)
      navegar(`/estudiante/certificados/${nuevo.idCertificado}`)
    } catch (errorAlObtener) {
      setError(
        errorAlObtener.codigo === 'curso_incompleto'
          ? 'Primero termina todas las lecciones del curso.'
          : errorAlObtener.message || 'No pudimos obtener tu certificado. Inténtalo otra vez.',
      )
      setObteniendo(false)
    }
  }

  return (
    <span className="vt-stack vt-stack-sm">
      <button type="button" className="vt-btn vt-btn-success" onClick={obtener} disabled={obteniendo} aria-busy={obteniendo}>
        <span className="vt-icon" aria-hidden="true">
          workspace_premium
        </span>
        {obteniendo ? 'Preparando tu certificado…' : 'Obtener certificado'}
        {!obteniendo && tituloCurso && <span className="vt-visually-hidden"> de {tituloCurso}</span>}
      </button>
      {error && (
        <span className="vt-field-error" role="alert">
          {error}
        </span>
      )}
    </span>
  )
}

export default BotonCertificado
