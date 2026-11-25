const express = require('express');
const cors = require('cors');
const pool = require('./config/database');
const verificarTokenFirebase = require('./middlewares/verificar-token-firebase');
const perfilRouter = require('./routes/perfil');
const estudiantesRouter = require('./routes/estudiantes');
const adminUsuariosRouter = require('./routes/admin-usuarios');
const gruposRouter = require('./routes/grupos');
const adminProgresoRouter = require('./routes/admin-progreso');
const adminEditoresCursoRouter = require('./routes/admin-editores-curso');
const misCursosRouter = require('./routes/mis-cursos');
const cursosDisponiblesRouter = require('./routes/cursos-disponibles');
const leccionesRouter = require('./routes/lecciones');
const contenidoRouter = require('./routes/contenido');
const categoriasRouter = require('./routes/categorias');
const cursosRouter = require('./routes/cursos');
const pasosRouter = require('./routes/pasos');
const misCertificadosRouter = require('./routes/mis-certificados');
const misGruposRouter = require('./routes/mis-grupos');
const certificadosRouter = require('./routes/certificados');
const manejarJsonInvalido =
  require('./middlewares/manejar-json-invalido');

const app = express();

app.use(cors({
  origin: process.env.FRONTEND_ORIGIN
}));
app.use(['/api/lecciones', '/api/categorias', '/api/cursos', '/api/pasos'], (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
app.use(express.json());
app.use('/api/perfil', perfilRouter);
app.use('/api/estudiantes', estudiantesRouter);
app.use('/api/admin/usuarios', adminUsuariosRouter);
app.use('/api/admin/cursos', adminEditoresCursoRouter);
app.use('/api/grupos', gruposRouter);
app.use('/api/admin', adminProgresoRouter);
app.use('/api/mis-cursos', misCursosRouter);
app.use('/api/cursos-disponibles', cursosDisponiblesRouter);
app.use('/api/lecciones', leccionesRouter);
app.use('/api/contenido', contenidoRouter);
app.use('/api/categorias', categoriasRouter);
app.use('/api/cursos', cursosRouter);
app.use('/api/pasos', pasosRouter);
app.use('/api/mis-certificados', misCertificadosRouter);
app.use('/api/mis-grupos', misGruposRouter);
app.use('/api/certificados', certificadosRouter);
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

app.use(manejarJsonInvalido);

module.exports = app;
