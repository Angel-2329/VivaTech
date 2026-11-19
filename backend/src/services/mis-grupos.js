const pool = require('../config/database');

const CONSULTA_MIS_GRUPOS = `
  SELECT
    g.id_grupo::text AS "idGrupo",
    g.nombre,
    u.nombre_completo AS "nombreMaestro",
    (u.activo = true AND u.rol = 'maestro') AS "maestroActivo"
  FROM grupo_estudiantes ge
  JOIN grupos g ON g.id_grupo = ge.id_grupo
  LEFT JOIN grupo_maestros gm ON gm.id_grupo = g.id_grupo
  LEFT JOIN usuarios u
    ON u.uid = gm.uid_maestro
   AND u.activo = true
   AND u.rol = 'maestro'
  WHERE ge.uid_estudiante = $1
  ORDER BY lower(g.nombre), g.id_grupo, lower(u.nombre_completo), u.uid
`;
function agruparFilas(filas) {
  const grupos = [];
  const porId = new Map();

  for (const fila of filas) {
    const idGrupo = String(fila.idGrupo);
    let grupo = porId.get(idGrupo);

    if (!grupo) {
      grupo = { idGrupo, nombre: fila.nombre, maestros: [] };
      porId.set(idGrupo, grupo);
      grupos.push(grupo);
    }

    if (fila.maestroActivo === true && typeof fila.nombreMaestro === 'string') {
      grupo.maestros.push({ nombreCompleto: fila.nombreMaestro });
    }
  }

  return grupos;
}

async function listarMisGrupos(usuario) {
  const resultado = await pool.query(CONSULTA_MIS_GRUPOS, [usuario.uid]);
  return agruparFilas(resultado.rows);
}

module.exports = { listarMisGrupos, agruparFilas, CONSULTA_MIS_GRUPOS };
