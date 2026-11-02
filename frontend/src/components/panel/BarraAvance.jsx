function BarraAvance({ completadas, total, unidad = 'lecciones', pequena = false }) {
  if (!total) {
    return <p className="vt-body-sm vt-text-muted">Todavía no hay lecciones publicadas</p>
  }

  const porcentaje = Math.round((completadas / total) * 100)
  const texto = `${completadas} de ${total} ${unidad}`

  return (
    <div className={pequena ? 'vt-progress vt-progress-sm' : 'vt-progress'}>
      <p className="vt-progress__label">
        <span>{texto}</span>
        <strong>{porcentaje} %</strong>
      </p>
      <div
        className="vt-progress__track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={completadas}
        aria-valuetext={`${texto} (${porcentaje} %)`}
      >
        <div className="vt-progress__fill" style={{ width: `${porcentaje}%` }} />
      </div>
    </div>
  )
}

export default BarraAvance
