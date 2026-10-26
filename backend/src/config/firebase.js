const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');

const projectId = process.env.FIREBASE_PROJECT_ID?.trim();

if (!projectId) {
  throw new Error('Falta configurar FIREBASE_PROJECT_ID');
}

const firebaseApp = initializeApp({
  projectId
});

const firebaseAuth = getAuth(firebaseApp);

module.exports = firebaseAuth;