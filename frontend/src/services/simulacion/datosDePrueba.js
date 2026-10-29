// DATOS DE PRUEBA para los servicios simulados del Sprint 3.
// Tienen exactamente la forma acordada en el contrato de la API.

export const categorias = [
  {
    idCategoria: 1,
    nombre: 'Banca móvil',
    cursos: [
      {
        idCurso: 1,
        titulo: 'Uso seguro de la aplicación del banco',
        descripcion: 'Aprende a entrar a tu banco desde el celular, revisar tu saldo y cuidar tus datos.',
        lecciones: [
          { idLeccion: 1, titulo: 'Abrir la aplicación de forma segura', duracionEstimadaMinutos: 10, estado: 'completada' },
          { idLeccion: 2, titulo: 'Consultar tu saldo y movimientos', duracionEstimadaMinutos: 12, estado: 'en_progreso' },
          { idLeccion: 3, titulo: 'Reconocer mensajes falsos del banco', duracionEstimadaMinutos: 15, estado: 'pendiente' },
        ],
      },
    ],
  },
  {
    idCategoria: 2,
    nombre: 'Pagos digitales',
    cursos: [
      {
        idCurso: 2,
        titulo: 'Pago de servicios en línea',
        descripcion: 'Practica cómo pagar la luz o el agua por internet, paso a paso y sin dinero real.',
        lecciones: [
          { idLeccion: 4, titulo: 'Leer tu recibo de luz', duracionEstimadaMinutos: 8, estado: 'pendiente' },
          { idLeccion: 5, titulo: 'Capturar la referencia de pago', duracionEstimadaMinutos: 10, estado: 'pendiente' },
          { idLeccion: 6, titulo: 'Guardar tu comprobante', duracionEstimadaMinutos: 8, estado: 'pendiente' },
        ],
      },
    ],
  },
]

export const TOTAL_LECCIONES_PUBLICADAS = 6

// ---------- Cuentas (GET /api/admin/usuarios) ----------

export const cuentas = [
  { uid: 'est-1', nombreCompleto: 'Rosa María Pérez Díaz', apodo: 'Rosa', rol: 'estudiante', activo: true },
  { uid: 'est-2', nombreCompleto: 'Carlos Hernández Ruiz', apodo: 'Don Carlos', rol: 'estudiante', activo: true },
  { uid: 'est-3', nombreCompleto: 'Teresa López Santiago', apodo: 'Tere', rol: 'estudiante', activo: true },
  { uid: 'est-4', nombreCompleto: 'José Juárez Martínez', apodo: null, rol: 'estudiante', activo: true },
  { uid: 'est-5', nombreCompleto: 'María Elena Cruz Vásquez', apodo: null, rol: 'estudiante', activo: true },
  { uid: 'est-6', nombreCompleto: 'Pedro García Morales', apodo: null, rol: 'estudiante', activo: false },
  { uid: 'mae-1', nombreCompleto: 'Luis Ramírez López', apodo: null, rol: 'maestro', activo: true },
  { uid: 'mae-2', nombreCompleto: 'Gabriela Méndez Ortiz', apodo: 'Gaby', rol: 'maestro', activo: true },
  { uid: 'adm-1', nombreCompleto: 'Ana Martínez Ruiz', apodo: 'Ana', rol: 'administrador', activo: true },
]


export const avancePorEstudiante = {
  'est-1': { leccionesCompletadas: 1, ultimaActividad: '2026-10-27T17:30:00.000Z' },
  'est-2': { leccionesCompletadas: 4, ultimaActividad: '2026-10-26T15:10:00.000Z' },
  'est-3': { leccionesCompletadas: 0, ultimaActividad: null },
  'est-4': { leccionesCompletadas: 6, ultimaActividad: '2026-10-25T19:45:00.000Z' },
  'est-5': { leccionesCompletadas: 2, ultimaActividad: '2026-10-27T14:00:00.000Z' },
  'est-6': { leccionesCompletadas: 0, ultimaActividad: null },
}

// ---------- Grupos (GET /api/grupos) ----------

export const grupos = [
  { idGrupo: 1, nombre: 'Grupo matutino', maestros: ['mae-1'], estudiantes: ['est-1', 'est-2', 'est-3'] },
  { idGrupo: 2, nombre: 'Grupo vespertino', maestros: ['mae-2'], estudiantes: ['est-4'] },
  { idGrupo: 3, nombre: 'Grupo sabatino', maestros: ['mae-1'], estudiantes: [] },
]

let siguienteIdGrupo = 4

export function nuevoIdGrupo() {
  return siguienteIdGrupo++
}



const ESPERA_MS = 600


export async function responder(valor) {
  await new Promise((resolver) => setTimeout(resolver, ESPERA_MS))
  return valor === undefined ? undefined : structuredClone(valor)
}

// Falla igual que solicitarApi: un Error con mensaje, estado y codigo
export async function fallar(mensaje, estado, codigo) {
  await new Promise((resolver) => setTimeout(resolver, ESPERA_MS))
  throw Object.assign(new Error(mensaje), { estado, codigo })
}

export function buscarCuenta(uid) {
  return cuentas.find((cuenta) => cuenta.uid === uid)
}

// true si "texto" aparece en "nombre", sin importar acentos ni mayúsculas
export function coincide(nombre, texto) {
  const normalizar = (valor) =>
    valor.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  return normalizar(nombre).includes(normalizar(texto.trim()))
}
