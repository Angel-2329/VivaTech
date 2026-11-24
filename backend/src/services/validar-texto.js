const PATRON_GRUPO = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9 _.,()#-]+$/;
const PATRON_NOMBRE = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ' -]+$/;
const TIENE_LETRA = /[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/;
const TIENE_LETRA_O_DIGITO = /[A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9]/;

function normalizarTexto(texto) {
  return texto
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizarNombrePersona(texto) {
  return normalizarTexto(texto).replace(/’/g, "'");
}

function contarCaracteres(texto) {
  return Array.from(texto).length;
}

function esNombreGrupoValido(nombre) {
  return PATRON_GRUPO.test(nombre) && TIENE_LETRA_O_DIGITO.test(nombre);
}

function esNombrePersonaValido(nombre) {
  return PATRON_NOMBRE.test(nombre) && TIENE_LETRA.test(nombre);
}

module.exports = {
  normalizarTexto,
  normalizarNombrePersona,
  contarCaracteres,
  esNombreGrupoValido,
  esNombrePersonaValido
};
