const { readFile } = require('node:fs/promises');
const { validarCurso, validarLeccion } = require('../src/services/validar-contenido');

const USO = 'Uso: node scripts/validar-contenido.js [--borrador] --curso "archivo.json" [--curso "otro.json"] [--leccion "ejemplo.json"]';

function interpretarArgumentos(argumentos) {
  const archivos = [];
  let publicable = true;
  let borradorIndicado = false;

  for (let indice = 0; indice < argumentos.length; indice += 1) {
    const argumento = argumentos[indice];
    if (argumento === '--borrador' && !borradorIndicado) {
      publicable = false;
      borradorIndicado = true;
    } else if (argumento === '--curso' || argumento === '--leccion') {
      const ruta = argumentos[indice + 1];
      if (typeof ruta !== 'string' || !ruta.trim() || ruta.startsWith('--')) {
        throw new Error(USO);
      }
      archivos.push({ tipo: argumento.slice(2), ruta });
      indice += 1;
    } else {
      throw new Error(USO);
    }
  }

  if (archivos.length === 0) throw new Error(USO);
  return { archivos, publicable };
}

async function comprobarArchivos(argumentos, {
  leerArchivo = readFile,
  informar = console.log,
  informarError = console.error
} = {}) {
  let opciones;
  try {
    opciones = interpretarArgumentos(argumentos);
  } catch (error) {
    informarError(error.message);
    return 1;
  }

  let fallos = 0;

  for (const archivo of opciones.archivos) {
    let texto;
    try {
      texto = await leerArchivo(archivo.ruta, 'utf8');
    } catch {
      informarError(`${archivo.ruta}: no fue posible leer el archivo`);
      fallos += 1;
      continue;
    }

    let contenido;
    try {
      contenido = JSON.parse(texto);
    } catch {
      informarError(`${archivo.ruta}: el archivo no contiene JSON válido`);
      fallos += 1;
      continue;
    }

    const validar = archivo.tipo === 'curso' ? validarCurso : validarLeccion;
    const resultado = validar(contenido, { publicable: opciones.publicable });
    if (!resultado.valido) {
      fallos += 1;
      for (const error of resultado.errores) {
        informarError(`${archivo.ruta}: ${error.ruta} [${error.codigo}] ${error.mensaje}`);
      }
    } else {
      const modo = opciones.publicable ? 'publicable' : 'borrador';
      informar(`${archivo.ruta}: válido como ${archivo.tipo} en modo ${modo}`);
    }
  }

  return fallos === 0 ? 0 : 1;
}

if (require.main === module) {
  comprobarArchivos(process.argv.slice(2))
    .then((codigo) => { process.exitCode = codigo; })
    .catch(() => {
      console.error('No fue posible completar la validación de contenido');
      process.exitCode = 1;
    });
}

module.exports = { interpretarArgumentos, comprobarArchivos };
