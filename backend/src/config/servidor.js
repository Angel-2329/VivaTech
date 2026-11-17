const HOST_PRODUCCION = '127.0.0.1';

function obtenerHost(env = process.env) {
  const host = env.API_HOST?.trim();
  if (host) return host;
  if (env.NODE_ENV === 'production') return HOST_PRODUCCION;
  return undefined;
}

module.exports = { obtenerHost, HOST_PRODUCCION };
