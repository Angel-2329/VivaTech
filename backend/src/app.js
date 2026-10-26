const express = require('express');
const cors = require('cors');
const pool = require('./config/database');
const verificarTokenFirebase = require('./middlewares/verificar-token-firebase');

const app = express();

app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    servicio: 'Viva Tech Backend'
  });
});

app.get('/api/db-check', async (req, res) => {
  try {
    await pool.query('SELECT 1');

    res.json({
      ok: true
    });
  } catch (error) {
    console.error('Error al conectar con PostgreSQL:', error.message);

    res.status(503).json({
      ok: false,
      mensaje: 'No fue posible conectar con la base de datos'
    });
  }
});

app.get('/api/auth-check', verificarTokenFirebase, (req, res) => {
  res.json({
    ok: true,
    uid: req.auth.uid
  });
});
module.exports = app;