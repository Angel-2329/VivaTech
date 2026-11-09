// Recursos de apoyo de un paso: icono, lista y aviso.
// El recurso "video" se muestra en la tarea 3.23.11 (VideoYouTube.jsx).

function RecursosPaso({ recursos }) {
  if (!recursos?.length) return null

  return recursos.map((recurso, posicion) => <Recurso key={posicion} recurso={recurso} />)
}

function Recurso({ recurso }) {
  if (recurso.tipo === 'icono') {
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

  // "video" y cualquier tipo nuevo todavía no se muestran
  return null
}

export default RecursosPaso
