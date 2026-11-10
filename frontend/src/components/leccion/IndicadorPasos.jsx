function IndicadorPasos({ total, posicion, completados, mensaje, tituloRef }) {
  return (
    <div className="vt-stack vt-stack-sm">
      <div className="vt-cluster vt-cluster-between">
        <h2 id="titulo-paso" ref={tituloRef} tabIndex={-1} className="vt-label-lg leccion__titulo-paso">
          Paso {posicion + 1} de {total}
        </h2>
        <p className="vt-autosave" role="status">
          <span className="vt-icon" aria-hidden="true">
            {mensaje ? 'check_circle' : 'cloud_done'}
          </span>
          {mensaje ?? 'Tu avance se guarda solo'}
        </p>
      </div>

      <ol className="vt-step-track leccion__pasos" style={{ '--vt-steps': total }} aria-label="Pasos de la lección">
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
