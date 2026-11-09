import { useState } from 'react'

export function useRespuesta(correcta) {
  const [acerto, setAcerto] = useState(false)
  const [ultimaIncorrecta, setUltimaIncorrecta] = useState(null)
  const [intentosFallidos, setIntentosFallidos] = useState(0)

  function elegir(idOpcion) {
    if (acerto) return

    if (idOpcion === correcta) {
      setAcerto(true)
      setUltimaIncorrecta(null)
    } else {
      setUltimaIncorrecta(idOpcion)
      setIntentosFallidos((numero) => numero + 1)
    }
  }

  return { acerto, ultimaIncorrecta, intentosFallidos, elegir }
}

export function clasesOpcion(base, { esCorrectaElegida, esIncorrectaElegida }) {
  return [base, esCorrectaElegida && 'vt-sim-highlight is-correcta', esIncorrectaElegida && 'is-incorrecta']
    .filter(Boolean)
    .join(' ')
}
