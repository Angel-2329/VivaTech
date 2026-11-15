const { ErrorReglaCurso } = require('./reglas-cursos');

const HOSTS_YOUTUBE = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com']);
const PATRON_ID = /^[A-Za-z0-9_-]{11}$/;

function invalido() {
  return new ErrorReglaCurso(400, 'Revisa el video: usa un enlace HTTPS de YouTube permitido o un identificador válido', 'video_invalido');
}

function extraerId(valor) {
  if (typeof valor !== 'string') throw invalido();
  const texto = valor.trim();
  if (!texto || /[\u0000-\u0020\u007f]/.test(texto)) throw invalido();
  let url;
  try { url = new URL(texto); } catch { throw invalido(); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) throw invalido();
  let id;
  if (HOSTS_YOUTUBE.has(url.hostname)) {
    if (url.pathname === '/watch') {
      const candidatos = url.searchParams.getAll('v');
      if (candidatos.length !== 1) throw invalido();
      [id] = candidatos;
    } else {
      if (url.searchParams.has('v')) throw invalido();
      id = url.pathname.match(/^\/(?:shorts|embed)\/([A-Za-z0-9_-]{11})\/?$/)?.[1];
    }
  } else if (url.hostname === 'youtu.be') {
    if (url.searchParams.has('v')) throw invalido();
    id = url.pathname.match(/^\/([A-Za-z0-9_-]{11})\/?$/)?.[1];
  } else if (url.hostname === 'www.youtube-nocookie.com') {
    if (url.searchParams.has('v')) throw invalido();
    id = url.pathname.match(/^\/embed\/([A-Za-z0-9_-]{11})\/?$/)?.[1];
  }
  if (typeof id !== 'string' || !PATRON_ID.test(id)) throw invalido();
  return id;
}

function normalizarVideo(valor) {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)
    || valor.tipo !== 'video' || valor.plataforma !== 'youtube'
    || Object.keys(valor).some((clave) => !['tipo', 'plataforma', 'url', 'idVideo', 'titulo'].includes(clave))
    || Object.hasOwn(valor, 'url') === Object.hasOwn(valor, 'idVideo')
    || typeof valor.titulo !== 'string') throw invalido();
  const titulo = valor.titulo.trim();
  if (Array.from(titulo).length < 1 || Array.from(titulo).length > 100) throw invalido();
  const idVideo = Object.hasOwn(valor, 'url') ? extraerId(valor.url) : valor.idVideo;
  if (typeof idVideo !== 'string' || !PATRON_ID.test(idVideo)) throw invalido();
  return { tipo: 'video', plataforma: 'youtube', idVideo, titulo };
}

function normalizarRecursosVideo(recursos, tipoActividad) {
  if (!Array.isArray(recursos)) return recursos;
  const videos = recursos.filter((recurso) => recurso?.tipo === 'video');
  if (videos.length > 1 || (videos.length && tipoActividad !== 'lectura')) throw invalido();
  return recursos.map((recurso) => recurso?.tipo === 'video' ? normalizarVideo(recurso) : recurso);
}

module.exports = { normalizarVideo, normalizarRecursosVideo };
