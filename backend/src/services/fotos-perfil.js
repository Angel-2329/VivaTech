const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const pool = require('../config/database');

const TAMANO_MAXIMO_FOTO = 300 * 1024;
const NOMBRE_ARCHIVO_VALIDO = /^[0-9a-f]{32}\.(jpg|webp)$/;

const COLUMNAS_FOTO = `
  foto_archivo IS NOT NULL AS "tieneFoto",
  to_jsonb(foto_actualizada) #>> '{}' AS "fotoActualizada"
`;

class ErrorFoto extends Error {
  constructor(estado, mensaje, codigo) {
    super(mensaje);
    this.name = 'ErrorFoto';
    this.estado = estado;
    this.codigo = codigo;
  }
}

function errorNoDisponible() {
  return new ErrorFoto(
    503,
    'No fue posible procesar la foto. Intenta de nuevo más tarde.',
    'foto_no_disponible'
  );
}

function errorNoEncontrada() {
  return new ErrorFoto(
    404,
    'La foto no está disponible',
    'foto_no_encontrada'
  );
}

function obtenerDirectorio() {
  const directorio = process.env.FOTOS_DIR;

  if (
    typeof directorio !== 'string'
    || directorio.trim() === ''
    || !path.isAbsolute(directorio)
  ) {
    console.error('FOTOS_DIR no está configurada como ruta absoluta');
    throw errorNoDisponible();
  }

  return directorio;
}

function detectarFormato(contenido) {
  if (!Buffer.isBuffer(contenido)) {
    return null;
  }

  if (
    contenido.length >= 3
    && contenido[0] === 0xff
    && contenido[1] === 0xd8
    && contenido[2] === 0xff
  ) {
    return { extension: 'jpg', tipo: 'image/jpeg' };
  }

  if (
    contenido.length >= 12
    && contenido.toString('ascii', 0, 4) === 'RIFF'
    && contenido.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return { extension: 'webp', tipo: 'image/webp' };
  }

  return null;
}

function rutaArchivo(directorio, nombre) {
  if (typeof nombre !== 'string' || !NOMBRE_ARCHIVO_VALIDO.test(nombre)) {
    return null;
  }

  return path.join(directorio, nombre);
}

async function borrarArchivo(nombre) {
  if (!nombre) {
    return;
  }

  try {
    const ruta = rutaArchivo(obtenerDirectorio(), nombre);

    if (!ruta) {
      console.error('Referencia de foto con formato inesperado; no se borró');
      return;
    }

    await fs.unlink(ruta);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return;
    }

    console.error(
      'No fue posible borrar un archivo de foto de perfil:',
      error?.code || error?.message
    );
  }
}

async function guardarFoto(uid, contenido) {
  const formato = detectarFormato(contenido);

  if (!formato) {
    throw new ErrorFoto(
      415,
      'La foto debe ser JPEG o WebP',
      'formato_no_permitido'
    );
  }

  if (contenido.length > TAMANO_MAXIMO_FOTO) {
    throw new ErrorFoto(
      413,
      'La foto debe pesar como máximo 300 KB',
      'foto_muy_grande'
    );
  }

  const directorio = obtenerDirectorio();
  const nombre = `${crypto.randomBytes(16).toString('hex')}.${formato.extension}`;

  try {
    await fs.writeFile(path.join(directorio, nombre), contenido, {
      mode: 0o600,
      flag: 'wx'
    });
  } catch (error) {
    console.error(
      'No fue posible guardar la foto de perfil en disco:',
      error?.code || error?.message
    );
    throw errorNoDisponible();
  }

  let resultado;

  try {
    resultado = await pool.query(
      `
        UPDATE usuarios u
        SET foto_archivo = $2,
            foto_actualizada = now()
        FROM (
          SELECT uid, foto_archivo
          FROM usuarios
          WHERE uid = $1
            AND activo = true
          FOR UPDATE
        ) anterior
        WHERE u.uid = anterior.uid
        RETURNING
          anterior.foto_archivo AS "fotoAnterior",
          to_jsonb(u.foto_actualizada) #>> '{}' AS "fotoActualizada"
      `,
      [uid, nombre]
    );
  } catch (error) {
    console.error('No fue posible registrar la foto de perfil:', error.message);
    await borrarArchivo(nombre);
    throw errorNoDisponible();
  }

  if (resultado.rowCount !== 1) {
    await borrarArchivo(nombre);
    throw new ErrorFoto(
      409,
      'El perfil cambió o ya no está disponible. Consulta tu perfil nuevamente',
      'perfil_no_actualizado'
    );
  }

  const { fotoAnterior, fotoActualizada } = resultado.rows[0];

  if (fotoAnterior && fotoAnterior !== nombre) {
    await borrarArchivo(fotoAnterior);
  }

  return { tieneFoto: true, fotoActualizada };
}

async function quitarFoto(uid) {
  let resultado;

  try {
    resultado = await pool.query(
      `
        UPDATE usuarios u
        SET foto_archivo = NULL,
            foto_actualizada = NULL
        FROM (
          SELECT uid, foto_archivo
          FROM usuarios
          WHERE uid = $1
            AND activo = true
            AND foto_archivo IS NOT NULL
          FOR UPDATE
        ) anterior
        WHERE u.uid = anterior.uid
        RETURNING anterior.foto_archivo AS "fotoAnterior"
      `,
      [uid]
    );
  } catch (error) {
    console.error('No fue posible quitar la foto de perfil:', error.message);
    throw errorNoDisponible();
  }

  if (resultado.rowCount === 1) {
    await borrarArchivo(resultado.rows[0].fotoAnterior);
  }
}

async function obtenerFoto(solicitante, uidDestino) {
  let resultado;

  try {
    resultado = await pool.query(
      `
        SELECT d.foto_archivo AS "fotoArchivo"
        FROM usuarios d
        WHERE d.uid = $1
          AND d.foto_archivo IS NOT NULL
          AND (
            d.uid = $2
            OR $3::text = 'administrador'
            OR (
              $3::text = 'maestro'
              AND EXISTS (
                SELECT 1
                FROM grupo_estudiantes ge
                JOIN grupo_maestros gm ON gm.id_grupo = ge.id_grupo
                WHERE ge.uid_estudiante = d.uid
                  AND gm.uid_maestro = $2
              )
            )
          )
      `,
      [uidDestino, solicitante.uid, solicitante.rol]
    );
  } catch (error) {
    console.error('No fue posible consultar la foto de perfil:', error.message);
    throw errorNoDisponible();
  }

  if (resultado.rowCount !== 1) {
    throw errorNoEncontrada();
  }

  const ruta = rutaArchivo(obtenerDirectorio(), resultado.rows[0].fotoArchivo);

  if (!ruta) {
    console.error('Referencia de foto con formato inesperado');
    throw errorNoDisponible();
  }

  let contenido;

  try {
    contenido = await fs.readFile(ruta);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      console.error('Falta el archivo de una foto de perfil registrada');
      throw errorNoEncontrada();
    }

    console.error(
      'No fue posible leer la foto de perfil:',
      error?.code || error?.message
    );
    throw errorNoDisponible();
  }

  const formato = detectarFormato(contenido);

  if (!formato) {
    console.error('Archivo de foto de perfil con formato inesperado');
    throw errorNoDisponible();
  }

  return { contenido, tipo: formato.tipo };
}

module.exports = {
  COLUMNAS_FOTO,
  ErrorFoto,
  TAMANO_MAXIMO_FOTO,
  borrarArchivo,
  detectarFormato,
  guardarFoto,
  obtenerFoto,
  quitarFoto
};
