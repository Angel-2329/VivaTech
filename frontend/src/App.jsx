import { Routes, Route, Navigate } from 'react-router'
import RutaProtegida from './components/RutaProtegida.jsx'
import Acceso from './pages/Acceso.jsx'
import PrimerAcceso from './pages/PrimerAcceso.jsx'
import AvisoPrivacidad from './pages/AvisoPrivacidad.jsx'
import InicioEstudiante from './pages/estudiante/InicioEstudiante.jsx'
import MisCursos from './pages/estudiante/MisCursos.jsx'
import ListaGrupos from './pages/grupos/ListaGrupos.jsx'
import DetalleGrupo from './pages/grupos/DetalleGrupo.jsx'
import UsuariosRoles from './pages/admin/UsuariosRoles.jsx'
import InicioAdmin from './pages/admin/InicioAdmin.jsx'
import ProgresoGeneral from './pages/admin/ProgresoGeneral.jsx'

function App() {
  return (
    <Routes>
      {/* "/" lleva al acceso; si ya había entrado, Acceso lo manda a su inicio */}
      <Route path="/" element={<Navigate to="/acceso" replace />} />
      <Route path="/acceso" element={<Acceso />} />
      <Route path="/aviso-de-privacidad" element={<AvisoPrivacidad />} />

      {/* Cualquier persona que ya confirmó su código */}
      <Route element={<RutaProtegida />}>
        <Route path="/bienvenida" element={<PrimerAcceso />} />
      </Route>

      {/* Solo estudiantes */}
      <Route element={<RutaProtegida roles={['estudiante']} />}>
        <Route path="/estudiante" element={<InicioEstudiante />} />
        <Route path="/estudiante/cursos" element={<MisCursos />} />
      </Route>

      {/* Solo maestros */}
      <Route element={<RutaProtegida roles={['maestro']} />}>
        <Route path="/maestro" element={<ListaGrupos />} />
        <Route path="/maestro/grupos/:idGrupo" element={<DetalleGrupo />} />
      </Route>

      {/* Solo administradores */}
      <Route element={<RutaProtegida roles={['administrador']} />}>
        <Route path="/admin" element={<InicioAdmin />} />
        <Route path="/admin/usuarios" element={<UsuariosRoles />} />
        <Route path="/admin/grupos" element={<ListaGrupos />} />
        <Route path="/admin/grupos/:idGrupo" element={<DetalleGrupo />} />
        <Route path="/admin/progreso" element={<ProgresoGeneral />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
