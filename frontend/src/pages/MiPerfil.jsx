import { useEffect, useId, useRef, useState } from 'react'
import FotoPerfil from '../components/FotoPerfil.jsx'
import CambioTelefonoPropio from '../components/perfil/CambioTelefonoPropio.jsx'
import DialogoConfirmacion from '../components/panel/DialogoConfirmacion.jsx'
import PlantillaPanel from '../components/panel/PlantillaPanel.jsx'
import { MensajeExito } from '../components/panel/EstadosCarga.jsx'
import { useSesion } from '../context/SesionContext.jsx'
import { quitarFotoPerfil, subirFotoPerfil } from '../services/fotoService.js'
import { actualizarPerfil } from '../services/perfilService.js'
import { NOMBRE_DEL_ROL } from '../utils/formato.js'
import { ErrorImagen, prepararFoto } from '../utils/imagen.js'
import { rutaDeInicio } from '../utils/rutaDeInicio.js'
import {
  AYUDA_CARACTERES_NOMBRE,
  LARGO_MAXIMO_APODO,
  LARGO_MAXIMO_NOMBRE,
  revisarApodo,
  revisarNombreCompleto,
} from '../utils/validacionTexto.js'
import './MiPerfil.css'

const ERRORES_FOTO = {
  foto_requerida: 'No recibimos la foto. Elígela otra vez.',
  foto_muy_grande: 'La foto es muy pesada. Elige otra foto.',
  formato_no_permitido: 'Ese tipo de imagen no se puede usar. Elige una foto en formato JPG, PNG o WebP.',
  perfil_no_actualizado: 'Tu perfil cambió o ya no está disponible. Vuelve a cargar la página.',
  foto_no_disponible: 'Por ahora no podemos guardar fotos. Inténtalo más tarde.',
}

const CAMBIO_TELEFONO_ACTIVO = import.meta.env.VITE_CAMBIO_TELEFONO !== 'false'

const CAMPO_DEL_ERROR = {
  nombre_completo_invalido: 'nombre',
  nombre_invalido: 'nombre',
  apodo_invalido: 'apodo',
}

function MiPerfil() {
  const { usuario, actualizarUsuario } = useSesion()
  const [mensaje, setMensaje] = useState('')
  const mensajeRef = useRef(null)
  const focoPendienteRef = useRef(null)

  useEffect(() => {
    const destino = focoPendienteRef.current?.current
    if (!destino) return
    destino.focus()
    focoPendienteRef.current = null
  })

  function avisar(texto) {
    setMensaje(texto)
    focoPendienteRef.current = mensajeRef
  }

  return (
    <PlantillaPanel
      titulo="Mi perfil"
      descripcion={
        CAMBIO_TELEFONO_ACTIVO
          ? 'Aquí puedes poner tu foto, corregir tu nombre o tu apodo y cambiar tu número de celular.'
          : 'Aquí puedes poner tu foto y corregir tu nombre o tu apodo.'
      }
      regresarA={rutaDeInicio(usuario)}
      textoRegresar="Regresar al inicio"
    >
      <MensajeExito texto={mensaje} enfoqueRef={mensajeRef} />

      <SeccionFoto
        usuario={usuario}
        onCambio={(cambios, texto) => {
          actualizarUsuario(cambios)
          avisar(texto)
        }}
        onLimpiarMensaje={() => setMensaje('')}
      />

      <SeccionDatos
        key={`${usuario.nombreCompleto}|${usuario.apodo ?? ''}`}
        usuario={usuario}
        onGuardado={(perfil) => {
          actualizarUsuario({ nombreCompleto: perfil.nombreCompleto, apodo: perfil.apodo })
          avisar('Guardamos tus datos.')
        }}
        onLimpiarMensaje={() => setMensaje('')}
      />

      {CAMBIO_TELEFONO_ACTIVO && (
        <CambioTelefonoPropio onCambiado={avisar} onLimpiarMensaje={() => setMensaje('')} />
      )}
    </PlantillaPanel>
  )
}

function SeccionFoto({ usuario, onCambio, onLimpiarMensaje }) {
  const [vistaPrevia, setVistaPrevia] = useState(null)
  const [preparando, setPreparando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [confirmarQuitar, setConfirmarQuitar] = useState(false)
  const [errorQuitar, setErrorQuitar] = useState('')
  const archivoRef = useRef(null)
  const vistaPreviaRef = useRef(null)
  const elegirRef = useRef(null)
  const textoVistaPreviaRef = useRef(null)
  const focoPendienteRef = useRef(null)
  const id = useId()

  useEffect(() => {
    const destino = focoPendienteRef.current?.current
    if (!destino) return
    destino.focus()
    focoPendienteRef.current = null
  })

  useEffect(() => () => {
    if (vistaPreviaRef.current) URL.revokeObjectURL(vistaPreviaRef.current.url)
  }, [])

  function cambiarVistaPrevia(nueva) {
    if (vistaPreviaRef.current) URL.revokeObjectURL(vistaPreviaRef.current.url)
    vistaPreviaRef.current = nueva
    setVistaPrevia(nueva)
  }

  function elegirFoto() {
    if (preparando || guardando) return
    onLimpiarMensaje()
    setError('')
    archivoRef.current?.click()
  }

  async function manejarArchivo(evento) {
    const archivo = evento.target.files?.[0]
    evento.target.value = ''
    if (!archivo) return

    setPreparando(true)
    setError('')
    try {
      const foto = await prepararFoto(archivo)
      cambiarVistaPrevia({ foto, url: URL.createObjectURL(foto) })
      focoPendienteRef.current = textoVistaPreviaRef
    } catch (errorAlPreparar) {
      setError(
        errorAlPreparar instanceof ErrorImagen
          ? errorAlPreparar.message
          : 'No pudimos abrir esa imagen. Elige otra foto.',
      )
    } finally {
      setPreparando(false)
    }
  }

  function cancelarVistaPrevia() {
    cambiarVistaPrevia(null)
    setError('')
    focoPendienteRef.current = elegirRef
  }

  async function guardarFoto() {
    if (!vistaPrevia || guardando) return
    setGuardando(true)
    setError('')
    try {
      const resultado = await subirFotoPerfil(vistaPrevia.foto)
      cambiarVistaPrevia(null)
      onCambio(
        { tieneFoto: resultado.tieneFoto, fotoActualizada: resultado.fotoActualizada },
        'Guardamos tu foto.',
      )
    } catch (errorAlGuardar) {
      setError(
        ERRORES_FOTO[errorAlGuardar.codigo]
          ?? (errorAlGuardar.message || 'No pudimos guardar tu foto. Inténtalo otra vez.'),
      )
    } finally {
      setGuardando(false)
    }
  }

  async function quitarFoto() {
    if (guardando) return
    setGuardando(true)
    setErrorQuitar('')
    try {
      await quitarFotoPerfil()
      setConfirmarQuitar(false)
      onCambio({ tieneFoto: false, fotoActualizada: null }, 'Quitamos tu foto. Ahora se muestran tus iniciales.')
    } catch (errorAlQuitar) {
      setErrorQuitar(
        ERRORES_FOTO[errorAlQuitar.codigo]
          ?? (errorAlQuitar.message || 'No pudimos quitar tu foto. Inténtalo otra vez.'),
      )
    } finally {
      setGuardando(false)
    }
  }

  const ocupado = preparando || guardando

  return (
    <section className="vt-card vt-stack" aria-labelledby={`${id}-titulo`}>
      <h2 id={`${id}-titulo`} className="vt-headline-sm">
        Foto de perfil
      </h2>
      <p className="vt-text-muted">
        La ven tú, tu maestra o maestro y los administradores. Tus compañeros ven solo tus iniciales.
      </p>

      <div className="mi-perfil__foto">
        {vistaPrevia ? (
          <img className="vt-avatar foto-perfil foto-perfil--lg" src={vistaPrevia.url} alt="Vista previa de tu foto nueva" />
        ) : (
          <FotoPerfil
            uid={usuario.uid}
            nombre={usuario.nombreCompleto}
            tieneFoto={usuario.tieneFoto}
            fotoActualizada={usuario.fotoActualizada}
            tamano="lg"
            descripcion={usuario.tieneFoto ? 'Tu foto de perfil' : 'Aún no tienes foto; se muestran tus iniciales'}
          />
        )}

        <div className="vt-stack vt-stack-sm">
          {vistaPrevia ? (
            <>
              <p ref={textoVistaPreviaRef} tabIndex={-1}>
                Así se verá tu foto. Usamos el centro de la imagen. Si te gusta, elige «Guardar foto».
              </p>
              <div className="vt-cluster">
                <button
                  type="button"
                  className="vt-btn vt-btn-primary"
                  onClick={guardarFoto}
                  disabled={ocupado}
                  aria-busy={guardando}
                >
                  {guardando ? 'Guardando…' : 'Guardar foto'}
                </button>
                <button type="button" className="vt-btn vt-btn-secondary" onClick={cancelarVistaPrevia} disabled={ocupado}>
                  Cancelar
                </button>
              </div>
            </>
          ) : (
            <div className="vt-cluster">
              <button
                ref={elegirRef}
                type="button"
                className="vt-btn vt-btn-primary"
                onClick={elegirFoto}
                disabled={ocupado}
                aria-busy={preparando}
              >
                <span className="vt-icon" aria-hidden="true">
                  add_a_photo
                </span>
                {preparando ? 'Preparando foto…' : usuario.tieneFoto ? 'Cambiar foto' : 'Elegir foto'}
              </button>
              {usuario.tieneFoto && (
                <button
                  type="button"
                  className="vt-btn vt-btn-danger-soft"
                  onClick={() => {
                    onLimpiarMensaje()
                    setErrorQuitar('')
                    setConfirmarQuitar(true)
                  }}
                  disabled={ocupado}
                >
                  Quitar foto
                </button>
              )}
            </div>
          )}
          <p className="vt-field-help">
            Puedes usar una foto de tu celular o computadora (JPG, PNG o WebP). La recortamos en cuadrado y la hacemos
            más ligera antes de guardarla.
          </p>
        </div>
      </div>

      <input
        ref={archivoRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        onChange={manejarArchivo}
      />

      {error && (
        <div className="vt-alert vt-alert-error" role="alert">
          <span className="vt-icon" aria-hidden="true">
            error
          </span>
          <p className="vt-alert__content">{error}</p>
        </div>
      )}

      <DialogoConfirmacion
        abierto={confirmarQuitar}
        titulo="¿Quitar tu foto?"
        textoConfirmar="Sí, quitar foto"
        peligro
        procesando={guardando}
        error={errorQuitar}
        onConfirmar={quitarFoto}
        onCancelar={() => setConfirmarQuitar(false)}
      >
        <p>En su lugar se mostrarán tus iniciales. Puedes poner otra foto cuando quieras.</p>
      </DialogoConfirmacion>
    </section>
  )
}

function SeccionDatos({ usuario, onGuardado, onLimpiarMensaje }) {
  const [nombreCompleto, setNombreCompleto] = useState(usuario.nombreCompleto)
  const [apodo, setApodo] = useState(usuario.apodo ?? '')
  const [errorNombre, setErrorNombre] = useState('')
  const [errorApodo, setErrorApodo] = useState('')
  const [errorGeneral, setErrorGeneral] = useState('')
  const [guardando, setGuardando] = useState(false)
  const nombreRef = useRef(null)
  const apodoRef = useRef(null)
  const id = useId()

  async function manejarEnvio(evento) {
    evento.preventDefault()
    if (guardando) return
    onLimpiarMensaje()

    const revisionNombre = revisarNombreCompleto(nombreCompleto)
    const revisionApodo = revisarApodo(apodo)
    setErrorNombre(revisionNombre.error ?? '')
    setErrorApodo(revisionApodo.error ?? '')
    setErrorGeneral('')

    if (revisionNombre.error) {
      nombreRef.current?.focus()
      return
    }
    if (revisionApodo.error) {
      apodoRef.current?.focus()
      return
    }

    const cambios = {}
    if (revisionNombre.valor !== usuario.nombreCompleto) cambios.nombreCompleto = revisionNombre.valor
    if (revisionApodo.valor !== (usuario.apodo ?? null)) cambios.apodo = revisionApodo.valor

    if (Object.keys(cambios).length === 0) {
      setErrorGeneral('No hay cambios que guardar.')
      return
    }

    setGuardando(true)
    try {
      const perfil = await actualizarPerfil(cambios)
      onGuardado(perfil)
    } catch (error) {
      const campo = CAMPO_DEL_ERROR[error.codigo]
      if (campo === 'nombre') {
        setErrorNombre(error.message)
        nombreRef.current?.focus()
      } else if (campo === 'apodo') {
        setErrorApodo(error.message)
        apodoRef.current?.focus()
      } else {
        setErrorGeneral(error.message || 'No pudimos guardar tus datos. Inténtalo otra vez.')
      }
      setGuardando(false)
    }
  }

  return (
    <section className="vt-card vt-stack" aria-labelledby={`${id}-titulo`}>
      <h2 id={`${id}-titulo`} className="vt-headline-sm">
        Tus datos
      </h2>
      <p className="vt-text-muted">
        Rol: {NOMBRE_DEL_ROL[usuario.rol]}.
        {CAMBIO_TELEFONO_ACTIVO
          ? ' Tu número de celular se cambia más abajo.'
          : ' Si cambiaste de número de celular, pide apoyo a un administrador.'}
      </p>

      <form className="vt-stack" onSubmit={manejarEnvio} noValidate>
        <div className="vt-field">
          <label className="vt-field-label" htmlFor={`${id}-nombre`}>
            Nombre completo
          </label>
          <p id={`${id}-ayuda-nombre`} className="vt-field-help">
            {AYUDA_CARACTERES_NOMBRE}
          </p>
          <input
            ref={nombreRef}
            id={`${id}-nombre`}
            className="vt-input"
            type="text"
            autoComplete="name"
            maxLength={LARGO_MAXIMO_NOMBRE}
            value={nombreCompleto}
            onChange={(evento) => {
              setNombreCompleto(evento.target.value)
              if (errorNombre) setErrorNombre('')
            }}
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

        <div className="vt-field">
          <label className="vt-field-label" htmlFor={`${id}-apodo`}>
            Apodo <span className="vt-text-muted">(opcional)</span>
          </label>
          <p id={`${id}-ayuda-apodo`} className="vt-field-help">
            Así te saludamos en Viva Tech. Si lo dejas vacío, usamos tu primer nombre.
          </p>
          <input
            ref={apodoRef}
            id={`${id}-apodo`}
            className="vt-input"
            type="text"
            autoComplete="nickname"
            maxLength={LARGO_MAXIMO_APODO}
            value={apodo}
            onChange={(evento) => {
              setApodo(evento.target.value)
              if (errorApodo) setErrorApodo('')
            }}
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

        {errorGeneral && (
          <div className="vt-alert vt-alert-error" role="alert">
            <span className="vt-icon" aria-hidden="true">
              error
            </span>
            <p className="vt-alert__content">{errorGeneral}</p>
          </div>
        )}

        <div>
          <button type="submit" className="vt-btn vt-btn-primary" disabled={guardando} aria-busy={guardando}>
            {guardando ? 'Guardando…' : 'Guardar datos'}
          </button>
        </div>
      </form>
    </section>
  )
}

export default MiPerfil
