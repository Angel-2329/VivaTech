import { useCallback, useRef, useState } from 'react'
import CategoriaEditor from '../../components/contenido/CategoriaEditor.jsx'
import FormularioNombre from '../../components/contenido/FormularioNombre.jsx'
import FormularioNuevoCurso from '../../components/contenido/FormularioNuevoCurso.jsx'
import DialogoConfirmacion from '../../components/panel/DialogoConfirmacion.jsx'
import PlantillaPanel from '../../components/panel/PlantillaPanel.jsx'
import { EstadoCarga, EstadoError, EstadoVacio, MensajeExito } from '../../components/panel/EstadosCarga.jsx'
import { useSesion } from '../../context/SesionContext.jsx'
import { useDatos } from '../../hooks/useDatos.js'
import {
  actualizarCurso,
  cambiarEstadoCurso,
  crearCategoria,
  crearCurso,
  eliminarCategoria,
  eliminarCurso,
  moverCurso,
  obtenerContenido,
  ordenarCategorias,
  renombrarCategoria,
} from '../../services/contenidoService.js'
import { textoFecha } from '../../utils/fechas.js'
import { plural } from '../../utils/formato.js'
import './Contenido.css'


function Contenido() {
  const { usuario } = useSesion()
  const esAdmin = usuario.rol === 'administrador'

  const cargarContenido = useCallback(() => obtenerContenido(usuario), [usuario])
  const { datos: categorias, cargando, error, reintentar } = useDatos(cargarContenido)

  const [mensaje, setMensaje] = useState('')
  const [modificando, setModificando] = useState(false)
  const [creandoCurso, setCreandoCurso] = useState(false)
  const [dialogo, setDialogo] = useState(null)
  const [procesandoDialogo, setProcesandoDialogo] = useState(false)
  const [errorDialogo, setErrorDialogo] = useState('')
  const operacionRef = useRef(false)

  const bloqueado = cargando || Boolean(error) || modificando

  
  async function ejecutar(accion, textoExito) {
    if (operacionRef.current) return
    operacionRef.current = true
    setModificando(true)
    setMensaje('')

    try {
      const resultado = await accion()
      setMensaje(typeof textoExito === 'function' ? textoExito(resultado) : textoExito)
      reintentar()
    } finally {
      operacionRef.current = false
      setModificando(false)
    }
  }

  async function manejarCrearCurso(datos) {
    await ejecutar(() => crearCurso(datos, usuario), (curso) => `Se creó el curso "${curso.titulo}" como borrador.`)
    setCreandoCurso(false)
  }

  function manejarCrearCategoria(nombre) {
    return ejecutar(() => crearCategoria(nombre, usuario), `Se creó la categoría "${nombre}".`)
  }

  function manejarRenombrar(categoria, nombre) {
    return ejecutar(() => renombrarCategoria(categoria.idCategoria, nombre, usuario), `La categoría ahora se llama "${nombre}".`)
  }

  // El servidor recibe la lista completa de categorías en el nuevo orden
  async function manejarMoverCategoria(categoria, nuevaPosicion) {
    const ids = categorias.map((actual) => actual.idCategoria).filter((id) => id !== categoria.idCategoria)
    ids.splice(nuevaPosicion, 0, categoria.idCategoria)

    try {
      await ejecutar(
        () => ordenarCategorias(ids, usuario),
        `"${categoria.nombre}" ahora está en el lugar ${nuevaPosicion + 1}.`,
      )
    } catch (errorAlMover) {
      setMensaje('')
      abrirAviso('No pudimos cambiar el orden', errorAlMover.message)
    }
  }

  async function manejarMoverCurso(curso, idCategoria) {
    const destino = categorias.find((categoria) => categoria.idCategoria === idCategoria)
    try {
      await ejecutar(() => moverCurso(curso.idCurso, idCategoria, usuario), `"${curso.titulo}" se movió a ${destino?.nombre}.`)
    } catch (errorAlMover) {
      abrirAviso('No pudimos mover el curso', errorAlMover.message)
    }
  }

 

  // fecha = "AAAA-MM-DD" o null para quitarla. Los errores los muestra el formulario.
  function manejarCambiarFecha(curso, fecha) {
    return ejecutar(
      () => actualizarCurso(curso.idCurso, { fechaCierre: fecha }, usuario),
      fecha
        ? `"${curso.titulo}" estará disponible hasta el ${textoFecha(fecha)}.`
        : `"${curso.titulo}" ya no tiene fecha de cierre.`,
    )
  }

  function abrirDialogo(configuracion) {
    if (bloqueado) return
    setErrorDialogo('')
    setDialogo(configuracion)
  }

  function abrirAviso(titulo, texto) {
    setErrorDialogo('')
    setDialogo({ titulo, contenido: <p>{texto}</p> })
  }

  function pedirAccionCurso(curso, tipo) {
    abrirDialogo(dialogoDeCurso(curso, tipo, usuario))
  }

  function pedirEliminarCategoria(categoria) {
    if (categoria.cursos.length > 0) {
      abrirDialogo({
        titulo: `Todavía no puedes eliminar "${categoria.nombre}"`,
        contenido: (
          <p>
            Tiene {plural(categoria.cursos.length, 'curso', 'cursos')}, contando los retirados. Primero mueve sus
            cursos a otra categoría.
          </p>
        ),
      })
      return
    }

    abrirDialogo({
      titulo: `¿Eliminar la categoría "${categoria.nombre}"?`,
      contenido: <p>Desaparecerá de la lista. Esta acción no se puede deshacer.</p>,
      textoConfirmar: 'Sí, eliminar',
      peligro: true,
      accion: () => eliminarCategoria(categoria.idCategoria, usuario),
      textoExito: `Se eliminó la categoría "${categoria.nombre}".`,
    })
  }

  async function confirmarDialogo() {
    if (!dialogo?.accion) return
    setProcesandoDialogo(true)
    setErrorDialogo('')

    try {
      await ejecutar(dialogo.accion, dialogo.textoExito)
      setDialogo(null)
    } catch (errorAccion) {
      setErrorDialogo(errorAccion.message || 'No pudimos hacer el cambio. Inténtalo otra vez.')
    } finally {
      setProcesandoDialogo(false)
    }
  }

  return (
    <PlantillaPanel
      titulo="Contenido"
      descripcion={
        esAdmin
          ? 'Organiza las categorías y los cursos de todos los maestros.'
          : 'Crea tus cursos y publícalos cuando estén listos. Puedes ver los de otros maestros, pero solo editar los tuyos.'
      }
      regresarA={esAdmin ? '/admin' : '/maestro'}
      textoRegresar="Regresar al inicio"
    >
      {categorias && (
        <div className="vt-cluster">
          {!creandoCurso && categorias.length > 0 && (
            <button type="button" className="vt-btn vt-btn-primary" onClick={() => setCreandoCurso(true)} disabled={bloqueado}>
              <span className="vt-icon" aria-hidden="true">
                add
              </span>
              Nuevo curso
            </button>
          )}
        </div>
      )}

      {creandoCurso && categorias && (
        <FormularioNuevoCurso categorias={categorias} onCrear={manejarCrearCurso} onCancelar={() => setCreandoCurso(false)} />
      )}

      {esAdmin && categorias && (
        <section className="vt-card vt-stack" aria-labelledby="titulo-nueva-categoria">
          <h2 id="titulo-nueva-categoria" className="vt-headline-sm">
            Nueva categoría
          </h2>
          <FormularioNombre
            etiqueta="Nombre de la categoría"
            textoBoton="Crear categoría"
            onGuardar={manejarCrearCategoria}
            limpiarAlGuardar
            deshabilitado={bloqueado}
          />
        </section>
      )}

      <MensajeExito texto={mensaje} />

      {cargando && <EstadoCarga texto="Cargando el contenido…" />}
      {error && <EstadoError error={error} onReintentar={reintentar} />}

      {categorias?.length === 0 && (
        <EstadoVacio icono="category" titulo="Todavía no hay categorías">
          <p>{esAdmin ? 'Crea la primera con el formulario de arriba.' : 'Un administrador debe crear las categorías.'}</p>
        </EstadoVacio>
      )}

      {categorias?.map((categoria, posicion) => (
        <CategoriaEditor
          key={categoria.idCategoria}
          categoria={categoria}
          posicion={posicion}
          totalCategorias={categorias.length}
          categorias={categorias}
          usuario={usuario}
          bloqueado={bloqueado}
          onRenombrar={manejarRenombrar}
          onMoverCategoria={manejarMoverCategoria}
          onEliminarCategoria={pedirEliminarCategoria}
          onPedirAccion={pedirAccionCurso}
          onMoverCurso={manejarMoverCurso}
          onCambiarFecha={manejarCambiarFecha}
        />
      ))}

      <DialogoConfirmacion
        abierto={dialogo !== null}
        titulo={dialogo?.titulo}
        textoConfirmar={dialogo?.textoConfirmar}
        peligro={dialogo?.peligro}
        procesando={procesandoDialogo}
        error={errorDialogo}
        onConfirmar={confirmarDialogo}
        onCancelar={() => setDialogo(null)}
      >
        {dialogo?.contenido}
      </DialogoConfirmacion>
    </PlantillaPanel>
  )
}


function dialogoDeCurso(curso, tipo, usuario) {
  if (tipo === 'publicar') {
    return {
      titulo: `¿Publicar "${curso.titulo}"?`,
      contenido: (
        <>
          <p>Los alumnos lo verán en Mis cursos.</p>
          <p>Ya publicado, solo podrás corregir textos: no se podrán agregar, quitar ni reordenar lecciones o pasos.</p>
        </>
      ),
      textoConfirmar: 'Sí, publicar',
      accion: () => cambiarEstadoCurso(curso.idCurso, 'publicado', usuario),
      textoExito: `Se publicó "${curso.titulo}".`,
    }
  }

  if (tipo === 'borrador') {
    return {
      titulo: `¿Regresar "${curso.titulo}" a borrador?`,
      contenido: <p>Los alumnos dejarán de verlo hasta que lo vuelvas a publicar.</p>,
      textoConfirmar: 'Sí, regresar a borrador',
      accion: () => cambiarEstadoCurso(curso.idCurso, 'borrador', usuario),
      textoExito: `"${curso.titulo}" volvió a borrador.`,
    }
  }

  return {
    titulo: `¿Eliminar "${curso.titulo}"?`,
    contenido: curso.tieneAvance ? (
      <>
        <p>Algunos alumnos ya tienen avance en este curso.</p>
        <p>
          Se borrarán sus lecciones y pasos, y el curso quedará como <strong>retirado</strong>: se conservan el título,
          la descripción, el avance de los alumnos y sus certificados. Los alumnos lo verán como "Curso retirado".
          Esta acción no se puede deshacer.
        </p>
      </>
    ) : (
      <p>Nadie tiene avance en este curso. Se borrará todo: el curso, sus lecciones y sus pasos. Esta acción no se puede deshacer.</p>
    ),
    textoConfirmar: curso.tieneAvance ? 'Sí, retirar el curso' : 'Sí, eliminar',
    peligro: true,
    accion: () => eliminarCurso(curso.idCurso, usuario),
    // 204 llega como undefined (se borró); 200 trae resultado: 'retirado'
    textoExito: (respuesta) =>
      respuesta?.resultado === 'retirado' ? `"${curso.titulo}" quedó como retirado.` : `Se eliminó "${curso.titulo}".`,
  }
}

export default Contenido
