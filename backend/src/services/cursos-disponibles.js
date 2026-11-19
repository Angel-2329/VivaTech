const { puedeVerCursoEstudiante } = require('./reglas-cursos');
const { comprobarEstudiante, consultarResumenes, resumirCurso } = require('./resumen-curso');

async function obtenerCursosDisponibles(usuario, { ahora = new Date() } = {}) {
  comprobarEstudiante(usuario);
  const filas = await consultarResumenes(usuario.uid);
  const categorias = new Map();

  for (const fila of filas) {
    if (fila.estado_publicacion !== 'publicado') continue;
    if (typeof fila.tieneAvance !== 'boolean') {
      throw new TypeError('La consulta de cursos debe indicar si hay avance');
    }
    if (!puedeVerCursoEstudiante(usuario, fila, { tieneAvance: fila.tieneAvance, ahora })) continue;

    const resumen = resumirCurso(fila, { ahora });
    if (!categorias.has(fila.idCategoria)) {
      categorias.set(fila.idCategoria, {
        idCategoria: fila.idCategoria,
        nombre: fila.nombreCategoria,
        orden: fila.ordenCategoria,
        cursos: []
      });
    }
    categorias.get(fila.idCategoria).cursos.push(resumen);
  }

  return Array.from(categorias.values());
}

module.exports = { obtenerCursosDisponibles };
