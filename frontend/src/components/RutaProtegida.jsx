import { Navigate, Outlet } from 'react-router'
import { useSesion } from '../context/SesionContext.jsx'
import { rutaDeInicio } from '../utils/rutaDeInicio.js'


function RutaProtegida({ roles }) {
  const { usuario } = useSesion()

  if (!usuario) return <Navigate to="/acceso" replace />

  if (roles && !roles.includes(usuario.rol)) {
    return <Navigate to={rutaDeInicio({ ...usuario, primerAcceso: false })} replace />
  }

  return <Outlet />
}

export default RutaProtegida
