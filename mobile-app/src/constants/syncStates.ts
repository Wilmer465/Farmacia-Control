export const SYNC_STATUS = Object.freeze({
  ONLINE: 'ONLINE',
  OFFLINE: 'OFFLINE',
  SYNCING: 'SYNCING',
  ERROR: 'ERROR',
} as const);

export type SyncStatus = typeof SYNC_STATUS[keyof typeof SYNC_STATUS];

export const SYNC_QUEUE_STATUS = Object.freeze({
  PENDING: 'PENDING',
  SYNCING: 'SYNCING',
  SYNCED: 'SYNCED',
  FAILED: 'FAILED',
  CONFLICT: 'CONFLICT',
} as const);

export type SyncQueueStatus = typeof SYNC_QUEUE_STATUS[keyof typeof SYNC_QUEUE_STATUS];

export const SYNC_OPERATION = Object.freeze({
  CREATE: 'CREATE',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
  UPLOAD_FILE: 'UPLOAD_FILE',
} as const);

export type SyncOperation = typeof SYNC_OPERATION[keyof typeof SYNC_OPERATION];

export const CONFLICT_RESOLUTION = Object.freeze({
  SERVER_WINS: 'SERVER_WINS',
  LOCAL_WINS: 'LOCAL_WINS',
  MANUAL_MERGE: 'MANUAL_MERGE',
} as const);

export type ConflictResolution = typeof CONFLICT_RESOLUTION[keyof typeof CONFLICT_RESOLUTION];

export const SYNC_DIRECTION = Object.freeze({
  PUSH: 'PUSH',
  PULL: 'PULL',
  BOTH: 'BOTH',
} as const);

export type SyncDirection = typeof SYNC_DIRECTION[keyof typeof SYNC_DIRECTION];

export const SYNC_METADATA_KEYS = Object.freeze({
  LAST_PULL_TIMESTAMP: 'last_pull_timestamp',
  LAST_PUSH_TIMESTAMP: 'last_push_timestamp',
  SCHEMA_VERSION: 'schema_version',
  DEVICE_ID: 'device_id',
  LAST_FULL_SYNC: 'last_full_sync',
} as const);