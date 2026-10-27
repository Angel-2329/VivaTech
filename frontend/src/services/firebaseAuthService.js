import {
  RecaptchaVerifier,
  signInWithPhoneNumber,
} from 'firebase/auth'

import { auth } from '../config/firebase.js'

export function crearVerificadorRecaptcha(contenedor) {
  if (!(contenedor instanceof HTMLElement)) {
    throw new Error('No se encontró el contenedor de verificación')
  }

  return new RecaptchaVerifier(auth, contenedor, {
    size: 'normal',
  })
}

export async function enviarCodigoFirebase(telefono, verificador) {
  if (typeof telefono !== 'string' || !/^\d{10}$/.test(telefono)) {
    throw new Error('Escribe los 10 números de tu celular')
  }

  if (!verificador) {
    throw new Error('La verificación de acceso no está preparada')
  }

  return signInWithPhoneNumber(
    auth,
    `+52${telefono}`,
    verificador
  )
}

export async function confirmarCodigoFirebase(confirmacion, codigo) {
  if (!confirmacion || typeof confirmacion.confirm !== 'function') {
    throw new Error('Solicita nuevamente tu código para continuar')
  }

  if (typeof codigo !== 'string' || !/^\d{6}$/.test(codigo)) {
    throw new Error('Escribe los 6 números del código')
  }

  return confirmacion.confirm(codigo)
}