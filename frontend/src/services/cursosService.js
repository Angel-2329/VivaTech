import { categorias, responder } from './simulacion/datosDePrueba.js'


export function obtenerMisCursos() {
  return responder(categorias)
}
