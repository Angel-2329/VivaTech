# Contenido de las lecciones

Esta carpeta guarda el contenido educativo de Viva Tech en archivos JSON. Desde aquí se carga a PostgreSQL con el script `cargar-contenido` (tarea 3.21.2). Después, el maestro y el administrador lo corrigen desde el editor de la plataforma.

## Archivos

| Archivo | Qué contiene |
|---|---|
| `README.md` | Este documento: el formato y las reglas de redacción |
| `ejemplo-leccion.json` | Una lección completa que sirve de modelo (lección 1 del curso del banco) |
| `curso-uso-seguro-banco.json` | Curso "Uso seguro de la aplicación del banco" (tarea 3.19.2) |
| `curso-pago-servicios.json` | Curso "Pago de servicios en línea" (tarea 3.19.3) |

En la tarea 3.19.4, Angel une los dos cursos en `backend/data/contenido-inicial.json`, que es el archivo que lee el script.

## Estructura de un curso

```json
{
  "categoria": "Banca móvil",
  "orden": 1,
  "titulo": "Uso seguro de la aplicación del banco",
  "descripcion": "Aprende a entrar a tu banco desde el celular, revisar tu saldo y cuidar tus datos.",
  "lecciones": [ ]
}
```

| Campo | Obligatorio | Regla | Columna en la base |
|---|---|---|---|
| `categoria` | Sí | Nombre exacto de una categoría ya cargada: `Banca móvil` o `Pagos digitales` | `cursos.id_categoria` (se busca por nombre) |
| `orden` | Sí | Entero mayor que 0, único dentro de la categoría | `cursos.orden` |
| `titulo` | Sí | Texto no vacío | `cursos.titulo` |
| `descripcion` | Sí | Una o dos frases | `cursos.descripcion` |
| `lecciones` | Sí | De 1 a 10 lecciones | tabla `lecciones` |

Los cursos iniciales se cargan como `publicado`.

## Estructura de una lección

```json
{
  "orden": 1,
  "titulo": "Abrir la aplicación de forma segura",
  "objetivo": "Instalar y abrir la aplicación de tu banco reconociendo las señales de que es segura.",
  "duracionEstimadaMinutos": 10,
  "pasos": [ ]
}
```

| Campo | Obligatorio | Regla | Columna en la base |
|---|---|---|---|
| `orden` | Sí | Entero mayor que 0, único dentro del curso | `lecciones.orden` |
| `titulo` | Sí | Texto no vacío | `lecciones.titulo` |
| `objetivo` | Sí | Una frase que empieza con un verbo | `lecciones.objetivo` |
| `duracionEstimadaMinutos` | Sí | Entero de 1 a 15 | `lecciones.duracion_estimada_minutos` |
| `pasos` | Sí | De 3 a 8 pasos, con al menos 1 actividad de tipo `toque` u `opcion` | tabla `pasos` |

## Estructura de un paso

```json
{
  "orden": 1,
  "instruccion": "Texto principal que lee el alumno.",
  "recursos": [ ],
  "actividad": { "tipo": "lectura" }
}
```

| Campo | Obligatorio | Regla | Columna en la base |
|---|---|---|---|
| `orden` | Sí | Entero mayor que 0, consecutivo dentro de la lección (1, 2, 3…) | `pasos.orden` |
| `instruccion` | Sí | Máximo 300 caracteres | `pasos.instruccion` |
| `recursos` | Sí | Arreglo (puede ir vacío `[]`) | `pasos.recursos` (JSONB, arreglo) |
| `actividad` | Sí | Objeto con su `tipo` | `pasos.actividad` (JSONB, objeto) |

### Recursos

Apoyos visuales que acompañan a la instrucción. Todos son opcionales.

| `tipo` | Campos | Cómo se ve |
|---|---|---|
| `icono` | `nombre` (de [Material Symbols](https://fonts.google.com/icons)), `alt` | Un ícono grande arriba del texto |
| `lista` | `elementos`: de 2 a 5 frases | Una lista con viñetas |
| `aviso` | `texto` | Un recuadro de alerta para algo importante de seguridad |

```json
"recursos": [
  { "tipo": "icono", "nombre": "smartphone", "alt": "Celular" },
  { "tipo": "lista", "elementos": ["Primera idea.", "Segunda idea."] },
  { "tipo": "aviso", "texto": "El banco nunca te pide tu contraseña por mensaje." }
]
```

### Actividades

| `tipo` | Qué hace el alumno | Campos |
|---|---|---|
| `lectura` | Lee la teoría y presiona "Entendido, continuar" | Solo `tipo` |
| `toque` | Toca el botón correcto en una pantalla de celular simulada | `pantalla`, `opciones`, `correcta`, `pista`, `mensajeAcierto` |
| `opcion` | Elige la respuesta correcta de una pregunta | `pregunta`, `opciones`, `correcta`, `pista`, `mensajeAcierto` |

Paso de tipo `toque`:

```json
"actividad": {
  "tipo": "toque",
  "pantalla": { "titulo": "Banco Ejemplo", "subtitulo": "Hola, ¿cómo quieres entrar?" },
  "opciones": [
    { "id": "huella", "texto": "Entrar con huella", "icono": "fingerprint" },
    { "id": "olvide", "texto": "Olvidé mi contraseña", "icono": "help" }
  ],
  "correcta": "huella",
  "pista": "Busca el botón con el dibujo de una huella digital.",
  "mensajeAcierto": "¡Muy bien! Entraste de forma rápida y segura."
}
```

Paso de tipo `opcion`:

```json
"actividad": {
  "tipo": "opcion",
  "pregunta": "¿Qué haces?",
  "opciones": [
    { "id": "a", "texto": "Toco el enlace y la instalo" },
    { "id": "b", "texto": "Busco la aplicación en la tienda oficial" }
  ],
  "correcta": "b",
  "pista": "Los bancos no mandan enlaces para instalar su aplicación.",
  "mensajeAcierto": "¡Exacto! Así te aseguras de tener la aplicación verdadera."
}
```

Reglas de las actividades:

- `toque` lleva de 2 a 6 opciones; `opcion` lleva de 2 a 4.
- `correcta` es el `id` de una de las opciones (formato en "Reglas que valida el sistema").
- `pantalla.subtitulo` y el `icono` de cada opción son opcionales.
- `pista` explica qué buscar, y `mensajeAcierto` confirma el avance (RF-18).

## Reglas que valida el sistema

Estas reglas las comprueba el backend. Los textos se miden en caracteres después de quitar los espacios de los extremos, contados con `Array.from` como los nombres de grupo.

### Límites de texto

| Campo | Mínimo | Máximo |
|---|---|---|
| Nombre de categoría | 1 | 60 |
| Título de curso o de lección | 1 | 100 |
| Descripción de curso | 1 | 300 |
| Objetivo de lección | 1 | 200 |
| `instruccion` | 1 | 300 |
| `pregunta` | 1 | 200 |
| `texto` de una opción | 1 | 100 |
| `pista` | 1 | 200 |
| `mensajeAcierto` | 1 | 150 |
| `pantalla.titulo` | 1 | 40 |
| `pantalla.subtitulo` (opcional) | 1 | 80 |
| Cada elemento de `lista` | 1 | 150 |
| `aviso.texto` | 1 | 200 |
| `alt` de un ícono | 1 | 80 |

### Identificadores de opción

- Formato: `^[a-z0-9_-]{1,20}$`. Solo letras minúsculas sin acento, números, guion y guion bajo, de 1 a 20 caracteres.
- Únicos dentro del paso.
- `correcta` debe ser el `id` de una de las opciones.

### Mientras el curso está en borrador

Se permite guardar contenido incompleto, pero cada parte que se guarda debe ser válida.

- Un curso puede no tener lecciones, y una lección puede no tener pasos.
- Máximo 10 lecciones por curso y 8 pasos por lección.
- La duración es un entero de 1 a 15 minutos.
- Cada paso guardado cumple su estructura: tipo válido, cantidad de opciones, `correcta` existente y límites de texto.
- El orden de los pasos es consecutivo dentro de la lección.

### Al publicar el curso

El backend exige, y si algo falta responde `409 contenido_incompleto` con un mensaje que dice qué falta:

- De 1 a 10 lecciones.
- Cada lección con 3 a 8 pasos.
- Cada lección con al menos una actividad `toque` u `opcion`.
- Todos los campos y actividades válidos.

El curso y sus lecciones se publican juntos, en la misma transacción.

## Cómo se redacta (revisión de contenido)

Estas reglas no las puede comprobar el sistema: las revisa una persona antes de publicar. La duración de 1 a 15 minutos solo valida el número declarado; que la lección realmente se termine en ese tiempo se comprueba en las pruebas de usabilidad.

- Se le habla al alumno de "tú".
- Frases de 20 palabras o menos; una idea por paso.
- Primero se explica (`lectura`) y después se practica (`toque` u `opcion`).
- La lección termina con una práctica o con un resumen.
- Nombres siempre ficticios: "Banco Ejemplo", "Luz del Valle". Nunca marcas de bancos o empresas reales.
- Nunca se pide al alumno un dato real: ni contraseñas, ni NIP, ni números de tarjeta o de cuenta.
- Sin tecnicismos. Si hace falta una palabra técnica, se explica en la misma frase.
- El objetivo empieza con un verbo ("Instalar…", "Reconocer…").
- La pista aparece después de un error. Señala dónde mirar (una palabra o un ícono) y por qué, pero nunca dice qué opción elegir ("elige la b").
- El mensaje de acierto es breve y positivo, y deja claro que es una práctica: no dice que se hizo una acción real, como entrar a una cuenta o descargar un archivo.
- No se afirman garantías absolutas ("nadie más puede entrar"). Se enseña a verificar por un canal oficial.
- Los dominios de ejemplo terminan en `.invalid`, que está reservado para ejemplos, como `banco-ejemplo.invalid`. La plataforma los muestra como texto, nunca como enlace.
- Al corregir el texto de un curso publicado, la opción correcta debe seguir siendo correcta.

## Cómo se carga y se corrige

1. El script `cargar-contenido` inserta los cursos, lecciones y pasos en una transacción. Si se vuelve a ejecutar, no duplica nada.
2. Ya cargado, el contenido se corrige desde el editor de la plataforma, no en estos archivos.
3. En un curso publicado solo se corrigen textos: no se cambia la respuesta correcta, el orden ni la cantidad de pasos.
