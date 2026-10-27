const express = require('express');
const cors = require('cors');
const pool = require('./config/database');
const verificarTokenFirebase = require('./middlewares/verificar-token-firebase');
const perfilRouter = require('./routes/perfil');

const app = express();

app.use(cors({
  origin: process.env.FRONTEND_ORIGIN
}));
app.use(express.json());
app.use('/api/perfil', perfilRouter);

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    servicio: 'Viva Tech Backend'
  });
});

if (process.env.NODE_ENV !== 'production') {
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
}
module.exports = app;