const pool = require('../config/database');
const { ErrorReglaCurso, puedeEditarCurso } = require('./reglas-cursos');

const CAMPOS_CURSO = `
  c.id_curso::text AS "idCurso", c.titulo, c.descripcion, c.orden,
  c.estado_publicacion AS "estadoPublicacion",
  c.fecha_cierre::text AS "fechaCierre", c.creado_por,
  autor.nombre_completo AS "creadoPor",
  (SELECT count(*)::integer FROM lecciones l WHERE l.id_curso = c.id_curso) AS "totalLecciones",
  (
    EXISTS (
      SELECT 1 FROM progresos p
      JOIN lecciones iniciada ON iniciada.id_leccion = p.id_leccion
      WHERE iniciada.id_curso = c.id_curso
    ) OR (
      c.estado_publicacion = 'retirado' AND EXISTS (
        SELECT 1 FROM historial_cursos_retirados h WHERE h.id_curso = c.id_curso
      )
    )
  ) AS "tieneAvance"
`;

const CONSULTA_LISTADO = `
  SELECT ca.id_categoria::text AS "idCategoria", ca.nombre AS "nombreCategoria",
    ca.orden AS "ordenCategoria", ${CAMPOS_CURSO}
  FROM categorias ca
  LEFT JOIN cursos c ON c.id_categoria = ca.id_categoria
  LEFT JOIN usuarios autor ON autor.uid = c.creado_por
  ORDER BY ca.orden, ca.id_categoria, c.orden, c.id_curso
`;

const CONSULTA_DETALLE = `
  SELECT c.id_categoria::text AS "idCategoria", ${CAMPOS_CURSO},
    COALESCE((
      SELECT json_agg(json_build_object(
        'idLeccion', l.id_leccion::text,
        'titulo', l.titulo,
        'objetivo', l.objetivo,
        'duracionEstimadaMinutos', l.duracion_estimada_minutos,
        'orden', l.orden,
        'pasos', COALESCE((
          SELECT json_agg(json_build_object(
            'idPaso', paso.id_paso::text,
            'orden', paso.orden,
            'instruccion', paso.instruccion,
            'recursos', paso.recursos,
            'actividad', paso.actividad
          ) ORDER BY paso.orden, paso.id_paso)
          FROM pasos paso WHERE paso.id_leccion = l.id_leccion
        ), '[]'::json)
      ) ORDER BY l.orden, l.id_leccion)
      FROM lecciones l
      WHERE l.id_curso = c.id_curso AND c.estado_publicacion <> 'retirado'
    ), '[]'::json) AS lecciones
  FROM cursos c
  JOIN usuarios autor ON autor.uid = c.creado_por
  WHERE c.id_curso = $1::bigint
`;

function comprobarEditor(usuario) {
  if (!usuario) {
    throw new ErrorReglaCurso(404, 'El perfil todavía no está registrado', 'perfil_no_registrado');
  }
  if (usuario.activo !== true) {
    throw new ErrorReglaCurso(403, 'La cuenta está desactivada', 'cuenta_desactivada');
  }
  if (!['maestro', 'administrador'].includes(usuario.rol)
    || typeof usuario.uid !== 'string' || !usuario.uid.trim() || usuario.uid.length > 128) {
    throw new ErrorReglaCurso(403, 'No tienes permisos para realizar esta acción', 'rol_no_autorizado');
  }
}

function comprobarIdCurso(idCurso) {
  const maximo = '9223372036854775807';
  if (typeof idCurso !== 'string' || !/^[1-9][0-9]{0,18}$/.test(idCurso)
    || (idCurso.length === maximo.length && idCurso > maximo)) {
    throw new ErrorReglaCurso(400, 'El identificador del curso no es válido', 'id_curso_invalido');
  }
}

function datosCurso(usuario, fila) {
  if (!['borrador', 'publicado', 'retirado'].includes(fila.estadoPublicacion)
    || typeof fila.tieneAvance !== 'boolean'
    || typeof fila.creadoPor !== 'string'
    || !Number.isInteger(fila.totalLecciones) || fila.totalLecciones < 0) {
    throw new TypeError('La consulta del editor devolvió un curso inconsistente');
  }
  return {
    idCurso: fila.idCurso,
    titulo: fila.titulo,
    descripcion: fila.descripcion,
    orden: fila.orden,
    estadoPublicacion: fila.estadoPublicacion,
    fechaCierre: fila.fechaCierre ?? null,
    tieneAvance: fila.tieneAvance,
    creadoPor: fila.creadoPor,
    puedeEditar: puedeEditarCurso(usuario, {
      estado_publicacion: fila.estadoPublicacion,
      creado_por: fila.creado_por
    })
  };
}

async function listarContenido(usuario) {
  comprobarEditor(usuario);
  const resultado = await pool.query(CONSULTA_LISTADO, []);
  const categorias = new Map();
  for (const fila of resultado.rows) {
    if (!categorias.has(fila.idCategoria)) {
      categorias.set(fila.idCategoria, {
        idCategoria: fila.idCategoria,
        nombre: fila.nombreCategoria,
        orden: fila.ordenCategoria,
        cursos: []
      });
    }
    if (fila.idCurso === null) continue;
    categorias.get(fila.idCategoria).cursos.push({
      ...datosCurso(usuario, fila),
      totalLecciones: fila.totalLecciones
    });
  }
  return Array.from(categorias.values());
}

async function obtenerContenidoCurso(usuario, idCurso) {
  comprobarEditor(usuario);
  comprobarIdCurso(idCurso);
  const resultado = await pool.query(CONSULTA_DETALLE, [idCurso]);
  if (resultado.rows.length === 0) {
    throw new ErrorReglaCurso(404, 'El curso no está disponible', 'curso_no_encontrado');
  }
  const fila = resultado.rows[0];
  const base = datosCurso(usuario, fila);
  let lecciones = [];
  if (fila.estadoPublicacion !== 'retirado') {
    if (!Array.isArray(fila.lecciones)) throw new TypeError('El detalle debe devolver un arreglo de lecciones');
    lecciones = fila.lecciones.map((leccion) => {
      if (!Array.isArray(leccion.pasos)) throw new TypeError('La lección debe devolver un arreglo de pasos');
      return {
        idLeccion: leccion.idLeccion,
        titulo: leccion.titulo,
        objetivo: leccion.objetivo,
        duracionEstimadaMinutos: leccion.duracionEstimadaMinutos,
        orden: leccion.orden,
        pasos: leccion.pasos.map((paso) => ({
          idPaso: paso.idPaso,
          orden: paso.orden,
          instruccion: paso.instruccion,
          recursos: paso.recursos,
          actividad: paso.actividad
        }))
      };
    });
  }
  return { ...base, idCategoria: fila.idCategoria, lecciones };
}

module.exports = { listarContenido, obtenerContenidoCurso };
