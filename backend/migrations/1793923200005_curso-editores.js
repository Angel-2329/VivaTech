exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE curso_editores (
      id_curso BIGINT NOT NULL,
      uid_maestro VARCHAR(128) NOT NULL,
      otorgado_por VARCHAR(128) NOT NULL,
      fecha_otorgamiento TIMESTAMPTZ NOT NULL DEFAULT now(),

      PRIMARY KEY (id_curso, uid_maestro),

      CONSTRAINT fk_curso_editores_curso
        FOREIGN KEY (id_curso)
        REFERENCES cursos(id_curso)
        ON DELETE RESTRICT,

      CONSTRAINT fk_curso_editores_maestro
        FOREIGN KEY (uid_maestro)
        REFERENCES usuarios(uid)
        ON DELETE RESTRICT,

      CONSTRAINT fk_curso_editores_otorgante
        FOREIGN KEY (otorgado_por)
        REFERENCES usuarios(uid)
        ON DELETE RESTRICT
    );

    CREATE INDEX idx_curso_editores_maestro
      ON curso_editores (uid_maestro);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE curso_editores;
  `);
};
