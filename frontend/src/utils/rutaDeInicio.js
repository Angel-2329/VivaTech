
export function rutaDeInicio(usuario) {
  if (usuario.primerAcceso) return '/bienvenida'

  switch (usuario.rol) {
    case 'maestro':
      return '/maestro' 
    case 'administrador':
      return '/admin' 
    default:
      return '/estudiante'
  }
}
