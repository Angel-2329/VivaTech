exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE usuarios
      ADD COLUMN foto_archivo TEXT NULL,
      ADD COLUMN foto_actualizada TIMESTAMPTZ NULL;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE usuarios
      DROP COLUMN foto_actualizada,
      DROP COLUMN foto_archivo;
  `);
};
