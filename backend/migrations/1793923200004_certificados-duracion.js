exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE certificados
      ADD COLUMN duracion_minutos INTEGER;

    ALTER TABLE certificados
      ADD CONSTRAINT chk_certificados_duracion
      CHECK (duracion_minutos IS NULL OR duracion_minutos > 0);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE certificados
      DROP CONSTRAINT chk_certificados_duracion;

    ALTER TABLE certificados
      DROP COLUMN duracion_minutos;
  `);
};
