import { useCallback, useEffect, useState } from 'react'

export function useDatos(cargarDatos) {
  const [intento, setIntento] = useState(0)
  const [resultado, setResultado] = useState({
    datos: null,
    error: null,
    funcion: null,
    intento: -1,
  })

  useEffect(() => {
    let vigente = true

    cargarDatos()
      .then((datos) => {
        if (vigente) setResultado({ datos, error: null, funcion: cargarDatos, intento })
      })
      .catch((error) => {
        if (vigente) setResultado({ datos: null, error, funcion: cargarDatos, intento })
      })

    return () => {
      vigente = false
    }
  }, [cargarDatos, intento])

 
  const cargando = resultado.funcion !== cargarDatos || resultado.intento !== intento

  const reintentar = useCallback(() => setIntento((numero) => numero + 1), [])

  
  const setDatos = useCallback((actualizar) => {
    setResultado((anterior) => ({
      ...anterior,
      datos: typeof actualizar === 'function' ? actualizar(anterior.datos) : actualizar,
    }))
  }, [])

  return {
    datos: cargando ? null : resultado.datos,
    error: cargando ? null : resultado.error,
    cargando,
    reintentar,
    setDatos,
  }
}
