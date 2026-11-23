import { useEffect } from 'react'
import { Routes, Route, Navigate, matchPath, useLocation } from 'react-router'
import RutaProtegida from './components/RutaProtegida.jsx'
import AvisoSinConexion from './components/AvisoSinConexion.jsx'
import Acceso from './pages/Acceso.jsx'
import PrimerAcceso from './pages/PrimerAcceso.jsx'
import AvisoPrivacidad from './pages/AvisoPrivacidad.jsx'
import InicioEstudiante from './pages/estudiante/InicioEstudiante.jsx'
import CursosDisponibles from './pages/estudiante/CursosDisponibles.jsx'
import MisCursos from './pages/estudiante/MisCursos.jsx'
import Leccion from './pages/estudiante/Leccion.jsx'
import MisCertificados from './pages/estudiante/MisCertificados.jsx'
import VistaCertificado from './pages/estudiante/VistaCertificado.jsx'
import VerificarCertificado from './pages/VerificarCertificado.jsx'
import ListaGrupos from './pages/grupos/ListaGrupos.jsx'
import DetalleGrupo from './pages/grupos/DetalleGrupo.jsx'
import UsuariosRoles from './pages/admin/UsuariosRoles.jsx'
import InicioAdmin from './pages/admin/InicioAdmin.jsx'
import ProgresoGeneral from './pages/admin/ProgresoGeneral.jsx'
import Contenido from './pages/contenido/Contenido.jsx'
import EditorCurso from './pages/contenido/EditorCurso.jsx'

const TITULOS_POR_RUTA = [
  ['/acceso', 'Acceso'],
  ['/aviso-de-privacidad', 'Aviso de privacidad'],
  ['/bienvenida', 'Bienvenida'],
  ['/estudiante', 'Inicio'],
  ['/estudiante/cursos-disponibles', 'Cursos disponibles'],
  ['/estudiante/mis-cursos/en-curso', 'Mis cursos: en curso'],
  ['/estudiante/mis-cursos/terminados', 'Mis cursos: terminados'],
  ['/estudiante/lecciones/:idLeccion', 'Lección'],
  ['/estudiante/certificados', 'Mis certificados'],
  ['/estudiante/certificados/:idCertificado', 'Certificado'],
  ['/maestro', 'Mis grupos'],
  ['/maestro/grupos/:idGrupo', 'Detalle del grupo'],
  ['/maestro/contenido', 'Contenido'],
  ['/maestro/contenido/cursos/:idCurso', 'Editar curso'],
  ['/admin', 'Inicio de administración'],
  ['/admin/usuarios', 'Cuentas y roles'],
  ['/admin/grupos', 'Grupos'],
  ['/admin/grupos/:idGrupo', 'Detalle del grupo'],
  ['/admin/progreso', 'Progreso general'],
  ['/admin/contenido', 'Contenido'],
  ['/admin/contenido/cursos/:idCurso', 'Editar curso'],
]

function tituloDeRuta(ruta) {
  const encontrado = TITULOS_POR_RUTA.find(([patron]) => matchPath(patron, ruta))
  return encontrado ? `${encontrado[1]} | Viva Tech` : 'Viva Tech'
}

function App() {
  const { pathname } = useLocation()

  useEffect(() => {
    if (matchPath('/verificar/:codigo', pathname)) return
    document.title = tituloDeRuta(pathname)
  }, [pathname])

  return (
    <>
      <Routes>
        {/* "/" lleva al acceso; si ya había entrado, Acceso lo manda a su inicio */}
        <Route path="/" element={<Navigate to="/acceso" replace />} />
        <Route path="/acceso" element={<Acceso />} />
        <Route path="/aviso-de-privacidad" element={<AvisoPrivacidad />} />
        {/* Pública: se abre al escanear el QR, con o sin sesión */}
        <Route path="/verificar/:codigo" element={<VerificarCertificado />} />

        {/* Cualquier persona que ya confirmó su código */}
        <Route element={<RutaProtegida />}>
          <Route path="/bienvenida" element={<PrimerAcceso />} />
        </Route>

        {/* Solo estudiantes */}
        <Route element={<RutaProtegida roles={['estudiante']} />}>
          <Route path="/estudiante" element={<InicioEstudiante />} />
          <Route path="/estudiante/cursos-disponibles" element={<CursosDisponibles />} />
          <Route path="/estudiante/mis-cursos" element={<Navigate to="/estudiante/mis-cursos/en-curso" replace />} />
          <Route path="/estudiante/mis-cursos/en-curso" element={<MisCursos seccion="en-curso" />} />
          <Route path="/estudiante/mis-cursos/terminados" element={<MisCursos seccion="terminados" />} />
          <Route path="/estudiante/cursos" element={<Navigate to="/estudiante/mis-cursos/en-curso" replace />} />
          <Route path="/estudiante/lecciones/:idLeccion" element={<Leccion />} />
          <Route path="/estudiante/certificados" element={<MisCertificados />} />
          <Route path="/estudiante/certificados/:idCertificado" element={<VistaCertificado />} />
        </Route>

        {/* Solo maestros */}
        <Route element={<RutaProtegida roles={['maestro']} />}>
          <Route path="/maestro" element={<ListaGrupos />} />
          <Route path="/maestro/grupos/:idGrupo" element={<DetalleGrupo />} />
          <Route path="/maestro/contenido" element={<Contenido />} />
          <Route path="/maestro/contenido/cursos/:idCurso" element={<EditorCurso />} />
        </Route>

        {/* Solo administradores */}
        <Route element={<RutaProtegida roles={['administrador']} />}>
          <Route path="/admin" element={<InicioAdmin />} />
          <Route path="/admin/usuarios" element={<UsuariosRoles />} />
          <Route path="/admin/grupos" element={<ListaGrupos />} />
          <Route path="/admin/grupos/:idGrupo" element={<DetalleGrupo />} />
          <Route path="/admin/progreso" element={<ProgresoGeneral />} />
          <Route path="/admin/contenido" element={<Contenido />} />
          <Route path="/admin/contenido/cursos/:idCurso" element={<EditorCurso />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <AvisoSinConexion />
    </>
  )
}

export default App
