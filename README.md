# Viva Tech

Plataforma educativa para la alfabetización digital de personas adultas, con enfoque en simplicidad, seguridad y accesibilidad.

El proyecto se desarrolla con Scrum, un modelo de prototipos, dos integrantes, ocho semanas operativas y cuatro sprints.

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

Incorporado en el sprint 4:

- Contenido educativo real en PostgreSQL: categorías, cursos, lecciones y pasos, con carga del contenido inicial por script.
- Recorrido del estudiante por lecciones y pasos (teoría, video de YouTube y actividades), con guardado del progreso.
- Inicio del estudiante con la tarjeta «Mi grupo»; pestañas «Cursos disponibles» y «Mis cursos» (subpestañas En curso y Terminados) y «Mis certificados».
- Editor de contenido para maestros y administrador: categorías, cursos, lecciones y pasos, con reordenado, vista previa, publicación, despublicación, fecha de cierre, retiro y eliminación de cursos, conservando el historial del estudiante.
- Permiso de edición que el administrador da a otros maestros sobre un curso; el maestro con permiso solo edita, no publica ni elimina.
- Certificados con folio, duración aproximada, QR y enlace para compartir en LinkedIn (sin API de LinkedIn), y verificación pública por código sin iniciar sesión.
- Retiro de varios estudiantes de un grupo, o de todos, conservando sus cuentas y su avance.
- Nombres de grupo únicos en el sistema y títulos de curso únicos por categoría.
- Validación de caracteres en nombres de grupo, nombre completo y apodo.
- Cambio del número de teléfono de una cuenta por el administrador, con registro de quién hizo el cambio.
- Cambio del número de teléfono por la propia persona desde «Mi perfil», con código SMS al número nuevo; el UID de la cuenta no cambia.
- Foto de perfil guardada en el servidor, visible solo para la persona, el administrador y sus maestros.
- PWA mínima: manifiesto, íconos, instalación y aviso sin conexión, sin service worker ni datos privados guardados en el dispositivo.

Las pantallas de permiso de edición, cambio de teléfono por el administrador y por la propia persona, y foto de perfil se integraron en `integracion` el 26 de noviembre de 2026, junto con su API. El cambio de teléfono por la propia persona solo se ha probado con números de prueba de Firebase; si la prueba con SMS real falla, la opción se oculta con `VITE_CAMBIO_TELEFONO=false`.

El prototipo cuenta con verificaciones locales y limitaciones explícitas; no está validado como listo para producción ni acredita conformidad completa con WCAG 2.2 AA. El merge a `integracion` no sustituye las pruebas conjuntas ni la aceptación formal del incremento.

## Resumen funcional

### Roles

| Rol | Qué puede hacer |
|---|---|
| Estudiante | Registrar su perfil y su foto, consultar su grupo, tomar cursos publicados por lecciones y pasos, retomar su avance, repasar cursos terminados, obtener certificados y compartirlos |
| Maestro | Crear y administrar sus grupos y estudiantes, consultar el avance de sus estudiantes, y crear y editar sus cursos o aquellos en los que el administrador le dio permiso de edición |
| Administrador | Todo lo del maestro sobre cualquier grupo y curso, además de gestionar cuentas (rol, activación y teléfono), categorías, maestros de grupo y permisos de edición, y consultar el resumen y el progreso general |
| Público sin cuenta | Verificar un certificado con su código o QR |

### Historias de usuario (resumen)

- Como persona adulta, quiero entrar solo con mi número de celular y un código, para no tener que recordar una contraseña.
- Como estudiante, quiero aprender paso a paso con explicaciones, videos y prácticas, y continuar donde me quedé.
- Como estudiante, quiero un certificado verificable de los cursos que termino, para demostrar lo aprendido.
- Como maestro, quiero organizar a mis estudiantes en grupos y ver su avance.
- Como maestro, quiero crear y publicar cursos sin programar, y que otro maestro autorizado me ayude a editarlos.
- Como administrador, quiero gestionar cuentas, roles, categorías y permisos para mantener el orden y la seguridad de la plataforma.

### Flujo principal

1. La persona escribe su número de celular, resuelve el reCAPTCHA y confirma el código SMS (Firebase Authentication).
2. Si es su primer acceso, registra su nombre completo y su apodo; la cuenta inicia con el rol estudiante.
3. El administrador asigna roles y organiza grupos; los maestros crean y publican cursos.
4. El estudiante elige un curso en «Cursos disponibles» y avanza lección por lección; su progreso se guarda en cada paso.
5. Al completar todas las lecciones obtiene su certificado, con folio y código QR.
6. Cualquier persona puede verificar el certificado en `/verificar` con el código o el QR, sin iniciar sesión.

### Acceso sin contraseñas

El acceso usa el número de teléfono y un código de un solo uso enviado por SMS, protegido con reCAPTCHA. La plataforma no guarda contraseñas: Firebase Authentication verifica la identidad y emite un token que el backend comprueba en cada solicitud. Rol, estado de la cuenta y permisos se deciden en el servidor con los datos de PostgreSQL, nunca con lo que envía el navegador. Equivale a un inicio de sesión con usuario y contraseña en cuanto a identificación y control de acceso, sin el riesgo de almacenar ni filtrar contraseñas.

## Tecnologías

- Frontend: React, Vite y React Router.
- Backend: Node.js y Express.
- Base de datos: PostgreSQL, con migraciones de node-pg-migrate.
- Autenticación: Firebase Authentication por teléfono.
- Verificación de tokens y cambio de teléfono por administrador: Firebase Admin SDK.
- Carga de la foto de perfil: multer, con archivos guardados en el disco del servidor.

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

VITE_URL_PUBLICA=

VITE_CAMBIO_TELEFONO=true
```

Los valores de Firebase deben pertenecer a la aplicación web del proyecto utilizado por el backend.

- `VITE_URL_PUBLICA` es el origen HTTPS público del frontend, sin `/` final (por ejemplo `https://tu-dominio`). Se usa para el QR y el enlace de LinkedIn del certificado. Si está vacía o apunta a `localhost` o a una IP privada, el certificado no muestra el QR ni el enlace.
- `VITE_CAMBIO_TELEFONO` controla la opción «Cambiar mi número» de «Mi perfil». Con `false` la opción se oculta; con cualquier otro valor, o si falta, se muestra. Después de cambiarla hay que volver a generar el build.

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
FOTOS_DIR=C:/ruta/absoluta/fuera-del-repo/fotos
GOOGLE_APPLICATION_CREDENTIALS=C:/ruta/absoluta/fuera-del-repo/cuenta-de-servicio.json
```

- El backend carga `.env` mediante dotenv; no carga automáticamente `.env.local` como Vite.
- `DATABASE_URL` debe apuntar a la base autorizada.
- `FIREBASE_PROJECT_ID` debe coincidir con el proyecto del frontend.
- `FRONTEND_ORIGIN` debe coincidir exactamente con el origen de Vite, sin barra final.
- `FOTOS_DIR` es la carpeta absoluta donde se guardan las fotos de perfil, fuera del repositorio y de cualquier carpeta pública. Es obligatoria y no tiene valor por defecto: si falta, las rutas de foto responden `503`.
- `GOOGLE_APPLICATION_CREDENTIALS` apunta a la llave de una cuenta de servicio de Firebase, guardada fuera del repositorio. La necesita el cambio de teléfono por administrador; sin ella, esa ruta responde `503`. Cada persona genera su propia llave; no se comparten ni se suben al repositorio.
- Reiniciar el backend después de modificar las variables.

No subir archivos de entorno reales, contraseñas, tokens ni credenciales privadas al repositorio.

## Migraciones

Crear primero la base de datos y configurar su conexión.

Para aplicar las migraciones, desde `backend`:

```powershell
npm run migrate:up
```

El repositorio tiene 9 migraciones en `backend/migrations`:

| Migración | Cambio |
|---|---|
| `1792909072380_crear-esquema-inicial` | Esquema inicial |
| `1793923200000_cursos-cierre-historial` | Fecha de cierre de cursos e historial de cursos retirados |
| `1793923200001_registro-contenido-inicial` | Registro de la carga del contenido inicial |
| `1793923200002_grupos-nombre-unico` | Índice único de nombres de grupo |
| `1793923200003_cursos-titulo-unico` | Índice único de títulos de curso por categoría |
| `1793923200004_certificados-duracion` | Duración en los certificados |
| `1793923200005_curso-editores` | Permisos de edición de cursos |
| `1793923200006_cambios-telefono` | Registro de cambios de teléfono |
| `1793923200007_usuarios-foto` | Referencia de la foto de perfil |

Las migraciones de índices únicos revisan primero los datos y se detienen sin modificarlos si encuentran duplicados. Sin las migraciones más recientes, el perfil, la administración de usuarios y el detalle de grupo responden `503`; aplicar las migraciones antes de iniciar una versión nueva del backend.

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

## API

La API se monta en `/api`. Salvo las rutas públicas indicadas, todas requieren:

```text
Authorization: Bearer TOKEN_DE_FIREBASE
```

El frontend obtiene el token desde Firebase Authentication; no se almacena manualmente en `localStorage` ni debe imprimirse. El backend obtiene el UID del token verificado y el rol y el estado de la cuenta desde PostgreSQL: el cliente no concede permisos enviando un rol en el cuerpo o en los filtros. Una cuenta desactivada recibe `403 cuenta_desactivada` y un rol no permitido, `403 rol_no_autorizado`.

### Rutas por área

| Área | Rutas | Acceso |
|---|---|---|
| Diagnóstico | `GET /api/health` | Pública |
| Perfil | `GET`, `POST` y `PATCH /api/perfil` | Persona autenticada (su propio perfil) |
| Foto de perfil | `PUT` y `DELETE /api/perfil/foto` | Persona autenticada (su propia foto) |
| Foto de otra persona | `GET /api/usuarios/:uid/foto` | La propia persona, el administrador o un maestro asignado a un grupo donde la persona es estudiante |
| Búsqueda de estudiantes | `GET /api/estudiantes` | Maestro o administrador |
| Administración de cuentas | `GET /api/admin/usuarios`; `PATCH /api/admin/usuarios/:uid/rol`, `/activo` y `/telefono` | Administrador |
| Resumen y progreso | `GET /api/admin/resumen` y `GET /api/admin/progreso` | Administrador |
| Permiso de edición de cursos | `GET` y `POST /api/admin/cursos/:idCurso/editores`; `DELETE /api/admin/cursos/:idCurso/editores/:uid` | Administrador |
| Grupos | `GET` y `POST /api/grupos`; `GET`, `PATCH` y `DELETE /api/grupos/:idGrupo` | Maestro asignado o administrador (el maestro solo ve sus grupos) |
| Estudiantes del grupo | `POST` y `DELETE /api/grupos/:idGrupo/estudiantes`; `POST /api/grupos/:idGrupo/estudiantes/retiros`; `DELETE /api/grupos/:idGrupo/estudiantes/:uid` | Maestro asignado o administrador |
| Maestros del grupo | `POST /api/grupos/:idGrupo/maestros`; `DELETE /api/grupos/:idGrupo/maestros/:uid` | Administrador |
| Mi grupo | `GET /api/mis-grupos` | Estudiante |
| Cursos del estudiante | `GET /api/cursos-disponibles`; `GET /api/mis-cursos/en-curso` y `/terminados` | Estudiante |
| Lecciones y progreso | `GET /api/lecciones/:idLeccion`; `PUT /api/lecciones/:idLeccion/progreso` | Estudiante |
| Certificados | `POST /api/cursos/:idCurso/certificado`; `GET /api/mis-certificados` | Estudiante |
| Verificación de certificados | `GET /api/certificados/verificar/:codigo` | Pública, sin token |
| Consulta del editor | `GET /api/contenido`; `GET /api/contenido/cursos/:idCurso` | Maestro o administrador |
| Categorías | `POST /api/categorias`; `PATCH` y `DELETE /api/categorias/:idCategoria`; `PUT /api/categorias/orden` | Administrador |
| Cursos | `POST /api/cursos`; `PATCH` y `DELETE /api/cursos/:idCurso`; `POST /api/cursos/:idCurso/lecciones`; `PUT /api/cursos/:idCurso/orden-lecciones` | Maestro autor, maestro con permiso de edición o administrador |
| Lecciones y pasos (editor) | `PATCH` y `DELETE /api/lecciones/:idLeccion`; `POST /api/lecciones/:idLeccion/pasos`; `PUT /api/lecciones/:idLeccion/orden-pasos`; `PATCH` y `DELETE /api/pasos/:idPaso` | Maestro autor, maestro con permiso de edición o administrador |

`GET /api/mis-cursos` se conserva por compatibilidad, pero quedó obsoleta: el frontend usa `/api/cursos-disponibles`, `/api/mis-cursos/en-curso` y `/api/mis-cursos/terminados`.

### Reglas principales

- **Perfil:** nombre completo de 3 a 100 caracteres y apodo opcional de hasta 30; solo letras (incluidos acentos y ñ), espacios, apóstrofo y guion. Se guardan normalizados (espacios repetidos a uno y sin espacios externos). El apodo vacío se guarda como `NULL`. El perfil nuevo recibe el rol estudiante y estas rutas no permiten cambiar el rol ni el estado.
- **Grupos:** nombre de 1 a 100 caracteres con letras, números, espacios y `- _ . , ( ) #`, y único en todo el sistema sin distinguir mayúsculas ni acentos (`409 grupo_duplicado`). Un grupo con estudiantes no se elimina (`409 grupo_con_participantes`). El retiro de estudiantes, uno, varios (hasta 100) o todos, conserva sus cuentas y su avance.
- **Cursos:** título único dentro de la categoría sin contar los cursos retirados (`409 curso_duplicado`). El maestro con permiso de edición solo edita datos, lecciones y pasos; publicar, despublicar, trasladar, retirar o eliminar el curso responde `403 permiso_solo_edicion`. Retirar un curso conserva el historial del estudiante.
- **Certificados:** el servidor revisa que el curso esté completo; el folio lo genera la base. La emisión repetida devuelve el certificado existente sin regenerarlo. `duracionMinutos` es la suma de la duración de las lecciones o `null` en certificados anteriores. La verificación pública devuelve solo nombre, curso, lecciones, folio, duración y fechas.
- **Foto de perfil:** campo multipart `foto`, solo JPEG o WebP según el contenido real del archivo y hasta 307 200 bytes. Se guarda con nombre aleatorio en `FOTOS_DIR`, fuera de la carpeta pública; la base guarda solo la referencia. Desactivar una cuenta borra su foto.
- **Cambio de teléfono por administrador:** número `+52` con 10 dígitos. El UID no cambia y se registra quién hizo el cambio, guardando solo los últimos 4 dígitos de cada número.
- **Identificadores:** `idGrupo` y otros BIGINT se devuelven como cadena decimal; no convertirlos a `Number` en el cliente.
- Las respuestas privadas usan `Cache-Control: no-store`. Los DELETE exitosos responden `204 No Content`, sin cuerpo.

Los errores controlados utilizan:

```json
{
  "ok": false,
  "mensaje": "Descripción del problema",
  "codigo": "codigo_opcional"
}
```

| HTTP | Significado general |
|---|---|
| 400 | Datos inválidos (por ejemplo `nombre_invalido`, `nombre_grupo_invalido`, `telefono_invalido`) |
| 401 | Autenticación ausente o rechazada |
| 403 | Rol no autorizado, cuenta desactivada o acción no permitida |
| 404 | Recurso inexistente o ajeno, con la misma respuesta para no revelar su existencia |
| 409 | Conflicto: duplicados, curso incompleto o estado que no permite la operación |
| 503 | El servicio (base de datos, disco o Firebase) no pudo completar la operación |

Una falla de conexión no se interpreta como primer acceso.

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

## Contenido inicial

Después de cargar las categorías, el contenido educativo inicial (4 cursos publicados con 15 lecciones y 82 pasos) se carga desde `backend`:

```powershell
npm run cargar-contenido -- "UID_DEL_ADMINISTRADOR"
```

Se aplican las mismas precauciones que en las categorías: migraciones aplicadas, administrador activo, conexión a la base autorizada y UID sustituido localmente. La carga se registra en la base y se ejecuta en una transacción; si encuentra un título de curso repetido, se detiene y revierte sin modificar datos.

## Comprobaciones y pruebas

### Frontend

Desde `frontend`:

```powershell
npm run lint
npm run build
npm audit
```

La compilación genera `frontend/dist`, que no debe incluirse en el repositorio. La última comprobación registrada (22 de noviembre de 2026, Node.js 24.18.0) reportó lint sin errores y compilación correcta, con el aviso conocido de Vite por un archivo JavaScript mayor de 500 kB (563 kB).

La última ejecución de `npm audit` registrada en el frontend (21 de noviembre de 2026) reportó 0 vulnerabilidades. El resultado de auditoría mencionado en la sección del override corresponde a evidencia histórica y no garantiza el estado actual de las dependencias.

### Backend
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
| Paneles, grupos y consulta de progreso | 62 a 153 |
| Lecciones y progreso | 154 a 201 |
| Editor de contenido | 202 a 315 |
| Certificados | 316 a 326 y 383 a 386 |
| Verificación Correccion de los Grupos | 327 a 382 |
| Validación de caracteres | 387 a 406 |
| Permiso de edición | 407 a 438 |
| Cambio de teléfono | 439 a 452 |
| Foto de perfil | 453 a 480 |

La numeración identifica escenarios y conserva la continuidad entre sprints; las carpetas los agrupan por propósito. Dentro de un recorrido puede ser necesario usar solicitudes anteriores para preparar o restaurar cuentas y grupos. Las consultas SQL manuales y las comprobaciones de interfaz no se cuentan como solicitudes adicionales de Bruno.

### Variables y secretos locales

Configurar los valores en cada computadora sin publicar tokens ni datos personales. Los archivos compartidos deben conservar referencias a variables, no valores reales de autenticación.

| Referencia | Uso |
|---|---|
| `{{baseUrl}}` | Origen local del backend, por ejemplo `http://localhost:3000`; las solicitudes de la colección agregan `/api` |
| `{{tokenAdministrador}}` | Token vigente de la cuenta ficticia de administrador |
| `{{tokenEstudiante}}` | Token vigente de la cuenta ficticia de estudiante |
| `{{tokenMaestro}}` | Token vigente de la cuenta ficticia de maestro (antes `tokenNuevo`) |
| `{{uidEstudiante}}` | UID de la cuenta ficticia de estudiante |
| `{{uidMaestro}}` | UID de la cuenta ficticia de maestro (antes `uidNuevo`) |
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



