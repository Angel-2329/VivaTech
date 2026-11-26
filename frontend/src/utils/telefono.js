export const DIGITOS_TELEFONO = 10

export function limpiarTelefono(texto) {
  const sinEspacios = String(texto ?? '').trim()
  const sinLada = sinEspacios.startsWith('+52') ? sinEspacios.slice(3) : sinEspacios
  return sinLada.replace(/\D/g, '').slice(0, DIGITOS_TELEFONO)
}

export function formatearTelefono(telefono) {
  return `${telefono.slice(0, 3)} ${telefono.slice(3, 6)} ${telefono.slice(6)}`
}

export function telefonoCompleto(telefono) {
  return telefono.length === DIGITOS_TELEFONO
}

export function telefonoInternacional(telefono) {
  return `+52${telefono}`
}
