export const TAMANO_MAXIMO_FOTO = 300 * 1024

const LADOS = [512, 384, 256]
const CALIDADES = [0.85, 0.75, 0.65, 0.55]

export class ErrorImagen extends Error {}

function cargarImagen(archivo) {
  return new Promise((resolver, rechazar) => {
    const url = URL.createObjectURL(archivo)
    const imagen = new Image()
    imagen.onload = () => {
      URL.revokeObjectURL(url)
      resolver(imagen)
    }
    imagen.onerror = () => {
      URL.revokeObjectURL(url)
      rechazar(new ErrorImagen('No pudimos abrir esa imagen. Elige una foto en formato JPG, PNG o WebP.'))
    }
    imagen.src = url
  })
}

function aBlob(lienzo, calidad) {
  return new Promise((resolver) => lienzo.toBlob(resolver, 'image/jpeg', calidad))
}

export async function prepararFoto(archivo) {
  if (!archivo || !archivo.type.startsWith('image/')) {
    throw new ErrorImagen('Ese archivo no es una imagen. Elige una foto en formato JPG, PNG o WebP.')
  }

  const imagen = await cargarImagen(archivo)
  const ancho = imagen.naturalWidth
  const alto = imagen.naturalHeight

  if (!ancho || !alto) {
    throw new ErrorImagen('No pudimos abrir esa imagen. Elige otra foto.')
  }

  const ladoOriginal = Math.min(ancho, alto)
  const origenX = (ancho - ladoOriginal) / 2
  const origenY = (alto - ladoOriginal) / 2

  for (const ladoMaximo of LADOS) {
    const lado = Math.min(ladoMaximo, ladoOriginal)
    const lienzo = document.createElement('canvas')
    lienzo.width = lado
    lienzo.height = lado
    const contexto = lienzo.getContext('2d')
    contexto.fillStyle = '#ffffff'
    contexto.fillRect(0, 0, lado, lado)
    contexto.drawImage(imagen, origenX, origenY, ladoOriginal, ladoOriginal, 0, 0, lado, lado)

    for (const calidad of CALIDADES) {
      const foto = await aBlob(lienzo, calidad)
      if (foto && foto.size <= TAMANO_MAXIMO_FOTO) return foto
    }
  }

  throw new ErrorImagen('No pudimos hacer la foto más ligera. Elige otra foto.')
}

export function inicialesDe(nombre) {
  const palabras = String(nombre ?? '').trim().split(/\s+/).filter(Boolean)
  if (palabras.length === 0) return ''
  const primera = palabras[0][0]
  const segunda = palabras.length > 1 ? palabras[1][0] : ''
  return `${primera}${segunda}`.toUpperCase()
}
