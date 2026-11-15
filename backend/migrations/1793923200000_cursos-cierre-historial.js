exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE cursos
      ADD COLUMN fecha_cierre DATE;

    ALTER TABLE cursos
      DROP CONSTRAINT chk_cursos_estado;

    ALTER TABLE cursos
      ADD CONSTRAINT chk_cursos_estado
      CHECK (estado_publicacion IN ('borrador', 'publicado', 'retirado'));

    CREATE TABLE historial_cursos_retirados (
      uid_estudiante VARCHAR(128) NOT NULL,
      id_curso BIGINT NOT NULL,
      lecciones JSONB NOT NULL,
      curso_completado BOOLEAN NOT NULL,
      fecha_finalizacion_curso TIMESTAMPTZ,
      fecha_retiro TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

      PRIMARY KEY (uid_estudiante, id_curso),

      CONSTRAINT fk_historial_cursos_retirados_estudiante
        FOREIGN KEY (uid_estudiante)
        REFERENCES usuarios(uid)
        ON DELETE RESTRICT,

      CONSTRAINT fk_historial_cursos_retirados_curso
        FOREIGN KEY (id_curso)
        REFERENCES cursos(id_curso)
        ON DELETE RESTRICT,

      CONSTRAINT chk_historial_cursos_retirados_lecciones
        CHECK (
          CASE
            WHEN jsonb_typeof(lecciones) = 'array'
              THEN jsonb_array_length(lecciones) BETWEEN 1 AND 10
            ELSE false
          END
        ),

      CONSTRAINT chk_historial_cursos_retirados_finalizacion
        CHECK (
          (curso_completado AND fecha_finalizacion_curso IS NOT NULL)
          OR
          (NOT curso_completado AND fecha_finalizacion_curso IS NULL)
        ),

      CONSTRAINT chk_historial_cursos_retirados_fechas
        CHECK (
          fecha_finalizacion_curso IS NULL
          OR fecha_finalizacion_curso <= fecha_retiro
        )
    );

    CREATE INDEX idx_historial_cursos_retirados_curso
      ON historial_cursos_retirados (id_curso);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    LOCK TABLE cursos, historial_cursos_retirados IN ACCESS EXCLUSIVE MODE;

    DO $reversion$
    BEGIN
      IF EXISTS (SELECT 1 FROM historial_cursos_retirados)
        OR EXISTS (
          SELECT 1 FROM cursos
          WHERE estado_publicacion = 'retirado'
            OR fecha_cierre IS NOT NULL
        )
      THEN
        RAISE EXCEPTION
          'No se puede revertir: existen historiales, cursos retirados o fechas de cierre en uso. No se eliminaron esos datos.'
          USING ERRCODE = 'P0001';
      END IF;
    END;
    $reversion$;

    DROP TABLE historial_cursos_retirados;

    ALTER TABLE cursos
      DROP CONSTRAINT chk_cursos_estado;

    ALTER TABLE cursos
      ADD CONSTRAINT chk_cursos_estado
      CHECK (estado_publicacion IN ('borrador', 'publicado'));

    ALTER TABLE cursos
      DROP COLUMN fecha_cierre;
  `);
};
