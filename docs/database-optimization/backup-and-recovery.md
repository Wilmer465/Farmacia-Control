# Copias y recuperación — escritorio

## Cobertura actual observada

- SQLite vive en `data/farmacia.db` en desarrollo y en `userData/farmacia.db` en la aplicación empaquetada.
- `backupService` crea copias mediante `db.backup()`, valida con `integrity_check`, lista y restaura con autorización. La restauración valida el nombre/ruta, hace checkpoint WAL, sustituye SQLite, elimina archivos WAL/SHM obsoletos y borra `cloud_sync_state.json` para evitar usar un cursor futuro.
- El programador permite frecuencias horaria, cada 6/12 horas, diaria, semanal y mensual. La configuración local persiste en `backup_config.json`.
- El estado de trabajo actual no ejecuta purga automática de respaldos; existe un plan local explícito para no borrar copias por el programador. Esto evita borrado automático pero permite crecimiento ilimitado de disco.
- La pantalla de respaldos mide tamaño local y el servicio valida espacio disponible antes de crear. El plan actual de trabajo debe mantener esas comprobaciones.

## Cobertura no demostrada

- No se probó una restauración aislada en esta fase.
- No hay evidencia de backup central descargable de PostgreSQL o de una copia completa del bucket `blobs` asociada al backup SQLite.
- `cloud_sync_state.json` y `backup_config.json` están fuera del `.db`; la política de copia conjunta debe confirmarse para instalaciones.
- No se midió RPO/RTO ni existe un valor verificado de tiempo de restauración.
- La documentación existente `docs/backups.md` describe retención que ya fue retirada en los cambios locales; no se modificó ese archivo para respetar el plan local del usuario. Debe actualizarse cuando el usuario cierre esa tarea.

## Procedimiento recomendado

1. En un equipo de pruebas, crear backup manual usando UI o `window.api.backups.crear`.
2. Validar el `.db` con `integrity_check` y comparar conteos/relaciones sin sacar datos personales del entorno.
3. Copiar backup y sus manifiestos de sincronización/configuración aprobados a almacenamiento cifrado con acceso restringido.
4. Restaurar en una instancia de pruebas aislada; validar FK, login, consulta de órdenes, inventario y documentos mediante IDs sintéticos.
5. Si se respaldan Storage, verificar cada objeto referenciado por tamaño y SHA-256 antes de declarar recuperación completa.
6. Mantener backups manuales/automáticos según la política aprobada. No borrar originales ni automatizar retención hasta autorización explícita.
7. Registrar fecha, versión de esquema, resultado y duración; no registrar nombres, firmas, claves ni tokens en informes.

## Recuperación de adjuntos y sincronización

SQLite y Storage no comparten transacción. Después de una restauración, pausar la sincronización hasta confirmar la base, el cursor y las referencias. Un descriptor de blob debe validarse al descargar con SHA-256. Si falta un objeto, marcar evidencia como no disponible y no completar el flujo que la requiere. Reanudar solo tras resolver referencias; no eliminar la copia local como parte de este procedimiento.

## Cuotas de Supabase

Los backups del proyecto remoto dependen del plan real. La consulta oficial de 2026-10-23 indica que los backups de base de proyectos Free no están disponibles para descarga desde el panel. No se verificó el plan del proyecto Farmacia-Control; se requiere copia independiente de PostgreSQL y Storage antes de depender de recuperación remota.
