const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  ErrorReglaCurso, fechaCiudadMexico, validarFechaCierre, obtenerEstadoCurso,
  puedeEditarCurso, validarEdicionCurso, validarCambioEstructural,
  validarDespublicacionCurso, puedeVerCursoEstudiante, validarAccesoLeccion
} = require('../src/services/reglas-cursos');

const AHORA = new Date('2026-11-08T05:59:59.999Z');
const MEDIANOCHE = new Date('2026-11-08T06:00:00.000Z');
const MAESTRO = { uid: 'uid-maestro', rol: 'maestro', activo: true };
const ADMIN = { uid: 'uid-admin', rol: 'administrador', activo: true };
const ALUMNO = { uid: 'uid-alumno', rol: 'estudiante', activo: true };

function curso(estado = 'publicado', fecha = null) {
  return { creado_por: MAESTRO.uid, estado_publicacion: estado, fecha_cierre: fecha };
}

function comprobarError(accion, estado, codigo) {
  assert.throws(accion, (error) => {
    assert.ok(error instanceof ErrorReglaCurso);
    assert.equal(error.estado, estado);
    assert.equal(error.codigo, codigo);
    assert.equal(typeof error.message, 'string');
    assert.ok(error.message.length > 0);
    return true;
  });
}

for (const [instante, fecha] of [
  ['2026-11-08T05:59:59.999Z', '2026-11-07'],
  ['2026-11-08T06:00:00.000Z', '2026-11-08'],
  ['2026-01-01T05:59:59.999Z', '2025-12-31'],
  ['2026-01-01T06:00:00.000Z', '2026-01-01'],
  ['2028-03-01T05:59:59.999Z', '2028-02-29']
]) {
  test(`Cursos fecha: ${instante} corresponde a ${fecha} en Ciudad de México`, () => {
    assert.equal(fechaCiudadMexico(new Date(instante)), fecha);
  });
}

test('Cursos fecha: reloj inválido no se interpreta silenciosamente como hoy', () => {
  for (const valor of [null, '2026-11-07', 0, new Date('invalida')]) {
    assert.throws(() => fechaCiudadMexico(valor), TypeError);
  }
});

test('Cursos fecha: acepta hoy local, fecha futura y null sin convertir a UTC', () => {
  assert.equal(validarFechaCierre('2026-11-07', { ahora: AHORA }), '2026-11-07');
  assert.equal(validarFechaCierre('2026-11-08', { ahora: AHORA }), '2026-11-08');
  assert.equal(validarFechaCierre('9999-12-31', { ahora: AHORA }), '9999-12-31');
  assert.equal(validarFechaCierre(null, { ahora: AHORA }), null);
});

for (const valor of [
  undefined, '', ' ', ' 2026-11-07 ', '2026-1-07', '2026-11-7',
  '2026-11-07T00:00:00Z', '2026-02-29', '2026-02-30', '2026-04-31',
  '2026-13-01', '2026-00-01', '2026-01-00', '0000-01-01',
  20261107, false, {}, [], new Date('2026-11-07T00:00:00Z')
]) {
  test(`Cursos fecha: rechaza entrada inválida ${JSON.stringify(valor)}`, () => {
    comprobarError(() => validarFechaCierre(valor, { ahora: AHORA }), 400, 'fecha_cierre_invalida');
  });
}

test('Cursos fecha: acepta bisiesto real y rechaza bisiesto inexistente', () => {
  assert.equal(validarFechaCierre('2028-02-29', { ahora: AHORA }), '2028-02-29');
  comprobarError(() => validarFechaCierre('2100-02-29', { ahora: AHORA }), 400, 'fecha_cierre_invalida');
});

test('Cursos fecha: nueva fecha pasada se rechaza aunque todavía sea hoy en UTC', () => {
  comprobarError(() => validarFechaCierre('2026-11-06', { ahora: AHORA }), 400, 'fecha_cierre_invalida');
  comprobarError(() => validarFechaCierre('2026-11-07', { ahora: MEDIANOCHE }), 400, 'fecha_cierre_invalida');
});

test('Cursos estado: permanece disponible hasta terminar el día local de cierre', () => {
  const actual = curso('publicado', '2026-11-07');
  assert.equal(obtenerEstadoCurso(actual, { ahora: AHORA }), 'disponible');
  assert.equal(obtenerEstadoCurso(actual, { ahora: MEDIANOCHE }), 'cerrado');
});

test('Cursos estado: fecha almacenada pasada es cierre válido, no entrada inválida', () => {
  assert.equal(obtenerEstadoCurso(curso('publicado', '2020-01-01'), { ahora: AHORA }), 'cerrado');
});

test('Cursos estado: reapertura por fecha futura o null, borrador no se publica', () => {
  assert.equal(obtenerEstadoCurso(curso('publicado', '2026-11-30'), { ahora: AHORA }), 'disponible');
  assert.equal(obtenerEstadoCurso(curso('publicado'), { ahora: AHORA }), 'disponible');
  assert.equal(obtenerEstadoCurso(curso('borrador', '2026-11-30'), { ahora: AHORA }), null);
});

test('Cursos estado: retirado tiene prioridad sobre cierre y borrador no tiene estado público', () => {
  assert.equal(obtenerEstadoCurso(curso('retirado', '2020-01-01'), { ahora: AHORA }), 'retirado');
  assert.equal(obtenerEstadoCurso(curso('borrador', '2020-01-01'), { ahora: AHORA }), null);
});

test('Cursos estado: fecha ausente representa curso sin fecha; tipo incorrecto no se convierte', () => {
  const actual = curso();
  delete actual.fecha_cierre;
  assert.equal(obtenerEstadoCurso(actual, { ahora: AHORA }), 'disponible');
  for (const valor of [new Date(), '2026-02-30', '', 123]) {
    actual.fecha_cierre = valor;
    assert.throws(() => obtenerEstadoCurso(actual, { ahora: AHORA }), TypeError);
  }
});

test('Cursos estado: inexistencia y estado persistido desconocido se distinguen', () => {
  comprobarError(() => obtenerEstadoCurso(null), 404, 'curso_no_encontrado');
  assert.throws(() => obtenerEstadoCurso(curso('cerrado')), TypeError);
});

for (const estado of ['borrador', 'publicado']) {
  test(`Cursos permisos: maestro autor y administrador pueden editar ${estado}`, () => {
    const actual = curso(estado, '2020-01-01');
    assert.equal(puedeEditarCurso(MAESTRO, actual), true);
    assert.equal(puedeEditarCurso(ADMIN, actual), true);
    assert.doesNotThrow(() => validarEdicionCurso(MAESTRO, actual));
    assert.doesNotThrow(() => validarEdicionCurso(ADMIN, actual));
  });
}

test('Cursos permisos: maestro ajeno no puede modificar aunque vea el curso', () => {
  const ajeno = { ...MAESTRO, uid: 'otro-maestro' };
  assert.equal(puedeEditarCurso(ajeno, curso()), false);
  comprobarError(() => validarEdicionCurso(ajeno, curso()), 403, 'curso_ajeno');
});

test('Cursos permisos: creadoPor visible no se usa como credencial de autoría', () => {
  const actual = { estado_publicacion: 'borrador', creadoPor: MAESTRO.uid };
  assert.equal(puedeEditarCurso(MAESTRO, actual), false);
  comprobarError(() => validarEdicionCurso(MAESTRO, actual), 403, 'curso_ajeno');
});

test('Cursos permisos: autor y administrador no editan ni reactivan retirados', () => {
  for (const usuario of [MAESTRO, ADMIN]) {
    const actual = curso('retirado');
    assert.equal(puedeEditarCurso(usuario, actual), false);
    comprobarError(() => validarEdicionCurso(usuario, actual), 409, 'curso_retirado');
    comprobarError(() => validarCambioEstructural(usuario, actual, { tieneAvance: false }), 409, 'curso_retirado');
    comprobarError(() => validarDespublicacionCurso(usuario, actual, { tieneAvance: false }), 409, 'curso_retirado');
  }
});

for (const [usuario, codigo, estado] of [
  [null, 'perfil_no_registrado', 404],
  [{ ...MAESTRO, activo: false }, 'cuenta_desactivada', 403],
  [{ ...ADMIN, activo: false }, 'cuenta_desactivada', 403],
  [ALUMNO, 'rol_no_autorizado', 403],
  [{ ...MAESTRO, uid: '' }, 'rol_no_autorizado', 403],
  [{ ...ADMIN, uid: undefined }, 'rol_no_autorizado', 403]
]) {
  test(`Cursos permisos: rechaza editor inválido ${JSON.stringify(usuario)}`, () => {
    assert.equal(puedeEditarCurso(usuario, curso()), false);
    comprobarError(() => validarEdicionCurso(usuario, curso()), estado, codigo);
  });
}

test('Cursos permisos: curso ausente nunca concede edición', () => {
  assert.equal(puedeEditarCurso(ADMIN, null), false);
  comprobarError(() => validarEdicionCurso(ADMIN, null), 404, 'curso_no_encontrado');
});

test('Cursos estructura: borrador propio sin avance permite cambios', () => {
  for (const usuario of [MAESTRO, ADMIN]) {
    assert.doesNotThrow(() => validarCambioEstructural(usuario, curso('borrador'), { tieneAvance: false }));
  }
});

test('Cursos estructura: borrador con avance bloquea estructura', () => {
  comprobarError(() => validarCambioEstructural(MAESTRO, curso('borrador'), { tieneAvance: true }), 409, 'curso_con_avance');
});

test('Cursos estructura: publicado bloquea con y sin avance, incluso para administrador', () => {
  for (const usuario of [MAESTRO, ADMIN]) {
    for (const tieneAvance of [true, false]) {
      comprobarError(() => validarCambioEstructural(usuario, curso(), { tieneAvance }), 409, 'curso_publicado');
    }
  }
});

test('Cursos estructura: permisos por autor se comprueban antes de permitir cambios', () => {
  comprobarError(() => validarCambioEstructural({ ...MAESTRO, uid: 'ajeno' }, curso('borrador'), { tieneAvance: false }), 403, 'curso_ajeno');
});

test('Cursos despublicación: publicado sin avance vuelve a borrador; con avance se rechaza', () => {
  assert.doesNotThrow(() => validarDespublicacionCurso(MAESTRO, curso(), { tieneAvance: false }));
  comprobarError(() => validarDespublicacionCurso(ADMIN, curso(), { tieneAvance: true }), 409, 'curso_con_avance');
});

test('Cursos despublicación: borrador existente no implica un cambio estructural nuevo', () => {
  assert.doesNotThrow(() => validarDespublicacionCurso(MAESTRO, curso('borrador'), { tieneAvance: true }));
});

test('Cursos reglas sensibles: nunca suponen ausencia de avance por indicador omitido o ambiguo', () => {
  for (const regla of [validarCambioEstructural, validarDespublicacionCurso]) {
    assert.throws(() => regla(MAESTRO, curso('borrador')), TypeError);
    for (const tieneAvance of [undefined, null, 0, 1, 'false', 'true']) {
      assert.throws(() => regla(MAESTRO, curso('borrador'), { tieneAvance }), TypeError);
    }
  }
});

for (const [estado, fecha, tieneAvance, tieneHistorial, visible] of [
  ['publicado', null, false, false, true],
  ['publicado', '2026-11-30', false, false, true],
  ['publicado', '2020-01-01', false, false, false],
  ['publicado', '2020-01-01', true, false, true],
  ['retirado', null, false, false, false],
  ['retirado', null, false, true, true],
  ['retirado', '2020-01-01', false, true, true],
  ['retirado', null, true, false, false],
  ['borrador', null, false, false, false],
  ['borrador', null, true, true, false]
]) {
  test(`Cursos visibilidad: ${estado}, fecha ${fecha}, avance ${tieneAvance}, historial ${tieneHistorial} → ${visible}`, () => {
    assert.equal(puedeVerCursoEstudiante(ALUMNO, curso(estado, fecha), {
      tieneAvance, tieneHistorial, ahora: AHORA
    }), visible);
  });
}

test('Cursos visibilidad: historial y avance se refieren al alumno verificado, sin convertir indicadores ambiguos', () => {
  assert.equal(puedeVerCursoEstudiante(ALUMNO, curso('retirado')), false);
  assert.equal(puedeVerCursoEstudiante(ALUMNO, curso('publicado', '2020-01-01'), { ahora: AHORA }), false);
  assert.throws(() => puedeVerCursoEstudiante(ALUMNO, curso(), { tieneAvance: 'false' }), TypeError);
  assert.throws(() => puedeVerCursoEstudiante(ALUMNO, curso('retirado'), { tieneHistorial: 'false' }), TypeError);
});

test('Cursos visibilidad: rol incorrecto, cuenta inactiva o perfil ausente no ven catálogo del alumno', () => {
  for (const usuario of [null, MAESTRO, ADMIN, { ...ALUMNO, activo: false }, { ...ALUMNO, uid: '' }]) {
    assert.equal(puedeVerCursoEstudiante(usuario, curso()), false);
  }
  assert.equal(puedeVerCursoEstudiante(ALUMNO, null), false);
});

test('Cursos lección: disponible permite empezar o continuar sin imponer orden entre lecciones', () => {
  for (const tieneAvance of [false, true]) {
    assert.doesNotThrow(() => validarAccesoLeccion(ALUMNO, curso(), { tieneAvance, ahora: AHORA }));
  }
});

test('Cursos lección: cerrado rechaza empezar pero permite terminar con avance previo del curso', () => {
  const actual = curso('publicado', '2020-01-01');
  comprobarError(() => validarAccesoLeccion(ALUMNO, actual, { tieneAvance: false, ahora: AHORA }), 409, 'curso_cerrado');
  assert.doesNotThrow(() => validarAccesoLeccion(ALUMNO, actual, { tieneAvance: true, ahora: AHORA }));
});

test('Cursos lección: el primer guardado deja de permitirse al cruzar medianoche local', () => {
  const actual = curso('publicado', '2026-11-07');
  assert.doesNotThrow(() => validarAccesoLeccion(ALUMNO, actual, { tieneAvance: false, ahora: AHORA }));
  comprobarError(() => validarAccesoLeccion(ALUMNO, actual, { tieneAvance: false, ahora: MEDIANOCHE }), 409, 'curso_cerrado');
  assert.doesNotThrow(() => validarAccesoLeccion(ALUMNO, actual, { tieneAvance: true, ahora: MEDIANOCHE }));
});

test('Cursos lección: retirado no permite continuar aunque hubiera avance', () => {
  for (const tieneAvance of [false, true]) {
    comprobarError(() => validarAccesoLeccion(ALUMNO, curso('retirado'), { tieneAvance, ahora: AHORA }), 404, 'curso_retirado');
  }
});

test('Cursos lección: borrador no expone contenido aunque exista avance', () => {
  comprobarError(() => validarAccesoLeccion(ALUMNO, curso('borrador'), { tieneAvance: true, ahora: AHORA }), 404, 'leccion_no_encontrada');
});

test('Cursos lección: exige estudiante activo y perfil registrado', () => {
  comprobarError(() => validarAccesoLeccion(MAESTRO, curso(), { tieneAvance: false }), 403, 'rol_no_autorizado');
  comprobarError(() => validarAccesoLeccion({ ...ALUMNO, activo: false }, curso(), { tieneAvance: false }), 403, 'cuenta_desactivada');
  comprobarError(() => validarAccesoLeccion(null, curso(), { tieneAvance: false }), 404, 'perfil_no_registrado');
});

test('Cursos lección: avance omitido o no booleano no concede acceso', () => {
  assert.throws(() => validarAccesoLeccion(ALUMNO, curso()), TypeError);
  assert.throws(() => validarAccesoLeccion(ALUMNO, curso(), { tieneAvance: 'true' }), TypeError);
});

test('Cursos reglas: no modifican el curso, el usuario ni el reloj recibido', () => {
  const actual = curso('borrador', '2026-11-30');
  const usuario = { ...MAESTRO };
  const reloj = new Date(AHORA);
  const anteriores = structuredClone({ actual, usuario, reloj });
  obtenerEstadoCurso(actual, { ahora: reloj });
  puedeEditarCurso(usuario, actual);
  validarEdicionCurso(usuario, actual);
  validarCambioEstructural(usuario, actual, { tieneAvance: false });
  validarDespublicacionCurso(usuario, actual, { tieneAvance: false });
  validarFechaCierre(actual.fecha_cierre, { ahora: reloj });
  assert.deepEqual({ actual, usuario, reloj }, anteriores);
});
