# Remove Backup Retention

## Goal
Eliminate the automatic backup retention/purge behavior so backups are never deleted by the scheduler. Keep manual and automatic backup creation, listing, restore, and disk usage reporting intact.

## Scope
- Backend retention logic in `backend/services/backupService.js`.
- Automatic backup creation flow that invokes purge.
- Config field `maximo_respaldos_por_sede` and related validation.
- UI retention panel in `src/pages/Respaldos.jsx`.
- Tests and docs that assert retention behavior.

## Changes
1. In `backupService.js`:
   - Remove `purgarRespaldosAntiguos`.
   - Remove `maximoRespaldosPorSede`.
   - Remove `maximo_respaldos_por_sede` from `CONFIG_POR_DEFECTO`.
   - Remove limit normalization in `guardarConfigAutoBackup`.
   - In `crear()`, remove the purge call and remove `purga` from the returned object.
   - Remove `purgarRespaldosAntiguos` from module exports.
2. In `Respaldos.jsx`:
   - Remove `maximo_respaldos_por_sede` from initial config state.
   - Remove the retention panel.
   - Remove purge count from the success message.
3. Update tests in `tests/ipc/ipc_handlers.test.js` to remove retention assertions and references to `purgarRespaldosAntiguos`.
4. Update `docs/backups.md` to remove retention section and related notes.

## Risks
- Disk usage will grow unbounded; ensure `consumo`/disk-space checks remain.
- Existing `backup_config.json` files may still contain `maximo_respaldos_por_sede`; harmless extra field.
- Removing exported function may break other callers; search before deletion.

## Validation
- Run IPC tests with Electron runtime.
- Run lint.
- Verify manual and automatic backup creation still return valid objects without `purga`.
