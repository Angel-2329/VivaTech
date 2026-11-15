import { useId, useState } from 'react'
import CampoTexto from './CampoTexto.jsx'
import { LIMITES_PASO, erroresDelServidor, leccionVacia, validarLeccion } from '../../utils/pasos.js'


function FormularioLeccion({ leccionInicial, soloTextos = false, textoBoton, onGuardar, onCancelar }) {
  const idBase = useId()
  const [datos, setDatos] = useState(() => {
    const base = leccionInicial ?? leccionVacia()
    return { titulo: base.titulo, objetivo: base.objetivo, duracionEstimadaMinutos: String(base.duracionEstimadaMinutos) }
  })
  const [errores, setErrores] = useState({})
  const [errorGeneral, setErrorGeneral] = useState('')
  const [guardando, setGuardando] = useState(false)

  function cambiar(campo, valor) {
    setDatos((anteriores) => ({ ...anteriores, [campo]: valor }))
    if (errores[campo]) setErrores((anteriores) => ({ ...anteriores, [campo]: '' }))
  }

  async function alEnviar(evento) {
    evento.preventDefault()
    if (guardando) return

    const nuevos = validarLeccion(datos)
    setErrores(nuevos)
    setErrorGeneral('')
    const primero = Object.keys(nuevos)[0]
    if (primero) {
      document.getElementById(`${idBase}-${primero}`)?.focus()
      return
    }

    const completos = {
      titulo: datos.titulo.trim(),
      objetivo: datos.objetivo.trim(),
      duracionEstimadaMinutos: Number(datos.duracionEstimadaMinutos),
    }
    let enviar = completos
    if (leccionInicial) {
      enviar = Object.fromEntries(
        Object.entries(completos).filter(([campo, valor]) => valor !== leccionInicial[campo]),
      )
      if (soloTextos) delete enviar.duracionEstimadaMinutos
      if (Object.keys(enviar).length === 0) {
        onCancelar()
        return
      }
    }

    setGuardando(true)
    try {
      await onGuardar(enviar)
    } catch (errorAlGuardar) {
      // 400 contenido_invalido: cada error junto a su campo
      const delServidor = erroresDelServidor(errorAlGuardar)
      setErrores(delServidor)
      setErrorGeneral(errorAlGuardar.message || 'No pudimos guardar la lección. Inténtalo otra vez.')
      setGuardando(false)
      const primeroServidor = Object.keys(delServidor)[0]
      if (primeroServidor) document.getElementById(`${idBase}-${primeroServidor}`)?.focus()
    }
  }

  return (
    <form className="vt-card vt-card-subtle vt-stack" onSubmit={alEnviar} noValidate>
      <CampoTexto
        id={`${idBase}-titulo`}
        etiqueta="Título de la lección"
        valor={datos.titulo}
        onCambiar={(valor) => cambiar('titulo', valor)}
        maximo={LIMITES_PASO.titulo}
        error={errores.titulo}
      />
      <CampoTexto
        id={`${idBase}-objetivo`}
        etiqueta="Lo que se va a aprender"
        valor={datos.objetivo}
        onCambiar={(valor) => cambiar('objetivo', valor)}
        maximo={LIMITES_PASO.objetivo}
        error={errores.objetivo}
        multilinea
      />

      <div className="vt-field">
        <label className="vt-field-label" htmlFor={`${idBase}-duracionEstimadaMinutos`}>
          Duración (minutos)
        </label>
        <p id={`${idBase}-duracion-ayuda`} className="vt-field-help">
          {soloTextos ? 'No se puede cambiar porque el curso ya está publicado o tiene avance.' : 'De 1 a 15 minutos'}
        </p>
        <input
          id={`${idBase}-duracionEstimadaMinutos`}
          className="vt-input editor__numero"
          type="number"
          inputMode="numeric"
          min="1"
          max="15"
          step="1"
          value={datos.duracionEstimadaMinutos}
          disabled={soloTextos}
          onChange={(evento) => cambiar('duracionEstimadaMinutos', evento.target.value)}
          aria-invalid={errores.duracionEstimadaMinutos ? 'true' : undefined}
          aria-describedby={`${idBase}-duracion-ayuda${errores.duracionEstimadaMinutos ? ` ${idBase}-duracion-error` : ''}`}
        />
        {errores.duracionEstimadaMinutos && (
          <p id={`${idBase}-duracion-error`} className="vt-field-error" role="alert">
            <span className="vt-icon" aria-hidden="true">
              error
            </span>
            {errores.duracionEstimadaMinutos}
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

      <div className="vt-cluster">
        <button type="submit" className="vt-btn vt-btn-primary vt-btn-sm" disabled={guardando} aria-busy={guardando}>
          {guardando ? 'Guardando…' : textoBoton}
        </button>
        <button type="button" className="vt-btn vt-btn-secondary vt-btn-sm" onClick={onCancelar} disabled={guardando}>
          Cancelar
        </button>
      </div>
    </form>
  )
}

export default FormularioLeccion
