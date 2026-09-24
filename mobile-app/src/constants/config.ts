import { SyncQueueStatus, SYNC_QUEUE_STATUS } from './syncStates';

export const APP_CONFIG = {
  name: 'Farmacia Control',
  version: '1.0.0',
  bundleIdentifier: 'com.farmacia.control.mobile',
} as const;

export const API_CONFIG = {
  baseURL: __DEV__ ? 'http://10.0.2.2:3000/api/v1' : 'https://api.farmacia-control.com/api/v1',
  timeout: 30000,
  retryAttempts: 3,
  retryDelay: 1000,
} as const;

export const AUTH_CONFIG = {
  accessTokenExpiry: 15 * 60 * 1000,
  refreshTokenExpiry: 30 * 24 * 60 * 60 * 1000,
  pinLength: 6,
  maxFailedAttempts: 5,
  lockoutDuration: 10 * 60 * 1000,
  sessionTimeout: 12 * 60 * 60 * 1000,
  inactivityTimeout: 15 * 60 * 1000,
} as const;

export const SYNC_CONFIG = {
  batchSize: 100,
  pullLimit: 500,
  autoSyncInterval: 5 * 60 * 1000,
  backgroundSyncInterval: 15 * 60 * 1000,
  maxRetries: 5,
  retryBackoffBase: 2000,
  debounceMs: 500,
  recentWindowMs: 30 * 60 * 1000,
} as const;

export const DB_CONFIG = {
  name: 'farmacia_control.db',
  version: 1,
  schemaVersion: 22,
} as const;

export const SCANNER_CONFIG = {
  torchEnabled: true,
  vibrationEnabled: true,
  formats: [
    'EAN_13',
    'EAN_8',
    'UPC_A',
    'UPC_E',
    'CODE_128',
    'CODE_39',
    'QR_CODE',
    'DATA_MATRIX',
    'PDF_417',
  ] as const,
} as const;

export const NOTIFICATION_CONFIG = {
  channelId: 'farmacia-control-default',
  channelName: 'Farmacia Control',
  channelDescription: 'Notificaciones de inventario, órdenes y sistema',
  importance: 'high' as const,
  vibrationPattern: [0, 250, 250, 250] as const,
} as const;

export const STORAGE_KEYS = Object.freeze({
  ACCESS_TOKEN: 'access_token',
  REFRESH_TOKEN: 'refresh_token',
  USER_SESSION: 'user_session',
  DEVICE_ID: 'device_id',
  PIN_HASH: 'pin_hash',
  BIOMETRIC_ENABLED: 'biometric_enabled',
  LAST_SYNC_STATUS: 'last_sync_status',
  SELECTED_SEDE: 'selected_sede',
  APP_SETTINGS: 'app_settings',
} as const);

export const ENTIDADES_SINCRONIZABLES = [
  'usuarios',
  'roles',
  'sedes',
  'medicamentos',
  'lotes',
  'movimientos_inventario',
  'ordenes',
  'orden_detalles',
  'despachos',
  'despacho_detalle',
  'entregas',
  'receptores',
  'solicitudes_eliminacion',
  'solicitudes_intercambio',
  'auditoria',
  'catalogo_cum',
  'catalogo_empaques',
  'catalogo_actualizaciones',
  'notificaciones',
  'mensajes',
  'dispositivos',
] as const;

export type EntidadSincronizable = typeof ENTIDADES_SINCRONIZABLES[number];

export const ORDEN_TABLAS_SINC = [
  'roles',
  'sedes',
  'usuarios',
  'medicamentos',
  'catalogo_cum',
  'catalogo_empaques',
  'receptores',
  'lotes',
  'ordenes',
  'orden_detalles',
  'despachos',
  'despacho_detalle',
  'entregas',
  'solicitudes_eliminacion',
  'solicitudes_intercambio',
  'movimientos_inventario',
  'auditoria',
  'catalogo_actualizaciones',
  'notificaciones',
  'mensajes',
  'dispositivos',
] as const;

export function esEstadoSincFinalizado(status: SyncQueueStatus): boolean {
  return [SYNC_QUEUE_STATUS.SYNCED, SYNC_QUEUE_STATUS.FAILED, SYNC_QUEUE_STATUS.CONFLICT].includes(status);
}