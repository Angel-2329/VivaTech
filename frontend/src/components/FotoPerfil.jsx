import { useEffect, useState } from 'react'
import { obtenerFotoUsuario } from '../services/fotoService.js'
import { inicialesDe } from '../utils/imagen.js'
import './FotoPerfil.css'

const fotosGuardadas = new Map()
const descargasPendientes = new Map()

function descargarFoto(uid, clave) {
  if (!descargasPendientes.has(clave)) {
    const descarga = obtenerFotoUsuario(uid)
      .then((contenido) => {
        const anterior = fotosGuardadas.get(uid)
        if (anterior?.clave === clave) return anterior.url
        if (anterior) URL.revokeObjectURL(anterior.url)
        const url = URL.createObjectURL(contenido)
        fotosGuardadas.set(uid, { clave, url })
        return url
      })
      .catch(() => null)
      .finally(() => descargasPendientes.delete(clave))
    descargasPendientes.set(clave, descarga)
  }
  return descargasPendientes.get(clave)
}

function FotoPerfil({ uid, nombre, tieneFoto, fotoActualizada, tamano = 'sm', descripcion = '' }) {
  const clave = tieneFoto && uid ? `${uid}|${fotoActualizada ?? ''}` : null
  const [, setDescargada] = useState(null)

  useEffect(() => {
    if (!clave || fotosGuardadas.get(uid)?.clave === clave) return undefined

    let vigente = true
    descargarFoto(uid, clave).then(() => {
      if (vigente) setDescargada(clave)
    })

    return () => {
      vigente = false
    }
  }, [uid, clave])

  const guardada = uid ? fotosGuardadas.get(uid) : null
  const url = clave && guardada?.clave === clave ? guardada.url : null
  const clases = `vt-avatar foto-perfil foto-perfil--${tamano}`

  if (url) {
    return (
      <img
        className={clases}
        src={url}
        alt={descripcion}
        aria-hidden={descripcion ? undefined : 'true'}
      />
    )
  }

  return (
    <span
      className={clases}
      role={descripcion ? 'img' : undefined}
      aria-label={descripcion || undefined}
      aria-hidden={descripcion ? undefined : 'true'}
    >
      {inicialesDe(nombre) || <span className="vt-icon">person</span>}
    </span>
  )
}

export default FotoPerfil
