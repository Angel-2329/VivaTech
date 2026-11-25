import { useEffect, useId, useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router'
import Encabezado from '../components/Encabezado.jsx'
import PiePagina from '../components/PiePagina.jsx'
import { useSesion } from '../context/SesionContext.jsx'
import { guardarPerfil } from '../services/perfilService.js'
import { nombreParaSaludo } from '../utils/nombreParaSaludo.js'
import { rutaDeInicio } from '../utils/rutaDeInicio.js'
import {
  AYUDA_CARACTERES_NOMBRE,
  LARGO_MAXIMO_APODO,
  LARGO_MAXIMO_NOMBRE,
  normalizarNombrePersona,
  revisarApodo,
  revisarNombreCompleto,
} from '../utils/validacionTexto.js'
import './PrimerAcceso.css'


const CAMPO_DEL_ERROR = {
  nombre_completo_invalido: 'nombre',
  nombre_invalido: 'nombre',
  apodo_invalido: 'apodo',
}

function PrimerAcceso() {
  const { usuario, refrescarPerfil, cerrarSesion } = useSesion()
  const [nombreCompleto, setNombreCompleto] = useState(usuario.nombreCompleto ?? '')
  const [apodo, setApodo] = useState(usuario.apodo ?? '')
  const [errorNombre, setErrorNombre] = useState('')
  const [errorApodo, setErrorApodo] = useState('')
  const [errorGuardado, setErrorGuardado] = useState('')
  const [guardando, setGuardando] = useState(false)
  const navigate = useNavigate()
  const tituloRef = useRef(null)
  const nombreRef = useRef(null)
  const apodoRef = useRef(null)
  const id = useId()

 
  const nombreDelSaludo = nombreParaSaludo({
    nombreCompleto: normalizarNombrePersona(nombreCompleto),
    apodo: normalizarNombrePersona(apodo) || null,
  })
  const saludo = nombreDelSaludo ? `¡Hola, ${nombreDelSaludo}!` : '¡Hola!'

  useEffect(() => {
    tituloRef.current?.focus()
  }, [])


  if (usuario.nombreCompleto) {
    return <Navigate to={rutaDeInicio(usuario)} replace />
  }

  function manejarCambioNombre(evento) {
    setNombreCompleto(evento.target.value)
    if (errorNombre) setErrorNombre('')
  }

  function manejarCambioApodo(evento) {
    setApodo(evento.target.value)
    if (errorApodo) setErrorApodo('')
  }

  async function manejarEnvio(evento) {
    evento.preventDefault()
    if (guardando) return

    const revisionNombre = revisarNombreCompleto(nombreCompleto)
    const revisionApodo = revisarApodo(apodo)

    setErrorNombre(revisionNombre.error ?? '')
    setErrorApodo(revisionApodo.error ?? '')
    setErrorGuardado('')

    if (revisionNombre.error) {
      nombreRef.current?.focus()
      return
    }
    if (revisionApodo.error) {
      apodoRef.current?.focus()
      return
    }

    const nombreLimpio = revisionNombre.valor
    const apodoLimpio = revisionApodo.valor

    setGuardando(true)

    try {
      const resultado = await guardarPerfil({
        nombreCompleto: nombreLimpio,
        apodo: apodoLimpio,
      })

      if (
        !resultado.ok
        && !(
          resultado.estado === 409
          && resultado.codigo === 'perfil_existente'
        )
      ) {
        const campo = CAMPO_DEL_ERROR[resultado.codigo]
        if (campo === 'nombre') {
          setErrorNombre(resultado.mensaje)
          nombreRef.current?.focus()
        } else if (campo === 'apodo') {
          setErrorApodo(resultado.mensaje)
          apodoRef.current?.focus()
        } else {
          setErrorGuardado(resultado.mensaje)
        }
        return
      }

      const perfil = await refrescarPerfil()

      if (perfil?.nombreCompleto) {
        navigate(rutaDeInicio(perfil), { replace: true })
      }
    } catch {
      setErrorGuardado(
        'No pudimos completar el registro. Inténtalo nuevamente.'
      )
    } finally {
      setGuardando(false)
    }
  }

  async function entrarConOtroNumero() {
    if (guardando) return

    setErrorGuardado('')
    setGuardando(true)

    try {
      await cerrarSesion()
      navigate('/acceso', { replace: true })
    } catch {
      setErrorGuardado(
        'No pudimos cerrar la sesión. Inténtalo nuevamente.'
      )
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="vt-page">
      <a className="vt-skip-link" href="#contenido">
        Saltar al contenido
      </a>

      <Encabezado variante="personalizacion" />

      <main id="contenido" className="vt-main">
        <div className="vt-container personalizacion">
          <button type="button" className="vt-back-link" onClick={entrarConOtroNumero} disabled={guardando}>
            <span className="vt-icon" aria-hidden="true">
              arrow_back
            </span>
            Entrar con otro número
          </button>

          <form className="vt-stack vt-stack-lg" onSubmit={manejarEnvio} noValidate>
            <div className="vt-stack vt-stack-sm">
              <p className="personalizacion__paso vt-label-md vt-text-action">
                <span className="vt-icon" aria-hidden="true">
                  badge
                </span>
                Último paso: tus datos
              </p>
              <h1 ref={tituloRef} tabIndex={-1} className="vt-headline-xl">
                ¿Cuál es tu nombre completo?
              </h1>
              <p className="vt-text-muted">
                Así aparecerá en tus certificados. Tu maestra o maestro también lo usará para
                encontrarte.
              </p>
            </div>

            {/* Campo 1: nombre completo (obligatorio) */}
            <div className="vt-field">
              <label className="vt-field-label" htmlFor={`${id}-nombre`}>
                Nombre completo
                <span className="vt-field-required">Obligatorio</span>
              </label>
              <p id={`${id}-ayuda-nombre`} className="vt-field-help">
                <span className="vt-icon" aria-hidden="true">
                  info
                </span>
                Escribe tu nombre y apellidos. {AYUDA_CARACTERES_NOMBRE} Ejemplo: Rosa María Pérez Díaz.
              </p>
              <input
                ref={nombreRef}
                id={`${id}-nombre`}
                className="vt-input"
                type="text"
                autoComplete="name"
                maxLength={LARGO_MAXIMO_NOMBRE}
                readOnly={guardando}
                value={nombreCompleto}
                onChange={manejarCambioNombre}
                aria-required="true"
                aria-invalid={errorNombre ? 'true' : undefined}
                aria-describedby={`${id}-ayuda-nombre${errorNombre ? ` ${id}-error-nombre` : ''}`}
              />
              {errorNombre && (
                <p id={`${id}-error-nombre`} className="vt-field-error" role="alert">
                  <span className="vt-icon" aria-hidden="true">
                    error
                  </span>
                  {errorNombre}
                </p>
              )}
            </div>

            {/* Campo 2: apodo (opcional) */}
            <div className="vt-field">
              <label className="vt-field-label" htmlFor={`${id}-apodo`}>
                ¿Cómo quieres que te saludemos? (opcional)
              </label>
              <p id={`${id}-ayuda-apodo`} className="vt-field-help">
                <span className="vt-icon" aria-hidden="true">
                  info
                </span>
                Por ejemplo: Rosa, Don Carlos o Tere. Si lo dejas vacío, te saludaremos con tu
                primer nombre.
              </p>
              <input
                ref={apodoRef}
                id={`${id}-apodo`}
                className="vt-input"
                type="text"
                autoComplete="nickname"
                maxLength={LARGO_MAXIMO_APODO}
                readOnly={guardando}
                value={apodo}
                onChange={manejarCambioApodo}
                aria-invalid={errorApodo ? 'true' : undefined}
                aria-describedby={`${id}-ayuda-apodo${errorApodo ? ` ${id}-error-apodo` : ''}`}
              />
              {errorApodo && (
                <p id={`${id}-error-apodo`} className="vt-field-error" role="alert">
                  <span className="vt-icon" aria-hidden="true">
                    error
                  </span>
                  {errorApodo}
                </p>
              )}
            </div>

            {/* Se actualiza mientras la persona escribe */}
            <div className="vt-alert vt-alert-info vt-alert-soft">
              <span className="vt-avatar" aria-hidden="true">
                <span className="vt-icon">waving_hand</span>
              </span>
              <div className="vt-alert__content">
                <p>Vista previa de saludo:</p>
                <p className="vt-text-action">
                  <strong>{saludo}</strong> Bienvenido(a) a tu espacio digital.
                </p>
              </div>
            </div>

            {errorGuardado && (
              <div className="vt-alert vt-alert-error" role="alert">
                <span className="vt-icon" aria-hidden="true">
                  error
                </span>
                <div className="vt-alert__content">
                  <p className="vt-alert__title">No pudimos guardar tus datos</p>
                  <p>{errorGuardado}</p>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={guardando}
              className="vt-btn vt-btn-primary vt-btn-block"
              aria-busy={guardando}
            >
              {guardando ? 'Guardando…' : 'Guardar y continuar'}
              <span className="vt-icon" aria-hidden="true">
                arrow_forward
              </span>
            </button>
          </form>

          <aside className="vt-alert vt-alert-info vt-alert-soft">
            <span className="vt-icon vt-text-success" aria-hidden="true">
              verified_user
            </span>
            <p className="vt-alert__content">
              <strong>
                Piloto Viva Tech 2026 - Prácticas simuladas sin datos bancarios reales ni dinero
                real. Aquí puedes aprender a tu propio ritmo y sin ningún riesgo.
              </strong>
            </p>
          </aside>
        </div>
      </main>

      <PiePagina />
    </div>
  )
}

export default PrimerAcceso
