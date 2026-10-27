import { Navigate, Outlet } from 'react-router'
import { useSesion } from '../context/SesionContext.jsx'
import { rutaDeInicio } from '../utils/rutaDeInicio.js'
import EstadoSesion from './EstadoSesion.jsx'

function RutaProtegida({ roles }) {
  const { usuario, cargando, errorSesion } = useSesion()

  if (cargando || errorSesion) {
    return <EstadoSesion />
  }

  if (!usuario) {
    return <Navigate to="/acceso" replace />
  }

  if (roles) {
    if (!usuario.nombreCompleto) {
      return <Navigate to="/bienvenida" replace />
    }

    if (!roles.includes(usuario.rol)) {
      return <Navigate to={rutaDeInicio(usuario)} replace />
    }
  }

  return <Outlet />
}

export default RutaProtegida