import { useState } from 'react'
import FormularioLeccion from './FormularioLeccion.jsx'
import FormularioPaso from './FormularioPaso.jsx'
import VistaPreviaPaso from './VistaPreviaPaso.jsx'
import { MAX_PASOS, MIN_PASOS_PUBLICAR, TIPOS_ACTIVIDAD } from '../../utils/pasos.js'
import { plural } from '../../utils/formato.js'


function LeccionEditor({
  leccion,
  posicion,
  totalLecciones,
  soloLectura,
  estructuraBloqueada,
  bloqueado,
  onGuardarLeccion,
  onMoverLeccion,
  onEliminarLeccion,
  onCrearPaso,
  onGuardarPaso,
  onMoverPaso,
  onEliminarPaso,
}) {
  const [abierto, setAbierto] = useState(null)
  const total = leccion.pasos.length
  const faltanPasos = total < MIN_PASOS_PUBLICAR
  const sinPractica = total > 0 && !leccion.pasos.some((paso) => paso.actividad.tipo !== 'lectura')

  const esAbierto = (tipo, idPaso) => abierto?.tipo === tipo && (idPaso === undefined || abierto.idPaso === idPaso)
  const cerrar = () => setAbierto(null)

  return (
    <li className="vt-card vt-stack editor__leccion">
      <div className="vt-stack vt-stack-sm">
        <p className="vt-body-sm vt-text-muted">
          Lección {posicion + 1} · {leccion.duracionEstimadaMinutos} min · {plural(total, 'paso', 'pasos')}
        </p>
        <h3 className="vt-headline-sm">{leccion.titulo}</h3>
        <p>{leccion.objetivo}</p>
        {(faltanPasos || sinPractica) && (
          <p className="vt-cluster vt-body-sm editor__pendiente">
            <span className="vt-icon" aria-hidden="true">
              info
            </span>
            {faltanPasos
              ? `Para publicar necesita al menos ${MIN_PASOS_PUBLICAR} pasos.`
              : 'Para publicar necesita al menos una práctica (toque u opción).'}
          </p>
        )}
      </div>

      {!soloLectura && !esAbierto('leccion') && (
        <div className="vt-cluster">
          <button
            type="button"
            className="vt-btn vt-btn-secondary vt-btn-sm"
            onClick={() => setAbierto({ tipo: 'leccion' })}
            disabled={bloqueado}
          >
            Editar datos
            <span className="vt-visually-hidden"> de la lección {leccion.titulo}</span>
          </button>
          {!estructuraBloqueada && (
            <>
              <BotonMover
                direccion="subir"
                que={`la lección ${leccion.titulo}`}
                disabled={bloqueado || posicion === 0}
                onClick={() => onMoverLeccion(leccion, posicion - 1)}
              />
              <BotonMover
                direccion="bajar"
                que={`la lección ${leccion.titulo}`}
                disabled={bloqueado || posicion === totalLecciones - 1}
                onClick={() => onMoverLeccion(leccion, posicion + 1)}
              />
              <button
                type="button"
                className="vt-btn vt-btn-danger-soft vt-btn-sm"
                onClick={() => onEliminarLeccion(leccion)}
                disabled={bloqueado}
              >
                Eliminar lección
                <span className="vt-visually-hidden"> {leccion.titulo}</span>
              </button>
            </>
          )}
        </div>
      )}

      {esAbierto('leccion') && (
        <FormularioLeccion
          leccionInicial={leccion}
          soloTextos={estructuraBloqueada}
          textoBoton="Guardar lección"
          onGuardar={async (datos) => {
            await onGuardarLeccion(leccion, datos)
            cerrar()
          }}
          onCancelar={cerrar}
        />
      )}

      {total === 0 ? (
        <p className="vt-body-sm vt-text-muted">Esta lección todavía no tiene pasos.</p>
      ) : (
        <ol className="vt-stack vt-stack-sm editor__pasos" aria-label={`Pasos de ${leccion.titulo}`}>
          {leccion.pasos.map((paso, numero) => (
            <li key={paso.idPaso} className="vt-stack vt-stack-sm editor__paso">
              <div className="vt-stack vt-stack-sm">
                <p className="vt-label-lg">
                  Paso {numero + 1} · {TIPOS_ACTIVIDAD[paso.actividad.tipo]}
                </p>
                <p className="editor__resumen-paso">{paso.instruccion}</p>
              </div>

              {!esAbierto('paso', paso.idPaso) && (
                <div className="vt-cluster">
                  {!soloLectura && (
                    <button
                      type="button"
                      className="vt-btn vt-btn-secondary vt-btn-sm"
                      onClick={() => setAbierto({ tipo: 'paso', idPaso: paso.idPaso })}
                      disabled={bloqueado}
                    >
                      Editar
                      <span className="vt-visually-hidden"> el paso {numero + 1}</span>
                    </button>
                  )}
                  <button
                    type="button"
                    className="vt-btn vt-btn-outline vt-btn-sm"
                    onClick={() =>
                      setAbierto(esAbierto('vista', paso.idPaso) ? null : { tipo: 'vista', idPaso: paso.idPaso })
                    }
                    aria-expanded={esAbierto('vista', paso.idPaso)}
                  >
                    <span className="vt-icon" aria-hidden="true">
                      visibility
                    </span>
                    {esAbierto('vista', paso.idPaso) ? 'Ocultar vista previa' : 'Vista previa'}
                    <span className="vt-visually-hidden"> del paso {numero + 1}</span>
                  </button>
                  {!estructuraBloqueada && (
                    <>
                      <BotonMover
                        direccion="subir"
                        que={`el paso ${numero + 1}`}
                        disabled={bloqueado || numero === 0}
                        onClick={() => onMoverPaso(leccion, paso, numero - 1)}
                      />
                      <BotonMover
                        direccion="bajar"
                        que={`el paso ${numero + 1}`}
                        disabled={bloqueado || numero === total - 1}
                        onClick={() => onMoverPaso(leccion, paso, numero + 1)}
                      />
                      <button
                        type="button"
                        className="vt-btn vt-btn-danger-soft vt-btn-sm"
                        onClick={() => onEliminarPaso(leccion, paso, numero)}
                        disabled={bloqueado}
                      >
                        Eliminar
                        <span className="vt-visually-hidden"> el paso {numero + 1}</span>
                      </button>
                    </>
                  )}
                </div>
              )}

              {esAbierto('vista', paso.idPaso) && <VistaPreviaPaso paso={paso} numero={numero + 1} />}

              {esAbierto('paso', paso.idPaso) && (
                <FormularioPaso
                  pasoInicial={paso}
                  numero={numero + 1}
                  soloTextos={estructuraBloqueada}
                  textoBoton="Guardar paso"
                  onGuardar={async (datos) => {
                    await onGuardarPaso(paso, datos)
                    cerrar()
                  }}
                  onCancelar={cerrar}
                />
              )}
            </li>
          ))}
        </ol>
      )}

      {!soloLectura && !estructuraBloqueada && !esAbierto('nuevo-paso') && (
        <div className="vt-stack vt-stack-sm">
          <div>
            <button
              type="button"
              className="vt-btn vt-btn-primary vt-btn-sm"
              onClick={() => setAbierto({ tipo: 'nuevo-paso' })}
              disabled={bloqueado || total >= MAX_PASOS}
            >
              <span className="vt-icon" aria-hidden="true">
                add
              </span>
              Agregar paso
              <span className="vt-visually-hidden"> a {leccion.titulo}</span>
            </button>
          </div>
          {total >= MAX_PASOS && <p className="vt-btn-hint">Una lección puede tener hasta {MAX_PASOS} pasos.</p>}
        </div>
      )}

      {esAbierto('nuevo-paso') && (
        <FormularioPaso
          numero={total + 1}
          soloTextos={false}
          textoBoton="Agregar paso"
          onGuardar={async (datos) => {
            await onCrearPaso(leccion, datos)
            cerrar()
          }}
          onCancelar={cerrar}
        />
      )}
    </li>
  )
}

function BotonMover({ direccion, que, disabled, onClick }) {
  const subir = direccion === 'subir'
  return (
    <button type="button" className="vt-btn vt-btn-outline vt-btn-sm" onClick={onClick} disabled={disabled}>
      <span className="vt-icon" aria-hidden="true">
        {subir ? 'arrow_upward' : 'arrow_downward'}
      </span>
      {subir ? 'Subir' : 'Bajar'}
      <span className="vt-visually-hidden"> {que}</span>
    </button>
  )
}

export default LeccionEditor
