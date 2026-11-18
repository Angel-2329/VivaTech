const { puedeVerCursoEstudiante } = require('./reglas-cursos');
const { comprobarEstudiante, consultarResumenes, resumirCurso } = require('./resumen-curso');

async function resumenesVisibles(usuario, ahora) {
  comprobarEstudiante(usuario);
  const filas = await consultarResumenes(usuario.uid);
  const visibles = [];
  for (const fila of filas) {
    if (!puedeVerCursoEstudiante(usuario, fila, {
      tieneAvance: fila.tieneAvance,
      tieneHistorial: fila.tieneHistorial,
      ahora
    })) continue;
    visibles.push({ fila, resumen: resumirCurso(fila, { ahora }) });
  }
  return visibles;
}

function leccionesPublicadas(fila) {
  return fila.lecciones.map(({ idLeccion, titulo, duracionEstimadaMinutos, estado }) => ({
    idLeccion, titulo, duracionEstimadaMinutos, estado
  }));
}

const instante = (valor) => (valor === null ? Number.NEGATIVE_INFINITY : Date.parse(valor));

function descendentePor(campo) {
  return (a, b) => {
    const diferencia = instante(b[campo]) - instante(a[campo]);
    if (diferencia !== 0) return diferencia;
    const idA = BigInt(a.idCurso);
    const idB = BigInt(b.idCurso);
    if (idA === idB) return 0;
    return idB > idA ? 1 : -1;
  };
}

async function obtenerCursosEnCurso(usuario, { ahora = new Date() } = {}) {
  const visibles = await resumenesVisibles(usuario, ahora);
  return visibles
    .filter(({ resumen }) => resumen.estado === 'en_curso' && resumen.retirado === false)
    .map(({ fila, resumen }) => ({ ...resumen, lecciones: leccionesPublicadas(fila) }))
    .sort(descendentePor('fechaUltimaActividad'));
}

async function obtenerCursosTerminados(usuario, { ahora = new Date() } = {}) {
  const visibles = await resumenesVisibles(usuario, ahora);
  return visibles
    .filter(({ resumen }) => resumen.estado === 'terminado')
    .map(({ fila, resumen }) => ({
      ...resumen,
      lecciones: resumen.retirado ? [] : leccionesPublicadas(fila)
    }))
    .sort(descendentePor('fechaFinalizacion'));
}

module.exports = { obtenerCursosEnCurso, obtenerCursosTerminados };
