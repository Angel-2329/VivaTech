const LIMITES_TEXTO = Object.freeze({
  categoria: 60,
  titulo: 100,
  descripcion: 300,
  objetivo: 200,
  instruccion: 300,
  pregunta: 200,
  opcion: 100,
  pista: 200,
  mensajeAcierto: 150,
  tituloPantalla: 40,
  subtituloPantalla: 80,
  elementoLista: 150,
  aviso: 200,
  alt: 80
});

function esObjeto(valor) {
  return valor !== null && typeof valor === 'object' && !Array.isArray(valor);
}

function crearContexto(publicable) {
  if (typeof publicable !== 'boolean') {
    throw new TypeError('La opción publicable debe ser booleana');
  }

  const errores = [];

  function error(ruta, codigo, mensaje) {
    errores.push({ ruta, codigo, mensaje });
  }

  function objeto(valor, ruta) {
    if (!esObjeto(valor)) {
      error(ruta, 'objeto_requerido', 'Debe ser un objeto JSON');
      return false;
    }
    return true;
  }

  function texto(valor, ruta, maximo) {
    if (typeof valor !== 'string') {
      error(ruta, 'texto_requerido', 'Debe ser una cadena de texto');
      return false;
    }

    const longitud = Array.from(valor.trim()).length;
    if (longitud < 1 || (maximo !== undefined && longitud > maximo)) {
      error(
        ruta,
        'longitud_invalida',
        maximo === undefined
          ? 'El texto no puede estar vacío'
          : `El texto debe tener entre 1 y ${maximo} caracteres`
      );
      return false;
    }
    return true;
  }

  function entero(valor, ruta, minimo, maximo) {
    if (!Number.isInteger(valor) || valor < minimo || valor > maximo) {
      error(ruta, 'entero_invalido', `Debe ser un entero de ${minimo} a ${maximo}`);
      return false;
    }
    return true;
  }

  function arreglo(valor, ruta, minimo, maximo) {
    if (!Array.isArray(valor)) {
      error(ruta, 'arreglo_requerido', 'Debe ser un arreglo');
      return false;
    }
    if (valor.length < minimo || valor.length > maximo) {
      error(ruta, 'cantidad_invalida', `Debe contener entre ${minimo} y ${maximo} elementos`);
    }
    return true;
  }

  function orden(valor, ruta) {
    return entero(valor, ruta, 1, 2147483647);
  }

  function recurso(valor, ruta) {
    if (!objeto(valor, ruta)) return;

    if (valor.tipo === 'icono') {
      texto(valor.nombre, `${ruta}.nombre`);
      texto(valor.alt, `${ruta}.alt`, LIMITES_TEXTO.alt);
    } else if (valor.tipo === 'lista') {
      if (arreglo(valor.elementos, `${ruta}.elementos`, 2, 5)) {
        valor.elementos.forEach((elemento, indice) => {
          texto(elemento, `${ruta}.elementos[${indice}]`, LIMITES_TEXTO.elementoLista);
        });
      }
    } else if (valor.tipo === 'aviso') {
      texto(valor.texto, `${ruta}.texto`, LIMITES_TEXTO.aviso);
    } else {
      error(`${ruta}.tipo`, 'tipo_recurso_invalido', 'El recurso debe ser icono, lista o aviso');
    }
  }

  function actividad(valor, ruta) {
    if (!objeto(valor, ruta)) return;

    if (valor.tipo === 'lectura') {
      if (Object.keys(valor).some((campo) => campo !== 'tipo')) {
        error(ruta, 'lectura_con_campos_extra', 'La actividad de lectura solo contiene tipo');
      }
      return;
    }

    if (valor.tipo !== 'toque' && valor.tipo !== 'opcion') {
      error(`${ruta}.tipo`, 'tipo_actividad_invalido', 'La actividad debe ser lectura, toque u opcion');
      return;
    }

    if (valor.tipo === 'toque') {
      if (objeto(valor.pantalla, `${ruta}.pantalla`)) {
        texto(valor.pantalla.titulo, `${ruta}.pantalla.titulo`, LIMITES_TEXTO.tituloPantalla);
        if (Object.hasOwn(valor.pantalla, 'subtitulo')) {
          texto(valor.pantalla.subtitulo, `${ruta}.pantalla.subtitulo`, LIMITES_TEXTO.subtituloPantalla);
        }
      }
    } else {
      texto(valor.pregunta, `${ruta}.pregunta`, LIMITES_TEXTO.pregunta);
    }

    texto(valor.pista, `${ruta}.pista`, LIMITES_TEXTO.pista);
    texto(valor.mensajeAcierto, `${ruta}.mensajeAcierto`, LIMITES_TEXTO.mensajeAcierto);

    const ids = new Set();
    if (arreglo(valor.opciones, `${ruta}.opciones`, 2, valor.tipo === 'toque' ? 6 : 4)) {
      valor.opciones.forEach((opcion, indice) => {
        const ubicacion = `${ruta}.opciones[${indice}]`;
        if (!objeto(opcion, ubicacion)) return;

        if (typeof opcion.id !== 'string' || !/^[a-z0-9_-]{1,20}$/.test(opcion.id)) {
          error(`${ubicacion}.id`, 'id_opcion_invalido', 'Usa de 1 a 20 letras minúsculas sin acentos, números, guion o guion bajo');
        } else {
          if (ids.has(opcion.id)) {
            error(`${ubicacion}.id`, 'id_opcion_duplicado', 'El ID debe ser único dentro del paso');
          }
          ids.add(opcion.id);
        }

        texto(opcion.texto, `${ubicacion}.texto`, LIMITES_TEXTO.opcion);
        if (Object.hasOwn(opcion, 'icono')) {
          texto(opcion.icono, `${ubicacion}.icono`);
        }
      });
    }

    if (typeof valor.correcta !== 'string' || !ids.has(valor.correcta)) {
      error(`${ruta}.correcta`, 'respuesta_invalida', 'Debe ser el ID de una opción válida del paso');
    }
  }

  function paso(valor, ruta) {
    if (!objeto(valor, ruta)) return;
    orden(valor.orden, `${ruta}.orden`);
    texto(valor.instruccion, `${ruta}.instruccion`, LIMITES_TEXTO.instruccion);

    if (!Array.isArray(valor.recursos)) {
      error(`${ruta}.recursos`, 'arreglo_requerido', 'Los recursos deben ser un arreglo, aunque esté vacío');
    } else {
      valor.recursos.forEach((elemento, indice) => recurso(elemento, `${ruta}.recursos[${indice}]`));
    }

    actividad(valor.actividad, `${ruta}.actividad`);
  }

  function leccion(valor, ruta) {
    if (!objeto(valor, ruta)) return;
    orden(valor.orden, `${ruta}.orden`);
    texto(valor.titulo, `${ruta}.titulo`, LIMITES_TEXTO.titulo);
    texto(valor.objetivo, `${ruta}.objetivo`, LIMITES_TEXTO.objetivo);
    entero(valor.duracionEstimadaMinutos, `${ruta}.duracionEstimadaMinutos`, 1, 15);

    if (arreglo(valor.pasos, `${ruta}.pasos`, publicable ? 3 : 0, 8)) {
      valor.pasos.forEach((elemento, indice) => {
        const ubicacion = `${ruta}.pasos[${indice}]`;
        paso(elemento, ubicacion);
        if (esObjeto(elemento) && Number.isInteger(elemento.orden) && elemento.orden !== indice + 1) {
          error(`${ubicacion}.orden`, 'orden_no_consecutivo', 'Los pasos deben estar ordenados de 1 a n, sin saltos ni repeticiones');
        }
      });

      if (publicable && !valor.pasos.some((elemento) => (
        esObjeto(elemento)
        && esObjeto(elemento.actividad)
        && ['toque', 'opcion'].includes(elemento.actividad.tipo)
      ))) {
        error(`${ruta}.pasos`, 'practica_requerida', 'Una lección publicable necesita al menos una práctica de toque u opcion');
      }
    }
  }

  function curso(valor, ruta) {
    if (!objeto(valor, ruta)) return;
    texto(valor.categoria, `${ruta}.categoria`, LIMITES_TEXTO.categoria);
    orden(valor.orden, `${ruta}.orden`);
    texto(valor.titulo, `${ruta}.titulo`, LIMITES_TEXTO.titulo);
    texto(valor.descripcion, `${ruta}.descripcion`, LIMITES_TEXTO.descripcion);

    if (arreglo(valor.lecciones, `${ruta}.lecciones`, publicable ? 1 : 0, 10)) {
      const ordenes = new Set();
      valor.lecciones.forEach((elemento, indice) => {
        const ubicacion = `${ruta}.lecciones[${indice}]`;
        leccion(elemento, ubicacion);
        if (esObjeto(elemento) && Number.isInteger(elemento.orden)) {
          if (ordenes.has(elemento.orden)) {
            error(`${ubicacion}.orden`, 'orden_duplicado', 'El orden de lección debe ser único dentro del curso');
          }
          ordenes.add(elemento.orden);
        }
      });
    }
  }

  return { curso, leccion, paso, resultado: () => ({ valido: errores.length === 0, errores }) };
}

function validarCurso(valor, { publicable = true } = {}) {
  const contexto = crearContexto(publicable);
  contexto.curso(valor, 'curso');
  return contexto.resultado();
}

function validarLeccion(valor, { publicable = true } = {}) {
  const contexto = crearContexto(publicable);
  contexto.leccion(valor, 'leccion');
  return contexto.resultado();
}

function validarPaso(valor) {
  const contexto = crearContexto(false);
  contexto.paso(valor, 'paso');
  return contexto.resultado();
}

module.exports = { LIMITES_TEXTO, validarCurso, validarLeccion, validarPaso };
