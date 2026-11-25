exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE cambios_telefono (
      id_cambio BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      uid_usuario VARCHAR(128) NOT NULL,
      uid_administrador VARCHAR(128) NOT NULL,
      ultimos4_anterior CHAR(4) NULL,
      ultimos4_nuevo CHAR(4) NOT NULL,
      fecha_cambio TIMESTAMPTZ NOT NULL DEFAULT now(),

      CONSTRAINT fk_cambios_telefono_usuario
        FOREIGN KEY (uid_usuario)
        REFERENCES usuarios(uid)
        ON DELETE RESTRICT,

      CONSTRAINT fk_cambios_telefono_administrador
        FOREIGN KEY (uid_administrador)
        REFERENCES usuarios(uid)
        ON DELETE RESTRICT,

      CONSTRAINT ck_cambios_telefono_ultimos4_anterior
        CHECK (ultimos4_anterior ~ '^[0-9]{4}$'),

      CONSTRAINT ck_cambios_telefono_ultimos4_nuevo
        CHECK (ultimos4_nuevo ~ '^[0-9]{4}$')
    );
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE cambios_telefono;
  `);
};
