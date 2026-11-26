const PATRON_GRUPO = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9 _.,()#-]+$/
const PATRON_NOMBRE = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ' -]+$/
const CARACTER_GRUPO = /[A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9 _.,()#-]/
const CARACTER_NOMBRE = /[A-Za-zÁÉÍÓÚÜÑáéíóúüñ' -]/
const TIENE_LETRA = /[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/
const TIENE_LETRA_O_DIGITO = /[A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9]/

export const LARGO_MAXIMO_GRUPO = 100
export const LARGO_MINIMO_NOMBRE = 3
export const LARGO_MAXIMO_NOMBRE = 100
export const LARGO_MAXIMO_APODO = 30

export const AYUDA_CARACTERES_GRUPO = 'Puedes usar letras, números, espacios y los signos - _ . , ( ) #.'
export const AYUDA_CARACTERES_NOMBRE = "Solo letras, espacios, apóstrofo (') y guion (-)."

export function normalizarTexto(texto) {
  return String(texto ?? '')
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .trim()
}

export function normalizarNombrePersona(texto) {
  return normalizarTexto(texto).replace(/’/g, "'")
}

export function contarCaracteres(texto) {
  return Array.from(texto).length
}


function caracteresNoPermitidos(texto, patronCaracter) {
  const vistos = []
  for (const caracter of texto) {
    if (!patronCaracter.test(caracter) && !vistos.includes(caracter)) vistos.push(caracter)
  }
  return vistos
}

function textoQuitar(caracteres) {
  if (caracteres.length === 0) return ''
  const lista = caracteres.slice(0, 5).join(' ')
  return ` ${caracteres.length === 1 ? 'Este no se puede usar' : 'Estos no se pueden usar'}: ${lista}`
}



export function revisarNombreGrupo(texto) {
  const valor = normalizarTexto(texto)
  const largo = contarCaracteres(valor)

  if (largo < 1 || largo > LARGO_MAXIMO_GRUPO) {
    return { error: `El nombre del grupo debe tener entre 1 y ${LARGO_MAXIMO_GRUPO} caracteres.` }
  }
  if (!PATRON_GRUPO.test(valor)) {
    return {
      error: `Usa solo letras, números, espacios y los signos - _ . , ( ) #.${textoQuitar(caracteresNoPermitidos(valor, CARACTER_GRUPO))}`,
    }
  }
  if (!TIENE_LETRA_O_DIGITO.test(valor)) {
    return { error: 'El nombre del grupo debe tener al menos una letra o un número.' }
  }
  return { valor }
}

export function revisarNombreCompleto(texto) {
  const valor = normalizarNombrePersona(texto)
  const largo = contarCaracteres(valor)

  if (largo < LARGO_MINIMO_NOMBRE || largo > LARGO_MAXIMO_NOMBRE) {
    return { error: `Escribe tu nombre completo, de ${LARGO_MINIMO_NOMBRE} a ${LARGO_MAXIMO_NOMBRE} caracteres.` }
  }
  if (!PATRON_NOMBRE.test(valor)) {
    return {
      error: `El nombre solo puede tener letras, espacios, apóstrofo (') y guion (-).${textoQuitar(caracteresNoPermitidos(valor, CARACTER_NOMBRE))}`,
    }
  }
  if (!TIENE_LETRA.test(valor)) {
    return { error: 'El nombre debe tener al menos una letra.' }
  }
  return { valor }
}

// El apodo es opcional: vacío se guarda como null.
export function revisarApodo(texto) {
  const valor = normalizarNombrePersona(texto)
  if (valor === '') return { valor: null }

  if (contarCaracteres(valor) > LARGO_MAXIMO_APODO) {
    return { error: `El apodo puede tener como máximo ${LARGO_MAXIMO_APODO} caracteres.` }
  }
  if (!PATRON_NOMBRE.test(valor)) {
    return {
      error: `El apodo solo puede tener letras, espacios, apóstrofo (') y guion (-).${textoQuitar(caracteresNoPermitidos(valor, CARACTER_NOMBRE))}`,
    }
  }
  if (!TIENE_LETRA.test(valor)) {
    return { error: 'El apodo debe tener al menos una letra.' }
  }
  return { valor }
}
