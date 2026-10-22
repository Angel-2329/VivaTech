import { Routes, Route, Navigate } from 'react-router'
import Acceso from './pages/Acceso.jsx'

function App() {
  return (
    <Routes>
      {/* Temporal: mientras no exista la pantalla de Inicio, "/" manda al acceso */}
      <Route path="/" element={<Navigate to="/acceso" replace />} />
      <Route path="/acceso" element={<Acceso />} />
    </Routes>
  )
}

export default App