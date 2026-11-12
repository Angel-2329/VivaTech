import { useId, useRef, useState } from 'react'
import CampoFechaCierre from './CampoFechaCierre.jsx'
import CampoTexto from './CampoTexto.jsx'
import { LIMITES, revisarFechaCierre, revisarTexto } from '../../utils/contenido.js'

function FormularioNuevoCurso({ categorias, onCrear, onCancelar }) {
  const [idCategoria, setIdCategoria] = useState(categorias[0]?.idCategoria ?? '')
  const [titulo, setTitulo] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [fechaCierre, setFechaCierre] = useState('')
  const [errores, setErrores] = useState({})
  const [errorGeneral, setErrorGeneral] = useState('')
  const [guardando, setGuardando] = useState(false)
  const tituloRef = useRef(null)
  const descripcionRef = useRef(null)
  const fechaRef = useRef(null)
  const idCampo = useId()

  async function enviar(evento) {
    evento.preventDefault()
    if (guardando) return

    const nuevosErrores = {
      titulo: revisarTexto(titulo, LIMITES.tituloCurso, 'el título del curso'),
      descripcion: revisarTexto(descripcion, LIMITES.descripcionCurso, 'la descripción del curso'),
      fechaCierre: revisarFechaCierre(fechaCierre),
    }
    setErrores(nuevosErrores)
    setErrorGeneral('')

    const campoConError =
      (nuevosErrores.titulo && tituloRef) ||
      (nuevosErrores.descripcion && descripcionRef) ||
      (nuevosErrores.fechaCierre && fechaRef)
    if (campoConError) {
      campoConError.current?.focus()
      return
    }

    setGuardando(true)
    try {
      const datos = { idCategoria, titulo: titulo.trim(), descripcion: descripcion.trim() }
      if (fechaCierre) datos.fechaCierre = fechaCierre
      await onCrear(datos)
    } catch (errorAlCrear) {
      setErrorGeneral(errorAlCrear.message || 'No pudimos crear el curso. Inténtalo otra vez.')
      setGuardando(false)
    }
  }

  return (
    <form className="vt-card vt-stack" onSubmit={enviar} noValidate aria-labelledby={`${idCampo}-titulo`}>
      <h2 id={`${idCampo}-titulo`} className="vt-headline-sm">
        Nuevo curso
      </h2>
      <p className="vt-text-muted">Se guarda como borrador. Los alumnos no lo ven hasta que lo publiques.</p>

      <div className="vt-field">
        <label className="vt-field-label" htmlFor={`${idCampo}-categoria`}>
          Categoría
        </label>
        <select
          id={`${idCampo}-categoria`}
          className="vt-select"
          value={idCategoria}
          onChange={(evento) => setIdCategoria(evento.target.value)}
        >
          {categorias.map((categoria) => (
            <option key={categoria.idCategoria} value={categoria.idCategoria}>
              {categoria.nombre}
            </option>
          ))}
        </select>
      </div>

      <CampoTexto
        etiqueta="Título del curso"
        valor={titulo}
        onCambiar={setTitulo}
        maximo={LIMITES.tituloCurso}
        error={errores.titulo}
        campoRef={tituloRef}
      />

      <CampoTexto
        etiqueta="Descripción (una o dos frases)"
        valor={descripcion}
        onCambiar={setDescripcion}
        maximo={LIMITES.descripcionCurso}
        error={errores.descripcion}
        multilinea
        campoRef={descripcionRef}
      />

      <CampoFechaCierre
        valor={fechaCierre}
        onCambiar={setFechaCierre}
        error={errores.fechaCierre}
        campoRef={fechaRef}
      />

      {errorGeneral && (
        <div className="vt-alert vt-alert-error" role="alert">
          <span className="vt-icon" aria-hidden="true">
            error
          </span>
          <p className="vt-alert__content">{errorGeneral}</p>
        </div>
      )}

      <div className="vt-cluster">
        <button type="submit" className="vt-btn vt-btn-primary" disabled={guardando} aria-busy={guardando}>
          {guardando ? 'Creando…' : 'Crear curso en borrador'}
        </button>
        <button type="button" className="vt-btn vt-btn-secondary" onClick={onCancelar} disabled={guardando}>
          Cancelar
        </button>
      </div>
    </form>
  )
}

export default FormularioNuevoCurso
