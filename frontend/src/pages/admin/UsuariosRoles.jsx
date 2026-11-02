import { useCallback, useId, useState } from 'react'
import DialogoConfirmacion from '../../components/panel/DialogoConfirmacion.jsx'
import PlantillaPanel from '../../components/panel/PlantillaPanel.jsx'
import Paginacion from '../../components/panel/Paginacion.jsx'
import {
  EstadoCarga,
  EstadoError,
  EstadoVacio,
  MensajeExito,
} from '../../components/panel/EstadosCarga.jsx'
import { useSesion } from '../../context/SesionContext.jsx'
import { useDatos } from '../../hooks/useDatos.js'
import { buscarCuentas, cambiarActivo, cambiarRol } from '../../services/adminService.js'
import { NOMBRE_DEL_ROL } from '../../utils/formato.js'
import './Admin.css'

const ROLES = ['estudiante', 'maestro', 'administrador']
const CUENTAS_POR_PAGINA = 20


function UsuariosRoles() {
  const { usuario } = useSesion()
  const id = useId()

  
  const [texto, setTexto] = useState('')
  const [rolFiltro, setRolFiltro] = useState('')
  const [criterios, setCriterios] = useState({ buscar: '', rol: '' })
  const [pagina, setPagina] = useState(0)

  const cargar = useCallback(() => buscarCuentas({
    ...criterios,
    limite: CUENTAS_POR_PAGINA + 1,
    desplazamiento: pagina * CUENTAS_POR_PAGINA,
  }), [criterios, pagina])
  const { datos: resultados, cargando, error, reintentar } = useDatos(cargar)
  const cuentas = resultados?.slice(0, CUENTAS_POR_PAGINA)
  const haySiguiente = (resultados?.length ?? 0) > CUENTAS_POR_PAGINA
  const [mensaje, setMensaje] = useState('')

  
  const [cambio, setCambio] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [errorCambio, setErrorCambio] = useState('')

  function manejarBusqueda(evento) {
    evento.preventDefault()
    if (guardando) return
    setMensaje('')
    setPagina(0)
    setCriterios({ buscar: texto.trim(), rol: rolFiltro })
  }

  function cambiarPagina(nuevaPagina) {
    if (cargando || guardando) return
    setMensaje('')
    setPagina(nuevaPagina)
  }

  function pedirConfirmacion(tipo, cuenta, valor) {
    setErrorCambio('')
    setCambio({ tipo, cuenta, valor })
  }

  async function confirmarCambio() {
    if (guardando || !cambio) return
    setGuardando(true)
    setErrorCambio('')

    const { tipo, cuenta, valor } = cambio

    try {
      const actualizada =
        tipo === 'rol' ? await cambiarRol(cuenta.uid, valor) : await cambiarActivo(cuenta.uid, valor)

      setMensaje(
        tipo === 'rol'
          ? `${actualizada.nombreCompleto} ahora tiene el rol de ${NOMBRE_DEL_ROL[actualizada.rol].toLowerCase()}.`
          : `La cuenta de ${actualizada.nombreCompleto} quedó ${actualizada.activo ? 'activa' : 'desactivada'}.`
      )
      setCambio(null)
      setPagina(0)
      reintentar()
    } catch (errorAlGuardar) {
      setErrorCambio(errorAlGuardar.message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <PlantillaPanel
      titulo="Cuentas y roles"
      descripcion="Busca a una persona para cambiar su rol o desactivar su cuenta."
      regresarA="/admin"
      textoRegresar="Regresar al inicio"
    >
      <form className="vt-card vt-toolbar buscador" onSubmit={manejarBusqueda} role="search">
        <div className="vt-field">
          <label className="vt-field-label" htmlFor={`${id}-buscar`}>
            Nombre
          </label>
          <input
            id={`${id}-buscar`}
            className="vt-input"
            type="search"
            maxLength={100}
            disabled={guardando}
            value={texto}
            onChange={(evento) => setTexto(evento.target.value)}
          />
        </div>
        <div className="vt-field">
          <label className="vt-field-label" htmlFor={`${id}-rol`}>
            Rol
          </label>
          <select
            id={`${id}-rol`}
            className="vt-select"
            disabled={guardando}
            value={rolFiltro}
            onChange={(evento) => setRolFiltro(evento.target.value)}
          >
            <option value="">Todos los roles</option>
            {ROLES.map((rol) => (
              <option key={rol} value={rol}>
                {NOMBRE_DEL_ROL[rol]}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="vt-btn vt-btn-primary buscador__boton" disabled={guardando}>
          <span className="vt-icon" aria-hidden="true">
            search
          </span>
          Buscar
        </button>
      </form>

      <MensajeExito texto={mensaje} />

      {cargando && <EstadoCarga texto="Buscando cuentas…" />}
      {error && <EstadoError error={error} onReintentar={reintentar} />}

      {cuentas?.length === 0 && (
        <EstadoVacio icono="person_search" titulo="No encontramos cuentas">
          <p>Revisa el nombre o elige "Todos los roles".</p>
        </EstadoVacio>
      )}

      {cuentas?.length > 0 && (
        <div className="vt-table-wrap">
          <table className="vt-table vt-table-responsive">
            <caption className="vt-visually-hidden">Cuentas encontradas</caption>
            <thead>
              <tr>
                <th scope="col">Nombre</th>
                <th scope="col">Rol</th>
                <th scope="col">Estado</th>
                <th scope="col">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {cuentas.map((cuenta) => (
                <FilaCuenta
                  key={`${cuenta.uid}-${cuenta.rol}`}
                  cuenta={cuenta}
                  esPropia={cuenta.uid === usuario.uid}
                  onCambiarRol={(rol) => pedirConfirmacion('rol', cuenta, rol)}
                  onCambiarActivo={() => pedirConfirmacion('activo', cuenta, !cuenta.activo)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Paginacion
        pagina={pagina}
        haySiguiente={haySiguiente}
        cargando={cargando || guardando}
        onCambiar={cambiarPagina}
        etiqueta="Páginas de cuentas y roles"
      />

      <DialogoConfirmacion
        abierto={cambio !== null}
        titulo={tituloDelCambio(cambio)}
        textoConfirmar={textoDelBoton(cambio)}
        peligro={cambio?.tipo === 'activo' && !cambio.valor}
        procesando={guardando}
        error={errorCambio}
        onConfirmar={confirmarCambio}
        onCancelar={() => setCambio(null)}
      >
        <p>{explicacionDelCambio(cambio)}</p>
      </DialogoConfirmacion>
    </PlantillaPanel>
  )
}

function tituloDelCambio(cambio) {
  if (!cambio) return ''
  const { tipo, cuenta, valor } = cambio
  if (tipo === 'rol') return `¿Cambiar el rol de ${cuenta.nombreCompleto} a ${NOMBRE_DEL_ROL[valor].toLowerCase()}?`
  return valor ? `¿Reactivar la cuenta de ${cuenta.nombreCompleto}?` : `¿Desactivar la cuenta de ${cuenta.nombreCompleto}?`
}

function textoDelBoton(cambio) {
  if (!cambio) return undefined
  if (cambio.tipo === 'rol') return 'Sí, cambiar rol'
  return cambio.valor ? 'Sí, reactivar' : 'Sí, desactivar'
}

function explicacionDelCambio(cambio) {
  if (!cambio) return ''
  const { tipo, valor } = cambio
  if (tipo === 'rol') return `La próxima vez que entre, verá solo las funciones de ${NOMBRE_DEL_ROL[valor].toLowerCase()}.`
  return valor
    ? 'Podrá volver a entrar a Viva Tech con su número de celular.'
    : 'No podrá entrar a Viva Tech hasta que reactives su cuenta. Su avance no se borra.'
}

function FilaCuenta({ cuenta, esPropia, onCambiarRol, onCambiarActivo }) {
  const [rolElegido, setRolElegido] = useState(cuenta.rol)
  const id = useId()

  return (
    <tr>
      <td data-label="Nombre">
        <strong>{cuenta.nombreCompleto}</strong>
        {cuenta.apodo && <span className="vt-text-muted"> ({cuenta.apodo})</span>}
      </td>
      <td data-label="Rol">
        <span className="vt-role-tag">{NOMBRE_DEL_ROL[cuenta.rol]}</span>
      </td>
      <td data-label="Estado">
        {cuenta.activo ? (
          <span className="vt-badge vt-badge-success">Activa</span>
        ) : (
          <span className="vt-badge vt-badge-neutral">Desactivada</span>
        )}
      </td>
      <td data-label="Acciones">
        {esPropia ? (
          <span className="vt-text-muted">Tu cuenta</span>
        ) : (
          <div className="vt-table__actions">
            <label className="vt-visually-hidden" htmlFor={`${id}-rol`}>
              Nuevo rol para {cuenta.nombreCompleto}
            </label>
            <select
              id={`${id}-rol`}
              className="vt-select admin__rol"
              value={rolElegido}
              onChange={(evento) => setRolElegido(evento.target.value)}
            >
              {ROLES.map((rol) => (
                <option key={rol} value={rol}>
                  {NOMBRE_DEL_ROL[rol]}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="vt-btn vt-btn-secondary vt-btn-sm"
              disabled={rolElegido === cuenta.rol}
              onClick={() => onCambiarRol(rolElegido)}
            >
              Guardar rol
              <span className="vt-visually-hidden"> de {cuenta.nombreCompleto}</span>
            </button>
            <button
              type="button"
              className={cuenta.activo ? 'vt-btn vt-btn-danger-soft vt-btn-sm' : 'vt-btn vt-btn-secondary vt-btn-sm'}
              onClick={onCambiarActivo}
            >
              {cuenta.activo ? 'Desactivar' : 'Reactivar'}
              <span className="vt-visually-hidden"> la cuenta de {cuenta.nombreCompleto}</span>
            </button>
          </div>
        )}
      </td>
    </tr>
  )
}

export default UsuariosRoles
