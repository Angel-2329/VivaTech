const MAX_LETRAS_MOSAICO = 22

function usaMosaico(opciones) {
  return (
    opciones.length <= 6 &&
    opciones.every((opcion) => opcion.icono && Array.from(opcion.texto).length <= MAX_LETRAS_MOSAICO)
  )
}

function BotonesApp({ opciones, correcta, acerto, ultimaIncorrecta, intentosFallidos, onElegir }) {
  const mosaico = usaMosaico(opciones)
  const columnas = mosaico && opciones.length % 3 === 0 ? 3 : 2

  return (
    <ul
      className={mosaico ? 'app-banco__mosaico' : 'app-banco__lista'}
      style={mosaico ? { '--columnas': columnas } : undefined}
      aria-label="Botones de la pantalla de práctica"
    >
      {opciones.map((opcion) => {
        const esCorrecta = acerto && opcion.id === correcta
        const esIncorrecta = opcion.id === ultimaIncorrecta
        const clases = [
          mosaico ? 'app-banco__acceso' : 'app-banco__fila',
          esCorrecta && 'is-correcta',
          esIncorrecta && 'is-incorrecta',
        ]
          .filter(Boolean)
          .join(' ')

        return (
          <li key={opcion.id}>
            <button
              type="button"
              className={clases}
              style={esIncorrecta ? { animationName: intentosFallidos % 2 ? 'sacudir-a' : 'sacudir-b' } : undefined}
              onClick={() => onElegir(opcion.id)}
              aria-disabled={acerto && !esCorrecta ? 'true' : undefined}
            >
              {opcion.icono && (
                <span className="app-banco__burbuja" aria-hidden="true">
                  <span className="vt-icon">{esCorrecta ? 'check' : opcion.icono}</span>
                </span>
              )}
              <span className="app-banco__texto">{opcion.texto}</span>
              {!mosaico && (
                <span className="vt-icon app-banco__flecha" aria-hidden="true">
                  {esCorrecta ? 'check_circle' : 'chevron_right'}
                </span>
              )}
              {esCorrecta && <span className="vt-visually-hidden"> (correcto)</span>}
              {esIncorrecta && <span className="vt-visually-hidden"> (no es este)</span>}
            </button>
          </li>
        )
      })}
    </ul>
  )
}

export default BotonesApp
