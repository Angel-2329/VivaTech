exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE cargas_contenido_inicial (
      clave VARCHAR(80) PRIMARY KEY,
      id_curso BIGINT UNIQUE,
      fecha_carga TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

      CONSTRAINT chk_cargas_contenido_inicial_clave
        CHECK (clave ~ '^[a-z0-9_-]{1,80}$'),

      CONSTRAINT fk_cargas_contenido_inicial_curso
        FOREIGN KEY (id_curso)
        REFERENCES cursos(id_curso)
        ON DELETE SET NULL
    );
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    LOCK TABLE cargas_contenido_inicial IN ACCESS EXCLUSIVE MODE;

    DO $reversion$
    BEGIN
      IF EXISTS (SELECT 1 FROM cargas_contenido_inicial) THEN
        RAISE EXCEPTION
          'No se puede revertir: existen registros de carga inicial, incluidos cursos eliminados previamente. No se eliminaron esos registros.'
          USING ERRCODE = 'P0001';
      END IF;
    END;
    $reversion$;

    DROP TABLE cargas_contenido_inicial;
  `);
};
