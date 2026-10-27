function esperar(milisegundos) {
  return new Promise((resolver) => setTimeout(resolver, milisegundos))
}

export async function guardarPerfil({ nombreCompleto, apodo }) {
  await esperar(800)

  return {
    ok: true,
    usuario: { nombreCompleto, apodo },
  }
}
