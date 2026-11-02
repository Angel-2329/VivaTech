function Paginacion({
  pagina,
  haySiguiente,
  cargando = false,
  onCambiar,
  etiqueta = 'Paginación de resultados',
}) {
  return (
    <nav className="vt-cluster" aria-label={etiqueta}>
      <button
        type="button"
        className="vt-btn vt-btn-secondary vt-btn-sm"
        disabled={cargando || pagina === 0}
        onClick={() => onCambiar(pagina - 1)}
      >
        Anterior
      </button>
      <span className="vt-body-sm" role="status" aria-live="polite" aria-atomic="true">
        Página {pagina + 1}
      </span>
      <button
        type="button"
        className="vt-btn vt-btn-secondary vt-btn-sm"
        disabled={cargando || !haySiguiente}
        onClick={() => onCambiar(pagina + 1)}
      >
        Siguiente
      </button>
    </nav>
  )
}

export default Paginacion
