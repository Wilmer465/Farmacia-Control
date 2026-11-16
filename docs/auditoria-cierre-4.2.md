# Auditoría de cierre — Etapa 4.2

**Rama:** `fix/auditoria-pr3`
**Fecha de la auditoría:** 2026-11-15
**Alcance:** revisión de cierre de las correcciones de restauración de respaldos,
custodia y recuperación de la clave HMAC, política de respaldos legacy y
verificaciones manuales pendientes de la Etapa 4.2.
**Restricciones respetadas:** sin acceso a producción; sin cambios en `main`;
sin commits ni PR; sin actualizar Electron ni dependencias; sin modificar
migraciones, esquema ni `data/farmacia.db`; sin eliminar respaldos; sin
`rebuild:node`; pruebas SQLite aisladas en `%TEMP%`; Windows con Electron 32.3.3.

> **Veredicto: la Etapa 4.2 NO se declara cerrada ni aprobada.**
>
> Los tres hallazgos originales (`V-4.2-01`, `V-4.2-02`, `V-4.2-03`) siguen
> corregidos y verificados por pruebas. Sin embargo, la auditoría de cierre
> identificó **doce hallazgos adicionales**, tres de ellos de severidad alta y
> bloqueantes:
>
> 1. un USUARIO autenticado puede crear respaldos globales firmados usando
>    `esAutomatico` y evitar la auditoría;
> 2. un respaldo etiquetado `SEDE` contiene la base completa y su restauración
>    revierte datos de otras sedes;
> 3. la pérdida de la clave de firma crea una clave nueva en silencio y deja
>    todos los respaldos anteriores no restaurables, sin recuperación.
>
> Las tres verificaciones manuales de la sección 7 **no se ejecutaron** en esta
> sesión y no se marcan como aprobadas. La aprobación queda bloqueada hasta
> resolver o aceptar formalmente los hallazgos y completar esas verificaciones.

---

## 1. Resumen ejecutivo

### 1.1 Estado de los tres hallazgos originales

| ID | Severidad original | Estado en el cierre | Evaluación |
|---|---|---|---|
| `V-4.2-01` | Alta | **Corregido para el vector original** | La restauración ya no acepta una SQLite ajena solo por su nombre. Exige manifiesto HMAC, tamaño, SHA-256, tablas, migraciones, huella de esquema y `user_version`; valida antes de promover, audita en el staging y hace rollback. Las pruebas y el arnés lo confirman. Quedan salvedades de custodia de clave, replay y separación por sede, tratadas como hallazgos nuevos. |
| `V-4.2-02` | Media | **Corregido** | `backups:restaurar` espera la promesa y solo reinicia si `resultado.ok === true`. Si falla, no reinicia. Evidencia: 12/12 pruebas de restauración y arnés real con `relaunch=1`/`exit=1` en éxito y `0`/`0` en rechazo. |
| `V-4.2-03` | Baja | **Corregido** | Los rechazos de adjuntos de órdenes llegan con el mensaje de política, sin detalles internos. Evidencia: 9/9 pruebas de `orden_documentos`. |

### 1.2 Hallazgos nuevos de la auditoría de cierre

| ID | Severidad | Estado | Resumen |
|---|---|---|---|
| `AC-4.2-01` | **Alta** | Abierto | Bypass de autorización en `backups:crear` mediante `{ esAutomatico: true }`; un USUARIO crea un respaldo global firmado y no auditado. |
| `AC-4.2-02` | **Alta** | Abierto | Un respaldo `SEDE` es una copia completa de la base; un ADMIN que lo restaura revierte datos de todas las sedes. |
| `AC-4.2-03` | **Alta** | Abierto | Si falta la clave de firma, el siguiente respaldo crea una nueva en silencio; los respaldos anteriores quedan no restaurables y no hay escrow ni recuperación. |
| `AC-4.2-04` | Media | Abierto / riesgo aceptado pendiente | No hay retención ni purga efectiva; `maximo_respaldos_por_sede` no se usa y los respaldos crecen sin límite. La retención fue retirada intencionalmente, pero `docs/backups.md` sigue documentándola. |
| `AC-4.2-05` | Media | Abierto | La restauración no comprueba espacio libre antes de copiar rollback/staging; un disco lleno puede impedir la promoción o el rollback. |
| `AC-4.2-06` | Media | Abierto | El nombre del respaldo usa resolución de segundos; dos respaldos en el mismo segundo colisionan y el segundo sobrescribe al primero. |
| `AC-4.2-07` | Baja | Abierto | `listar` marca `restaurable:true` solo con verificar el manifiesto; no recalcula el SHA-256 del `.db`. La restauración sí lo revalida, así que no hay bypass, pero la UI puede mentir. |
| `AC-4.2-08` | Media (protección de datos) | Riesgo abierto | Los respaldos son SQLite en texto plano; el HMAC protege autenticidad e integridad, no confidencialidad. En este entorno `data/backups` está dentro de OneDrive. |
| `AC-4.2-09` | Baja | Abierto | El fallback fuera de Electron escribe una clave cruda en `data/backup-signing.key`, sin `safeStorage`. No lo usa la app empaquetada, pero es una trampa para scripts/CLI. |
| `AC-4.2-10` | Baja | Abierto | El reemplazo del manifiesto no es atómico (`rmSync` + `renameSync`); un crash entre ambos pasos deja un respaldo válido sin manifiesto. |
| `AC-4.2-11` | Baja (documentación) | Abierto | `docs/backups.md` describe `purgarRespaldosAntiguos` y retención por sede que ya no existen en el código. |
| `AC-4.2-12` | Baja/Media (gobierno) | Abierto | No hay aprobación de dos personas para restaurar ni para exportar/rotar la clave; las dos confirmaciones de la UI las da el mismo usuario. |

> No todos los hallazgos son vulnerabilidades explotables. `AC-4.2-04` a
> `AC-4.2-12` incluyen riesgos operativos, de protección de datos, de
> documentación y de gobierno. Se separan para no diluir los tres bloqueantes.

### 1.3 Lo que sí quedó demostrado

- El HMAC-SHA256 está bien construido: clave aleatoria de 32 bytes, serialización
  canónica, comparación con `crypto.timingSafeEqual`, firma de todos los campos
  relevantes y `claveId` como selector de clave.
- La restauración revalida el contenido antes y después de copiar, usa staging,
  conserva la base anterior y hace rollback verificado.
- La clave se guarda fuera de `backups/` y, en Electron, cifrada con
  `safeStorage`; no hay clave en el repositorio, en los manifiestos ni en los
  respaldos.
- Los respaldos legacy no se sellan automáticamente ni se presentan como
  auténticos.
- `data/farmacia.db` conserva su hash y `mtime`; `main` no fue modificado por
  esta auditoría.

---

## 2. Alcance, método y entorno

### 2.1 Método

1. Lectura completa de los servicios, controladores, handlers IPC, políticas de
   seguridad, UI y pruebas relacionadas.
2. Revisión de los diffs de la rama y de **todos** los archivos sin seguimiento
   relevantes, sin usar `git add` ni `git add -N`.
3. Verificación de la lógica con pruebas automatizadas y con tres
   demostraciones aisladas que usan el handler IPC real y una SQLite en
   `%TEMP%`.
4. Inventario de los respaldos existentes y del perfil de usuario de Electron.
5. Reejecución de la suite completa, pruebas específicas, lint, auditoría de
   dependencias y `git diff --check`.

No se hizo una auditoría visual de la UI ni una prueba en producción. Las
verificaciones manuales siguen pendientes (sección 7).

### 2.2 Entorno

| Componente | Versión / condición |
|---|---|
| Sistema | Windows, sesión de usuario `USER-D` |
| Electron | 32.3.3 (ABI 128) |
| `better-sqlite3` | 11.10.0, compilado para Electron 32 |
| Node CLI | 22.22.3 (solo para herramientas; no se ejecutó `rebuild:node`) |
| pnpm | 11.25.0 (`corepack pnpm`) |
| SQLite de pruebas | Archivos absolutos bajo `%TEMP%`, vía `FARMACIA_TEST_DB_PATH` |
| Modo | `NODE_ENV=test`, sin planificadores de respaldo/sync/HTTP |

### 2.3 Aislamiento

- Las pruebas y demos usan `NODE_ENV=test` y una ruta absoluta distinta de
  `data/farmacia.db`; `resolveDbPath()` rechaza la ruta de desarrollo.
- `backupService.setDirectorioRespaldos(...)` y
  `backupService.setClaveManifiestoPath(...)` redirigen respaldos y clave a
  `%TEMP%`.
- No se abrió, copió ni sustituyó `data/farmacia.db`.
- No se modificaron `data/backup_config.json` ni `data/cloud_sync_state.json`;
  ya estaban modificados antes de esta auditoría.
- No se eliminó ningún respaldo de `data/backups`.

### 2.4 Limitaciones

- No se dispone de la clave de firma real en el perfil inspeccionado; no se pudo
  probar el ciclo real de `safeStorage`/DPAPI con una clave existente. Sí se
  probó el camino de clave ausente y el camino de clave cruda en pruebas.
- No se probó una restauración real sobre la base empaquetada de producción.
- No se auditó el comportamiento de OneDrive, antivirus, Windows Defender,
  copias de sombra, ACLs reales ni BitLocker.
- No se auditó la retención desde el punto de vista legal o contable.
- No se ejecutaron las verificaciones manuales A/B/C.

---

## 3. Evaluación del HMAC, del manifiesto y de la restauración

### 3.1 Construcción criptográfica

| Comprobación | Resultado | Detalle |
|---|---|---|
| Algoritmo | **Correcto** | `crypto.createHmac('sha256', clave)` en `backupManifest.js:142-146`. |
| Clave | **Correcta** | 32 bytes de `crypto.randomBytes(32)` (`obtenerClave`, líneas 128-140). |
| Serialización | **Correcta y determinista** | `serializarCanonico` ordena claves y usa `JSON.stringify`; la firma excluye solo `hmac` (líneas 46-55, 142-146). |
| Comparación | **Correcta** | `crypto.timingSafeEqual` sobre buffers de igual longitud, con validación de formato hex de 64 caracteres (líneas 148-153). |
| Cobertura | **Correcta** | El manifiesto firma nombre, SHA-256, tamaño, fecha, `automatico`, alcance, sede, migraciones, huella de esquema, `userVersion` y `claveId`. |
| `claveId` | **Adecuado como selector** | SHA-256 de la clave truncado a 16 hex (64 bits); no es secreto y no sustituye la verificación HMAC. |
| Clave en manifiesto | **No** | Solo se publica `claveId`. |
| Clave en respaldo | **No** | El `.db` es SQLite estándar; la clave vive fuera. |
| Clave en repositorio | **No** | `.gitignore` excluye `data/`; no se encontró clave versionada. |

**Conclusión:** el primitivo HMAC y su uso son correctos. El problema no es la
criptografía, sino el ciclo de vida de la clave y el hecho de que el HMAC no
aporta confidencialidad.

### 3.2 Qué protege y qué no protege

**Protege:**

- Que el manifiesto no fue alterado sin la clave.
- Que el `.db` corresponde al tamaño y SHA-256 firmados.
- Que el esquema, las migraciones y `user_version` son los firmados.
- Que un archivo ajeno, corrupto o con manifiesto manipulado no se restaure.
- Que la restauración no sustituya la base si la validación o la auditoría de
  staging fallan.

**No protege:**

- **Confidencialidad:** los respaldos son SQLite en texto plano.
- **Compromiso de la clave:** quien obtenga la clave puede firmar manifiestos
  para cualquier `.db`.
- **Mismo usuario de Windows:** `safeStorage`/DPAPI liga la clave al perfil; un
  proceso malicioso que corra como ese usuario puede descifrarla.
- **Replay:** un atacante con escritura en `backups/` puede sustituir el par
  `.db` + manifiesto por uno antiguo válido; el HMAC seguirá verificando. La
  restauración de un punto anterior es una función, pero no hay secuencia,
  frescura ni anti-rollback.
- **Borrado o denegación:** el HMAC no impide que se borren respaldos o que se
  llene el disco.
- **Sede:** el manifiesto declara `alcance: SEDE`, pero el contenido puede ser
  la base completa. La firma acredita lo que se firmó, no que el contenido esté
  filtrado por sede.

### 3.3 Custodia actual de la clave

| Aspecto | Implementación actual | Evaluación |
|---|---|---|
| Ubicación | `userData/backup-signing.key.bin` en Electron (`backupManifest.js:68-79`) | Fuera de `backups/`, correcto. |
| Cifrado | `safeStorage.encryptString` / `decryptString` | En Windows usa DPAPI del perfil; no es portable a otro equipo/perfil. |
| Permisos | `openSync(..., 0o600)` | En Windows el modo POSIX es limitado; hereda ACL del directorio. Verificar ACL real. |
| Creación | `obtenerClave({ crear: true })` crea si falta | **Riesgo alto:** no comprueba si existen manifiestos; rota en silencio. |
| Lectura para listar/restaurar | `crear: false`; falla cerrado | Correcto: sin clave no se declara auténtico. |
| Clave dañada | `leerClave` lanza; no se regenera | Correcto en cuanto a no crear otra, pero no hay recuperación. |
| Exportación | No existe | Bloquea recuperación ante pérdida de equipo/perfil. |
| Rotación | No existe | No se puede cambiar la clave conservando la verificación de respaldos antiguos. |
| Revocación | No existe | Una clave comprometida no se puede invalidar selectivamente. |
| Escrow | No existe | Un solo equipo/perfil es un punto único de fallo. |
| Auditoría de clave | No hay eventos de creación/exportación/rotación | No se puede reconstruir la historia de custodia. |

El perfil inspeccionado (`%APPDATA%\farmacia-control`) **no contiene**
`backup-signing.key.bin`. Sí contiene una base `farmacia.db` de 643 KB,
artefactos `.startup-recovery-*` y `backup_config.json`, pero ninguna clave de
firma. Esto impide verificar el ciclo real de `safeStorage` en esta máquina y
refuerza la necesidad de un procedimiento de custodia reproducible.

### 3.4 Validación de contenido y TOCTOU

`backupService.restaurar` (líneas 503-596) hace, en orden:

1. Validación de rol, nombre, `path.basename`, `..`, patrón y contención en la
   carpeta de respaldos.
2. `leerManifiesto` + `verificarPermisoRestaurar` + `validarContenidoRespaldo`.
3. `restoreDatabase` con `expectedSha256`, migraciones, esquema y
   `userVersion`.
4. Rehash del origen antes de copiar, copia a staging, rehash y validación del
   staging.
5. `beforePromote` escribe la auditoría de éxito en el staging; luego se
   eliminan companions vacíos, se sincroniza y se revalida.
6. Promoción con `ReplaceFileW` y copia previa
   `.startup-recovery-<id>.promoted-old.db`.
7. Rehash y validación de la base promovida; si algo falla después de promover,
   rollback con hash original y restauración del cursor.

**TOCTOU:** la ventana entre la validación inicial y la copia está cubierta por
el rehash de `restoreDatabase` (`hashAntesDeCopiar`) y por el hash esperado. Si
el archivo cambia, no se promueve. La ventana entre la lectura del manifiesto y
la copia no permite sustituir el `.db` sin cambiar el hash; para sustituir el
par completo por uno antiguo válido hace falta acceso de escritura a la carpeta
y no hay anti-replay.

**Enlaces simbólicos/hardlinks:** `validarContenidoRespaldo` usa
`fs.statSync` y exige `isFile()`, pero no usa `lstat` ni rechaza reparse points.
Un atacante con escritura en `backups/` podría intentar un enlace; el hash del
manifiesto limita el ataque, pero se recomienda rechazar enlaces y comprobar
`realpath` dentro de la carpeta. No se demostró un bypass práctico.

**WAL y temporales:** la creación consolida con `journal_mode = DELETE` y
`limpiarCompanionFiles`; `eliminarCompanionVacio` rechaza `-wal`/`-shm` con
contenido. En los 25 respaldos legacy, los 25 `.db-wal` están vacíos y los 25
`.db-shm` tienen 32 KB; un `.db-shm` no contiene datos durables, pero el código
actual lo trataría como compañero con contenido. Para una importación legacy
controlada habrá que distinguir `-wal` (datos) de `-shm` (memoria compartida) y
trabajar sobre una copia.

### 3.5 Rollback y espacio

El rollback está bien diseñado y probado: conserva la base anterior, verifica
hash y valida SQLite antes de promover de vuelta, y registra
`ROLLED_BACK`/`RECOVERY_REQUIRED`. Sin embargo, **`restoreDatabase` no comprueba
espacio libre**. `prepareDatabase` sí lo hace (`startupRecovery.js:691-695,
719-723, 735-736, 750-760`), pero la restauración manual no. Una restauración
necesita al menos la base activa, el staging y la copia de rollback; un disco
lleno puede hacer fallar la copia o, peor, el rollback, dejando
`RECOVERY_REQUIRED`.

### 3.6 Auditoría de la operación

- La creación manual audita éxito/fallo (`backupService.crear`, líneas 337-387).
- La creación con `esAutomatico` **no audita**, incluso si la invoca un usuario
  (ver `AC-4.2-01`).
- La restauración audita intentos sin permiso, nombre inválido, formato, ruta,
  inexistencia, validación, permiso y fallo de restauración
  (`auditarRestauracion`, líneas 419-435).
- El éxito se escribe en el staging antes de promover
  (`auditarExitoEnStaging`, líneas 437-466).
- Si la auditoría de staging falla, no se promueve. Es correcto.
- No hay auditoría específica de creación/exportación/rotación/revocación de la
  clave porque esas operaciones no existen.

---

## 4. Diseño propuesto de custodia y recuperación de la clave

> **Estado:** diseño, no implementado. Cualquier cambio de código queda sujeto a
> aprobación. No se propone criptografía propia: se usan primitivas estándar o
> herramientas vetadas.

### 4.1 Objetivos

1. Que perder el equipo, reinstalar Windows o cambiar de perfil no inutilice
   todos los respaldos.
2. Que una clave comprometida se pueda revocar sin declarar auténticos los
   respaldos antiguos.
3. Que ninguna clave quede en texto plano en el repositorio, los respaldos, los
   manifiestos, los logs o una contraseña por defecto.
4. Que la exportación/importación/rotación tenga control de acceso, doble
   aprobación y auditoría.
5. Que la app **nunca** cree una clave nueva en silencio si ya existen
   respaldos.

### 4.2 Modelo de amenazas

| Escenario | Consecuencia actual | Objetivo del diseño |
|---|---|---|
| Pérdida del equipo | La clave DPAPI se pierde; los respaldos quedan no restaurables | Recuperar desde un kit de escrow cifrado |
| Reinstalación de Windows | Igual | Importar el kit antes de crear respaldos |
| Cambio de perfil de Windows | Igual | Importar el kit; no depender de DPAPI del perfil anterior |
| Restauración en otro equipo | La clave no descifra | Kit de escrow + verificación de `claveId` |
| Robo del equipo | El atacante puede usar la sesión si conoce la contraseña; DPAPI no protege contra el usuario activo | Revocar la clave; asumir compromiso si el escrow estaba junto al equipo |
| Ransomware/malware | Puede cifrar/borrar respaldos y clave | Copia offline/inmutable; clave en escrow separado |
| Insider con acceso al mismo usuario | Puede leer la clave y los respaldos | Separación de funciones, doble control, auditoría, cifrado en reposo |
| Clave comprometida | No hay revocación | Estado `REVOCADA`; los manifiestos con ese `claveId` fallan cerrado |
| Rotación programada | No existe | Keyring con clave activa y claves retiradas |

### 4.3 Arquitectura recomendada: keyring versionado + escrow cifrado

**A. Keyring local versionado**

Sustituir el archivo único por un keyring cifrado con `safeStorage`:

```json
{
  "version": 1,
  "claveActivaId": "a1b2c3d4e5f60718",
  "claves": [
    {
      "claveId": "a1b2c3d4e5f60718",
      "creadaEn": "2026-11-15T12:00:00.000Z",
      "estado": "ACTIVA",
      "material": "<base64 de 32 bytes>"
    },
    {
      "claveId": "0f1e2d3c4b5a6978",
      "creadaEn": "2026-10-01T12:00:00.000Z",
      "estado": "RETIRADA",
      "material": "<base64 de 32 bytes>"
    }
  ]
}
```

Reglas:

- Solo la clave `ACTIVA` firma respaldos nuevos.
- Las claves `RETIRADA` se conservan para verificar manifiestos antiguos.
- Las claves `REVOCADA` no se usan para verificar; un manifiesto con ese
  `claveId` se rechaza con un mensaje explícito.
- `leerManifiesto` selecciona la clave por `claveId`, no solo por la activa.
- El keyring se escribe de forma atómica, con `fsync`, permisos restrictivos y
  copia de seguridad local; nunca se escribe en `backups/`.
- Migración desde el archivo único: leer la clave actual, crear un keyring con
  una clave `ACTIVA`, verificar que los manifiestos existentes siguen válidos y
  conservar el archivo anterior hasta completar la migración.
- No borrar el keyring anterior hasta tener un escrow verificado.

**B. Kit de recuperación (escrow)**

El keyring local sigue atado a DPAPI. Para recuperación se exporta un **kit**
cifrado, separado de los respaldos:

- Contenido: versión, `claveId(s)`, material, fecha, operador, motivo y hash del
  keyring.
- Cifrado: composición estándar **AES-256-GCM** con clave derivada por
  **scrypt** (o Argon2id si se aprueba una dependencia vetada), sal aleatoria,
  nonce único, tag y parámetros versionados. No se inventa un formato
  criptográfico.
- Alternativa preferida para la primera iteración: exportar el keyring a un
  archivo y cifrarlo con una herramienta vetada (`age` o 7-Zip con AES-256),
  evitando criptografía propia en la app.
- Contraseña: definida por el custodio, sin valor por defecto, con requisitos de
  longitud/entropía y confirmación. No se guarda en la app.
- Almacenamiento: dos copias en medios/ubicaciones separadas de los respaldos;
  acceso registrado; sobre sellado o caja fuerte; nunca en el repositorio, en
  `backups/`, en OneDrive compartido ni en el mismo equipo.
- Importación: acción explícita de SUPERADMIN, con segunda aprobación,
  passphrase, verificación de `claveId` contra los manifiestos y auditoría. No
  sobrescribe la clave activa sin un procedimiento de rotación.

**C. Recuperación offline**

- Para una instalación pequeña, el kit cifrado en dos medios offline es
  suficiente.
- Para varias sedes/organización, usar un gestor de secretos o KMS/HSM con
  envelope encryption; la app recibe la clave de datos al arrancar y la cachea
  cifrada con `safeStorage` para modo offline.
- Si se requiere reparto de confianza, usar un esquema estándar de secret
  sharing (por ejemplo, `ssss`/Shamir) con umbral y custodios definidos; no
  implementar uno propio.
- No usar una clave derivada del nombre del equipo, del usuario, del disco o de
  una contraseña fija: no aporta seguridad y crea una falsa sensación de
  recuperación.

### 4.4 Rotación y revocación

**Rotación programada:**

1. Generar nueva clave de 32 bytes.
2. Añadirla al keyring como `ACTIVA`; pasar la anterior a `RETIRADA`.
3. Firmar los respaldos nuevos con la nueva; los antiguos se siguen verificando
   con la retirada.
4. Exportar un nuevo kit de escrow y verificar su importación en un perfil
   limpio.
5. Auditar `ROTAR_CLAVE` con `claveId` anterior/nuevo, operador y aprobador.

**Revocación por compromiso:**

1. Marcar la clave como `REVOCADA` y dejar de aceptar manifiestos con ese
   `claveId`.
2. Crear una clave nueva y un kit nuevo.
3. Crear respaldos nuevos desde una base conocida como buena; no re-firmar
   automáticamente los respaldos antiguos.
4. Conservar los archivos y manifiestos revocados como evidencia; no borrarlos
   sin aprobación.
5. Auditar `REVOCAR_CLAVE`, notificar a los custodios y revisar accesos.

### 4.5 Cambios de comportamiento necesarios (propuesta)

- `obtenerClave({ crear: true })` **no debe crear** si existe algún
  `*.manifest.json`, un keyring o un archivo de clave previo. Debe lanzar un
  error accionable: "Existe una clave o hay respaldos; importe el kit o
  inicialice explícitamente".
- Si falta la clave y hay respaldos, la app debe entrar en **modo de solo
  lectura de respaldos**: listar como no verificables, bloquear creación y
  mostrar un aviso persistente. No debe rotar en silencio.
- La inicialización de una instalación nueva debe ser una acción explícita,
  auditada y con confirmación; si ya hay respaldos, exige importar el kit.
- Añadir eventos de auditoría: `CREAR_CLAVE`, `EXPORTAR_CLAVE`,
  `IMPORTAR_CLAVE`, `ROTAR_CLAVE`, `REVOCAR_CLAVE`, `FALLO_CLAVE`.
- Añadir una pantalla de "Custodia de clave" con `claveId` activo, claves
  retiradas, último escrow y fecha de próxima prueba de recuperación.
- Restringir el archivo de clave con ACL de Windows al usuario de la app y
  Administradores; verificar con `icacls`.
- No incluir la clave en logs, mensajes de error, manifiestos, reportes ni
  soportes.

### 4.6 Criterios de aceptación del diseño

1. Simular pérdida de `backup-signing.key.bin` con respaldos existentes: la app
   bloquea la creación, no genera clave nueva y muestra el procedimiento.
2. Exportar el kit, borrar el perfil, importarlo en un perfil limpio y
   restaurar un respaldo antiguo: debe verificar y restaurar.
3. Rotar la clave: los respaldos nuevos usan la nueva; los antiguos siguen
   verificando con la retirada.
4. Revocar una clave: los manifiestos con ese `claveId` se rechazan y queda
   auditoría.
5. No hay clave en texto plano fuera de `safeStorage` o del kit cifrado.
6. La exportación/importación exige segunda aprobación y queda auditada.
7. Prueba de recuperación documentada y repetida al menos una vez antes de
   producción.

---

## 5. Política propuesta para respaldos legacy

> **Estado:** diseño, no implementado. No se generó ningún manifiesto HMAC para
> los respaldos existentes y no se habilitó su restauración.

### 5.1 Inventario actual

| Dato | Valor |
|---|---|
| Archivos `.db` en `data/backups` | **25** |
| Manifiestos `.manifest.json` | **0** |
| Tamaño total | **7.65 GB** |
| `.db-wal` | 25, todos de 0 bytes |
| `.db-shm` | 25, todos de 32 KB |
| Más antiguo | `2026-10-24 19:16:38` |
| Más reciente | `2026-11-13 17:23:20` |
| Nombres | 24 `farmacia_backup_auto_global_*` y 1 `farmacia_backup_sede_sede_4_*` |
| Tamaño del más reciente | ~383 MB |

Ninguno es restaurable desde la app: no tienen manifiesto y no se puede
acreditar su autenticidad ni su sede. Un ADMIN ni siquiera los ve; SUPERADMIN
los ve como `No restaurable`.

### 5.2 Definición

Un **respaldo legacy** es un `.db` con nombre compatible con el patrón de la
app pero sin un manifiesto HMAC válido creado por esta instalación. No se
considera auténtico, aunque su contenido sea SQLite válido. La validación
estructural solo demuestra que el archivo puede abrirse; no demuestra quién lo
creó, cuándo ni si fue alterado.

### 5.3 Principios

1. **No sellar automáticamente.** Generar un HMAC ahora atribuiría una
   autenticidad que no existió; sería mentir sobre la historia.
2. **No borrar ni modificar el original.** Se trabaja sobre copias en cuarentena.
3. **No habilitar la restauración normal.** La UI debe seguir mostrando
   `No restaurable`.
4. **Importación supervisada y auditada.** Solo con aprobación, ventana de
   mantenimiento y respaldo previo.
5. **Conservar la evidencia.** Hash, tamaño, `mtime`, nombre, ubicación,
   operador, aprobador y resultado.
6. **Crear un respaldo autenticado después.** La importación no termina hasta
   que exista un respaldo nuevo firmado y verificado.

### 5.4 Procedimiento propuesto

**Fase 1 — Identificación e inventario**

- Listar todos los `.db` sin manifiesto; calcular SHA-256 y tamaño; registrar
  `mtime`, ruta y nombre.
- Guardar el inventario en un documento controlado (no en el repositorio) con
  fecha, operador y aprobador.
- Marcar cada archivo como `LEGACY_NO_AUTENTICADO`.
- No mover ni renombrar los originales.

**Fase 2 — Validación estructural sobre una copia**

- Copiar a un directorio de cuarentena en `%TEMP%` o medio controlado.
- Verificar que el `.db-wal` esté vacío. Un `.db-shm` de 32 KB no contiene datos
  durables; se puede descartar en la copia si no hay conexiones abiertas.
- Ejecutar `PRAGMA integrity_check` y `PRAGMA foreign_key_check`.
- Comprobar tablas requeridas (`auditoria`, `usuarios`, `sedes`,
  `migrations`, inventario, órdenes, etc.).
- Comparar las migraciones aplicadas con la lista conocida; registrar
  `user_version` y huella de esquema.
- Si el esquema es incompatible, **no migrar automáticamente**: definir un ETL
  controlado o descartar la importación.
- Registrar el resultado por archivo: `VALIDO_ESTRUCTURAL`,
  `CORRUPTO`, `ESQUEMA_INCOMPATIBLE`.

**Fase 3 — Procedencia y aprobación**

- El operador declara origen (sede, fecha aproximada, motivo, quién lo generó).
- Clasificar la procedencia como `DECLARADA`, nunca `VERIFICADA`.
- Exigir aprobación de SUPERADMIN y de una segunda persona (seguridad/operación
  o jurídica).
- Si no hay procedencia creíble, usar el archivo solo como último recurso y
  dejar constancia del riesgo.

**Fase 4 — Importación supervisada**

- Ventana de mantenimiento con la app cerrada o en modo mantenimiento.
- Crear y validar un respaldo autenticado de la base actual antes de tocar nada.
- Verificar espacio libre suficiente para base actual + staging + rollback.
- Copiar el legacy a staging, validar de nuevo y promover con el mismo
  mecanismo de journal/rollback que usa la restauración autenticada, o con un
  procedimiento manual equivalente.
- No usar la ruta normal de `backups:restaurar` para un legacy; no debe existir
  un botón que lo haga.
- Si la importación falla, restaurar la base previa y conservar el legacy
  intacto.

**Fase 5 — Auditoría y cierre**

- Registrar un evento nuevo `IMPORTAR_RESPALDO_LEGACY` (requiere añadirlo a
  `AUDIT_ACTIONS`) con hash del legacy, hash de la base previa, operador,
  aprobador, resultado y observaciones.
- Crear inmediatamente un respaldo autenticado de la base importada.
- Verificar ese respaldo nuevo en una SQLite aislada (no solo listarlo).
- Conservar el legacy original, la copia de cuarentena y el respaldo previo
  según la política de retención legal.
- Documentar la decisión y el resultado en el expediente de la sede.

### 5.5 Prohibiciones explícitas

- No generar `hmac` para un legacy ni marcarlo `restaurable:true`.
- No etiquetarlo como "verificado", "auténtico" u "oficial".
- No sobrescribir, renombrar ni borrar el original.
- No importar sin respaldo previo autenticado y sin rollback probado.
- No usar la importación legacy para saltarse roles, sede o doble control.
- No migrar un esquema desconocido sin revisión y pruebas.

### 5.6 Criterios de aceptación de la política

1. Inventario completo con hash de los 25 archivos.
2. Cada archivo clasificado y con decisión documentada.
3. Ningún legacy aparece como restaurable en la UI.
4. Un legacy validado se importa en un entorno aislado, con auditoría y
   rollback, y luego se crea un respaldo autenticado.
5. El original permanece intacto y verificable por hash.
6. La política y el procedimiento están aprobados por operación y por la
   responsabilidad jurídica/privacidad.

---

## 6. Análisis de `release_payload.test.js`

### 6.1 Fallo observado

```text
not ok 101 - electron-builder empaqueta el frontend pero excluye salidas previas dentro de dist
  location: 'tests/unit/release_payload.test.js:9:1'
      assert.ok(files.includes('dist/**/*'))
    TestContext.<anonymous> (tests/unit/release_payload.test.js:10:10)
# tests 324
# suites 36
# pass 323
# fail 1
```

### 6.2 Causa exacta

La prueba espera que `package.json#build.files` contenga el patrón `dist/**/*`.
El archivo actual contiene `dist/renderer/**/*` (línea 68 de `package.json`), que
es el directorio real de salida de Vite. El patrón no coincide, así que
`Array.prototype.includes` devuelve `false` y la prueba falla.

### 6.3 Condición preexistente

- La prueba fue **añadida** en el commit `89420f3` ("feat(backend): implementar
  validación estricta de evidencias biométricas y firma física", 2026-10-25).
- En ese mismo commit, `package.json` ya tenía `dist/renderer/**/*`.
- `git show 89420f3:package.json`, `git show HEAD:package.json`,
  `git show main:package.json` y el archivo de trabajo muestran el mismo patrón
  `dist/renderer/**/*`.
- Por tanto, la prueba nació con una expectativa que no coincidía con el
  `package.json` de su propio commit. No es una regresión de la Etapa 4.2, que
  se auditó después (2026-11-14/15).
- `git diff --stat HEAD..main` solo muestra diferencias en
  `data/backup_config.json` y `data/cloud_sync_state.json`; el desajuste está
  también en `main`.

### 6.4 Impacto de seguridad

- **Directo:** ninguno. No hay ejecución de código, exposición de datos ni
  bypass de permisos.
- **Indirecto:** el fallo crónico de la suite reduce la señal de CI y puede
  enmascarar una regresión real de empaquetado. Un cambio futuro en
  `build.files` que excluya el renderer no se detectaría si el test ya está
  rojo por otro motivo.
- **Empaquetado:** el patrón `dist/renderer/**/*` parece correcto para Vite;
  no se debe cambiar a `dist/**/*` a ciegas porque eso incluiría
  `win-unpacked`, instaladores y artefactos que las exclusiones intentan
  evitar. La decisión debe basarse en el `outDir` real y en una inspección del
  payload de `electron-builder --dir`.

### 6.5 Recomendación

1. Confirmar el `outDir` de Vite (`vite.config.js`) y el layout de
   `electron-builder`.
2. Si el layout correcto es `dist/renderer`, actualizar la prueba para exigir
   `dist/renderer/**/*` y mantener las exclusiones; añadir una comprobación de
   que no se incluyen `dist/win-unpacked/**` ni instaladores.
3. Si el layout correcto es `dist`, cambiar `build.files` y ajustar las
   exclusiones, pero verificar el payload real antes.
4. No modificar la prueba solo para que pase sin decidir el layout.
5. Documentar la decisión en `docs/backups.md` o en un documento de
   empaquetado, y ejecutar `electron-builder --dir` en CI.

**Estado:** fallo preexistente, ajeno a la Etapa 4.2, no corregido en esta
auditoría. No se alteró la prueba ni `package.json`.

---

## 7. Verificaciones manuales pendientes (A, B y C)

> **Estado: NO EJECUTADAS.** No se marcan como aprobadas. Los procedimientos
> siguientes son reproducibles y usan una base aislada; no deben ejecutarse
> contra producción ni contra `data/farmacia.db`.

### 7.1 Preparación común

```powershell
# Desde la raíz del repositorio.
corepack pnpm run build:react

$root = Join-Path $env:TEMP ("farmacia-manual-" + (Get-Date -Format "yyyyMMdd-HHmmss"))
New-Item -ItemType Directory -Path $root -Force | Out-Null

$env:NODE_ENV = "test"
$env:FARMACIA_TEST_DB_PATH = Join-Path $root "farmacia.db"
$userData = Join-Path $root "userData"
New-Item -ItemType Directory -Path $userData -Force | Out-Null

# Lanzar la app real con la BD y el userData aislados.
& .\node_modules\electron\dist\electron.exe . --user-data-dir=$userData
```

`NODE_ENV=test` hace que `resolveDbPath()` use `FARMACIA_TEST_DB_PATH`, que
`prepareDatabase` cree/migre la base y que no se inicien los planificadores.
`--user-data-dir` separa la clave `backup-signing.key.bin` y el estado de
Electron. Al terminar, cerrar la app y restaurar las variables de entorno.

Si la app no arranca porque falta `dist/renderer/index.html`, ejecutar
`corepack pnpm run build:react`.

### 7.2 Prueba A — PDF/PNG en el visor del sistema y rechazos

**Objetivo:** confirmar visualmente que el visor del sistema abre el PDF y el
PNG, y que los archivos inexistentes o con formatos no permitidos se rechazan
sin abrir nada.

**Pasos positivos:**

1. Iniciar sesión como SUPERADMIN o ADMIN.
2. Ir a **Catálogo CUM** y crear/seleccionar un registro.
3. Adjuntar un PDF real y válido; guardar.
4. Pulsar **Mostrar documento**; el visor PDF del sistema debe abrir
   `documento.pdf` desde `%TEMP%\farmacia-doc-*\`.
5. Repetir con un PNG real; el visor de imágenes debe abrir
   `documento.png`.
6. Cerrar el visor y comprobar que la app sigue respondiendo.

**Pasos negativos:**

1. Intentar adjuntar un SVG, un `.exe` o un archivo con extensión permitida pero
   contenido distinto (por ejemplo, SVG renombrado a `.pdf`). Si el selector
   `accept="image/*,application/pdf"` no permite elegirlo, usar el arnés o un
   build de desarrollo; **no marcar la prueba como aprobada si no se pudo
   ejecutar por la UI**.
2. Intentar un archivo de más de 10 MB.
3. Intentar un nombre con `../` o caracteres prohibidos.
4. Forzar un registro con un documento inexistente o una fila manipulada y
   pulsar **Mostrar documento**; debe rechazarse con un mensaje funcional y no
   debe abrirse el visor.

**Evidencia a registrar:** captura del visor, ruta temporal creada, mensaje
exacto de cada rechazo, hora y usuario. El arnés automatizado ya verificó la
ruta temporal y la respuesta IPC, pero **no** la apertura visual.

### 7.3 Prueba B — HTTPS externo y rechazo de esquemas

**Positivo:**

1. Iniciar sesión y abrir la documentación del receptor que contiene los
   enlaces de Wacom/ZKTeco (`src/components/DocumentacionReceptor.jsx`).
2. Pulsar un enlace HTTPS
   (`https://developer.wacom.com/downloads`,
   `https://developer-support.wacom.com/...` o
   `https://www.zkteco.com/en/ZKFingerSDKforWindows`).
3. Confirmar que se abre el navegador predeterminado y que la URL es HTTPS.
4. Confirmar que la app no crea una segunda ventana interna ni navega fuera del
   `index.html`.

**Negativo:**

En la app empaquetada no hay un control de UI para escribir URLs arbitrarias.
Para ejecutar los negativos, usar una de estas vías:

- el arnés de integración con una ventana controlada, o
- un build de desarrollo con DevTools y una base aislada, o
- una prueba unitaria de `esAperturaExternaPermitida` (ya existe en
  `tests/security/app_origin_policy.test.js`).

Casos:

| Entrada | Resultado esperado |
|---|---|
| `https://example.com/` | Abre el navegador (positivo). |
| `http://example.com/` | **No** abre; `window.open` devuelve `null` y el handler no llama a `shell.openExternal`. |
| `javascript:alert(1)` | **No** abre. |
| `data:text/html,<script>alert(1)</script>` | **No** abre. |
| `file:///C:/Windows/win.ini` | **No** abre. |
| `mailto:` / `ms-settings:` | **No** abre. |

La política real está en `electron/navigationPolicy.js:8-16`: solo `https:` con
host no vacío. `electron/main.js:49-56` aplica
`setWindowOpenHandler` y llama a `shell.openExternal` solo si la política lo
permite. La prueba unitaria cubre los esquemas; la apertura visual del navegador
sigue pendiente.

### 7.4 Prueba C — Restauración `SEDE` con ADMIN y efecto cross-sede

**Objetivo:** verificar el gate de ADMIN y, sobre todo, si la restauración de un
respaldo `SEDE` afecta a otras sedes.

**Precondiciones:** base aislada con al menos dos sedes y un usuario ADMIN
asignado a la sede 1. No usar producción.

**Pasos:**

1. Iniciar sesión como SUPERADMIN; crear un ADMIN de la sede 1 si no existe.
2. Crear un marcador en la sede 2 (por ejemplo, un receptor, un usuario o un
   movimiento de inventario) y anotar su identificador.
3. Iniciar sesión como ADMIN de la sede 1 y crear un respaldo manual. Debe
   quedar etiquetado `SEDE` y ser visible/restaurable para ese ADMIN.
4. Volver a SUPERADMIN y modificar la sede 2 después del respaldo (crear otro
   marcador o cambiar un dato).
5. Iniciar sesión como ADMIN de la sede 1 y restaurar el respaldo `SEDE`.
6. Comprobar:
   - que la restauración se permite (gate de ADMIN);
   - que el marcador de la sede 2 **sigue existiendo** (comportamiento seguro
     esperado);
   - que la sede 1 sí volvió al punto del respaldo.
7. Si el marcador de la sede 2 desaparece, **detener la prueba**: es la
   reproducción de `AC-4.2-02`. Registrar la evidencia y no continuar sobre esa
   base.

**Resultado actual esperado según el código:** el respaldo `SEDE` contiene la
base completa y la restauración promueve la base completa, por lo que el
marcador de la sede 2 desaparecerá. La demo aislada de la sección 8 ya lo
confirmó. La prueba manual sirve para confirmar el mismo efecto en la UI real y
para decidir el diseño correctivo (backup filtrado por sede o restauración
reservada a SUPERADMIN).

**Evidencia:** capturas antes/después, nombres de archivo, `claveId`, filas de
auditoría, hash de la base previa y resultado de la restauración.

### 7.5 Estado de las verificaciones

| Prueba | Estado | Motivo |
|---|---|---|
| A — PDF/PNG en visor | **NO EJECUTADA** | Requiere inspección visual en Windows; el arnés intercepta `shell` y no abre el visor. |
| A — rechazos de formato/archivo inexistente | **PARCIAL / NO EJECUTADA en UI** | Cubierta por pruebas y arnés; la UI puede filtrar formatos. |
| B — HTTPS positivo | **NO EJECUTADA** | Requiere observar el navegador del sistema. |
| B — rechazo de HTTP/`javascript:`/`data:`/`file:` | **CUBIERTA POR PRUEBAS, NO VISUAL** | `app_origin_policy.test.js` valida la política; la UI empaquetada no tiene entrada libre. |
| C — restauración `SEDE` con ADMIN | **NO EJECUTADA** | Requiere UI real con dos sedes; la demo aislada ya confirmó el efecto cross-sede. |

---

## 8. Evidencias de las demostraciones aisladas

Los tres scripts están en
`C:\Users\USER-D\AppData\Local\Temp\opencode\audit-4.2\`. Se ejecutaron con
`ELECTRON_RUN_AS_NODE=1` y el binario de Electron 32. Cada script devuelve
`EXIT_CODE=2` cuando confirma el hallazgo; no es un fallo del script.

### 8.1 `AC-4.2-01` — bypass de `esAutomatico`

Archivo: `demo_esautomatico.js`; salida:
`demo_esautomatico.out.txt`.

| Paso | Resultado |
|---|---|
| Sesión | `audit_usuario`, rol `USUARIO`, sede 1, token válido. |
| `backups:crear` con `{}` | `{ ok:false, error:"Solo el Superadmin y el Administrador de sede pueden gestionar respaldos." }` |
| `backups:crear` con `{ esAutomatico:true }` | `ok:true`; `farmacia_backup_auto_global_20261115_192954.db` + `.manifest.json`; `restaurable:true`; `firma:"e3cd241b1e594d05"`. |
| Filas de auditoría nuevas | **0** |
| `backups:listar` como USUARIO | `{ ok:false, error:"Solo el Superadmin..." }` |
| Conclusión | **VULNERABILIDAD CONFIRMADA**: un USUARIO creó un respaldo global firmado y no auditado. |

### 8.2 `AC-4.2-02` — restauración `SEDE` cross-sede

Archivo: `demo_sede_cruzada.js`; salida: `demo_sede_cruzada.out.txt`.

| Paso | Resultado |
|---|---|
| Sedes antes del respaldo | 1 Sede Principal, 2 Sede Quibdó, 3 Sede Medellín. |
| Respaldo creado por ADMIN de sede 1 | `farmacia_backup_sede_Sede_Principal_20261115_192953.db`; contiene **las 3 sedes**. |
| Cambios posteriores | Sede 2 renombrada, sede 4 creada, marcador de auditoría en sede 2. |
| Restauración por ADMIN de sede 1 | `{ restaurado:true }`. |
| Sedes después | 1, 2 y 3 originales; la sede 4 desapareció; el marcador de sede 2 desapareció; la sede 2 volvió a "Sede Quibdó". |
| Conclusión | **CONFIRMADO**: restaurar el respaldo `SEDE` revirtió datos de otra sede. |

### 8.3 `AC-4.2-03` — pérdida de clave y rotación silenciosa

Archivo: `demo_perdida_clave.js`; salida: `demo_perdida_clave.out.txt`.

| Paso | Resultado |
|---|---|
| Primer respaldo | `farmacia_backup_global_20261115_192954.db`, `claveId` `642e110fb340f601`. |
| Borrar `backup-signing.key` | Archivo de 32 bytes eliminado. |
| Segundo respaldo | `farmacia_backup_global_20261115_192956.db`, `claveId` `0ba65b53a791e0cd`. |
| Claves | Distintas; la nueva se creó sin aviso. |
| Listado | El segundo `restaurable:true`; el primero `restaurable:false`, motivo "Autenticidad no verificada." |
| Restaurar el primero | "No se pudo verificar la autenticidad del respaldo. No se restauró." |
| Conclusión | **CONFIRMADO**: la pérdida de la clave rota en silencio el acceso a los respaldos anteriores. |

**Hallazgo adicional observado en la primera corrida:** dos respaldos creados
dentro del mismo segundo usaron el mismo nombre; el segundo sobrescribió al
primero. La corrida definitiva se separó 1.2 s para aislar la pérdida de clave.
Esto sustenta `AC-4.2-06`.

---

## 9. Pruebas automatizadas, lint y auditoría

### 9.1 Pruebas específicas

Comando:

```powershell
$files = @(
  ".\tests\security\backup_restore_security.test.js",
  ".\tests\security\orden_documentos.test.js",
  ".\tests\ipc\ipc_handlers.test.js",
  ".\tests\database\startupRecovery.test.js"
)
$env:ELECTRON_RUN_AS_NODE = "1"
& ".\node_modules\electron\dist\electron.exe" --test $files
Remove-Item Env:\ELECTRON_RUN_AS_NODE
```

Resultado actual: **55/55**, 6 suites, 0 fallos. Incluye 12 pruebas de
restauración, 9 de documentos de órdenes, 22 de IPC y 12 de `startupRecovery`.
Evidencia: `%TEMP%\opencode\audit-4.2\targeted-final.txt`.

### 9.2 Suite completa

Comando:

```powershell
$files = (Get-ChildItem ".\tests" -Recurse -Filter *.test.js).FullName
$env:ELECTRON_RUN_AS_NODE = "1"
& ".\node_modules\electron\dist\electron.exe" --test $files
Remove-Item Env:\ELECTRON_RUN_AS_NODE
```

Resultado actual:

```text
# tests 324
# suites 36
# pass 323
# fail 1
# cancelled 0
# skipped 0
# todo 0
```

El único fallo es `tests/unit/release_payload.test.js`, analizado en la sección
6. No se modificó para hacerlo pasar. Evidencia:
`%TEMP%\opencode\audit-4.2\suite-final.txt`.

### 9.3 Lint y auditoría de dependencias

| Comprobación | Resultado | Evidencia |
|---|---|---|
| `corepack pnpm run lint` | **0 errores** (exit 0) | `lint-final.txt` |
| `corepack pnpm audit --prod` | **Sin vulnerabilidades conocidas** | `audit-final.txt` |
| `git diff --check` | **Exit 0**, solo avisos LF→CRLF | salida de la sesión |
| `better-sqlite3` ABI | Todas las pruebas SQLite corrieron bajo Electron 32 | no se ejecutó `rebuild:node` |

### 9.4 Arnés Electron real (evidencia previa)

La corrida de la auditoría 4.2 en
`%TEMP%\farmacia-etapa42\harness-20261115-100542\` reportó:

| Escenario | Resultado |
|---|---|
| `restore-valid` | `ok:true`, marcador `1 → 0`, `relaunch=1`, `exit=1`, auditoría de éxito 1, 38 tablas. |
| `restore-foreign` | `ok:false` por manifiesto, `relaunch=0`, `exit=0`, base activa intacta. |
| `restore-corrupt` | `ok:false` por huella, `relaunch=0`, `exit=0`, tablas intactas. |

No se reejecutó el arnés en esta sesión; se cita como evidencia previa. Para
reproducirlo:

```powershell
corepack pnpm run build:react
.\tests\e2e\electron-real\run_harness.ps1
```

### 9.5 Estado del repositorio

| Dato | Valor |
|---|---|
| Rama | `fix/auditoria-pr3` |
| HEAD | `ff854dd9b54cc735f534fdb4eb4b5336fa37296c` (el mismo commit que `origin/fix/auditoria-pr3`) |
| `main` | `13d8369d222a19c2834b6b3d84a1e1517cdd817c` |
| Relación | HEAD es ancestro de `main`; `main` incluye la fusión de la rama (PR #4) y dos commits posteriores que solo cambian `data/backup_config.json` y `data/cloud_sync_state.json`. |
| Cambios de trabajo | 51 entradas en `git status --short`, incluidas modificaciones y archivos sin seguimiento (entre ellos este documento y los dos informes de auditoría). |
| `git add` | No se usó `git add` ni `git add -N`. |
| `main` | No fue modificado por esta auditoría. |
| Migraciones | No se modificó ningún archivo de `backend/database/migrations/`. |
| `data/farmacia.db` | SHA-256 `5A9093839ED8C6F19486D7111990D126E6A90EA37CAB20223520753F351CEF41`; `mtime` 2026-11-13 17:25:43; sin cambios. |
| Dependencias | `electron` sigue en 32.3.3. El árbol contiene cambios ajenos a 4.2 en `@xmldom/xmldom`, `node-forge`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` y la eliminación de `react-router-dom`; no fueron modificados por esta auditoría. |

---

## 10. Archivos revisados

### 10.1 Backend y seguridad

- `backend/services/backupManifest.js`
- `backend/services/backupService.js`
- `backend/database/startupRecovery.js`
- `backend/repositories/auditoriaRepository.js`
- `backend/controllers/backupController.js`
- `backend/ipcHandlers.js`
- `backend/services/permisoService.js`
- `backend/database/connection.js`
- `backend/security/ipcSecurity.js`
- `backend/controllers/ordenController.js`
- `shared/errorSanitizer.js`
- `shared/documentPolicy.js`
- `shared/appOriginPolicy.js`
- `shared/contentSecurityPolicy.js`
- `shared/constants.js`
- `electron/main.js`
- `electron/preload.js`
- `electron/navigationPolicy.js`
- `electron/documentOpener.js`

### 10.2 Frontend

- `src/pages/Respaldos.jsx`
- `src/pages/CatalogoCUM.jsx`
- `src/pages/Entregas.jsx`
- `src/pages/Recepcion.jsx`
- `src/components/DocumentacionReceptor.jsx`
- `src/services/inventarioApi.js`
- `src/shimWindowApi.js`

### 10.3 Pruebas y documentación

- `tests/security/backup_restore_security.test.js`
- `tests/security/orden_documentos.test.js`
- `tests/security/catalogo_documentos.test.js`
- `tests/security/document_policy.test.js`
- `tests/security/app_origin_policy.test.js`
- `tests/security/ipc_handlers_security.test.js`
- `tests/security/ipc_sender_policy.test.js`
- `tests/security/preload_exposure.test.js`
- `tests/security/renderer_credentials.test.js`
- `tests/ipc/ipc_handlers.test.js`
- `tests/database/startupRecovery.test.js`
- `tests/unit/release_payload.test.js`
- `tests/e2e/electron-real/` (arnés y README)
- `docs/backups.md`
- `docs/auditoria-seguridad-4.2.md`
- `docs/auditoria-seguridad-4.1.md`
- `package.json`, `.gitignore`, `vite.config.js`
- `data/backup_config.json` y `data/backups/` (solo lectura/inventario)

---

## 11. Riesgos residuales y criterios de cierre

### 11.1 Riesgos residuales

1. **Custodia de la clave (Alta).** Sin escrow, perder el equipo/perfil equivale
   a perder todos los respaldos. `AC-4.2-03`.
2. **Cross-sede (Alta).** Un ADMIN puede revertir otras sedes con un respaldo
   `SEDE`. `AC-4.2-02`.
3. **Bypass de creación (Alta).** Un USUARIO puede crear respaldos globales sin
   auditoría. `AC-4.2-01`.
4. **Crecimiento sin retención (Media).** 7.65 GB y 25 respaldos; el más
   reciente ~383 MB; no hay purga. `AC-4.2-04`.
5. **Espacio en restauración (Media).** Sin comprobación previa; riesgo de
   `RECOVERY_REQUIRED`. `AC-4.2-05`.
6. **Colisión de nombres (Media).** Resolución de segundos; un respaldo puede
   sobrescribirse. `AC-4.2-06`.
7. **Confidencialidad (Media).** SQLite en texto plano; `data/backups` en
   OneDrive en este entorno. `AC-4.2-08`.
8. **Replay de respaldos (Baja/Media).** Un par `.db` + manifiesto antiguo
   válido no se distingue de uno actual. No hay secuencia/frescura.
9. **Enlaces y TOCTOU (Baja).** No se rechazan symlinks/reparse points; el hash
   limita el abuso. Ventana de validación/copia cubierta por rehash.
10. **Documentación (Baja).** `docs/backups.md` describe retención inexistente;
    `release_payload` sigue rojo.
11. **Electron 32 fuera de soporte (H-12 de 4.1).** No se actualizó por
    restricción; sigue siendo un riesgo de plataforma.
12. **Contraseñas iniciales del seed (H-11 de 4.1).** `wilmer`/`Wilmer465*` y
    `superadmin`/`Superadmin123*`; forzar cambio en primer arranque.
13. **Temporales con datos personales (H-13 de 4.1).** `farmacia-doc-*` en
    `%TEMP%` sin limpieza observada.
14. **API HTTP sin TLS (H-15 de 4.1).** Mantener `127.0.0.1` o TLS.
15. **Mismo usuario de Windows.** El HMAC y DPAPI no protegen contra malware que
    corre como el usuario de la app.

### 11.2 Criterios de cierre

La Etapa 4.2 solo puede declararse cerrada cuando se cumpla todo lo siguiente:

1. **`AC-4.2-01` resuelto:** `backups:crear` valida rol siempre; el renderer no
   puede activar `esAutomatico`; la creación automática es interna y auditada.
2. **`AC-4.2-02` resuelto o aceptado formalmente:** o los respaldos `SEDE` se
   filtran por sede, o la restauración de una copia completa queda reservada a
   SUPERADMIN con advertencia y doble control. La prueba C debe pasar sin
   afectar otras sedes.
3. **`AC-4.2-03` resuelto:** keyring versionado, escrow cifrado, importación en
   perfil limpio, rotación/revocación y bloqueo de creación silenciosa. Prueba
   de recuperación documentada.
4. **`AC-4.2-04` decidido:** política de retención/archivo/almacenamiento
   aprobada; documentación alineada; alerta de disco y límite operativo.
5. **`AC-4.2-05` resuelto:** comprobación de espacio antes de restaurar y prueba
   con disco simulado lleno.
6. **`AC-4.2-06` resuelto:** nombres únicos (milisegundos + nonce/secuencia) y
   creación exclusiva; no se sobrescribe un respaldo.
7. **`AC-4.2-07` resuelto o aceptado:** la UI distingue "firma válida" de
   "contenido verificado"; idealmente verifica el hash al listar o al pulsar.
8. **`AC-4.2-08` aceptado:** decisión de cifrado en reposo/ACL/almacenamiento
   externo, con responsable y fecha.
9. **`AC-4.2-09` resuelto:** eliminar el fallback de clave cruda o exigir un
   override explícito.
10. **`AC-4.2-10` resuelto:** reemplazo atómico del manifiesto y bloqueo por
    nombre.
11. **`AC-4.2-11` resuelto:** `docs/backups.md` actualizado a la realidad.
12. **`AC-4.2-12` decidido:** doble control para restauración y custodia de
    clave, o aceptación formal del riesgo.
13. **Verificaciones manuales A, B y C ejecutadas** con evidencia y resultado
    aceptable.
14. **Pruebas:** suite completa sin fallos nuevos; `release_payload` corregido o
    aceptado como deuda separada con dueño y fecha.
15. **Lint/auditoría:** 0 errores y sin vulnerabilidades conocidas.
16. **Datos:** `data/farmacia.db` sin cambios; respaldos legacy conservados;
    ningún legacy marcado como auténtico.
17. **Gobierno:** aprobación formal de operación, seguridad y privacidad; no hay
    hallazgos altos abiertos sin aceptación documentada.

---

## 12. Conclusión

La corrección de los tres hallazgos originales es real y está bien probada:
la restauración ya no acepta una SQLite ajena por su nombre, el reinicio espera
la promesa y los mensajes de adjuntos son funcionales. El HMAC-SHA256 está bien
construido y la restauración tiene staging, validación y rollback.

Pero la Etapa 4.2 **no puede cerrarse** con el estado actual:

- el control de rol de `backups:crear` se puede saltar con `esAutomatico`;
- un respaldo `SEDE` revierte todas las sedes;
- la pérdida de la clave inutiliza los respaldos anteriores sin recuperación;
- no hay retención efectiva, comprobación de espacio en restauración ni nombres
  únicos;
- los respaldos son texto plano y el legacy no tiene un procedimiento aprobado;
- las verificaciones manuales A/B/C siguen pendientes.

El trabajo de esta auditoría es documental y de pruebas aisladas. No se
implementaron custodia ni importación legacy, no se modificó el código de
producción, no se tocó `main`, no se actualizaron Electron ni dependencias, no
se alteraron migraciones y `data/farmacia.db` conserva su hash y `mtime`.
