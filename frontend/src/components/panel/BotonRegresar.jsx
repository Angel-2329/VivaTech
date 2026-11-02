import { Link } from 'react-router'

function BotonRegresar({ a, texto = 'Regresar' }) {
  return (
    <Link className="vt-back-link" to={a}>
      <span className="vt-icon" aria-hidden="true">
        arrow_back
      </span>
      {texto}
    </Link>
  )
}

export default BotonRegresar
