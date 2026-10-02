# Auditoría técnica: bajas/eliminaciones, permisos de Superadmin, UI y respaldos

## Contexto

Alcance en tres bloques: bugs de lógica y flujo, consistencia visual, y
reparación/optimización de respaldos. Recoge lo verificado en el código y las
decisiones tomadas con el usuario.

**Entorno:** el proceso main de Electron cachea `backend/services`. Todo cambio de
servicio exige matar `electron.exe` y relanzar `npm run dev` antes de validar en
la UI. Los tests se ejecutan con el runtime de Electron (ver `AGENTS.md`).

---

## Decisiones tomadas

| Decisión | Resolución |
|---|---|
| Eliminación de trabajadores | Anonimizar y conservar el histórico. Nunca se borra la fila de `usuarios`. |
| Quién aprueba las bajas | ADMIN solo su propia sede (verificado server-side); SUPERADMIN todas. |
| Peso de los respaldos | Optimizar estructura + retención. Sin compresión ni exclusión del catálogo. |
| Alcance de la unificación visual | Quirúrgico: modal centrado, botón Escanear, selector de sede, variantes de ancho. |
| Purga de respaldos | Solo archivos automáticos, y con el conteo por alcance de sede. |
| Clave de deduplicación | Polimórfica `(tipo_registro, registro_id)`. |

---

## Hallazgos verificados

### Bloque 1 — Bugs

1. **Duplicidad de solicitudes.** `solicitudEliminacionService.crear` inserta sin
   consultar solicitudes `PENDIENTE`. `006_solicitudes_eliminacion.js` solo define
   índices no únicos sobre `sede_id` y `estado`.
2. **Escritura parcial.** El `INSERT` y el registro de auditoría no comparten
   transacción. Si `auditoriaRepository.registrar` falla, la solicitud queda
   creada y el usuario ve "Error interno"; al reintentar se duplica.
3. **Formulario que se congela.** `Inventario.jsx:91-112` no tiene `try/catch`.
   Si la promesa IPC **rechaza** en lugar de devolver `{ok:false}`,
   `setEnviandoBaja(false)` nunca se ejecuta y el botón queda deshabilitado de
   forma permanente. `Eliminaciones.jsx:120-153` repite el patrón.
4. **Aprobación: dos causas distintas, no una.**
   - Para `ADMIN`, `resolver` lanza `PermisoError` ("solo el Superadmin"), así que
     no se ejecuta nada. Es un rechazo real, no un fallo silencioso.
   - Para `SUPERADMIN` sí escribe, pero `loteService.calcularEstado`
     (`loteService.js:19`) colapsa `DADO_DE_BAJA` a **`AGOTADO`**. El lote queda
     en la UI idéntico a uno sin existencias: no hay rastro visible de la baja.
5. **Fuga de lotes dados de baja.** `loteRepository.findAll` no filtra
   `estado_manual` y `Eliminaciones.jsx:70` solo filtra por
   `cantidad_total_unidades > 0`. Un lote dado de baja con existencias sigue
   siendo seleccionable para intercambio.
6. **`lotes` no tiene columna `estado`.** El estado mostrado es derivado en
   `loteService.calcularEstado` a partir de `estado_manual`. No existe dónde
   registrar por qué ni quién dio de baja un lote.

### Bloque 2 — Sesiones y acceso

7. **No hace falta código nuevo para cortar el acceso.** `authService.login:79`
   rechaza cualquier usuario con `estado !== ACTIVO`, y
   `sessionService.resolverUsuarioDesdeSesion:50` relee el usuario de la base en
   cada petición y destruye la sesión si ya no está `ACTIVO`. Anonimizar con
   `estado = 'ELIMINADO'` bloquea login y sesiones vivas por sí solo.
8. `sesiones` es un `Map` en memoria (`sessionService.js:7`): no sobrevive a un
   reinicio, así que no hay sesiones persistidas que purgar.
9. Solo hay que añadir `ELIMINADO` a `ESTADOS_REGISTRO`
   (`shared/constants.js:47`), que hoy solo declara `ACTIVO` e `INACTIVO`.

### Bloque 3 — UI

10. `.modal-overlay` (`global.css:1658`) usa `align-items: flex-start` y
    `.modal-card` fija `max-width: 650px`. Hay anchos inline dispersos: 500, 520,
    640, 700, 720 y 750 px en `CatalogoCUM`, `Entregas`, `Eliminaciones`,
    `Ordenes` e `Inventario`. No hay listener de `Escape` en ningún componente.
11. "📦 Escanear / Recibir" (`Inventario.jsx:151`) usa `btn-accion-azul`, un chip
    pequeño y claro (`#dbeafe`, radio 6px, `0.78rem`), junto a
    `btn-toggle-action btn-primario` (`#2563eb` sólido, radio 8px, `0.85rem`).
    La jerarquía visual está rota dentro del mismo grupo de acciones.
12. Selector de sede del encabezado (`AppShell.jsx:318`) usa
    `user-sede-selector` (fondo translúcido oscuro, `0.72rem`, `max-width:200px`)
    frente a `sede-reporte-select` en `Reportes.jsx:251` (fondo blanco, `0.88rem`,
    `min-width:260px`, anillo de foco). `Auditoria.jsx` y `Respaldos.jsx` copian
    además el estilo inline: hay tres variantes del mismo control.

### Bloque 4 — Respaldos

13. Los arreglos de la sesión anterior **ya están en disco y verificados**
    (`docs/backups.md`): `backupController` async, `db.backup()` y
    `ACTUALIZAR_CONFIG` añadido a `AUDIT_ACTIONS`. Si la app sigue fallando, la
    causa más probable es la caché del proceso main, no el código.
14. **Peso desproporcionado: 81 MB por respaldo** con 65.335 filas de
    `catalogo_cum`, 1 medicamento, 3 lotes, 2 órdenes y ~104 de auditoría.
    Causa: `018_catalogo_cum.js` crea 10 índices, 9 sobre columnas `TEXT` largas;
    SQLite duplica en cada índice el texto indexado.
15. **Índices confirmados como no usados**, revisando todas las consultas de
    `catalogoCumService.js`:
    - `idx_catalogo_cum_cum` es **redundante**: `cum TEXT NOT NULL UNIQUE` ya crea
      un índice implícito, y las consultas usan `c.cum = t.cum`.
    - `_fuente`, `_estado` y `_version`: ninguna consulta filtra por esas columnas
      de forma independiente.
    - `_producto`, `_principio` y `_registro`: la búsqueda
      (`catalogoCumService.js:595`) usa `LIKE` con `OR` sobre tres columnas. Sin
      `COLLATE NOCASE`, `LIKE` no aprovecha índice, y el `OR` impide usar los
      tres a la vez.
    - **Se conservan** `_gtin`, `_gtin_log` y `_gtin_venta`: hay consultas de
      igualdad directa (`catalogoCumService.js:556,563,570`).
16. **`auto_vacuum` inoperante.** `connection.js:44` aplica
    `auto_vacuum = INCREMENTAL` sobre una base que ya tiene tablas; SQLite lo
    ignora y solo surte efecto tras un `VACUUM` completo. Por eso
    `incremental_vacuum(100)` de `crear()` libera 100 páginas y nada más.
17. **`VACUUM` no puede ir dentro de una migración.** `migrate.js:34-37` envuelve
    `migration.up(db)` en `db.transaction()`, y SQLite rechaza `VACUUM` dentro de
    una transacción. El runner necesita soporte para migraciones no atómicas.
18. **Sin retención.** Cada respaldo automático horario son ~81 MB: ~2 GB
    diarios, que acabarían llenando el disco y harían fallar tanto el automático
    como el manual.

---

## Plan de ejecución

### Fase 1 — Integridad de solicitudes de baja

1. `backend/database/migrations/024_bajas_sin_duplicado.js`
   - Restricción atómica, no solo de aplicación. Al ser `registro_id`
     polimórfico, la clave incluye `tipo_registro`:
     ```sql
     CREATE UNIQUE INDEX IF NOT EXISTS idx_solicitudes_elim_pendiente
       ON solicitudes_eliminacion(tipo_registro, registro_id)
       WHERE estado = 'PENDIENTE';
     ```
     Cubre hoy el lote y cubre el medicamento cuando ese `tipo_registro` se
     implemente, sin bloquear bajas legítimas de lotes distintos del mismo
     medicamento.
   - Columnas de trazabilidad en `lotes`: `baja_motivo TEXT`,
     `baja_usuario_id INTEGER`, `baja_fecha TEXT`.

2. `backend/repositories/solicitudEliminacionRepository.js`
   - `existePendiente({ tipoRegistro, registroId })`.
   - `marcarLoteDeBaja(id, { motivo, usuarioId })`, que actualice
     `lotes.estado_manual` y las columnas nuevas en la misma transacción que
     resuelve la solicitud.

3. `backend/services/solicitudEliminacionService.js`
   - `crear`: rechazar con `Ya existe una solicitud de baja PENDIENTE para este
     registro.`, comprobando dentro de la misma transacción que cierra con el
     `INSERT`.
   - Traducir el `SqliteError` de índice único a ese mismo mensaje, para que la
     protección siga valiendo ante dos envíos simultáneos.
   - `crear` y `resolver`: meter insert/update, efecto sobre el lote y auditoría
     en `db.transaction()` para eliminar la escritura parcial.

4. `backend/services/permisoService.js`
   - `verificarResolucionEliminacion(usuarioSesion, solicitud)`: admite
     `SUPERADMIN` en cualquier sede y `ADMIN` solo cuando
     `solicitud.sede_id === usuarioSesion.sede_id`. Se mantiene la prohibición de
     aprobar la propia solicitud.

5. `backend/services/loteService.js`
   - `calcularEstado`: devolver `DADO_DE_BAJA` como estado propio, después de la
     comprobación de existencias, para que un lote dado de baja con stock no se
     reporte activo.
   - `listar`: exponer `incluirDadosDeBaja` y filtrarlos por defecto donde el
     lote ya no es operable.

6. `src/pages/Inventario.jsx` y `src/pages/Eliminaciones.jsx`
   - Excluir `DADO_DE_BAJA` de `lotesDisponibles` (cierra la fuga del punto 5).
   - Añadir `DADO_DE_BAJA: 'estado-gris'` al mapa de clases y mostrar el motivo en
     el tooltip de la fila.

### Fase 2 — Robustez de los formularios

7. Envolver en `try/catch/finally` `handleConfirmarBaja`,
   `handleConfirmarRechazo`, `handleAprobarBaja` y `handleAprobarIntercambio`,
   para que el indicador de progreso se restablezca siempre y el rechazo se
   muestre en el formulario en vez de bloquearlo.
8. Convertir también `cargar()` de ambas páginas con `finally`, para que un fallo
   de red no deje la vista permanentemente en estado de carga.

### Fase 3 — Permisos y eliminación de trabajadores

9. `shared/constants.js`: añadir `ELIMINADO` a `ESTADOS_REGISTRO` y
   `ELIMINAR_USUARIO` a `AUDIT_ACTIONS`.
10. `backend/database/migrations/025_usuario_eliminado.js`: columnas
    `eliminado_en TEXT` y `eliminado_por INTEGER`.
11. `backend/repositories/usuarioRepository.js`: `eliminarDefinitivo(id)` que
    anonimiza dentro de una transacción — `nombre` → `Usuario eliminado`,
    `username` → `eliminado_<id>_<epoch>` (respeta el `UNIQUE`), `password_hash`
    → valor aleatorio, `estado` → `ELIMINADO` — **sin borrar la fila**, para que
    `auditoria.usuario_id`, órdenes, despachos y aprobaciones sigan siendo válidos.
    Los puntos 7 y 8 hacen innecesaria cualquier invalidación explícita de
    sesiones.
12. `backend/services/usuarioService.js`: `eliminarDefinitivo(usuarioSesion, id)`
    - Reutiliza `verificarAccesoWilmer` (solo el Superadmin principal).
    - Mismas protecciones que `cambiarEstado`: bloquea la cuenta principal Wilmer
      y prohíbe el auto-borrado.
    - Excluye de `listar()` los usuarios `ELIMINADO` salvo filtro explícito.
13. `src/pages/Usuarios.jsx`: acción "Eliminar definitivamente" con doble
    confirmación, indicando que el histórico de auditoría se conserva.

### Fase 4 — UI

14. `src/styles/global.css`
    - `.modal-overlay`: `align-items: center` y `padding: 1.5rem`.
    - `.modal-card { margin: auto; }` para que un modal más alto que el viewport
      siga desplazándose en lugar de recortarse por arriba, ajustando
      `max-height` al nuevo padding.
    - Variantes `.modal-sm` (500px), `.modal-md` (640px), `.modal-lg` (760px).
    - Listener global de `Escape`.
15. Reemplazar los `maxWidth` inline por las variantes en `CatalogoCUM.jsx`,
    `Entregas.jsx`, `Eliminaciones.jsx`, `Ordenes.jsx` e `Inventario.jsx`.
    Mapeo: 500/520 → `modal-sm`; 640 → `modal-md`; 700/720/750 → `modal-lg`.
16. `Inventario.jsx`: "Escanear / Recibir" pasa de `btn-accion-azul` a
    `btn-toggle-action` con la variante primaria, igual que "+ Nuevo Medicamento".
17. `AppShell.jsx`: el selector de sede del encabezado adopta el estilo de
    `Reportes.jsx`. Unificar además `Auditoria.jsx` y `Respaldos.jsx` sobre la
    misma clase, eliminando los estilos inline duplicados.

### Fase 5 — Peso y retención de respaldos

18. `backend/database/migrate.js`: admitir migraciones no atómicas mediante un
    flag `atomic: false` respetado por el runner. Sin esto, `VACUUM` falla dentro
    de la transacción de la línea 34.
19. `backend/database/migrations/026_optimizar_catalogo_cum.js`, marcada
    `atomic: false`
    - Antes de eliminar nada, verificar con `EXPLAIN QUERY PLAN` sobre las
      consultas de `catalogoCumService.js` que los tres índices de texto no se
      usan; si alguno se usa, se conserva.
    - Eliminar `_cum`, `_fuente`, `_estado` y `_version`; eliminar `_producto`,
      `_principio` y `_registro` solo si el plan lo confirma.
    - Ejecutar `VACUUM`.
    - `down` recrea todos los índices eliminados. Siguen siendo recuperables
      desde `018_catalogo_cum.js` si un caso de uso futuro los necesita.
20. `backend/services/backupService.js`
    - Retención configurable `maximo_respaldos_por_sede`, con **default 20**.
      A frecuencia horaria son ~20 h de historia por sede; a diario, ~20 días.
    - La purga solo toca archivos `farmacia_backup_auto_*` y cuenta por alcance
      de sede, de modo que una sede activa no pueda borrar el respaldo global.
      **Nunca purga antes de que el nuevo respaldo exista y haya pasado
      `validarIntegridad`.**
    - Comprobación de espacio libre previo, con mensaje claro si no alcanza, en
      vez de un fallo genérico.
    - Sustituir `incremental_vacuum(100)` por `PRAGMA optimize` más un vacuum
      incremental completo, que ahora sí funciona tras el `VACUUM` del punto 19.
21. `src/pages/Respaldos.jsx`: campo para `maximo_respaldos_por_sede` y tamaño
    total en disco, para que el operador vea el consumo.

### Fase 6 — Corrección de documentación

22. `AGENTS.md` contiene una afirmación mía que es **falsa**:
    "`backend/database/migrate.js` solo exporta `runMigrations`; no tiene bloque
    `require.main`". El archivo sí lo tiene, en `migrate.js:51-53`; invocar el
    script sí se ejecuta, y por eso `npm run migrate` falla con `ERR_DLOPEN_FAILED`
    en lugar de no hacer nada. Corregir esa línea.

---

## Riesgos

| Riesgo | Mitigación |
|---|---|
| El índice único parcial bloquea un flujo válido | La condición es solo sobre `PENDIENTE`; una solicitud resuelta libera el índice |
| Anonimizar rompe una vista que espera el nombre real | `listar()` los excluye; auditar los JOIN de auditoría y órdenes antes de aplicar |
| Eliminar índices degrada consultas no detectadas | Se exige `EXPLAIN QUERY PLAN` previo y el `down` los recrea |
| `VACUUM` bloquea la app | Se ejecuta en la migración, no en caliente |
| El cambio de `calcularEstado` altera reportes que agregan por estado | Revisar `reporteService` y `loteRepository.resumenVencimientos`, que ya excluyen `DADO_DE_BAJA` |
| La purga borra un respaldo útil | Solo automáticos, con el nuevo validado antes de purgar y conteo por sede |

---

## Validación

1. `npm run lint` — 0 errores.
2. Suite completa con el runtime de Electron; comparar contra la línea base:
   `La unidad de medida es obligatoria` ya falla antes de estos cambios y el
   conteo de fallos no debe cambiar.
3. Tests nuevos en `tests/business-rules/reglas_negocio.test.js`:
   - Segunda solicitud del mismo registro se rechaza.
   - Un fallo de auditoría no deja la solicitud creada.
   - `ADMIN` resuelve en su sede y es rechazado en otra.
   - `SUPERADMIN` sigue resolviendo en todas.
   - Lote aprobado queda `DADO_DE_BAJA`, no `AGOTADO`, y no aparece en
     `lotesDisponibles`.
   - Anonimizar conserva la fila y las entradas de auditoría asociadas.
   - El usuario eliminado no puede autenticarse.
4. Test de respaldo: tras crear, no quedan más de `maximo_respaldos_por_sede`
   automáticos de ese alcance, los manuales siguen intactos y el `.db` nuevo pasa
   `validarIntegridad`.
5. Medir `data/backups` antes y después; el respaldo nuevo debe ser sensiblemente
   menor que 81 MB.
6. Verificación manual: abrir cada modal y confirmar centrado, `Escape` cierra, y
   el botón Escanear comparte estilo con "+ Nuevo Medicamento".

---

## Fuera de alcance

- Compresión de respaldos y exclusión de `catalogo_cum` (descartadas por decisión).
- Sistema de notificaciones (fase diferida ya registrada en el plan de auditoría).
- Sincronización móvil con Supabase y contrato `/sync/*` (plan aparte).
- La referencia polimórfica `solicitudes_eliminacion.registro_id` sin FK real:
  conviene separarla por tipo de entidad, pero es un cambio de esquema mayor que
  no bloquea ninguno de los puntos anteriores.
