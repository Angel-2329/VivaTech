
const CODIGO_DE_PRUEBA = '123456'


const USUARIOS_DE_PRUEBA = {
  '9511111111': {
    uid: 'prueba-estudiante',
    nombreCompleto: 'Rosa María Pérez Díaz',
    apodo: 'Rosa',
    rol: 'estudiante',
  },
  '9512222222': {
    uid: 'prueba-maestro',
    nombreCompleto: 'Luis Ramírez López',
    apodo: null,
    rol: 'maestro',
  },
  '9513333333': {
    uid: 'prueba-administrador',
    nombreCompleto: 'Ana Martínez Ruiz',
    apodo: 'Ana',
    rol: 'administrador',
  },
}

function esperar(milisegundos) {
  return new Promise((resolver) => setTimeout(resolver, milisegundos))
}

export async function enviarCodigo(telefono) {
  await esperar(800)
  console.info(`[Simulación] Código para ${telefono}: ${CODIGO_DE_PRUEBA}`)
  return { ok: true }
}

export async function verificarCodigo(telefono, codigo) {
  await esperar(800)

  if (codigo !== CODIGO_DE_PRUEBA) {
    return {
      ok: false,
      mensaje: 'El código no coincide. Revisa el mensaje e inténtalo otra vez.',
    }
  }

  const existente = USUARIOS_DE_PRUEBA[telefono]

  if (existente) {
    return { ok: true, usuario: { ...existente } }
  }

  
  return {
    ok: true,
    usuario: {
      uid: `prueba-${telefono}`,
      nombreCompleto: null,
      apodo: null,
      rol: 'estudiante',
    },
  }
}
