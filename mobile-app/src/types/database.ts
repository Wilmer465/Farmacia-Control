import { 
  Usuario, Rol, Sede, Medicamento, Lote, MovimientoInventario, 
  Orden, OrdenDetalle, Despacho, DespachoDetalle, Entrega, Receptor,
  SolicitudEliminacion, SolicitudIntercambio, Auditoria, 
  CatalogoCUM, CatalogoEmpaque, Notificacion, Mensaje, Dispositivo,
  SyncQueueItem, SyncMetadata
} from './domain';

export interface DatabaseSchema {
  usuarios: Usuario;
  roles: Rol;
  sedes: Sede;
  medicamentos: Medicamento;
  lotes: Lote;
  movimientos_inventario: MovimientoInventario;
  ordenes: Orden;
  orden_detalles: OrdenDetalle;
  despachos: Despacho;
  despacho_detalle: DespachoDetalle;
  entregas: Entrega;
  receptores: Receptor;
  solicitudes_eliminacion: SolicitudEliminacion;
  solicitudes_intercambio: SolicitudIntercambio;
  auditoria: Auditoria;
  catalogo_cum: CatalogoCUM;
  catalogo_empaques: CatalogoEmpaque;
  notificaciones_locales: Notificacion;
  mensajes_locales: Mensaje;
  dispositivos: Dispositivo;
  sync_queue: SyncQueueItem;
  sync_metadata: SyncMetadata;
}

export type TableName = keyof DatabaseSchema;

export interface SqliteRow {
  [key: string]: any;
}

export interface Migration {
  version: number;
  name: string;
  up: (db: any) => Promise<void>;
  down?: (db: any) => Promise<void>;
}

export interface Repository<T> {
  findAll(filters?: any): Promise<T[]>;
  findById(id: number): Promise<T | null>;
  create(data: Omit<T, 'id'>): Promise<T>;
  update(id: number, data: Partial<T>): Promise<T>;
  delete(id: number): Promise<void>;
  count(filters?: any): Promise<number>;
}

export interface LoteRepository extends Repository<Lote> {
  findByMedicamentoAndSede(medicamentoId: number, sedeId: number, numeroLote: string): Promise<Lote | null>;
  findDisponiblesByMedicamento(medicamentoId: number, sedeId: number): Promise<Lote[]>;
}

export interface OrdenRepository extends Repository<Orden> {
  findBySede(sedeId: number, filters?: any): Promise<Orden[]>;
  crearConDetalles(data: any): Promise<Orden>;
  cancelar(id: number, motivo: string): Promise<Orden>;
  actualizarDocumentacion(id: number, data: any): Promise<Orden>;
}

export interface DespachoRepository extends Repository<Despacho> {
  findByOrden(ordenId: number): Promise<Despacho[]>;
  crearConDetalles(data: any): Promise<{ despacho: Despacho; nuevoEstadoOrden: string }>;
}

export interface SyncQueueRepository extends Repository<SyncQueueItem> {
  findPending(limit?: number): Promise<SyncQueueItem[]>;
  findByEntity(entity: string, entityId: number): Promise<SyncQueueItem | null>;
  findByIdempotencyKey(key: string): Promise<SyncQueueItem | null>;
  markSyncing(ids: number[]): Promise<void>;
  markSynced(id: number, remoteId: string): Promise<void>;
  markFailed(id: number, error: string): Promise<void>;
  markConflict(id: number, serverData: any): Promise<void>;
  incrementAttempts(id: number): Promise<void>;
  getPendingCount(): Promise<number>;
  cleanupOldSynced(olderThanDays: number): Promise<number>;
}

export interface SyncMetadataRepository {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  getAll(): Promise<SyncMetadata[]>;
}

export interface NotificacionRepository extends Repository<Notificacion> {
  findUnreadCount(): Promise<number>;
  markAsRead(ids: number[]): Promise<void>;
  markAllAsRead(): Promise<void>;
}

export interface MensajeRepository extends Repository<Mensaje> {
  findUnreadCount(): Promise<number>;
  markAsRead(ids: number[]): Promise<void>;
}

export interface AuditoriaRepository {
  registrar(auditoria: Omit<Auditoria, 'id'>): Promise<number>;
  findAll(filters?: any): Promise<Auditoria[]>;
  count(filters?: any): Promise<number>;
}