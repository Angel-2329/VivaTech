export function nombreParaSaludo(usuario) {
  if (!usuario) return ''
  if (usuario.apodo) return usuario.apodo

  const nombreCompleto = usuario.nombreCompleto?.trim()
  if (!nombreCompleto) return ''

  return nombreCompleto.split(/\s+/)[0]
}
