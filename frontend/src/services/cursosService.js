// SERVICIO SIMULADO de cursos (Sprint 4, tarea 3.23.1).


import { responder } from './simulacion/datosDePrueba.js'
import { armarMisCursos } from './simulacion/progresoDePrueba.js'

export function obtenerMisCursos() {
  return responder(armarMisCursos())
}
