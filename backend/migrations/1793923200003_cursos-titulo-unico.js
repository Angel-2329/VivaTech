const TITULO_NORMALIZADO = `lower(translate(btrim(regexp_replace(titulo, '[[:space:]\\u00a0]+', ' ', 'g')), 'ÁÉÍÓÚÜÑáéíóúü', 'AEIOUUñaeiouu'))`;

exports.up = (pgm) => {
  pgm.sql(`
    LOCK TABLE cursos IN SHARE MODE;

    DO $verificacion$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM cursos
        WHERE estado_publicacion <> 'retirado'
        GROUP BY id_categoria, ${TITULO_NORMALIZADO}
        HAVING count(*) > 1
      ) THEN
        RAISE EXCEPTION
          'No se puede crear el índice: existen cursos con títulos duplicados en una misma categoría. No se renombró ni eliminó ningún curso.'
          USING ERRCODE = 'P0001';
      END IF;
    END;
    $verificacion$;

    CREATE UNIQUE INDEX uq_cursos_titulo_normalizado
      ON cursos (id_categoria, (${TITULO_NORMALIZADO}))
      WHERE estado_publicacion <> 'retirado';
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP INDEX uq_cursos_titulo_normalizado;
  `);
};
