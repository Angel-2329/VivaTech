import { useId, useState } from 'react'
import CampoTexto from './CampoTexto.jsx'
import VistaPreviaPaso from './VistaPreviaPaso.jsx'
import {
  LIMITES_PASO,
  MAX_ELEMENTOS_LISTA,
  MAX_OPCIONES,
  MIN_ELEMENTOS_LISTA,
  MIN_OPCIONES,
  TIPOS_ACTIVIDAD,
  TIPOS_RECURSO,
  cambiarTipoActividad,
  erroresDelServidor,
  estructuraPaso,
  limpiarPaso,
  nuevoIdOpcion,
  pasoVacio,
  recursoVacio,
  validarPaso,
} from '../../utils/pasos.js'


function conValor(objeto, ruta, valor) {
  const [clave, ...resto] = ruta.split('.')
  const copia = Array.isArray(objeto) ? [...objeto] : { ...objeto }
  copia[clave] = resto.length === 0 ? valor : conValor(objeto[clave], resto.join('.'), valor)
  return copia
}


function FormularioPaso({ pasoInicial, numero, soloTextos, textoBoton, onGuardar, onCancelar }) {
  const idBase = useId()
  const [paso, setPaso] = useState(() => structuredClone(pasoInicial ?? pasoVacio()))
  const [errores, setErrores] = useState({})
  const [errorGeneral, setErrorGeneral] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [verVistaPrevia, setVerVistaPrevia] = useState(false)

  const { actividad } = paso
  const idDe = (ruta) => `${idBase}-${ruta.replaceAll('.', '-')}`

  
  function cambiar(ruta, valor) {
    setPaso((anterior) => conValor(anterior, ruta, valor))
    const cambiaEstructura = Array.isArray(valor) || ruta === 'actividad'
    if (cambiaEstructura) setErrores({})
    else if (errores[ruta]) setErrores((anteriores) => ({ ...anteriores, [ruta]: '' }))
  }

  function cambiarTipo(tipo) {
    setPaso((anterior) => ({ ...anterior, actividad: cambiarTipoActividad(anterior.actividad, tipo) }))
    setErrores({})
  }

  async function enviar(evento) {
    evento.preventDefault()
    if (guardando) return

    const nuevos = validarPaso(paso)
    setErrores(nuevos)
    setErrorGeneral('')
    const primero = Object.keys(nuevos)[0]
    if (primero) {
      setErrorGeneral(`Revisa ${Object.keys(nuevos).length === 1 ? 'el campo marcado' : `los ${Object.keys(nuevos).length} campos marcados`}.`)
      document.getElementById(idDe(primero))?.focus()
      return
    }

    const limpio = limpiarPaso(paso)
    // Lo bloqueado ya está desactivado; aquí solo puede pasar si se borró un subtítulo que existía
    if (soloTextos && pasoInicial && estructuraPaso(limpio) !== estructuraPaso(pasoInicial)) {
      setErrorGeneral('En este curso solo se corrigen textos: no dejes vacío el subtítulo, corrígelo.')
      document.getElementById(idDe('actividad.pantalla.subtitulo'))?.focus()
      return
    }

    setGuardando(true)
    try {
      await onGuardar(limpio)
    } catch (errorAlGuardar) {
      // 400 contenido_invalido: cada error junto a su campo, y el mensaje general de respaldo
      const delServidor = erroresDelServidor(errorAlGuardar)
      setErrores(delServidor)
      setErrorGeneral(errorAlGuardar.message || 'No pudimos guardar el paso. Inténtalo otra vez.')
      setGuardando(false)
      const primeroServidor = Object.keys(delServidor)[0]
      if (primeroServidor) document.getElementById(idDe(primeroServidor))?.focus()
    }
  }

  
  const campo = (ruta, etiqueta, maximo, extra = {}) => ({
    id: idDe(ruta),
    etiqueta,
    maximo,
    valor: ruta.split('.').reduce((actual, clave) => actual?.[clave], paso) ?? '',
    onCambiar: (valor) => cambiar(ruta, valor),
    error: errores[ruta],
    ...extra,
  })

  return (
    <form className="vt-card vt-card-subtle vt-stack editor__formulario-paso" onSubmit={enviar} noValidate>
      {soloTextos && (
        <div className="vt-alert vt-alert-info">
          <span className="vt-icon" aria-hidden="true">
            lock
          </span>
          <p className="vt-alert__content">
            Solo puedes corregir textos. El tipo de paso, los recursos, las opciones y la respuesta correcta están
            bloqueados.
          </p>
        </div>
      )}

      <div className="vt-field">
        <label className="vt-field-label" htmlFor={idDe('tipo')}>
          Tipo de paso
        </label>
        <select
          id={idDe('tipo')}
          className="vt-select"
          value={actividad.tipo}
          onChange={(evento) => cambiarTipo(evento.target.value)}
          disabled={soloTextos}
        >
          {Object.entries(TIPOS_ACTIVIDAD).map(([tipo, texto]) => (
            <option key={tipo} value={tipo}>
              {texto}
            </option>
          ))}
        </select>
      </div>

      <CampoTexto {...campo('instruccion', 'Texto del paso', LIMITES_PASO.instruccion, { multilinea: true })} />

      <Recursos paso={paso} soloTextos={soloTextos} campo={campo} errores={errores} idDe={idDe} cambiar={cambiar} />

      {actividad.tipo === 'toque' && (
        <fieldset className="vt-stack vt-stack-sm editor__grupo">
          <legend className="vt-label-lg">Pantalla de práctica</legend>
          <CampoTexto {...campo('actividad.pantalla.titulo', 'Título de la pantalla', LIMITES_PASO.tituloPantalla)} />
          {/* En publicados solo se corrige un subtítulo que ya existía; no se agrega uno nuevo */}
          {(!soloTextos || pasoInicial?.actividad.pantalla?.subtitulo) && (
            <CampoTexto
              {...campo('actividad.pantalla.subtitulo', 'Subtítulo (opcional)', LIMITES_PASO.subtituloPantalla)}
            />
          )}
        </fieldset>
      )}

      {actividad.tipo === 'opcion' && (
        <CampoTexto {...campo('actividad.pregunta', 'Pregunta', LIMITES_PASO.pregunta)} />
      )}

      {actividad.tipo !== 'lectura' && (
        <>
          <Opciones
            actividad={actividad}
            soloTextos={soloTextos}
            campo={campo}
            errores={errores}
            idDe={idDe}
            cambiar={cambiar}
          />
          <CampoTexto {...campo('actividad.pista', 'Pista si se equivoca', LIMITES_PASO.pista)} />
          <CampoTexto {...campo('actividad.mensajeAcierto', 'Mensaje cuando acierta', LIMITES_PASO.mensajeAcierto)} />
        </>
      )}

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
        <button
          type="button"
          className="vt-btn vt-btn-outline vt-btn-sm"
          onClick={() => setVerVistaPrevia((actual) => !actual)}
          aria-expanded={verVistaPrevia}
        >
          <span className="vt-icon" aria-hidden="true">
            visibility
          </span>
          {verVistaPrevia ? 'Ocultar vista previa' : 'Vista previa'}
        </button>
        <button type="button" className="vt-btn vt-btn-secondary vt-btn-sm" onClick={onCancelar} disabled={guardando}>
          Cancelar
        </button>
      </div>

      {verVistaPrevia && <VistaPreviaPaso paso={limpiarPaso(paso)} numero={numero} />}
    </form>
  )
}



function Recursos({ paso, soloTextos, campo, errores, idDe, cambiar }) {
  const tiposUsados = new Set(paso.recursos.map((recurso) => recurso.tipo))

  function quitar(posicion) {
    cambiar(
      'recursos',
      paso.recursos.filter((_, actual) => actual !== posicion),
    )
  }

  return (
    <fieldset className="vt-stack vt-stack-sm editor__grupo">
      <legend className="vt-label-lg">Recursos de apoyo (opcionales)</legend>

      {paso.recursos.length === 0 && <p className="vt-body-sm vt-text-muted">Este paso no tiene recursos.</p>}

      {paso.recursos.map((recurso, posicion) => {
        const ruta = `recursos.${posicion}`
        return (
          <div key={`${recurso.tipo}-${posicion}`} className="vt-stack vt-stack-sm editor__recurso">
            <p className="vt-cluster vt-cluster-between">
              <strong>{TIPOS_RECURSO[recurso.tipo] ?? recurso.tipo}</strong>
              {!soloTextos && (
                <button type="button" className="vt-btn vt-btn-ghost vt-btn-sm" onClick={() => quitar(posicion)}>
                  Quitar {TIPOS_RECURSO[recurso.tipo]?.toLowerCase()}
                </button>
              )}
            </p>

            {recurso.tipo === 'icono' && (
              <>
                <div className="vt-field">
                  <label className="vt-field-label" htmlFor={idDe(`${ruta}.nombre`)}>
                    Nombre del ícono
                  </label>
                  <p id={`${idDe(`${ruta}.nombre`)}-ayuda`} className="vt-field-help">
                    En inglés, de Material Symbols. Por ejemplo: shopping_cart, lock, receipt_long
                  </p>
                  <div className="vt-cluster">
                    <input
                      id={idDe(`${ruta}.nombre`)}
                      className="vt-input editor__icono-nombre"
                      type="text"
                      value={recurso.nombre}
                      onChange={(evento) => cambiar(`${ruta}.nombre`, evento.target.value)}
                      disabled={soloTextos}
                      aria-invalid={errores[`${ruta}.nombre`] ? 'true' : undefined}
                      aria-describedby={`${idDe(`${ruta}.nombre`)}-ayuda`}
                    />
                    {recurso.nombre.trim() && (
                      <span className="vt-category-icon" aria-hidden="true">
                        <span className="vt-icon">{recurso.nombre.trim()}</span>
                      </span>
                    )}
                  </div>
                  {errores[`${ruta}.nombre`] && (
                    <p className="vt-field-error" role="alert">
                      {errores[`${ruta}.nombre`]}
                    </p>
                  )}
                </div>
                <CampoTexto {...campo(`${ruta}.alt`, 'Qué muestra el ícono (para lectores de pantalla)', LIMITES_PASO.alt)} />
              </>
            )}

            {recurso.tipo === 'lista' && (
              <>
                {recurso.elementos.map((_, numero) => (
                  <div key={numero} className="editor__elemento">
                    <CampoTexto
                      {...campo(`${ruta}.elementos.${numero}`, `Punto ${numero + 1}`, LIMITES_PASO.elementoLista)}
                    />
                    {!soloTextos && recurso.elementos.length > MIN_ELEMENTOS_LISTA && (
                      <button
                        type="button"
                        className="vt-btn vt-btn-ghost vt-btn-sm"
                        onClick={() =>
                          cambiar(
                            `${ruta}.elementos`,
                            recurso.elementos.filter((__, actual) => actual !== numero),
                          )
                        }
                      >
                        Quitar punto {numero + 1}
                      </button>
                    )}
                  </div>
                ))}
                {!soloTextos && recurso.elementos.length < MAX_ELEMENTOS_LISTA && (
                  <div>
                    <button
                      type="button"
                      className="vt-btn vt-btn-outline vt-btn-sm"
                      onClick={() => cambiar(`${ruta}.elementos`, [...recurso.elementos, ''])}
                    >
                      Agregar punto
                    </button>
                  </div>
                )}
              </>
            )}

            {recurso.tipo === 'aviso' && (
              <CampoTexto {...campo(`${ruta}.texto`, 'Texto del aviso', LIMITES_PASO.aviso, { multilinea: true })} />
            )}
          </div>
        )
      })}

      {!soloTextos && (
        <div className="vt-cluster">
          {Object.entries(TIPOS_RECURSO)
            .filter(([tipo]) => !tiposUsados.has(tipo))
            .map(([tipo, texto]) => (
              <button
                key={tipo}
                type="button"
                className="vt-btn vt-btn-outline vt-btn-sm"
                onClick={() => cambiar('recursos', [...paso.recursos, recursoVacio(tipo)])}
              >
                <span className="vt-icon" aria-hidden="true">
                  add
                </span>
                Agregar {texto.toLowerCase()}
              </button>
            ))}
        </div>
      )}
    </fieldset>
  )
}



function Opciones({ actividad, soloTextos, campo, errores, idDe, cambiar }) {
  const maximo = MAX_OPCIONES[actividad.tipo]
  const esToque = actividad.tipo === 'toque'

  function quitar(posicion) {
    const quitada = actividad.opciones[posicion]
    cambiar(
      'actividad',
      {
        ...actividad,
        opciones: actividad.opciones.filter((_, actual) => actual !== posicion),
        correcta: actividad.correcta === quitada.id ? '' : actividad.correcta,
      },
    )
  }

  return (
    <fieldset className="vt-stack vt-stack-sm editor__grupo" aria-describedby={idDe('actividad.opciones')}>
      <legend className="vt-label-lg">{esToque ? 'Botones de la pantalla' : 'Respuestas'}</legend>
      <p id={idDe('actividad.opciones')} className="vt-field-help" tabIndex={-1}>
        De {MIN_OPCIONES} a {maximo}. Marca la correcta con el círculo.
      </p>
      {errores['actividad.opciones'] && (
        <p className="vt-field-error" role="alert">
          {errores['actividad.opciones']}
        </p>
      )}
      {errores['actividad.correcta'] && (
        <p className="vt-field-error" role="alert">
          {errores['actividad.correcta']}
        </p>
      )}

      {actividad.opciones.map((opcion, posicion) => (
        <div key={opcion.id} className="vt-stack vt-stack-sm editor__opcion">
          <label className="vt-cluster editor__correcta">
            <input
              id={posicion === 0 ? idDe('actividad.correcta') : undefined}
              type="radio"
              name={idDe('correcta')}
              checked={actividad.correcta === opcion.id}
              onChange={() => cambiar('actividad.correcta', opcion.id)}
              disabled={soloTextos}
            />
            La opción {posicion + 1} es la correcta
          </label>
          <CampoTexto {...campo(`actividad.opciones.${posicion}.texto`, `Opción ${posicion + 1}`, LIMITES_PASO.opcion)} />
          {esToque && (
            <div className="vt-field">
              <label className="vt-field-label" htmlFor={idDe(`actividad.opciones.${posicion}.icono`)}>
                Ícono del botón (opcional)
              </label>
              <input
                id={idDe(`actividad.opciones.${posicion}.icono`)}
                className="vt-input editor__icono-nombre"
                type="text"
                value={opcion.icono ?? ''}
                onChange={(evento) => cambiar(`actividad.opciones.${posicion}.icono`, evento.target.value)}
                disabled={soloTextos}
              />
            </div>
          )}
          {!soloTextos && actividad.opciones.length > MIN_OPCIONES && (
            <div>
              <button type="button" className="vt-btn vt-btn-ghost vt-btn-sm" onClick={() => quitar(posicion)}>
                Quitar opción {posicion + 1}
              </button>
            </div>
          )}
        </div>
      ))}

      {!soloTextos && actividad.opciones.length < maximo && (
        <div>
          <button
            type="button"
            className="vt-btn vt-btn-outline vt-btn-sm"
            onClick={() =>
              cambiar('actividad.opciones', [...actividad.opciones, { id: nuevoIdOpcion(actividad.opciones), texto: '' }])
            }
          >
            <span className="vt-icon" aria-hidden="true">
              add
            </span>
            Agregar opción
          </button>
        </div>
      )}
    </fieldset>
  )
}

export default FormularioPaso
