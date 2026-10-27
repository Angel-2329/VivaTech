const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;

if (!connectionString || !connectionString.trim()) {
  throw new Error('Falta configurar DATABASE_URL en el entorno del backend');
}

const pool = new Pool({
  connectionString,
  connectionTimeoutMillis: 5000,
  query_timeout: 5000
});

pool.on('error', (error) => {
  console.error(
    'Error inesperado en el pool de PostgreSQL:',
    error.message
  );
});

module.exports = pool;