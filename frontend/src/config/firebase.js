import { getApp, getApps, initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

const variablesFaltantes = Object.entries(firebaseConfig)
  .filter(([, valor]) => typeof valor !== 'string' || !valor.trim())
  .map(([nombre]) => nombre)

if (variablesFaltantes.length > 0) {
  throw new Error(
    `Falta configurar Firebase: ${variablesFaltantes.join(', ')}`
  )
}

const app = getApps().some((aplicacion) => aplicacion.name === '[DEFAULT]')
  ? getApp()
  : initializeApp(firebaseConfig)

export const auth = getAuth(app)

auth.languageCode = 'es'

const esEntornoLocal =
  window.location.hostname === 'localhost' ||
  window.location.hostname === '127.0.0.1'

const modoPrueba =
  import.meta.env.DEV &&
  esEntornoLocal &&
  import.meta.env.VITE_FIREBASE_AUTH_TESTING === 'true'

auth.settings.appVerificationDisabledForTesting = modoPrueba