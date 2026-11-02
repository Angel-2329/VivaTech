# Viva Tech

Plataforma educativa para la alfabetización digital de personas adultas, con enfoque en simplicidad, seguridad y accesibilidad.

El proyecto se desarrolla con Scrum, un modelo de prototipos, cinco integrantes, nueve semanas operativas y cuatro sprints.

## Estado del prototipo

Funcionalidades implementadas y conectadas a la API real:

- Acceso telefónico mediante Firebase Authentication.
- Solicitud, confirmación y reenvío del código.
- Registro de nombre completo obligatorio y apodo opcional.
- Consulta y actualización del perfil mediante la API.
- Recuperación y cierre de sesión.
- Navegación según los roles estudiante, maestro y administrador.
- Rechazo de cuentas desactivadas.
- Manejo de errores de conexión y reintento.
- Script para configurar el primer administrador.
- Script de carga de las categorías iniciales aprobadas.
- Consulta administrativa de cuentas, búsqueda por nombre, filtro por rol y paginación.
- Cambio de roles y desactivación/reactivación de otras cuentas, sujetos a las restricciones del backend.
- Creación, listado, renombrado y eliminación de grupos sin estudiantes asignados.
- Acceso del maestro únicamente a sus grupos asignados y acceso del administrador a todos los grupos.
- Asignación y retiro de estudiantes; asignación y retiro de maestros únicamente por administrador.
- Resumen administrativo con desglose de cuentas activas y desactivadas.
- Consulta de progreso por grupo y progreso general desde PostgreSQL, sin duplicar finalizaciones por pertenencia a varios grupos.
- Paneles administrativos y de grupos conectados mediante `adminService.js` y `gruposService.js`, incluyendo respuestas DELETE 204 sin contenido.

### Experiencia del estudiante y alcance pendiente

El acceso, el perfil, el rol, el estado de cuenta y la protección de rutas del estudiante son reales. Sin embargo, `cursosService.js` permanece simulado durante el sprint 3: las categorías, cursos, lecciones y el avance educativo que presenta esa interfaz no constituyen actividad educativa guardada en PostgreSQL.

La implementación real de `GET /api/mis-cursos` está prevista para el sprint 4. La carga de categorías iniciales no crea ni publica automáticamente cursos o lecciones.

Las consultas de progreso de maestros y administradores sí leen PostgreSQL. Esto no significa que ya esté implementado el recorrido educativo que genera y guarda automáticamente ese progreso. Sin lecciones publicadas consideradas o sin registros de progreso, las consultas devuelven ceros y última actividad nula según corresponda.

La emisión de certificados y QR no forma parte de la implementación de este sprint. Las funcionalidades completas de PWA y el despliegue siguen pendientes de sus etapas correspondientes.

El prototipo cuenta con verificaciones locales y limitaciones explícitas; no está validado como listo para producción ni acredita conformidad completa con WCAG 2.2 AA. El merge a `integracion` no sustituye las pruebas conjuntas ni la aceptación formal del incremento.

## Tecnologías

- Frontend: React, Vite y React Router.
- Backend: Node.js y Express.
- Base de datos: PostgreSQL.
- Autenticación: Firebase Authentication.
- Verificación de tokens: Firebase Admin SDK.

PostgreSQL almacena los perfiles de la aplicación. El número telefónico es administrado por Firebase Authentication y no se almacena en la tabla de usuarios.

No se utiliza Firestore como base de datos de la aplicación.

## Estructura

```text
VivaTech/
├── frontend/
│   ├── public/
│   └── src/
│       ├── components/
│       ├── config/
│       ├── context/
│       ├── hooks/
│       ├── pages/
│       ├── services/
│       ├── styles/
│       └── utils/
├── backend/
│   ├── migrations/
│   ├── scripts/
│   ├── src/
│   │   ├── config/
│   │   ├── middlewares/
│   │   ├── routes/
│   │   └── services/
│   └── test/
├── docs/
│   └── bruno/
│       └── VivaTech API/
└── README.md
```

## Requisitos

- Node.js y npm.
- PostgreSQL en ejecución.
- Un proyecto Firebase con Authentication por teléfono habilitado.
- Configuración de una aplicación web en ese proyecto.

El entorno de trabajo reportado utiliza Node.js 24.18.0. Se recomienda mantener la misma versión en el equipo y respetar los requisitos de las dependencias instaladas.

Para desarrollo local se utilizan números ficticios configurados en Firebase, no teléfonos personales.

## Instalación de dependencias

El frontend y el backend tienen sus propios archivos `package.json`. No se instalan las dependencias desde la raíz.

Desde la raíz del repositorio:

```powershell
cd frontend
npm ci
```

En otra terminal, también desde la raíz:

```powershell
cd backend
npm ci
```

`npm ci` utiliza las versiones registradas en cada `package-lock.json`.

Si npm informa scripts pendientes de autorización, revisarlos antes de permitir su ejecución. No autorizar todos automáticamente ni ejecutar `npm audit fix --force` sin analizar sus efectos.

## Configuración del frontend

Crear `frontend/.env.local` tomando como referencia `frontend/.env.example`.

Variables necesarias:

```env
VITE_FIREBASE_API_KEY=tu-api-key-web
VITE_FIREBASE_AUTH_DOMAIN=tu-proyecto.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=tu-id-de-proyecto
VITE_FIREBASE_APP_ID=tu-app-id-web
VITE_FIREBASE_AUTH_TESTING=true

VITE_API_URL=http://localhost:3000/api
```

Los valores de Firebase deben pertenecer a la aplicación web del proyecto utilizado por el backend.

- Vite carga `.env.local`.
- Las variables `VITE_*` pueden quedar expuestas en el código del navegador: no colocar claves privadas ni credenciales de Firebase Admin.
- `VITE_API_URL` incluye `/api`; los servicios agregan rutas como `/perfil`.
- Reiniciar Vite después de modificar las variables.

### Modo de prueba de Firebase

Con `VITE_FIREBASE_AUTH_TESTING=true` y Vite en desarrollo, se activa la verificación de aplicación de prueba.

Este modo:

- Requiere números ficticios y códigos configurados en Firebase Console.
- No envía SMS reales a esos números.
- No sustituye Firebase por el antiguo simulador.
- No demuestra el funcionamiento del reCAPTCHA real.

El código restringe esta opción a `import.meta.env.DEV`. No se activa en una compilación de producción.

La prueba de reCAPTCHA real con el modo de prueba desactivado sigue pendiente en un entorno autorizado.

## Configuración del backend

Crear `backend/.env` tomando como referencia `backend/.env.example`.

Ejemplo:

```env
DATABASE_URL=postgresql://USUARIO:CONTRASENA@localhost:5432/BASE_DE_DESARROLLO
FIREBASE_PROJECT_ID=tu-id-de-proyecto
FRONTEND_ORIGIN=http://localhost:5173
PORT=3000
NODE_ENV=development
```

- El backend carga `.env` mediante dotenv; no carga automáticamente `.env.local` como Vite.
- `DATABASE_URL` debe apuntar a la base autorizada.
- `FIREBASE_PROJECT_ID` debe coincidir con el proyecto del frontend.
- `FRONTEND_ORIGIN` debe coincidir exactamente con el origen de Vite, sin barra final.
- Reiniciar el backend después de modificar las variables.

No subir archivos de entorno reales, contraseñas, tokens ni credenciales privadas al repositorio.

## Migraciones

Crear primero la base de datos y configurar su conexión.

Para aplicar las migraciones, desde `backend`:

```powershell
npm run migrate:up
```

### Advertencia sobre la reversión

```powershell
npm run migrate:down
```

revierte la última migración aplicada. La reversión de la migración inicial elimina las tablas del esquema de la aplicación y sus datos.

No ejecutarla para arrancar el proyecto, resolver errores de acceso ni sobre una base con información que deba conservarse.

La edición de la migración inicial se acordó durante el prototipo, cuando no había datos reales. No debe utilizarse como estrategia de actualización de una base con datos reales.

## Ejecución local

Mantener dos terminales abiertas.

### Backend

Desde `backend`:

```powershell
npm run dev
```

Puerto predeterminado: `3000`.

Para ejecutar sin nodemon:

```powershell
npm start
```

### Frontend

Desde `frontend`:

```powershell
npm run dev
```

Abrir la dirección que indique Vite. Si utiliza un puerto distinto de `5173`, ajustar `FRONTEND_ORIGIN` en el backend y reiniciarlo.

## API de perfil

Las rutas requieren:

```text
Authorization: Bearer TOKEN_DE_FIREBASE
```

El frontend obtiene el token desde Firebase Authentication. No se almacena manualmente en `localStorage` ni debe imprimirse.

| Método | Ruta | Función |
|---|---|---|
| GET | `/api/perfil` | Consultar el perfil autenticado |
| POST | `/api/perfil` | Crear el perfil |
| PATCH | `/api/perfil` | Actualizar nombre completo o apodo |

Formato de perfil:

```json
{
  "uid": "uid-del-usuario",
  "nombreCompleto": "Persona de Prueba",
  "apodo": null,
  "rol": "estudiante"
}
```

Reglas principales:

- El UID procede del token verificado.
- El nombre completo es obligatorio, entre 3 y 100 caracteres después de quitar espacios externos.
- El apodo es opcional, de hasta 30 caracteres.
- El apodo vacío se guarda como `NULL`.
- El perfil nuevo recibe el rol estudiante.
- Las rutas de perfil no permiten asignar roles ni cambiar el estado activo.
- PATCH conserva los campos omitidos.

Los errores controlados utilizan:

```json
{
  "ok": false,
  "mensaje": "Descripción del problema",
  "codigo": "codigo_opcional"
}
```

Casos relevantes:

- `404 perfil_no_registrado`: identidad autenticada sin perfil.
- `409 perfil_existente`: intento de creación duplicada.
- `403 cuenta_desactivada`: perfil desactivado.
- `401`: autenticación ausente o rechazada.
- `503`: imposibilidad de completar una operación por un fallo del servicio.

Una falla de conexión no se interpreta como primer acceso.

## API de usuarios y administración

Estas rutas requieren un token de Firebase mediante `Authorization: Bearer ...`. El backend obtiene el rol y el estado de la cuenta desde PostgreSQL; el cliente no concede permisos enviando un rol en el cuerpo o en los filtros.

| Método | Ruta | Acceso y función |
|---|---|---|
| GET | `/api/estudiantes` | Maestro o administrador: buscar estudiantes activos por nombre completo para agregarlos a grupos; no devuelve su progreso |
| GET | `/api/admin/usuarios` | Administrador: consultar cuentas activas y desactivadas, con búsqueda y filtro opcional de rol |
| PATCH | `/api/admin/usuarios/:uid/rol` | Administrador: cambiar el rol de otra cuenta, sujeto a sus participaciones en grupos |
| PATCH | `/api/admin/usuarios/:uid/activo` | Administrador: desactivar o reactivar otra cuenta |
| GET | `/api/admin/resumen` | Administrador: consultar totales y desglose de cuentas |
| GET | `/api/admin/progreso` | Administrador: consultar progreso de estudiantes, tengan grupo o no |

### Búsqueda, filtro de rol y paginación

`GET /api/estudiantes`, `GET /api/admin/usuarios` y `GET /api/admin/progreso` reciben parámetros de consulta en la URL, no en encabezados:

| Parámetro | Comportamiento |
|---|---|
| `buscar` | Un solo texto de hasta 100 caracteres; se quitan espacios exteriores y se busca literalmente dentro del nombre completo, sin distinguir mayúsculas; vacío u omitido no restringe por nombre |
| `limite` | Entero de 1 a 100; predeterminado 50 |
| `desplazamiento` | Entero de 0 a 2147483647; predeterminado 0 |

Solo `GET /api/admin/usuarios` incorpora además `rol`: `estudiante`, `maestro` o `administrador`, en minúsculas. Se quitan espacios exteriores; vacío u omitido no filtra por rol. Un valor inválido o varios valores de `rol` producen `400 rol_invalido`.

Ejemplo:

```text
GET /api/admin/usuarios?buscar=Persona&rol=estudiante&limite=20&desplazamiento=0
```

Los filtros se aplican antes de paginar. Las respuestas son listas, ordenadas por nombre completo sin distinguir mayúsculas y por UID como desempate; no incluyen un total global de resultados. No asumir que una sola página contiene todas las cuentas.

La interfaz de Cuentas y Progreso muestra 20 registros por página. Solicita hasta 21 para detectar una página siguiente, muestra solo los primeros 20 y avanza el desplazamiento de 20 en 20. Una búsqueda nueva reinicia la página. Los buscadores de participantes utilizan el mismo tamaño; al buscar maestros, determinan si hay otra página antes de ocultar candidatos desactivados.

### Cambio de rol y estado

Los cuerpos de las operaciones de cambio son:

```json
{ "rol": "maestro" }
```

```json
{ "activo": false }
```

- El administrador no puede modificar su propio rol ni estado desde estas rutas: `403 modificacion_propia_no_permitida`.
- Para cambiar efectivamente el rol de una persona, primero debe retirarse de sus participaciones como estudiante o maestro en grupos; de lo contrario se responde `409 usuario_en_grupos`.
- Desactivar no elimina el perfil, las asignaciones ni el progreso. Una cuenta desactivada no puede utilizar la plataforma.
- El backend vuelve a comprobar los permisos del administrador dentro de la transacción y bloquea las cuentas involucradas en orden por UID.
- Las operaciones exitosas devuelven el usuario actualizado como JSON.

### Resumen administrativo

`GET /api/admin/resumen` devuelve un objeto con los campos numéricos:

```json
{
  "totalEstudiantes": 0,
  "estudiantesActivos": 0,
  "estudiantesInactivos": 0,
  "totalMaestros": 0,
  "maestrosActivos": 0,
  "maestrosInactivos": 0,
  "totalGrupos": 0,
  "totalLeccionesPublicadas": 0,
  "leccionesCompletadas": 0
}
```

Los valores anteriores son ilustrativos. Cada total de personas suma sus cuentas activas y desactivadas. Los conteos se calculan desde la base, sin columnas adicionales para almacenarlos.

`leccionesCompletadas` cuenta los registros completados considerados de cuentas cuyo rol actual sea `estudiante`, activas o desactivadas y con grupo o sin grupo. Pertenecer a varios grupos no multiplica sus finalizaciones. Cambiar de rol no borra el historial, pero ese historial deja de formar parte de este total mientras la cuenta no tenga rol de estudiante.

### Progreso general y última actividad

Cada elemento de `GET /api/admin/progreso` tiene esta estructura ilustrativa:

```json
{
  "uid": "uid-ilustrativo",
  "nombreCompleto": "Estudiante de Prueba",
  "activo": true,
  "grupos": [],
  "leccionesCompletadas": 0,
  "totalLeccionesPublicadas": 0,
  "ultimaActividad": null
}
```

- Incluye cuentas con rol actual de estudiante, activas y desactivadas, incluso sin grupos ni progreso.
- Solo considera lecciones publicadas que pertenezcan a cursos publicados. Una lección publicada en un curso borrador se excluye.
- Las finalizaciones se cuentan por estudiante y lección, no por asignación a grupo.
- `ultimaActividad` es la mayor `fecha_actualizacion` de su progreso considerado, incluyendo estado `en_progreso` y `completada`; no representa inicio de sesión, navegación ni cambios de perfil.
- Las fechas se transmiten en ISO 8601. Si no hay progreso considerado, se devuelve `null` y la interfaz muestra “Sin actividad registrada”.
- Si no hay lecciones consideradas, el total y las finalizaciones son cero. La interfaz informa “Todavía no hay lecciones publicadas”, sin dividir por cero.

## API de grupos y participantes

Estas rutas requieren autenticación y una cuenta activa con rol autorizado. `creado_por` registra la autoría del grupo; no sustituye la asignación en `grupo_maestros`. El maestro opera únicamente sobre grupos donde está asignado. El administrador puede operar sobre todos los grupos.

| Método | Ruta | Acceso | Éxito |
|---|---|---|---|
| GET | `/api/grupos` | Maestro: sus grupos; administrador: todos | 200, lista de grupos |
| POST | `/api/grupos` | Maestro o administrador | 201, grupo creado |
| PATCH | `/api/grupos/:idGrupo` | Maestro asignado o administrador | 200, grupo actualizado |
| DELETE | `/api/grupos/:idGrupo` | Maestro asignado o administrador | 204, sin cuerpo |
| GET | `/api/grupos/:idGrupo` | Maestro asignado o administrador | 200, detalle del grupo |
| POST | `/api/grupos/:idGrupo/estudiantes` | Maestro asignado o administrador | 201, estudiante asignado con su progreso |
| DELETE | `/api/grupos/:idGrupo/estudiantes/:uid` | Maestro asignado o administrador | 204, sin cuerpo |
| POST | `/api/grupos/:idGrupo/maestros` | Solo administrador | 201, `{ uid, nombreCompleto }` |
| DELETE | `/api/grupos/:idGrupo/maestros/:uid` | Solo administrador | 204, sin cuerpo |

### Identificadores, nombre y creación

- `idGrupo` se devuelve como cadena decimal en JSON para conservar la precisión de BIGINT. Las rutas aceptan identificadores positivos sin ceros iniciales, hasta `9223372036854775807`; un valor inválido produce `400 id_grupo_invalido`.
- No convertir el identificador a `Number` para compararlo, guardarlo o construir rutas en el cliente.
- Crear y renombrar reciben `{ "nombre": "Grupo matutino" }`.
- El nombre debe tener de 1 a 100 caracteres después de quitar espacios iniciales y finales. Se conservan los espacios interiores; no se exige unicidad del nombre.
- El formulario y el backend cuentan los puntos de código del texto mediante `Array.from`. Un nombre inválido produce `400 nombre_grupo_invalido`.
- Si crea un maestro, el grupo y su autoasignación se guardan dentro de la misma transacción. Crear como administrador no lo asigna automáticamente como maestro.
- Un maestro que solicita un grupo ajeno recibe `404 grupo_no_encontrado`, igual que un grupo inexistente para un solicitante autorizado. Esto no sustituye los rechazos 401 por autenticación o 403 por rol o estado no permitido.

Ejemplo ilustrativo de un elemento del listado, creación o renombrado:

```json
{
  "idGrupo": "3",
  "nombre": "Grupo matutino",
  "totalEstudiantes": 1,
  "maestros": [
    {
      "uid": "uid-maestro-ilustrativo",
      "nombreCompleto": "Maestro de Prueba"
    }
  ]
}
```

`totalEstudiantes` cuenta las asignaciones existentes, incluidas las de cuentas desactivadas, sin multiplicarlas por el número de maestros.

### Detalle y progreso del grupo

Ejemplo ilustrativo:

```json
{
  "idGrupo": "3",
  "nombre": "Grupo matutino",
  "totalLeccionesPublicadas": 0,
  "maestros": [
    {
      "uid": "uid-maestro-ilustrativo",
      "nombreCompleto": "Maestro de Prueba"
    }
  ],
  "estudiantes": [
    {
      "uid": "uid-estudiante-ilustrativo",
      "nombreCompleto": "Estudiante de Prueba",
      "apodo": null,
      "activo": true,
      "leccionesCompletadas": 0,
      "ultimaActividad": null
    }
  ]
}
```

El detalle conserva estudiantes sin actividad y estudiantes desactivados ya asignados, mostrando su estado. Los cálculos utilizan las mismas reglas de publicación y última actividad de la consulta general. El progreso pertenece al estudiante y a la lección, no se duplica por cada grupo. El contrato del maestro asignado mantiene únicamente `uid` y `nombreCompleto`, sin agregar automáticamente `activo`.

### Asignación y retiro

Los POST de asignación reciben un objeto JSON con un solo UID destinatario:

```json
{ "uid": "uid-del-participante" }
```

- Para nuevas asignaciones, el estudiante o maestro debe existir, tener el rol correspondiente y estar activo. No se cambia su rol para permitir la asignación.
- Se registra al solicitante como `asignado_por`.
- Antes de consultar la cuenta destinataria, el servicio comprueba el acceso al grupo; vuelve a validar permisos y acceso en la operación protegida.
- Las cuentas involucradas se bloquean en orden por UID antes de bloquear el grupo, siguiendo un orden compatible con las operaciones administrativas. La existencia de estos bloqueos no acredita que la concurrencia real esté verificada.
- La validación del rol y estado destinatarios precede al control de duplicados.
- Solo el administrador asigna o retira maestros. No se exige conservar al menos un maestro: puede retirar la última asignación sin eliminar el grupo.
- Se permite retirar asignaciones de cuentas desactivadas. Retirar no elimina perfiles ni progreso y no reactiva la cuenta.
- Retirar una asignación de maestro le quita acceso a ese grupo, aunque conserve su rol y estado activo.

Errores de negocio relevantes:

| Situación | HTTP y código |
|---|---|
| UID ausente o inválido | 400 `uid_invalido` |
| Grupo no disponible | 404 `grupo_no_encontrado` |
| Cuenta destinataria inexistente al asignar | 404 `usuario_no_encontrado` |
| Rol destinatario incorrecto | 400 `usuario_no_es_estudiante` o `usuario_no_es_maestro` |
| Cuenta destinataria desactivada al asignar | 403 `cuenta_desactivada` |
| Asignación duplicada | 409 `estudiante_ya_asignado` o `maestro_ya_asignado` |
| Asignación inexistente al retirar | 404 `asignacion_no_encontrada` |

### Eliminación de grupos y respuestas vacías

No se elimina un grupo mientras tenga estudiantes asignados, activos o desactivados: la API responde `409 grupo_con_participantes`. Si no tiene estudiantes, se retiran las asignaciones de maestros y se elimina el grupo dentro de la misma transacción. No se eliminan perfiles ni progreso, y se conservan las claves foráneas con `ON DELETE RESTRICT`.

La interfaz puede impedir la confirmación cuando su listado ya muestra estudiantes, pero el backend vuelve a comprobar la regla para no depender de información desactualizada del navegador.

Los DELETE exitosos de grupos y participantes responden `204 No Content`, sin JSON. `solicitarApi` devuelve `undefined` antes de intentar leer el cuerpo; los consumidores no deben exigir un objeto de respuesta ni mostrar un error por su ausencia. Las respuestas no exitosas conservan el manejo de errores de la API.

## Primer administrador

El script es una herramienta operativa de preparación inicial, no una ruta pública ni un sustituto de la gestión de roles que ya ofrece la interfaz administrativa.

Antes de utilizarlo:

1. Acceder mediante Firebase.
2. Registrar el perfil desde la interfaz.
3. Obtener el UID del usuario en Firebase Authentication.
4. Confirmar que se trata de la cuenta autorizada para la configuración inicial y que no participa en grupos.

Desde `backend`:

```powershell
npm run crear-admin -- "UID_DEL_USUARIO"
```

Sustituir el texto entre comillas por el UID real del usuario. No utilizar el identificador del proyecto ni escribir los signos `< >`.

El script cambia el rol de un perfil existente; no crea usuarios ni perfiles. Ejecutarlo solo como parte de la configuración inicial autorizada.

El código actual no impone una única ejecución ni comprueba que sea el primer administrador de la base. Las restricciones de uso inicial y de ausencia de participaciones deben respetarse como precondiciones operativas; no asumir que el script aplica las mismas comprobaciones de las rutas administrativas.

No publicar su salida con datos de usuarios.

## Categorías iniciales

Las categorías aprobadas se cargan durante la preparación de la plataforma y no se crean desde la interfaz. Este comando necesita acceso autorizado al backend y a su configuración de PostgreSQL; el UID identifica al creador y no funciona como contraseña.

Antes de utilizarlo:

1. Aplicar las migraciones sobre la base autorizada.
2. Contar con un perfil existente de administrador activo.
3. Comprobar que la conexión corresponde al entorno donde se autoriza cargar los datos.

Desde `backend`:

```powershell
npm run cargar-categorias -- "UID_DEL_ADMINISTRADOR"
```

Sustituir el marcador localmente. No guardar UID reales en scripts, documentación, capturas o archivos de entorno compartidos. El comando carga:

| Nombre | Orden |
|---|---:|
| Banca móvil | 1 |
| Pagos digitales | 2 |

- El creador de las categorías nuevas es el administrador activo indicado.
- Ambas categorías se procesan en una transacción. Durante la comprobación y carga se bloquean escrituras concurrentes sobre `categorias`; no se presenta este mecanismo como patrón general para las operaciones habituales.
- Si ya existe una categoría con el nombre y orden esperados, se conserva sin actualizar su autoría ni los demás campos.
- Si falta una categoría y el estado existente es compatible, se inserta únicamente la faltante.
- Si un nombre corresponde a otro orden, un orden está ocupado por otro nombre o existen coincidencias incompatibles, se rechaza la carga y se solicita revertir la transacción, sin sobrescribir esos datos.
- Una ejecución inicial sobre categorías vacías informa `Creadas: 2. Ya existentes: 0.`; una repetición compatible informa `Creadas: 0. Ya existentes: 2.`.
- El comando sin UID muestra su uso y termina con código de salida 1. Una cuenta inexistente, desactivada o sin rol de administrador se rechaza.
- La carga no crea ni publica cursos o lecciones y no genera progreso. No ejecutar migraciones destructivas para repetirla.

## Comprobaciones y pruebas

### Frontend

Desde `frontend`:

```powershell
npm run lint
npm run build
npm audit
```

La compilación genera `frontend/dist`, que no debe incluirse en el repositorio. Lint y compilación se ejecutaron satisfactoriamente por el desarrollador durante la conexión del sprint 3. La salida compartida de la compilación no mostró advertencias.

`npm audit` es una comprobación adicional recomendada; no se reportó una ejecución nueva durante este cierre. El resultado de auditoría mencionado en la sección del override corresponde a evidencia histórica y no garantiza el estado actual de las dependencias.

### Backend

Desde `backend`:

```powershell
npm test
```

La última ejecución compartida por el desarrollador durante la conexión del sprint 3 reportó 230 pruebas aprobadas, 0 fallidas, 0 omitidas y 0 canceladas. No se afirma que GitHub Actions u otro servicio haya ejecutado automáticamente esa suite ni que exista una ejecución posterior sobre cada merge.

| Área | Pruebas |
|---|---:|
| Suite anterior y ampliación del filtro administrativo de rol | 88 |
| Permisos y validaciones de grupos | 58 |
| Recorridos transaccionales de gestión básica de grupos | 11 |
| Asignación y retiro de participantes | 31 |
| Resumen y progreso administrativo | 22 |
| Categorías iniciales | 20 |
| **Total** | **230** |

Las pruebas utilizan Firebase y PostgreSQL simulados según el archivo; las del script de categorías inyectan un pool simulado. Comprueban validaciones, respuestas, parámetros y orden de consultas, confirmación o reversión solicitada y liberación de conexiones. No ejecutan migraciones ni la colección de Bruno y no sustituyen las pruebas con servicios reales.

Un `ROLLBACK` solicitado a un cliente simulado no demuestra la reversión real de PostgreSQL. Los cambios simulados de permisos no prueban concurrencia real. Las comprobaciones sobre el texto SQL y las filas simuladas no recalculan agregados en una base real. El comando operativo completo de categorías y su entorno tampoco quedan cubiertos solo por las pruebas de su función exportada.

### Pruebas manuales realizadas

Las pruebas de esta sección fueron ejecutadas y reportadas por el desarrollador; no se atribuyen al asistente. Son escenarios seleccionados, no una ejecución automática completa de todos los recorridos.

Antecedentes de acceso y perfiles del sprint 2:

- Acceso con los tres roles.
- Primer acceso, validación y registro del perfil.
- Acceso de una persona con perfil existente.
- Código incorrecto y posterior confirmación correcta.
- Reenvío y cambio de número.
- Recuperación y cierre de sesión.
- Restricción de rutas de interfaz sin sesión.
- Cuenta desactivada y posterior reactivación.
- Recuperación mediante reintento tras detener y reiniciar el backend.
- Uso con teclado.
- Zoom del navegador al 200 %.
- Redistribución de los pasos de acceso a 320 píxeles CSS.
- Identificación de controles y anuncios de errores con Narrador de Windows.

Verificaciones de API y conexión del sprint 3:

- Categorías: carga inicial, repetición sin duplicados, rechazo de UID inexistente o cuenta sin rol de administrador, conflicto de datos y restauración de los datos temporales.
- Grupos: creación por administrador y maestro, autoasignación del maestro, listado por asignación, renombrado, validaciones y rechazo de grupo ajeno.
- Participantes: asignación por rol permitido, rechazo de duplicados, cuentas inexistentes, roles incorrectos y UID ausente; retiro y asignación inexistente.
- Estudiantes desactivados conservados en el detalle consultado por API y bloqueo de eliminación del grupo con estudiantes activos o desactivados.
- Maestros: asignación y retiro exclusivamente administrativos, conservación de la asignación al desactivar la cuenta, retiro de maestro desactivado y pérdida de acceso después de retirarlo y reactivarlo.
- Resumen contrastado con PostgreSQL; búsqueda, filtros y paginación de las rutas administrativas.
- Con dos cursos y cuatro lecciones temporales: exclusión de lección borrador y de lección publicada en curso borrador, dos lecciones consideradas, una finalización y última actividad de una lección visible en progreso.
- Registros excluidos con fechas posteriores no alteraron la última actividad considerada.
- Estudiante en dos grupos sin duplicación del progreso o de finalizaciones en el resumen; consistencia con el detalle de grupo.
- Retiro de asignaciones con conservación comprobada de los cuatro registros temporales de progreso y consulta general del estudiante sin grupos.
- Desde las pantallas conectadas: lectura de cuentas, filtros y búsqueda, estado vacío, desactivación/reactivación, cambio temporal de rol y retirada del resultado que deja de cumplir el filtro.
- Actualización del resumen y visibilidad del estudiante desactivado en Progreso; restauración posterior del estado activo y rol de las cuentas.
- Caída temporal del backend y recuperación mediante Reintentar, sin tratar el error como una consulta vacía exitosa.
- Paginación de Cuentas y Progreso con 21 perfiles ficticios: 20 resultados en Página 1 y uno en Página 2, sin duplicados, retorno y reinicio a Página 1 al buscar.
- Desde las pantallas: creación, persistencia y renombrado del grupo, búsqueda y asignación de participantes, bloqueo visual de eliminación con estudiantes, acceso del maestro y pérdida de acceso al retirar su asignación.
- Retiro de estudiante por maestro, retiro de maestro activo por administrador y eliminación del grupo vacío, sin mostrar errores al procesar respuestas vacías. No se registró una comprobación directa en Network del HTTP 204 durante esos recorridos de navegador.
- Limpieza verificada de los cursos, lecciones, progresos, grupos, asignaciones y perfiles ficticios utilizados; categorías y cuentas originales conservadas.

Comprobaciones de accesibilidad y navegador durante la conexión:

- En Cuentas, diálogo de desactivación cancelado con teclado: foco visible, entrada al diálogo, contención con Tab y Shift+Tab, cierre con Escape y retorno al botón que lo abrió.
- Cuentas con zoom del navegador al 200 %, sin pérdida de contenido o funcionalidad reportada.
- Cuentas a 320 píxeles CSS de ancho, con redistribución y controles accesibles reportados. No se generaliza ese resultado a todas las pantallas.
- Consola sin errores nuevos tras limpiar mensajes, recargar y realizar la consulta de Cuentas revisada.

Estas comprobaciones son evidencia parcial y no constituyen una evaluación completa de conformidad WCAG 2.2 AA. La verificación ampliada con lector de pantalla de los recorridos nuevos sigue pendiente; la evidencia de Narrador del sprint 2 no se presenta como una prueba nueva de los paneles.

Limitaciones de esta evidencia:

- Las variantes concretas de algunas pruebas de desplazamiento de API no se registraron; no se atribuye una variante específica. La navegación integrada de Cuentas y Progreso con 21 perfiles sí se comprobó de forma explícita.
- Faltan varias páginas en los buscadores de participantes, especialmente con candidatos maestros desactivados entre resultados.
- Falta comprobar desde la interfaz conectada el estudiante desactivado en el detalle de grupo. Su conservación sí se verificó previamente por API.
- La consulta general incluyó un estudiante desactivado sin progreso educativo; falta ese escenario con progreso existente y la verificación del criterio de rol actual mediante datos de progreso y cambio de rol.
- La normalización de espacios del filtro de rol tiene pruebas simuladas; no se reportó una comprobación manual específica de esa variante.
- Las reversiones, interrupciones y concurrencia reales, y las validaciones completas de producción, no quedan acreditadas por estas pruebas locales.

### Rutas de diagnóstico

- `/api/health`: disponibilidad básica del servidor.
- `/api/db-check`: comprobación de conexión con PostgreSQL.
- `/api/auth-check`: comprobación del token de Firebase.

Las dos últimas solo se registran cuando `NODE_ENV` es distinto de `production`.

Se comprobó localmente que en modo producción `/api/health` responde y las dos rutas de diagnóstico devuelven 404. Esto no equivale a validar un despliegue completo de producción.

## Colección manual de Bruno

La colección está en `docs/bruno/VivaTech API/`, con su archivo `opencollection.yml`. Abrir esa carpeta como colección existente en Bruno; no es necesario copiar sus solicitudes a otra colección ni ejecutar todos los escenarios para consultar su organización.

Organización de las solicitudes guardadas:

| Carpeta o escenario | Numeración |
|---|---|
| Autenticación, perfiles y autorización | 1 a 61 |
| Paneles, grupos y consulta de progreso / Gestión de grupos: gestión básica | 62 a 79 |
| Gestión de grupos: detalle y estudiantes | 80 a 99 |
| Gestión de grupos: asignación y retiro de maestros | 100 a 114 |
| Resumen y progreso general | 115 a 137 |
| Administración de usuarios: filtro de rol | 138 a 153 |

La numeración identifica escenarios y conserva la continuidad entre sprints; las carpetas los agrupan por propósito. Dentro de un recorrido puede ser necesario usar solicitudes anteriores para preparar o restaurar cuentas y grupos. Las consultas SQL manuales y las comprobaciones de interfaz no se cuentan como solicitudes adicionales de Bruno.

### Variables y secretos locales

Configurar los valores en cada computadora sin publicar tokens ni datos personales. Los archivos compartidos deben conservar referencias a variables, no valores reales de autenticación.

| Referencia | Uso |
|---|---|
| `{{baseUrl}}` | Origen local del backend, por ejemplo `http://localhost:3000`; las solicitudes de la colección agregan `/api` |
| `{{tokenAdministrador}}` | Token vigente de la cuenta ficticia de administrador |
| `{{tokenEstudiante}}` | Token vigente de la cuenta ficticia de estudiante |
| `{{tokenNuevo}}` | Nombre histórico del token de la cuenta ficticia que se preparó como maestro |
| `{{uidEstudiante}}` | UID de la cuenta ficticia de estudiante |
| `{{uidNuevo}}` | Nombre histórico del UID de la cuenta ficticia preparada como maestro |
| `{{idGrupoAdministradorPrueba}}` | Identificador actual del grupo administrativo del escenario; en la comparación de progreso por grupos corresponde al grupo A preparado para esa prueba |
| `{{idGrupoMaestroPrueba}}` | Identificador actual del grupo creado por el maestro en los escenarios que lo requieren |

`baseUrl` de Bruno no tiene el mismo formato que `VITE_API_URL`: esta última incluye `/api`. Evitar duplicar ese segmento. Guardar los tokens en el mecanismo de secretos locales de Bruno, no en variables versionadas, scripts ni capturas compartidas. Mantener también los UID reales fuera de los archivos compartidos.

Los tokens deben corresponder a cuentas registradas con el rol y estado previstos. Un 401 por token vencido no demuestra un rechazo por rol. Para solicitudes sin token, revisar que no exista un encabezado Authorization habilitado ni autenticación heredada que altere el escenario.

### Preparación y ejecución por escenarios

Las solicitudes almacenadas no constituyen una suite de aserciones automáticas ni preparan los datos por sí solas. El estado HTTP incluido en el nombre es una expectativa que debe contrastarse con la respuesta y con las condiciones de la base.

1. Confirmar que el backend utiliza una base local autorizada y las cuentas son ficticias.
2. Revisar la solicitud completa: método, URL, parámetros de consulta, autenticación y cuerpo. `buscar`, `rol`, `limite` y `desplazamiento` son parámetros de URL, no encabezados.
3. Preparar únicamente los registros que necesita el escenario y guardar sus identificadores. Actualizar las referencias locales con los ID devueltos al crear grupos; no reutilizar los de una prueba anterior que ya se limpió.
4. Ejecutar las solicitudes pertinentes una por una y registrar estado, cuerpo y verificaciones de datos, sin compartir credenciales.
5. Restaurar roles y estados de las cuentas modificadas. Retirar asignaciones temporales antes de eliminar sus grupos y verificar que perfiles y progreso se conserven cuando corresponda.
6. Verificar la limpieza y el estado final de las cuentas antes de iniciar otro escenario.

No ejecutar la colección completa indiscriminadamente: hay solicitudes que crean perfiles, cambian roles o estados, asignan participantes y eliminan grupos. Una creación exitosa no debe repetirse para inspeccionar su respuesta: los nombres de grupo no son únicos y podría crear otro registro. Repetir un registro de perfil o retirar una asignación ya eliminada tampoco conserva la misma respuesta esperada.

Las pruebas con cuentas desactivadas requieren desactivar temporalmente la cuenta ficticia correcta mediante un administrador, verificar las consultas y reactivarla al terminar. No utilizar el administrador principal como destinatario ni modificar una cuenta real para preparar el escenario. La solicitud 78 necesita un estudiante asignado antes de intentar eliminar el grupo; después debe retirarse esa asignación para completar la limpieza.

### Escenarios con progreso educativo temporal

Las solicitudes de resumen y progreso con contenido requieren una preparación autorizada independiente. El conjunto manual utilizado fue:

- Dos cursos: uno publicado y otro borrador.
- Dos lecciones publicadas dentro del curso publicado, una con progreso completado y otra en progreso.
- Una lección borrador en el curso publicado y una publicada en el curso borrador, ambas con progreso completado que debe excluirse.
- Fechas de actualización controladas: la actividad considerada más reciente pertenece a la lección visible en progreso; los registros excluidos tienen fechas posteriores.
- Dos grupos con el mismo estudiante, para comprobar una sola finalización en el resumen y una sola aparición en progreso general con ambos nombres de grupo.

Sobre una base sin otro contenido considerado, la preparación debe producir dos lecciones visibles, una finalización y la última actividad de la lección visible en progreso. Retirar todas las asignaciones mantiene el progreso del estudiante sin grupos; solo después de comprobarlo se retiran los registros educativos temporales.

La limpieza respeta las claves foráneas: retirar asignaciones y grupos; eliminar únicamente los progresos preparados, después sus lecciones y finalmente sus cursos. Conservar las categorías y cuentas originales. No usar migraciones destructivas ni borrados generales. Si se preparan perfiles ficticios exclusivamente para paginación, su retiro se limita a sus identificadores reservados y autorizados; no constituye una función de eliminación de usuarios de la plataforma.

La preparación no está automatizada mediante semillas o scripts compartidos. No asumir que los ID de cursos y lecciones de una ejecución anterior siguen disponibles. Comprobar títulos, relaciones y estado antes de insertar o limpiar, y revertir una transacción si sus filas afectadas no coinciden con las esperadas.

### Alcance de las solicitudes guardadas

Los escenarios se ejecutaron manualmente durante las actividades y después se guardaron o reorganizaron como archivos. Se verificó su carga visual en Bruno, pero no se reportó una nueva ejecución completa de esos archivos después de guardarlos. La solicitud 127 conserva una variante de búsqueda por fragmento sin espacios que no se volvió a ejecutar exactamente como quedó almacenada.

La aceptación de resultados depende de la preparación actual y de las comprobaciones realizadas, no del nombre o la cantidad de archivos. Los resultados históricos no garantizan el funcionamiento de todos los escenarios sobre una versión futura.

## Dependencias: override temporal

El frontend incluye un override de `@grpc/grpc-js` a `1.13.6`, limitado a la dependencia de `@firebase/firestore`.

Se agregó para corregir las alertas de seguridad observadas al instalar Firebase. La aplicación utiliza Firebase Authentication, no Firestore como base de datos.

Después del ajuste se reportaron:

- Auditoría del frontend sin vulnerabilidades conocidas.
- Lint y compilación satisfactorios.
- Pruebas manuales de autenticación satisfactorias.

Revisar este override al actualizar Firebase. No conservarlo indefinidamente sin reevaluar su necesidad y compatibilidad.

## Pendientes y limitaciones del incremento


| Área | Pendiente o límite |
|---|---|
| Buscadores de participantes | Verificar varias páginas, especialmente cuando una página contiene solo candidatos maestros desactivados y existen candidatos activos después |
| Detalle de grupo | Comprobar desde la interfaz conectada la presentación y el retiro de un estudiante desactivado; existe evidencia previa por API |
| Progreso general | Verificar cuenta desactivada con progreso existente y el criterio de rol actual mediante un cambio de rol con historial educativo |
| Categorías | Probar con un administrador realmente desactivado y comprobar en PostgreSQL una reversión después de una inserción previa; los mocks cubren el recorrido, no esa evidencia real |
| Integridad y concurrencia | Verificar operaciones concurrentes y fallos o interrupciones reales, incluyendo asignaciones frente a cambios de rol o estado y eliminación de grupos |
| Accesibilidad | Ampliar los recorridos con lector de pantalla y completar la evaluación pertinente de WCAG 2.2 AA; las comprobaciones parciales no acreditan conformidad total |
| Autenticación web | Verificar reCAPTCHA real con el modo de prueba desactivado en un entorno autorizado |
| Dependencias | Ejecutar una auditoría actual cuando corresponda y reevaluar el override temporal al actualizar Firebase |
| Despliegue | Validar configuración y comportamiento en la VPS con dominio propio, HTTPS y entorno real; no se declara validado por las pruebas locales |
| Experiencia educativa | Desarrollar el contenido, la consulta real de cursos y el guardado educativo conforme al alcance del siguiente sprint, sin confundirlos con la consulta de progreso ya implementada |

La suite de 230 casos corresponde al backend y utiliza dependencias simuladas según el archivo. El frontend cuenta con lint, compilación y verificaciones manuales reportadas; no se afirma que exista una suite automatizada de interfaz o de extremo a extremo. La ausencia de errores nuevos en la consola durante una consulta concreta no acredita que todas las pantallas estén libres de errores.

No incorporar certificados, QR, sistemas administrativos adicionales, infraestructura nueva o ampliaciones de alcance para resolver estos pendientes sin autorización. Mantener PostgreSQL como base de datos y Firebase Authentication como autenticación.


