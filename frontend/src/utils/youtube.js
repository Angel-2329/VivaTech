const ID_VIDEO = /^[A-Za-z0-9_-]{11}$/
const DOMINIOS_YOUTUBE = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com'])

export function esIdVideo(valor) {
  return typeof valor === 'string' && ID_VIDEO.test(valor)
}

// Devuelve el ID del video, o null si el enlace no es de un video de YouTube
export function extraerIdVideo(enlace) {
  if (typeof enlace !== 'string' || !enlace.trim()) return null

  let url
  try {
    const texto = enlace.trim()
    url = new URL(/^https?:\/\//i.test(texto) ? texto : `https://${texto}`)
  } catch {
    return null
  }

  const dominio = url.hostname.toLowerCase()
  const partes = url.pathname.split('/').filter(Boolean)
  let id = null

  if (dominio === 'youtu.be') {
    id = partes[0]
  } else if (DOMINIOS_YOUTUBE.has(dominio)) {
    if (partes[0] === 'watch') id = url.searchParams.get('v')
    else if (partes[0] === 'shorts' || partes[0] === 'embed') id = partes[1]
  }

  return esIdVideo(id) ? id : null
}


export function urlReproductor(idVideo) {
  return `https://www.youtube-nocookie.com/embed/${idVideo}?cc_load_policy=1&rel=0`
}
