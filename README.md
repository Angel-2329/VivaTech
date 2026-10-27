# Viva Tech

Plataforma educativa para la alfabetización digital de personas adultas, con enfoque en simplicidad, seguridad y accesibilidad.

El proyecto se desarrolla con Scrum, un modelo de prototipos, cinco integrantes, nueve semanas operativas y cuatro sprints.

## Estado del prototipo 

Funcionalidades implementadas e integradas:

- Acceso telefónico mediante Firebase Authentication.
- Solicitud, confirmación y reenvío del código.
- Registro de nombre completo obligatorio y apodo opcional.
- Consulta y actualización del perfil mediante la API.
- Recuperación y cierre de sesión.
- Navegación según los roles estudiante, maestro y administrador.
- Rechazo de cuentas desactivadas.
- Manejo de errores de conexión y reintento.
- Script para configurar el primer administrador.

Los paneles de cada rol son pantallas en construcción. La integración del acceso no significa que las funcionalidades educativas, administrativas o de PWA estén completas.

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
│   │   └── routes/
│   └── test/
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

## Primer administrador

El script es una herramienta de preparación inicial, no una ruta pública ni un sustituto de la futura gestión de roles.

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

No publicar su salida con datos de usuarios.

## Comprobaciones y pruebas

### Frontend

Desde `frontend`:

```powershell
npm run lint
npm run build
npm audit
```

La compilación genera `frontend/dist`, que no debe incluirse en el repositorio.

### Backend

Desde `backend`:

```powershell
npm test
```

Al momento de esta documentación se reportaron 38 pruebas aprobadas y ninguna fallida.

Las pruebas automatizadas de rutas y middlewares utilizan dependencias simuladas. No sustituyen las pruebas con Firebase y PostgreSQL reales.

### Pruebas manuales realizadas

Se reportaron resultados satisfactorios para:

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

Estas comprobaciones no constituyen una evaluación completa de conformidad WCAG 2.2 AA.

### Rutas de diagnóstico

- `/api/health`: disponibilidad básica del servidor.
- `/api/db-check`: comprobación de conexión con PostgreSQL.
- `/api/auth-check`: comprobación del token de Firebase.

Las dos últimas solo se registran cuando `NODE_ENV` es distinto de `production`.

Se comprobó localmente que en modo producción `/api/health` responde y las dos rutas de diagnóstico devuelven 404. Esto no equivale a validar un despliegue completo de producción.

## Dependencias: override temporal

El frontend incluye un override de `@grpc/grpc-js` a `1.13.6`, limitado a la dependencia de `@firebase/firestore`.

Se agregó para corregir las alertas de seguridad observadas al instalar Firebase. La aplicación utiliza Firebase Authentication, no Firestore como base de datos.

Después del ajuste se reportaron:

- Auditoría del frontend sin vulnerabilidades conocidas.
- Lint y compilación satisfactorios.
- Pruebas manuales de autenticación satisfactorias.

Revisar este override al actualizar Firebase. No conservarlo indefinidamente sin reevaluar su necesidad y compatibilidad.

## Versionado e integración

Flujo habitual:

```text
Rama de actividad → frontend o backend → integracion → main
```

Las actividades que requieren el código reunido de ambas partes se realizan en una rama de actividad desde `integracion`, con PR de regreso a `integracion`.

- No editar directamente ramas protegidas.
- Revisar cambios y pruebas antes de fusionar.
- No eliminar las ramas compartidas.
- Incorporar la versión aceptada a `main` mediante PR en la Sprint Review.
- Un merge exitoso no sustituye los criterios de aceptación.

