import { Routes, Route, Navigate } from 'react-router'
import RutaProtegida from './components/RutaProtegida.jsx'
import Acceso from './pages/Acceso.jsx'
import PrimerAcceso from './pages/PrimerAcceso.jsx'
import AvisoPrivacidad from './pages/AvisoPrivacidad.jsx'
import EnConstruccion from './pages/EnConstruccion.jsx'
import InicioEstudiante from './pages/estudiante/InicioEstudiante.jsx'

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
        <Route path="/estudiante/cursos" element={<EnConstruccion titulo="Mis cursos" />} />
      </Route>

      {/* Solo maestros */}
      <Route element={<RutaProtegida roles={['maestro']} />}>
        <Route path="/maestro" element={<EnConstruccion titulo="Mis grupos" />} />
        <Route path="/maestro/grupos/:idGrupo" element={<EnConstruccion titulo="Detalle del grupo" />} />
      </Route>

      {/* Solo administradores */}
      <Route element={<RutaProtegida roles={['administrador']} />}>
        <Route path="/admin" element={<EnConstruccion titulo="Inicio del administrador" />} />
        <Route path="/admin/usuarios" element={<EnConstruccion titulo="Cuentas y roles" />} />
        <Route path="/admin/grupos" element={<EnConstruccion titulo="Grupos" />} />
        <Route path="/admin/grupos/:idGrupo" element={<EnConstruccion titulo="Detalle del grupo" />} />
        <Route path="/admin/progreso" element={<EnConstruccion titulo="Progreso general" />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
