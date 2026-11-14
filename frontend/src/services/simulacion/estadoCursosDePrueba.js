import { yaCerro } from '../../utils/fechas.js'


export const FECHAS_CIERRE = {
  10: '2026-11-05',
  11: '2026-11-30',
}


export const CURSO_RETIRADO = {
  idCurso: '13',
  idCategoria: '1',
  titulo: 'Usar el cajero automático',
  descripcion: 'Retira efectivo y consulta tu saldo en el cajero sin prisas.',
  cursoCompletado: true,
  leccionesAlRetirar: ['Encontrar un cajero seguro', 'Retirar efectivo paso a paso', 'Consultar tu saldo en el cajero'],
  fechaFinalizacionCurso: '2026-10-28T18:00:00.000Z',
}

export function estadoSegunFecha(fechaCierre) {
  return yaCerro(fechaCierre) ? 'cerrado' : 'disponible'
}
