import { useState } from 'react'
import FormularioNombre from './FormularioNombre.jsx'
import TarjetaCursoEditor from './TarjetaCursoEditor.jsx'
import { plural } from '../../utils/formato.js'

function CategoriaEditor({
  categoria,
  posicion,
  totalCategorias,
  categorias,
  usuario,
  bloqueado,
  onRenombrar,
  onMoverCategoria,
  onEliminarCategoria,
  onPedirAccion,
  onMoverCurso,
  onCambiarFecha,
}) {
  const [editandoNombre, setEditandoNombre] = useState(false)
  const esAdmin = usuario.rol === 'administrador'
  const idTitulo = `categoria-${categoria.idCategoria}`

  async function guardarNombre(nombre) {
    await onRenombrar(categoria, nombre)
    setEditandoNombre(false)
  }

  return (
    <section className="vt-stack contenido__categoria" aria-labelledby={idTitulo}>
      <div className="vt-stack vt-stack-sm">
        <h2 id={idTitulo} className="vt-headline-md">
          {categoria.nombre}
        </h2>
        <p className="vt-body-sm vt-text-muted">{plural(categoria.cursos.length, 'curso', 'cursos')}</p>
      </div>

      {esAdmin && editandoNombre && (
        <FormularioNombre
          etiqueta={`Nuevo nombre para "${categoria.nombre}"`}
          textoBoton="Guardar nombre"
          valorInicial={categoria.nombre}
          onGuardar={guardarNombre}
          onCancelar={() => setEditandoNombre(false)}
          deshabilitado={bloqueado}
        />
      )}

      {esAdmin && !editandoNombre && (
        <div className="vt-cluster">
          <button
            type="button"
            className="vt-btn vt-btn-secondary vt-btn-sm"
            onClick={() => setEditandoNombre(true)}
            disabled={bloqueado}
          >
            Cambiar nombre
            <span className="vt-visually-hidden"> de {categoria.nombre}</span>
          </button>
          <button
            type="button"
            className="vt-btn vt-btn-outline vt-btn-sm"
            onClick={() => onMoverCategoria(categoria, posicion - 1)}
            disabled={bloqueado || posicion === 0}
          >
            <span className="vt-icon" aria-hidden="true">
              arrow_upward
            </span>
            Subir
            <span className="vt-visually-hidden"> {categoria.nombre}</span>
          </button>
          <button
            type="button"
            className="vt-btn vt-btn-outline vt-btn-sm"
            onClick={() => onMoverCategoria(categoria, posicion + 1)}
            disabled={bloqueado || posicion === totalCategorias - 1}
          >
            <span className="vt-icon" aria-hidden="true">
              arrow_downward
            </span>
            Bajar
            <span className="vt-visually-hidden"> {categoria.nombre}</span>
          </button>
          <button
            type="button"
            className="vt-btn vt-btn-danger-soft vt-btn-sm"
            onClick={() => onEliminarCategoria(categoria)}
            disabled={bloqueado}
          >
            Eliminar categoría
            <span className="vt-visually-hidden"> {categoria.nombre}</span>
          </button>
        </div>
      )}

      {categoria.cursos.length === 0 ? (
        <p className="vt-card vt-card-subtle">Esta categoría todavía no tiene cursos.</p>
      ) : (
        <ul className="vt-grid-auto contenido__cursos" aria-label={`Cursos de ${categoria.nombre}`}>
          {categoria.cursos.map((curso) => (
            <TarjetaCursoEditor
              key={curso.idCurso}
              curso={curso}
              usuario={usuario}
              categorias={categorias}
              bloqueado={bloqueado}
              onPedirAccion={onPedirAccion}
              onMover={onMoverCurso}
              onCambiarFecha={onCambiarFecha}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

export default CategoriaEditor
