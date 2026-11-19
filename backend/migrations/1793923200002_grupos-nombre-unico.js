const NOMBRE_NORMALIZADO = `lower(translate(btrim(regexp_replace(nombre, '[[:space:]\\u00a0]+', ' ', 'g')), 'ÁÉÍÓÚÜÑáéíóúü', 'AEIOUUñaeiouu'))`;

exports.up = (pgm) => {
  pgm.sql(`
    LOCK TABLE grupos IN SHARE MODE;

    DO $verificacion$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM grupos
        GROUP BY ${NOMBRE_NORMALIZADO}
        HAVING count(*) > 1
      ) THEN
        RAISE EXCEPTION
          'No se puede crear el índice: existen grupos con nombres duplicados. No se renombró ni eliminó ningún grupo.'
          USING ERRCODE = 'P0001';
      END IF;
    END;
    $verificacion$;

    CREATE UNIQUE INDEX uq_grupos_nombre_normalizado
      ON grupos ((${NOMBRE_NORMALIZADO}));
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP INDEX uq_grupos_nombre_normalizado;
  `);
};
