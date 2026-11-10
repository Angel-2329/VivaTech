export const MENU_POR_ROL = {
  estudiante: [
    { ruta: '/estudiante', texto: 'Inicio', exacta: true },
    { ruta: '/estudiante/cursos', texto: 'Mis cursos' },
  ],
  maestro: [
    { ruta: '/maestro', texto: 'Mis grupos', exacta: true },
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
