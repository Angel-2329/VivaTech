function textoMaestros(maestros) {
  if (maestros.length === 0) return 'Sin maestro asignado'
  const nombres = maestros.map((maestro) => maestro.nombreCompleto).join(', ')
  return maestros.length === 1 ? `Maestra o maestro: ${nombres}` : `Maestras y maestros: ${nombres}`
}

function TarjetaMiGrupo({ grupos }) {
  const titulo = grupos?.length > 1 ? 'Mis grupos' : 'Mi grupo'

  return (
    <section className="vt-card vt-stack vt-stack-sm" aria-labelledby="titulo-mi-grupo">
      <span className="vt-category-icon" aria-hidden="true">
        <span className="vt-icon">groups</span>
      </span>
      <h2 id="titulo-mi-grupo" className="vt-headline-sm">
        {titulo}
      </h2>

      {grupos === null && (
        <p className="vt-text-muted">No pudimos cargar tu grupo. Recarga la página para intentarlo de nuevo.</p>
      )}

      {grupos?.length === 0 && (
        <p className="vt-text-muted">
          Todavía no perteneces a un grupo. Puedes tomar cualquier curso; cuando tu maestra o maestro te agregue,
          aparecerá aquí.
        </p>
      )}

      {grupos?.length > 0 && (
        <ul className="vt-stack vt-stack-sm mi-grupo__lista">
          {grupos.map((grupo) => (
            <li key={grupo.idGrupo}>
              <p>
                <strong>{grupo.nombre}</strong>
              </p>
              <p className="vt-body-sm vt-text-muted">{textoMaestros(grupo.maestros)}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export default TarjetaMiGrupo
