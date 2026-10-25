import { Routes, Route, Navigate } from 'react-router'
import RutaProtegida from './components/RutaProtegida.jsx'
import Acceso from './pages/Acceso.jsx'
import PrimerAcceso from './pages/PrimerAcceso.jsx'
import EnConstruccion from './pages/EnConstruccion.jsx'

function App() {
  return (
    <Routes>
      {/* "/" lleva al acceso; si ya había entrado, Acceso lo manda a su inicio */}
      <Route path="/" element={<Navigate to="/acceso" replace />} />
      <Route path="/acceso" element={<Acceso />} />

      {/* Cualquier persona que ya confirmó su código */}
      <Route element={<RutaProtegida />}>
        <Route path="/bienvenida" element={<PrimerAcceso />} />
      </Route>

      {/* Solo estudiantes */}
      <Route element={<RutaProtegida roles={['estudiante']} />}>
        <Route path="/estudiante" element={<EnConstruccion titulo="Inicio del estudiante" />} />
      </Route>

      {/* Solo maestros */}
      <Route element={<RutaProtegida roles={['maestro']} />}>
        <Route path="/maestro" element={<EnConstruccion titulo="Panel del maestro" />} />
      </Route>

      {/* Solo administradores */}
      <Route element={<RutaProtegida roles={['administrador']} />}>
        <Route path="/admin" element={<EnConstruccion titulo="Panel del administrador" />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
