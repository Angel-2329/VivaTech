function IndicadorPasos({ total, posicion, completados }) {
  return (
    <div className="vt-stack vt-stack-sm">
      <div className="vt-cluster vt-cluster-between">
        <p className="vt-label-lg">
          Paso {posicion + 1} de {total}
        </p>
        <p className="vt-autosave">
          <span className="vt-icon" aria-hidden="true">
            cloud_done
          </span>
          Tu avance se guarda solo
        </p>
      </div>

      <ol className="vt-step-track" style={{ '--vt-steps': total }} aria-label="Pasos de la lección">
        {Array.from({ length: total }, (_, numero) => (
          <li
            key={numero}
            className={numero < completados ? 'is-completed' : undefined}
            aria-current={numero === posicion ? 'step' : undefined}
          >
            <span>
              Paso {numero + 1}
              {numero < completados && <span className="vt-visually-hidden"> (terminado)</span>}
            </span>
          </li>
        ))}
      </ol>
    </div>
  )
}

export default IndicadorPasos
