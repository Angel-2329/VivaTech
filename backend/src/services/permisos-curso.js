async function tienePermisoEditor(cliente, usuario, curso) {
  if (!usuario || usuario.rol !== 'maestro' || usuario.activo !== true || !curso) return false;
  if (typeof curso.idCurso !== 'string' || usuario.uid === curso.creado_por) return false;
  const { rows } = await cliente.query(`
    SELECT 1 AS permiso FROM curso_editores
    WHERE id_curso = $1::bigint AND uid_maestro = $2
    FOR SHARE
  `, [curso.idCurso, usuario.uid]);
  if (rows.length > 1) throw new TypeError('El permiso de edición debe ser único');
  return rows.length === 1;
}

module.exports = { tienePermisoEditor };
