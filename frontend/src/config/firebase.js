import { getApp, getApps, initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

const variablesRequeridas = {
  VITE_FIREBASE_API_KEY: firebaseConfig.apiKey,
  VITE_FIREBASE_AUTH_DOMAIN: firebaseConfig.authDomain,
  VITE_FIREBASE_PROJECT_ID: firebaseConfig.projectId,
  VITE_FIREBASE_APP_ID: firebaseConfig.appId,
}

for (const [nombre, valor] of Object.entries(variablesRequeridas)) {
  if (typeof valor !== 'string' || !valor.trim()) {
    throw new Error(`Falta configurar ${nombre} en el frontend`)
  }
}

const app = getApps().length === 0
  ? initializeApp(firebaseConfig)
  : getApp()

export const auth = getAuth(app)

if (
  import.meta.env.DEV
  && import.meta.env.VITE_FIREBASE_AUTH_TESTING === 'true'
) {
  auth.settings.appVerificationDisabledForTesting = true
}