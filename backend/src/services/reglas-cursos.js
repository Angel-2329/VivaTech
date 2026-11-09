const formateadorMexico = new Intl.DateTimeFormat('en-CA-u-ca-gregory-nu-latn', {
  timeZone: 'America/Mexico_City',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});

class ErrorReglaCurso extends Error {
  constructor(estado, mensaje, codigo) {
    super(mensaje);
    this.name = 'ErrorReglaCurso';
    this.estado = estado;
    this.codigo = codigo;
  }
}

function fechaCiudadMexico(ahora = new Date()) {
  if (!(ahora instanceof Date) || Number.isNaN(ahora.getTime())) {
    throw new TypeError('El reloj debe proporcionar una fecha válida');
  }
  const partes = Object.fromEntries(formateadorMexico.formatToParts(ahora).map((parte) => [parte.type, parte.value]));
  return `${partes.year.padStart(4, '0')}-${partes.month}-${partes.day}`;
}

function esFechaCalendario(valor) {
  if (typeof valor !== 'string' || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(valor) || valor.startsWith('0000-')) {
    return false;
  }
  const fecha = new Date(`${valor}T00:00:00.000Z`);
  return !Number.isNaN(fecha.getTime()) && fecha.toISOString().slice(0, 10) === valor;
}

function validarFechaCierre(valor, { ahora = new Date() } = {}) {
  if (valor === null) return null;
  if (!esFechaCalendario(valor)) {
    throw new ErrorReglaCurso(400, 'La fecha de cierre debe ser una fecha válida en formato AAAA-MM-DD o null', 'fecha_cierre_invalida');
  }
  if (valor < fechaCiudadMexico(ahora)) {
    throw new ErrorReglaCurso(400, 'La fecha de cierre debe ser de hoy en adelante, según la hora de Ciudad de México', 'fecha_cierre_invalida');
  }
  return valor;
}

function comprobarCurso(curso) {
  if (!curso) {
    throw new ErrorReglaCurso(404, 'El curso no está disponible', 'curso_no_encontrado');
  }
  if (!['borrador', 'publicado', 'retirado'].includes(curso.estado_publicacion)) {
    throw new TypeError('El curso debe tener un estado de publicación reconocido');
  }
}

function comprobarIndicador(valor, nombre) {
  if (typeof valor !== 'boolean') {
    throw new TypeError(`${nombre} debe ser un booleano obtenido del servidor`);
  }
}

function esUsuarioActivo(usuario, roles) {
  return Boolean(
    usuario
    && typeof usuario.uid === 'string'
    && usuario.uid.trim().length > 0
    && usuario.uid.length <= 128
    && usuario.activo === true
    && roles.includes(usuario.rol)
  );
}

function comprobarUsuario(usuario, roles) {
  if (!usuario) {
    throw new ErrorReglaCurso(404, 'El perfil todavía no está registrado', 'perfil_no_registrado');
  }
  if (usuario.activo !== true) {
    throw new ErrorReglaCurso(403, 'La cuenta está desactivada', 'cuenta_desactivada');
  }
  if (!esUsuarioActivo(usuario, roles)) {
    throw new ErrorReglaCurso(403, 'No tienes permisos para realizar esta acción', 'rol_no_autorizado');
  }
}

function obtenerEstadoCurso(curso, { ahora = new Date() } = {}) {
  comprobarCurso(curso);
  if (curso.estado_publicacion === 'retirado') return 'retirado';
  if (curso.estado_publicacion === 'borrador') return null;

  const fecha = curso.fecha_cierre;
  if (fecha === null || fecha === undefined) return 'disponible';
  if (!esFechaCalendario(fecha)) {
    throw new TypeError('La fecha de cierre almacenada debe recibirse como YYYY-MM-DD o null');
  }
  return fecha < fechaCiudadMexico(ahora) ? 'cerrado' : 'disponible';
}

function puedeEditarCurso(usuario, curso) {
  if (!esUsuarioActivo(usuario, ['maestro', 'administrador']) || !curso) return false;
  if (!['borrador', 'publicado'].includes(curso.estado_publicacion)) return false;
  return usuario.rol === 'administrador' || usuario.uid === curso.creado_por;
}

function validarEdicionCurso(usuario, curso) {
  comprobarUsuario(usuario, ['maestro', 'administrador']);
  comprobarCurso(curso);
  if (usuario.rol === 'maestro' && usuario.uid !== curso.creado_por) {
    throw new ErrorReglaCurso(403, 'Solo puedes modificar los cursos que tú creaste', 'curso_ajeno');
  }
  if (curso.estado_publicacion === 'retirado') {
    throw new ErrorReglaCurso(409, 'Un curso retirado es de solo lectura y no puede reactivarse', 'curso_retirado');
  }
}

function validarCambioEstructural(usuario, curso, { tieneAvance } = {}) {
  validarEdicionCurso(usuario, curso);
  comprobarIndicador(tieneAvance, 'tieneAvance');
  if (curso.estado_publicacion === 'publicado') {
    throw new ErrorReglaCurso(409, 'Un curso publicado solo permite las correcciones autorizadas', 'curso_publicado');
  }
  if (tieneAvance) {
    throw new ErrorReglaCurso(409, 'No se puede cambiar la estructura de un curso con avance registrado', 'curso_con_avance');
  }
}

function validarDespublicacionCurso(usuario, curso, { tieneAvance } = {}) {
  validarEdicionCurso(usuario, curso);
  comprobarIndicador(tieneAvance, 'tieneAvance');
  if (curso.estado_publicacion === 'publicado' && tieneAvance) {
    throw new ErrorReglaCurso(409, 'El curso no puede volver a borrador porque tiene avance registrado', 'curso_con_avance');
  }
}

function puedeVerCursoEstudiante(usuario, curso, {
  tieneAvance = false,
  tieneHistorial = false,
  ahora = new Date()
} = {}) {
  if (!esUsuarioActivo(usuario, ['estudiante']) || !curso) return false;
  comprobarIndicador(tieneAvance, 'tieneAvance');
  comprobarIndicador(tieneHistorial, 'tieneHistorial');
  const estado = obtenerEstadoCurso(curso, { ahora });
  if (estado === 'retirado') return tieneHistorial;
  if (estado === 'cerrado') return tieneAvance;
  return estado === 'disponible';
}

function validarAccesoLeccion(usuario, curso, { tieneAvance, ahora = new Date() } = {}) {
  comprobarUsuario(usuario, ['estudiante']);
  comprobarCurso(curso);
  comprobarIndicador(tieneAvance, 'tieneAvance');
  const estado = obtenerEstadoCurso(curso, { ahora });
  if (estado === 'retirado') {
    throw new ErrorReglaCurso(404, 'Este curso fue retirado y sus lecciones ya no están disponibles', 'curso_retirado');
  }
  if (estado === null) {
    throw new ErrorReglaCurso(404, 'La lección no está disponible', 'leccion_no_encontrada');
  }
  if (estado === 'cerrado' && !tieneAvance) {
    throw new ErrorReglaCurso(409, 'Este curso cerró y ya no puedes empezarlo', 'curso_cerrado');
  }
}

module.exports = {
  ErrorReglaCurso,
  fechaCiudadMexico,
  validarFechaCierre,
  obtenerEstadoCurso,
  puedeEditarCurso,
  validarEdicionCurso,
  validarCambioEstructural,
  validarDespublicacionCurso,
  puedeVerCursoEstudiante,
  validarAccesoLeccion
};
