import { 
  SyncEngineState, 
  SyncOptions, 
  SyncProgress, 
  SyncResult,
  PushOperationResult,
  ServerChange,
  ConflictItem,
  ConflictResolution,
  PushResult,
  PullResult,
  BackgroundSyncTask,
  DEFAULT_SYNC_CONFIG 
} from '../../types/sync';
import { SyncQueueRepository } from '../database/repositories/SyncQueueRepository';
import { SyncMetadataRepository } from '../database/repositories/SyncMetadataRepository';
import { sqliteService } from '../database/SQLiteService';
import { apiClient } from '../api/ApiClient';
import type { SyncQueueItem } from '../../types/domain';
import { supabaseSyncProvider } from './SupabaseSyncProvider';
import { extraerMarcaTemporal } from '../../utils/syncPayload';
import { EntidadSincronizable, ORDEN_TABLAS_SINC } from '../../constants/config';
import { generateSyncId, hashData } from '../../utils/idempotency';
import { suggestResolution, createConflictFromSyncError, ConflictItem as UtilConflictItem } from '../../utils/conflict';
import { notificationService } from '../notifications/NotificationService';
import { AuditoriaLocalRepository } from '../database/repositories/AuditoriaRepository';

type SyncStatusListener = (state: SyncEngineState) => void;

export class SyncEngine {
  private static instance: SyncEngine;
  private state: SyncEngineState = {
    status: 'IDLE',
    pendingCount: 0,
    syncingCount: 0,
    failedCount: 0,
    conflictCount: 0,
  };
  private listeners: Set<SyncStatusListener> = new Set();
  private syncInterval: ReturnType<typeof setInterval> | null = null;
  private isSyncing = false;
  private abortController: AbortController | null = null;
  
  private syncQueueRepo = new SyncQueueRepository();
  private syncMetadataRepo = new SyncMetadataRepository();
  private auditoriaLocalRepo = new AuditoriaLocalRepository();

  private config = { ...DEFAULT_SYNC_CONFIG };
  private backgroundSyncTask: BackgroundSyncTask = {
    name: 'background-sync',
    interval: this.config.syncInterval,
    enabled: this.config.autoSyncEnabled,
  };

  static getInstance(): SyncEngine {
    if (!SyncEngine.instance) {
      SyncEngine.instance = new SyncEngine();
    }
    return SyncEngine.instance;
  }

  async initialize(): Promise<void> {
    await this.loadState();
    await this.startAutoSync();
  }

  private async loadState(): Promise<void> {
    await this.updateStats();
    this.notifyListeners();
  }

  subscribe(listener: SyncStatusListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    this.listeners.forEach(listener => listener(this.state));
  }

  private updateState(partial: Partial<SyncEngineState>): void {
    this.state = { ...this.state, ...partial };
    this.notifyListeners();
  }

  async getState(): Promise<SyncEngineState> {
    await this.updateStats();
    return this.state;
  }

  private async updateStats(): Promise<void> {
    const stats = await this.syncQueueRepo.getStats();
    this.updateState({
      pendingCount: stats.pending,
      syncingCount: stats.syncing,
      failedCount: stats.failed,
      conflictCount: stats.conflict,
    });
  }

  async sync(options: SyncOptions = {}): Promise<SyncResult> {
    if (this.isSyncing) {
      return { success: false, pushed: 0, pulled: 0, conflicts: 0, errors: 0, duration: 0, error: 'Sync already in progress' };
    }

    const startTime = Date.now();
    this.isSyncing = true;
    this.abortController = new AbortController();

    // Fase 1: con Supabase configurado, sin conexión no se intenta nada.
    // La cola local espera; la operación sigue 100% disponible offline.
    if (supabaseSyncProvider.habilitado()) {
      const enLinea = await supabaseSyncProvider.hayConexion();
      if (!enLinea) {
        this.isSyncing = false;
        this.abortController = null;
        await this.updateStats();
        return {
          success: false, pushed: 0, pulled: 0, conflicts: 0, errors: 0,
          duration: Date.now() - startTime, error: 'Sin conexión. Cambios guardados en local.',
        };
      }
    }
    
    this.updateState({ status: 'SYNCING', error: undefined });

    try {
      let pushed = 0;
      let pulled = 0;
      let conflicts = 0;
      let errors = 0;

      // Phase 1: PUSH
      if (options.direction !== 'PULL') {
        this.updateProgress({ phase: 'PUSH', current: 0, total: 1, message: 'Enviando cambios locales...' });
        const pushResult = await this.push(options);
        pushed = pushResult.syncedCount;
        conflicts += pushResult.conflictCount;
        errors += pushResult.failedCount;
      }

      // Phase 2: PULL
      if (options.direction !== 'PUSH') {
        this.updateProgress({ phase: 'PULL', current: 0, total: 1, message: 'Descargando cambios del servidor...' });
        const pullResult = await this.pull(options);
        pulled = pullResult.changes.length;
      }

      // Phase 3: CONFLICTS
      if (conflicts > 0) {
        this.updateProgress({ phase: 'CONFLICTS', current: 0, total: conflicts, message: 'Resolviendo conflictos...' });
        // Conflicts are already recorded, UI will handle resolution
      }

      // Phase 4: APPLYING (already done in pull)
      this.updateProgress({ phase: 'APPLYING', current: 1, total: 1, message: 'Finalizando...' });

      await this.updateStats();
      await this.syncMetadataRepo.setLastPullTimestamp(new Date().toISOString());
      await this.syncMetadataRepo.setLastPushTimestamp(new Date().toISOString());

      this.updateState({ 
        status: 'IDLE', 
        lastSync: new Date(),
        nextSync: new Date(Date.now() + this.config.syncInterval),
      });

      const duration = Date.now() - startTime;
      
      // Notify
      if (this.config.notifyOnSyncComplete) {
        await notificationService.showLocalNotification({
          title: 'Sincronización completada',
          body: `${pushed} subidos, ${pulled} bajados${conflicts > 0 ? `, ${conflicts} conflictos` : ''}`,
        });
      }

      return { success: true, pushed, pulled, conflicts, errors, duration };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
      this.updateState({ status: 'ERROR', error: errorMessage });
      
      if (this.config.notifyOnSyncError) {
        await notificationService.showLocalNotification({
          title: 'Error de sincronización',
          body: errorMessage,
        });
      }

      return { 
        success: false, 
        pushed: 0, 
        pulled: 0, 
        conflicts: 0, 
        errors: 1, 
        duration: Date.now() - startTime, 
        error: errorMessage 
      };
    } finally {
      this.isSyncing = false;
      this.abortController = null;
      this.updateProgress({ phase: 'COMPLETE', current: 1, total: 1 });
    }
  }

  private updateProgress(progress: SyncProgress): void {
    this.updateState({ progress });
  }

  private async push(options: SyncOptions): Promise<PushResult> {
    const tables = options.tables || ORDEN_TABLAS_SINC;
    const pendingItems = await this.syncQueueRepo.findPending(this.config.batchSize);
    
    if (pendingItems.length === 0) {
      return { results: [], syncedCount: 0, failedCount: 0, conflictCount: 0 };
    }

    // Filter by tables if specified
    const filteredItems = options.tables 
      ? pendingItems.filter(item => options.tables!.includes(item.entity as EntidadSincronizable))
      : pendingItems;

    const ids = filteredItems.map(item => item.id);
    await this.syncQueueRepo.markSyncing(ids);

    // Fase 1: Supabase directo (RLS por sede). Sin configurar, vía API desktop.
    if (supabaseSyncProvider.habilitado()) {
      try {
        const pushResult = await supabaseSyncProvider.subirLote(filteredItems);
        return this.procesarResultadosPush(filteredItems, pushResult.results);
      } catch (error) {
        for (const item of filteredItems) {
          await this.syncQueueRepo.markFailed(item.id, error instanceof Error ? error.message : 'Network error');
        }
        throw error;
      }
    }

    const operations = filteredItems.map(item => ({
      idempotency_key: item.idempotency_key,
      operation: item.operation_type,
      entity: item.entity,
      entity_local_id: item.entity_id || 0,
      entity_remote_id: item.remote_id ? parseInt(item.remote_id, 10) : undefined,
      payload: JSON.parse(item.payload),
      user_id: item.user_id,
      sede_id: item.sede_id || 0,
      timestamp: item.created_at,
      version: item.version,
    }));

    try {
      const response = await apiClient.post<PushResult>('/sync/push', { operations });
      
      if (!response.ok) {
        throw new Error(response.error || 'Push failed');
      }

      const results = response.data?.results || [];
      return this.procesarResultadosPush(filteredItems, results);
    } catch (error) {
      // Mark all as failed
      for (const item of filteredItems) {
        await this.syncQueueRepo.markFailed(item.id, error instanceof Error ? error.message : 'Network error');
      }
      throw error;
    }
  }

  private async procesarResultadosPush(
    filteredItems: SyncQueueItem[],
    results: PushOperationResult[]
  ): Promise<PushResult> {
      let syncedCount = 0;
      let failedCount = 0;
      let conflictCount = 0;

      for (const result of results) {
        const queueItem = filteredItems.find(item => item.idempotency_key === result.idempotency_key);
        if (!queueItem) continue;

        if (result.status === 'synced') {
          await this.syncQueueRepo.markSynced(queueItem.id, result.remote_id?.toString() || '');
          syncedCount++;
          
          // Audit
          await this.auditoriaLocalRepo.registrar({
            usuario_id: queueItem.user_id,
            rol: '', // Will be filled by server
            sede_id: queueItem.sede_id,
            accion: 'SYNC_PUSH',
            modulo: 'SYNC',
            entidad: queueItem.entity,
            entidad_id: queueItem.entity_id,
            valores_nuevos: JSON.stringify({ remote_id: result.remote_id }),
            device_id: await this.getDeviceId(),
            sync_id: generateSyncId(),
            resultado: 'EXITO',
          });
        } else if (result.status === 'conflict') {
          await this.syncQueueRepo.markConflict(queueItem.id, result.error);
          conflictCount++;
          
          // Audit conflict
          await this.auditoriaLocalRepo.registrar({
            usuario_id: queueItem.user_id,
            rol: '',
            sede_id: queueItem.sede_id,
            accion: 'CONFLICTO_SINCRONIZACION',
            modulo: 'SYNC',
            entidad: queueItem.entity,
            entidad_id: queueItem.entity_id,
            valores_anteriores: queueItem.payload,
            valores_nuevos: JSON.stringify(result.error),
            device_id: await this.getDeviceId(),
            sync_id: generateSyncId(),
            resultado: 'CONFLICTO',
          });
          
          if (this.config.notifyOnConflict) {
            await notificationService.showLocalNotification({
              title: 'Conflicto de sincronización',
              body: `Conflicto en ${queueItem.entity}: ${result.error}`,
            });
          }
        } else {
          await this.syncQueueRepo.markFailed(queueItem.id, result.error || 'Unknown error');
          failedCount++;
        }
      }

      return { results, syncedCount, failedCount, conflictCount };
    } catch (error) {
      // Mark all as failed
      for (const item of filteredItems) {
        await this.syncQueueRepo.markFailed(item.id, error instanceof Error ? error.message : 'Network error');
      }
      throw error;
    }
  }

  private async pull(options: SyncOptions): Promise<PullResult> {
    const tables = options.tables || ORDEN_TABLAS_SINC;
    const lastPull = await this.syncMetadataRepo.getLastPullTimestamp();

    // Fase 1: Supabase directo con cursor synced_at (RLS filtra por sede).
    if (supabaseSyncProvider.habilitado()) {
      const data = await supabaseSyncProvider.bajar(
        [...tables] as string[],
        lastPull && !options.forceFullSync ? lastPull : null,
        this.config.pullLimit
      );
      await this.applyServerChanges(data.changes);
      if (data.cursor) {
        await this.syncMetadataRepo.setLastPullTimestamp(data.cursor);
      }
      return data;
    }
    
    const params: Record<string, any> = { limit: this.config.pullLimit };
    if (lastPull && !options.forceFullSync) {
      params.since = lastPull;
    }
    if (tables.length > 0) {
      params.tables = tables.join(',');
    }

    const response = await apiClient.get<PullResult>('/sync/pull', params);
    
    if (!response.ok) {
      throw new Error(response.error || 'Pull failed');
    }

    const data = response.data!;
    
    // Apply changes in order
    await this.applyServerChanges(data.changes);
    
    return data;
  }

  private async applyServerChanges(changes: ServerChange[]): Promise<void> {
    // Sort by table order to respect FKs
    const sortedChanges = [...changes].sort((a, b) => {
      const indexA = ORDEN_TABLAS_SINC.indexOf(a.entity as EntidadSincronizable);
      const indexB = ORDEN_TABLAS_SINC.indexOf(b.entity as EntidadSincronizable);
      return (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB);
    });

    for (const change of sortedChanges) {
      await this.applySingleChange(change);
    }
  }

  private async applySingleChange(change: ServerChange): Promise<void> {
    const tableName = change.entity;
    const data = { ...(change.data as Record<string, unknown>) };

    try {
      // Convergencia LWW: si hay un cambio local pendiente de la misma fila y
      // el servidor es más nuevo, se aplica el servidor y se registra el
      // conflicto (edición local preservada en auditoría). Si el local es más
      // nuevo o empata, también se aplica el servidor (gana servidor) y se
      // registra, porque el push previo ya subió lo local.
      const pk = Number((data as Record<string, unknown>).id);
      if (Number.isFinite(pk)) {
        const pendiente = await this.syncQueueRepo.findByEntity(tableName, pk);
        if (pendiente) {
          let pendienteTs: string | null = null;
          try {
            const payload = JSON.parse(pendiente.payload);
            pendienteTs = extraerMarcaTemporal(
              payload,
              (pendiente as unknown as { created_at?: string }).created_at || null
            );
          } catch {
            pendienteTs = (pendiente as unknown as { created_at?: string }).created_at || null;
          }
          const servidorTs = extraerMarcaTemporal(data, change.server_timestamp);
          const decision = supabaseSyncProvider.resolverAplicacion(servidorTs, pendienteTs);
          if (decision === 'conflicto') {
            await this.syncQueueRepo.markConflict(pendiente.id, {
              servidor: data,
              localTs: pendienteTs,
              servidorTs,
            });
            await this.auditoriaLocalRepo.registrar({
              usuario_id: pendiente.user_id,
              rol: '',
              sede_id: pendiente.sede_id,
              accion: 'CONFLICTO_SINCRONIZACION',
              modulo: 'SYNC',
              entidad: pendiente.entity,
              entidad_id: pendiente.entity_id,
              valores_anteriores: pendiente.payload,
              valores_nuevos: JSON.stringify({ servidorTs, localTs: pendienteTs }),
              device_id: await this.getDeviceId(),
              sync_id: generateSyncId(),
              resultado: 'CONFLICTO',
            });
            if (this.config.notifyOnConflict) {
              await notificationService.showLocalNotification({
                title: 'Conflicto de sincronización',
                body: `Conflicto en ${tableName}: el servidor trae un cambio más nuevo.`,
              });
            }
          }
        }
      }

      // Al bajar usuarios nunca se trae password_hash (RLS/sanitizado): se
      // preserva el local y se marca restablecimiento si no hay credencial.
      if (tableName === 'usuarios') {
        const local = pk && Number.isFinite(pk)
          ? await sqliteService.queryFirst<{ password_hash?: string }>(
              'SELECT password_hash FROM usuarios WHERE id = ?',
              [pk]
            )
          : null;
        const fila = data as Record<string, unknown>;
        if (local && (local as { password_hash?: string }).password_hash) {
          fila.password_hash = (local as { password_hash: string }).password_hash;
        } else if (!fila.password_hash) {
          fila.password_hash = `__SIN_CREDENCIAL_${Date.now()}__`;
          (fila as Record<string, unknown>).debe_restablecer_contrasena = 1;
        }
      }

      if (change.operation === 'DELETE') {
        if (pk) {
          await sqliteService.execute(`DELETE FROM "${tableName}" WHERE id = ?`, [pk]);
        }
      } else if (change.operation === 'CREATE' || change.operation === 'UPDATE') {
        // expo-sqlite no enlaza objetos: descriptores y JSON van como texto.
        const columns = Object.keys(data);
        const placeholders = columns.map(() => '?').join(', ');
        const columnNames = columns.map(c => `"${c}"`).join(', ');
        const values = columns.map(c => {
          const v = (data as Record<string, unknown>)[c];
          return v !== null && typeof v === 'object' ? JSON.stringify(v) : v;
        });

        const sql = `INSERT OR REPLACE INTO "${tableName}" (${columnNames}) VALUES (${placeholders})`;
        await sqliteService.execute(sql, values);
      }
    } catch (error) {
      console.error(`Error applying change to ${tableName}:`, error);
      // Don't throw - continue with other changes
    }
  }

  private async getDeviceId(): Promise<string> {
    let deviceId = await this.syncMetadataRepo.getDeviceId();
    if (!deviceId) {
      deviceId = `mobile_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      await this.syncMetadataRepo.setDeviceId(deviceId);
    }
    return deviceId;
  }

  async startAutoSync(): Promise<void> {
    if (this.syncInterval) return;
    
    if (this.config.autoSyncEnabled) {
      this.syncInterval = setInterval(() => {
        if (!this.isSyncing) {
          this.sync({ direction: 'PUSH' }).catch(console.error);
        }
      }, this.config.syncInterval);

      this.backgroundSyncTask.enabled = true;
      this.backgroundSyncTask.nextRun = new Date(Date.now() + this.config.syncInterval);
    }
  }

  stopAutoSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
    this.backgroundSyncTask.enabled = false;
  }

  setConfig(config: Partial<typeof DEFAULT_SYNC_CONFIG>): void {
    this.config = { ...this.config, ...config };
    if (config.syncInterval && this.syncInterval) {
      this.stopAutoSync();
      this.startAutoSync();
    }
  }

  getConfig(): typeof DEFAULT_SYNC_CONFIG {
    return { ...this.config };
  }

  async getConflicts(): Promise<ConflictItem[]> {
    // This would fetch from local conflict storage
    return [];
  }

  async resolveConflict(conflictId: number, resolution: ConflictResolution, mergedData?: any): Promise<void> {
    // Implementation for resolving conflicts
  }

  async cancel(): Promise<void> {
    if (this.abortController) {
      this.abortController.abort();
    }
  }

  async triggerBackgroundSync(): Promise<void> {
    if (!this.isSyncing && this.backgroundSyncTask.enabled) {
      await this.sync({ direction: 'PUSH' });
    }
  }
}

export const syncEngine = SyncEngine.getInstance();
