/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`

    CREATE OR REPLACE FUNCTION fn_poner_fecha_actualizacion()
    RETURNS trigger AS $$
    BEGIN
      NEW.fecha_actualizacion := CURRENT_TIMESTAMP;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    CREATE TABLE usuarios (
      uid VARCHAR(128) PRIMARY KEY,
      nombre_completo VARCHAR(100) NOT NULL,
      nombre_apodo VARCHAR(30),
      rol VARCHAR(20) NOT NULL DEFAULT 'estudiante',
      activo BOOLEAN NOT NULL DEFAULT true,
      fecha_registro TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      fecha_actualizacion TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

      CONSTRAINT chk_usuarios_uid
        CHECK (length(trim(uid)) > 0),

      CONSTRAINT chk_usuarios_rol
        CHECK (rol IN ('estudiante', 'maestro', 'administrador')),

      CONSTRAINT chk_usuarios_nombre_completo
        CHECK (length(trim(nombre_completo)) BETWEEN 3 AND 100),

      CONSTRAINT chk_usuarios_apodo
        CHECK (nombre_apodo IS NULL OR length(trim(nombre_apodo)) > 0)
    );

    CREATE TABLE grupos (
      id_grupo BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      nombre TEXT NOT NULL,
      creado_por VARCHAR(128) NOT NULL,
      fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      fecha_actualizacion TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

      CONSTRAINT fk_grupos_creador
        FOREIGN KEY (creado_por)
        REFERENCES usuarios(uid)
        ON DELETE RESTRICT,

      CONSTRAINT chk_grupos_nombre
        CHECK (length(trim(nombre)) > 0)
    );

    CREATE TABLE grupo_maestros (
      id_grupo BIGINT NOT NULL,
      uid_maestro VARCHAR(128) NOT NULL,
      fecha_asignacion TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      asignado_por VARCHAR(128) NOT NULL,

      PRIMARY KEY (id_grupo, uid_maestro),

      CONSTRAINT fk_grupo_maestros_grupo
        FOREIGN KEY (id_grupo)
        REFERENCES grupos(id_grupo)
        ON DELETE RESTRICT,

      CONSTRAINT fk_grupo_maestros_maestro
        FOREIGN KEY (uid_maestro)
        REFERENCES usuarios(uid)
        ON DELETE RESTRICT,

      CONSTRAINT fk_grupo_maestros_asignador
        FOREIGN KEY (asignado_por)
        REFERENCES usuarios(uid)
        ON DELETE RESTRICT
    );

    CREATE TABLE grupo_estudiantes (
      id_grupo BIGINT NOT NULL,
      uid_estudiante VARCHAR(128) NOT NULL,
      fecha_asignacion TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      asignado_por VARCHAR(128) NOT NULL,

      PRIMARY KEY (id_grupo, uid_estudiante),

      CONSTRAINT fk_grupo_estudiantes_grupo
        FOREIGN KEY (id_grupo)
        REFERENCES grupos(id_grupo)
        ON DELETE RESTRICT,

      CONSTRAINT fk_grupo_estudiantes_estudiante
        FOREIGN KEY (uid_estudiante)
        REFERENCES usuarios(uid)
        ON DELETE RESTRICT,

      CONSTRAINT fk_grupo_estudiantes_asignador
        FOREIGN KEY (asignado_por)
        REFERENCES usuarios(uid)
        ON DELETE RESTRICT
    );

    CREATE TABLE categorias (
      id_categoria BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      nombre TEXT NOT NULL,
      descripcion TEXT,
      icono VARCHAR(50),
      creado_por VARCHAR(128) NOT NULL,
      orden INTEGER NOT NULL,
      fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      fecha_actualizacion TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

      CONSTRAINT fk_categorias_creador
        FOREIGN KEY (creado_por)
        REFERENCES usuarios(uid)
        ON DELETE RESTRICT,

      CONSTRAINT uq_categorias_nombre UNIQUE (nombre),
      CONSTRAINT uq_categorias_orden UNIQUE (orden)
        DEFERRABLE INITIALLY DEFERRED,

      CONSTRAINT chk_categorias_orden CHECK (orden > 0),
      CONSTRAINT chk_categorias_nombre
        CHECK (length(trim(nombre)) > 0)
    );

    CREATE TABLE cursos (
      id_curso BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      id_categoria BIGINT NOT NULL,
      titulo TEXT NOT NULL,
      descripcion TEXT NOT NULL,
      estado_publicacion VARCHAR(20) NOT NULL DEFAULT 'borrador',
      creado_por VARCHAR(128) NOT NULL,
      orden INTEGER NOT NULL,
      fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      fecha_actualizacion TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

      CONSTRAINT fk_cursos_categoria
        FOREIGN KEY (id_categoria)
        REFERENCES categorias(id_categoria)
        ON DELETE RESTRICT,

      CONSTRAINT fk_cursos_creador
        FOREIGN KEY (creado_por)
        REFERENCES usuarios(uid)
        ON DELETE RESTRICT,

      CONSTRAINT uq_cursos_categoria_orden
        UNIQUE (id_categoria, orden)
        DEFERRABLE INITIALLY DEFERRED,

      CONSTRAINT chk_cursos_estado
        CHECK (estado_publicacion IN ('borrador', 'publicado')),

      CONSTRAINT chk_cursos_orden CHECK (orden > 0),
      CONSTRAINT chk_cursos_titulo
        CHECK (length(trim(titulo)) > 0)
    );

    CREATE TABLE lecciones (
      id_leccion BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      id_curso BIGINT NOT NULL,
      titulo TEXT NOT NULL,
      duracion_estimada_minutos SMALLINT NOT NULL,
      estado_publicacion VARCHAR(20) NOT NULL DEFAULT 'borrador',
      creado_por VARCHAR(128) NOT NULL,
      orden INTEGER NOT NULL,
      objetivo TEXT,
      fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      fecha_actualizacion TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

      CONSTRAINT fk_lecciones_curso
        FOREIGN KEY (id_curso)
        REFERENCES cursos(id_curso)
        ON DELETE RESTRICT,

      CONSTRAINT fk_lecciones_creador
        FOREIGN KEY (creado_por)
        REFERENCES usuarios(uid)
        ON DELETE RESTRICT,

      CONSTRAINT uq_lecciones_curso_orden
        UNIQUE (id_curso, orden)
        DEFERRABLE INITIALLY DEFERRED,

      CONSTRAINT chk_lecciones_duracion
        CHECK (duracion_estimada_minutos BETWEEN 1 AND 15),

      CONSTRAINT chk_lecciones_estado
        CHECK (estado_publicacion IN ('borrador', 'publicado')),

      CONSTRAINT chk_lecciones_orden CHECK (orden > 0),
      CONSTRAINT chk_lecciones_titulo
        CHECK (length(trim(titulo)) > 0)
    );

    CREATE TABLE pasos (
      id_paso BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      id_leccion BIGINT NOT NULL,
      orden INTEGER NOT NULL,
      instruccion TEXT NOT NULL,
      recursos JSONB,
      actividad JSONB,
      fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      fecha_actualizacion TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

      CONSTRAINT fk_pasos_leccion
        FOREIGN KEY (id_leccion)
        REFERENCES lecciones(id_leccion)
        ON DELETE RESTRICT,

      CONSTRAINT uq_pasos_leccion_orden
        UNIQUE (id_leccion, orden)
        DEFERRABLE INITIALLY DEFERRED,

      CONSTRAINT uq_pasos_leccion_paso
        UNIQUE (id_leccion, id_paso),

      CONSTRAINT chk_pasos_orden CHECK (orden > 0),

      CONSTRAINT chk_pasos_instruccion
        CHECK (length(trim(instruccion)) > 0),

      CONSTRAINT chk_pasos_recursos
        CHECK (
          recursos IS NULL
          OR jsonb_typeof(recursos) = 'array'
        ),

      CONSTRAINT chk_pasos_actividad
        CHECK (
          actividad IS NULL
          OR jsonb_typeof(actividad) = 'object'
        )
    );

    CREATE TABLE progresos (
      uid_estudiante VARCHAR(128) NOT NULL,
      id_leccion BIGINT NOT NULL,
      estado VARCHAR(20) NOT NULL DEFAULT 'en_progreso',
      id_ultimo_paso_completado BIGINT,
      fecha_inicio TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      fecha_actualizacion TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      fecha_finalizacion TIMESTAMPTZ,

      PRIMARY KEY (uid_estudiante, id_leccion),

      CONSTRAINT fk_progresos_estudiante
        FOREIGN KEY (uid_estudiante)
        REFERENCES usuarios(uid)
        ON DELETE RESTRICT,

      CONSTRAINT fk_progresos_leccion
        FOREIGN KEY (id_leccion)
        REFERENCES lecciones(id_leccion)
        ON DELETE RESTRICT,

      CONSTRAINT fk_progresos_paso_correcto
        FOREIGN KEY (id_leccion, id_ultimo_paso_completado)
        REFERENCES pasos(id_leccion, id_paso)
        ON DELETE RESTRICT,

      CONSTRAINT chk_progresos_estado
        CHECK (estado IN ('en_progreso', 'completada')),

      CONSTRAINT chk_progresos_fechas
        CHECK (
          fecha_finalizacion IS NULL
          OR fecha_finalizacion >= fecha_inicio
        ),

      CONSTRAINT chk_progresos_finalizacion
        CHECK (
          (estado = 'en_progreso' AND fecha_finalizacion IS NULL)
          OR
          (estado = 'completada' AND fecha_finalizacion IS NOT NULL)
        )
    );

    CREATE SEQUENCE seq_folio_certificados;

    CREATE TABLE certificados (
      id_certificado BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      folio VARCHAR(20) NOT NULL DEFAULT (
        'VT-' ||
        to_char(
          CURRENT_TIMESTAMP AT TIME ZONE 'America/Mexico_City',
          'YYYY'
        ) ||
        '-' ||
        lpad(nextval('seq_folio_certificados')::text, 6, '0')
      ),
      codigo_verificacion UUID NOT NULL DEFAULT gen_random_uuid(),
      uid_estudiante VARCHAR(128) NOT NULL,
      id_curso BIGINT NOT NULL,
      nombre_en_certificado VARCHAR(100) NOT NULL,
      titulo_curso_en_certificado TEXT NOT NULL,
      lecciones_en_certificado JSONB NOT NULL,
      fecha_finalizacion_curso TIMESTAMPTZ NOT NULL,
      fecha_emision TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

      CONSTRAINT fk_certificados_estudiante
        FOREIGN KEY (uid_estudiante)
        REFERENCES usuarios(uid)
        ON DELETE RESTRICT,

      CONSTRAINT fk_certificados_curso
        FOREIGN KEY (id_curso)
        REFERENCES cursos(id_curso)
        ON DELETE RESTRICT,

      CONSTRAINT uq_certificados_folio UNIQUE (folio),
      CONSTRAINT uq_certificados_codigo UNIQUE (codigo_verificacion),
      CONSTRAINT uq_certificados_estudiante_curso
        UNIQUE (uid_estudiante, id_curso),

      CONSTRAINT chk_certificados_folio
        CHECK (folio ~ '^VT-[0-9]{4}-[0-9]{6}$'),

      CONSTRAINT chk_certificados_nombre
        CHECK (length(trim(nombre_en_certificado)) > 0),

      CONSTRAINT chk_certificados_titulo_curso
        CHECK (length(trim(titulo_curso_en_certificado)) > 0),

      CONSTRAINT chk_certificados_lecciones CHECK (
        jsonb_typeof(lecciones_en_certificado) = 'array'
        AND jsonb_array_length(lecciones_en_certificado) > 0
      ),

      CONSTRAINT chk_certificados_fechas
        CHECK (fecha_emision >= fecha_finalizacion_curso)
    );

    CREATE TRIGGER trg_usuarios_fecha
      BEFORE UPDATE ON usuarios
      FOR EACH ROW EXECUTE FUNCTION fn_poner_fecha_actualizacion();

    CREATE TRIGGER trg_grupos_fecha
      BEFORE UPDATE ON grupos
      FOR EACH ROW EXECUTE FUNCTION fn_poner_fecha_actualizacion();

    CREATE TRIGGER trg_categorias_fecha
      BEFORE UPDATE ON categorias
      FOR EACH ROW EXECUTE FUNCTION fn_poner_fecha_actualizacion();

    CREATE TRIGGER trg_cursos_fecha
      BEFORE UPDATE ON cursos
      FOR EACH ROW EXECUTE FUNCTION fn_poner_fecha_actualizacion();

    CREATE TRIGGER trg_lecciones_fecha
      BEFORE UPDATE ON lecciones
      FOR EACH ROW EXECUTE FUNCTION fn_poner_fecha_actualizacion();

    CREATE TRIGGER trg_pasos_fecha
      BEFORE UPDATE ON pasos
      FOR EACH ROW EXECUTE FUNCTION fn_poner_fecha_actualizacion();

    CREATE TRIGGER trg_progresos_fecha
      BEFORE UPDATE ON progresos
      FOR EACH ROW EXECUTE FUNCTION fn_poner_fecha_actualizacion();

    CREATE INDEX idx_grupo_maestros_maestro
      ON grupo_maestros(uid_maestro);

    CREATE INDEX idx_grupo_estudiantes_estudiante
      ON grupo_estudiantes(uid_estudiante);

    CREATE INDEX idx_cursos_categoria
      ON cursos(id_categoria);

    CREATE INDEX idx_lecciones_curso
      ON lecciones(id_curso);

    CREATE INDEX idx_pasos_leccion
      ON pasos(id_leccion);

    CREATE INDEX idx_progresos_leccion
      ON progresos(id_leccion);

    CREATE INDEX idx_progresos_reciente
      ON progresos(uid_estudiante, fecha_actualizacion DESC);

    CREATE INDEX idx_certificados_estudiante
      ON certificados(uid_estudiante);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS certificados;
    DROP SEQUENCE IF EXISTS seq_folio_certificados;
    DROP TABLE IF EXISTS progresos;
    DROP TABLE IF EXISTS pasos;
    DROP TABLE IF EXISTS lecciones;
    DROP TABLE IF EXISTS cursos;
    DROP TABLE IF EXISTS categorias;
    DROP TABLE IF EXISTS grupo_estudiantes;
    DROP TABLE IF EXISTS grupo_maestros;
    DROP TABLE IF EXISTS grupos;
    DROP TABLE IF EXISTS usuarios;

    DROP FUNCTION IF EXISTS fn_poner_fecha_actualizacion();
  `);
};