const express = require('express');
const cors = require('cors');
const pool = require('./config/database');

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
    const result = await pool.query(`
      SELECT current_database() AS database,
             current_user AS user_name
    `);

    res.json({
      ok: true,
      database: result.rows[0].database,
      user: result.rows[0].user_name
    });
  } catch (error) {
    console.error('Error al conectar con PostgreSQL:', error.message);

    res.status(500).json({
      ok: false,
      mensaje: 'No fue posible conectar con la base de datos'
    });
  }
});

module.exports = app;