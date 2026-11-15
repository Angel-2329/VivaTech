import { useId, useState } from 'react'
import { Link } from 'react-router'
import FormularioFechaCierre from './FormularioFechaCierre.jsx'
import { ESTADO_CURSO } from '../../utils/contenido.js'
import { textoFecha, yaCerro } from '../../utils/fechas.js'
import { plural } from '../../utils/formato.js'

function TarjetaCursoEditor({ curso, usuario, categorias, bloqueado, onPedirAccion, onMover, onCambiarFecha }) {
  const estado = ESTADO_CURSO[curso.estadoPublicacion]
  const esAdmin = usuario.rol === 'administrador'
  const retirado = curso.estadoPublicacion === 'retirado'
  const rutaEditor = `${esAdmin ? '/admin' : '/maestro'}/contenido/cursos/${curso.idCurso}`

  return (
    <li className="vt-card vt-stack contenido__curso">
      <div className="vt-stack vt-stack-sm">
        <p className="vt-cluster">
          <span className={estado.clase}>
            <span className="vt-icon" aria-hidden="true">
              {estado.icono}
            </span>
            {estado.texto}
          </span>
          {!retirado && (
            <span className="vt-body-sm vt-text-muted">{plural(curso.totalLecciones, 'lección', 'lecciones')}</span>
          )}
        </p>
        <h3 className="vt-headline-sm">{curso.titulo}</h3>
        <p>{curso.descripcion}</p>
        <p className="vt-body-sm vt-text-muted">
          Creado por {curso.creadoPor}
        </p>
        {!retirado && <TextoFechaCierre fechaCierre={curso.fechaCierre} />}
      </div>

      {retirado && (
        <p className="vt-body-sm vt-text-muted">
          Curso retirado: se conserva el avance de los alumnos y ya no se puede editar.
        </p>
      )}

      {!retirado && !curso.puedeEditar && (
        <div className="vt-stack vt-stack-sm">
          <p className="vt-body-sm vt-text-muted">Solo quien lo creó o un administrador puede editarlo.</p>
          <div>
            <Link className="vt-btn vt-btn-outline vt-btn-sm" to={rutaEditor}>
              Ver lecciones
              <span className="vt-visually-hidden"> de {curso.titulo}</span>
            </Link>
          </div>
        </div>
      )}

      {curso.puedeEditar && (
        <AccionesCurso
          curso={curso}
          rutaEditor={rutaEditor}
          bloqueado={bloqueado}
          onPedirAccion={onPedirAccion}
          puedeMover={esAdmin}
          categorias={categorias}
          onMover={onMover}
          onCambiarFecha={onCambiarFecha}
        />
      )}
    </li>
  )
}

function TextoFechaCierre({ fechaCierre }) {
  let texto = 'Sin fecha de cierre'
  if (fechaCierre) texto = yaCerro(fechaCierre) ? `Cerró el ${textoFecha(fechaCierre)}` : `Disponible hasta el ${textoFecha(fechaCierre)}`

  return (
    <p className="vt-cluster vt-body-sm">
      <span className="vt-icon" aria-hidden="true">
        {fechaCierre && yaCerro(fechaCierre) ? 'event_busy' : 'event'}
      </span>
      {texto}
    </p>
  )
}

function AccionesCurso({ curso, rutaEditor, bloqueado, onPedirAccion, puedeMover, categorias, onMover, onCambiarFecha }) {
  const id = useId()
  const [editandoFecha, setEditandoFecha] = useState(false)
  const publicado = curso.estadoPublicacion === 'publicado'
  const noPuedeDespublicar = publicado && curso.tieneAvance

  return (
    <div className="vt-stack vt-stack-sm">
      <div className="vt-cluster">
        <Link className="vt-btn vt-btn-secondary vt-btn-sm" to={rutaEditor}>
          Editar lecciones
          <span className="vt-visually-hidden"> de {curso.titulo}</span>
        </Link>

        {publicado ? (
          <button
            type="button"
            className="vt-btn vt-btn-outline vt-btn-sm"
            onClick={() => onPedirAccion(curso, 'borrador')}
            disabled={bloqueado || noPuedeDespublicar}
            aria-describedby={noPuedeDespublicar ? `${id}-avance` : undefined}
          >
            Volver a borrador
            <span className="vt-visually-hidden"> {curso.titulo}</span>
          </button>
        ) : (
          <button
            type="button"
            className="vt-btn vt-btn-primary vt-btn-sm"
            onClick={() => onPedirAccion(curso, 'publicar')}
            disabled={bloqueado}
          >
            Publicar
            <span className="vt-visually-hidden"> {curso.titulo}</span>
          </button>
        )}

        <button
          type="button"
          className="vt-btn vt-btn-danger-soft vt-btn-sm"
          onClick={() => onPedirAccion(curso, 'eliminar')}
          disabled={bloqueado}
        >
          Eliminar curso
          <span className="vt-visually-hidden"> {curso.titulo}</span>
        </button>

        {!editandoFecha && (
          <button
            type="button"
            className="vt-btn vt-btn-ghost vt-btn-sm"
            onClick={() => setEditandoFecha(true)}
            disabled={bloqueado}
          >
            <span className="vt-icon" aria-hidden="true">
              event
            </span>
            Fecha de cierre
            <span className="vt-visually-hidden"> de {curso.titulo}</span>
          </button>
        )}
      </div>

      {editandoFecha && (
        <FormularioFechaCierre
          curso={curso}
          onGuardar={async (fecha) => {
            await onCambiarFecha(curso, fecha)
            setEditandoFecha(false)
          }}
          onCancelar={() => setEditandoFecha(false)}
        />
      )}

      {noPuedeDespublicar && (
        <p id={`${id}-avance`} className="vt-btn-hint">
          No puede volver a borrador porque algún alumno ya tiene avance.
        </p>
      )}

      {puedeMover && categorias.length > 1 && (
        <MoverCurso curso={curso} categorias={categorias} bloqueado={bloqueado} onMover={onMover} />
      )}
    </div>
  )
}


function MoverCurso({ curso, categorias, bloqueado, onMover }) {
  const id = useId()
  const otras = categorias.filter((categoria) => categoria.idCategoria !== curso.idCategoria)
  const [destino, setDestino] = useState(otras[0]?.idCategoria ?? '')
  const elegido = otras.some((categoria) => categoria.idCategoria === destino) ? destino : otras[0]?.idCategoria

  return (
    <form
      className="vt-cluster contenido__mover"
      onSubmit={(evento) => {
        evento.preventDefault()
        if (elegido) onMover(curso, elegido)
      }}
    >
      <label className="vt-body-sm" htmlFor={`${id}-destino`}>
        Mover a
      </label>
      <select
        id={`${id}-destino`}
        className="vt-select"
        value={elegido}
        onChange={(evento) => setDestino(evento.target.value)}
        disabled={bloqueado}
      >
        {otras.map((categoria) => (
          <option key={categoria.idCategoria} value={categoria.idCategoria}>
            {categoria.nombre}
          </option>
        ))}
      </select>
      <button type="submit" className="vt-btn vt-btn-secondary vt-btn-sm" disabled={bloqueado}>
        Mover
        <span className="vt-visually-hidden"> {curso.titulo}</span>
      </button>
    </form>
  )
}

export default TarjetaCursoEditor
