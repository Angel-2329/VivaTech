export const MENU_POR_ROL = {
  estudiante: [
    { ruta: '/estudiante', texto: 'Inicio', exacta: true },
    { ruta: '/estudiante/cursos-disponibles', texto: 'Cursos disponibles' },
    { ruta: '/estudiante/mis-cursos', texto: 'Mis cursos', activaEn: ['/estudiante/lecciones'] },
    { ruta: '/estudiante/certificados', texto: 'Mis certificados' },
  ],
  maestro: [
    { ruta: '/maestro', texto: 'Mis grupos', exacta: true, activaEn: ['/maestro/grupos'] },
    { ruta: '/maestro/contenido', texto: 'Contenido' },
  ],
  administrador: [
    { ruta: '/admin', texto: 'Inicio', exacta: true },
    { ruta: '/admin/usuarios', texto: 'Cuentas' },
    { ruta: '/admin/grupos', texto: 'Grupos' },
    { ruta: '/admin/progreso', texto: 'Progreso' },
    { ruta: '/admin/contenido', texto: 'Contenido' },
  ],
}

function quitarDiagonalFinal(ruta) {
  return ruta.length > 1 && ruta.endsWith('/') ? ruta.slice(0, -1) : ruta
}

function empiezaCon(ruta, prefijo) {
  return ruta === prefijo || ruta.startsWith(`${prefijo}/`)
}


export function estaActiva(opcion, rutaActual) {
  const ruta = quitarDiagonalFinal(rutaActual)

  const coincide = opcion.exacta ? ruta === opcion.ruta : empiezaCon(ruta, opcion.ruta)
  if (coincide) return true

  return (opcion.activaEn ?? []).some((prefijo) => empiezaCon(ruta, prefijo))
}
