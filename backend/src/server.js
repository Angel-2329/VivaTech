require('dotenv').config();

const app = require('./app');
const { obtenerHost } = require('./config/servidor');

const PORT = process.env.PORT || 3000;
const HOST = obtenerHost();

app.listen(PORT, HOST, () => {
  console.log(`Backend ejecutándose en http://${HOST ?? 'localhost'}:${PORT}`);
});
