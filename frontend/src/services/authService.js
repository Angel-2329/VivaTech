// SIMULACIÓN del acceso con SMS.

const CODIGO_DE_PRUEBA = '123456'

// Números de prueba para ver cómo entra cada rol.
const USUARIOS_DE_PRUEBA = {
  '9511111111': { nombre: 'Rosa', rol: 'estudiante' },
  '9512222222': { nombre: 'Luis Ramírez', rol: 'maestro' },
  '9513333333': { nombre: 'Ana', rol: 'administrador' },
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
    return { ok: true, usuario: { telefono, ...existente, primerAcceso: false } }
  }

  return {
    ok: true,
    usuario: { telefono, nombre: '', rol: 'estudiante', primerAcceso: true },
  }
}
