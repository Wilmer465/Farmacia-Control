import { SyncOperation, ConflictResolution } from '../constants/syncStates';
export type { ConflictResolution } from '../constants/syncStates';
import { SyncQueueItem } from './domain';
export type { SyncQueueItem } from './domain';
import { EntidadSincronizable } from '../constants/config';

export interface SyncEngineState {
  status: 'IDLE' | 'SYNCING' | 'PAUSED' | 'ERROR';
  lastSync?: Date;
  nextSync?: Date;
  pendingCount: number;
  syncingCount: number;
  failedCount: number;
  conflictCount: number;
  error?: string;
  progress?: {
    phase: 'PUSH' | 'PULL' | 'CONFLICTS' | 'APPLYING';
    current: number;
    total: number;
  };
}

export interface SyncQueueOperation extends SyncQueueItem {
  payloadParsed: any;
}

export interface PullResult {
  changes: ServerChange[];
  cursor: string;
  hasMore: boolean;
}

export interface ServerChange {
  entity: EntidadSincronizable;
  operation: 'CREATE' | 'UPDATE' | 'DELETE';
  data: any;
  server_timestamp: string;
}

export interface PushResult {
  results: PushOperationResult[];
  syncedCount: number;
  failedCount: number;
  conflictCount: number;
}

export interface PushOperationResult {
  idempotencyKey: string;
  status: 'synced' | 'conflict' | 'error';
  remoteId?: number;
  error?: string;
  serverVersion?: number;
}

export interface ConflictItem {
  id: number;
  entity: EntidadSincronizable;
  localData: any;
  serverData: any;
  conflictType: 'VERSION_MISMATCH' | 'STOCK_NEGATIVE' | 'FK_MISSING' | 'DUPLICATE' | 'DELETED_ON_SERVER' | 'CONSTRAINT_VIOLATION';
  suggestedResolution: ConflictResolution;
  localQueueItem: SyncQueueItem;
  createdAt: string;
  resolvedAt?: string;
  resolution?: ConflictResolution;
  resolvedBy?: number;
  mergedData?: any;
}

export interface SyncConflictResolution {
  conflictId: number;
  resolution: ConflictResolution;
  mergedData?: any;
}

export interface SyncOptions {
  direction?: 'PUSH' | 'PULL' | 'BOTH';
  forceFullSync?: boolean;
  tables?: EntidadSincronizable[];
  onProgress?: (progress: SyncProgress) => void;
}

export interface SyncProgress {
  phase: 'IDLE' | 'PUSH' | 'PULL' | 'CONFLICTS' | 'APPLYING' | 'COMPLETE';
  current: number;
  total: number;
  message?: string;
}

export interface SyncResult {
  success: boolean;
  pushed: number;
  pulled: number;
  conflicts: number;
  errors: number;
  duration: number;
  error?: string;
}

export interface BackgroundSyncTask {
  name: string;
  interval: number;
  lastRun?: Date;
  nextRun?: Date;
  enabled: boolean;
}

export interface OfflineOperation {
  id: string;
  type: SyncOperation;
  entity: EntidadSincronizable;
  entityId?: number;
  data: any;
  timestamp: Date;
  synced: boolean;
}

export interface SyncConfig {
  autoSyncEnabled: boolean;
  syncInterval: number;
  batchSize: number;
  pullLimit: number;
  maxRetries: number;
  retryBackoffBase: number;
  conflictResolutionDefault: ConflictResolution;
  notifyOnConflict: boolean;
  notifyOnSyncComplete: boolean;
  notifyOnSyncError: boolean;
}

export const DEFAULT_SYNC_CONFIG: SyncConfig = {
  autoSyncEnabled: true,
  syncInterval: 5 * 60 * 1000,
  batchSize: 100,
  pullLimit: 500,
  maxRetries: 5,
  retryBackoffBase: 2000,
  conflictResolutionDefault: 'SERVER_WINS',
  notifyOnConflict: true,
  notifyOnSyncComplete: false,
  notifyOnSyncError: true,
};