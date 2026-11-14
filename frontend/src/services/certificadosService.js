import { fallar, responder } from './simulacion/datosDePrueba.js'
import { armarMisCertificados, emitirCertificado, verificarCodigo } from './simulacion/progresoDePrueba.js'


export async function obtenerCertificado(idCurso, usuario) {
  const resultado = emitirCertificado(String(idCurso), usuario)
  if (resultado.error) {
    const { mensaje, estado, codigo } = resultado.error
    return fallar(mensaje, estado, codigo)
  }
  return responder(resultado.respuesta)
}


// Real: return solicitarApi('/mis-certificados')
export async function listarMisCertificados() {
  return responder(armarMisCertificados())
}

// Pública, sin token (cliente aparte: apiPublica.js).
// { nombreCompleto, tituloCurso, lecciones, folio, fechaFinalizacionCurso, fechaEmision }
// Código inválido o inexistente: 404 certificado_no_encontrado.
// Real: return solicitarApiPublica(`/certificados/verificar/${encodeURIComponent(codigo)}`)
export async function verificarCertificado(codigo) {
  const datos = verificarCodigo(String(codigo))
  if (!datos) return fallar('Este certificado no es válido', 404, 'certificado_no_encontrado')
  return responder(datos)
}
