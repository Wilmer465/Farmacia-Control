import { Usuario, Lote, Orden, Despacho, Entrega, Receptor, SolicitudEliminacion, SolicitudIntercambio, Auditoria, Medicamento, Sede, Notificacion, Mensaje, CatalogoCUM, CatalogoEmpaque } from './domain';

export interface ApiResponse<T = any> {
  ok: boolean;
  data?: T;
  error?: string;
  code?: string;
}

export interface PaginatedResponse<T> {
  ok: boolean;
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  ok: boolean;
  data?: {
    usuario: Usuario;
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };
  error?: string;
}

export interface RefreshTokenRequest {
  refresh_token: string;
}

export interface RefreshTokenResponse {
  ok: boolean;
  data?: {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };
  error?: string;
}

export interface RegisterDeviceRequest {
  device_id: string;
  platform: 'ios' | 'android';
  app_version: string;
  push_token?: string;
}

export interface RegisterDeviceResponse {
  ok: boolean;
  data?: { device_id: number };
  error?: string;
}

export interface MedicamentosListResponse extends PaginatedResponse<Medicamento> {}
export interface MedicamentoResponse extends ApiResponse<Medicamento> {}

export interface LotesListRequest {
  sedeId?: number;
  medicamentoId?: number;
  limit?: number;
  offset?: number;
  conTotal?: boolean;
}
export interface LotesListResponse extends PaginatedResponse<Lote> {}
export interface LoteResponse extends ApiResponse<Lote> {}

export interface CreateLoteRequest {
  medicamento_id: number;
  sede_id: number;
  numero_lote: string;
  fecha_expedicion: string;
  fecha_vencimiento: string;
  cantidad_cajas?: number;
  cantidad_unidades_sueltas?: number;
  cantidad_unidades?: number;
  cantidad_total_unidades?: number;
}

export interface AjustarLoteRequest {
  cantidad_cajas: number;
  cantidad_unidades_sueltas: number;
  motivo: string;
}

export interface OrdenesListRequest {
  sedeId?: number;
  estado?: string;
  fechaInicio?: string;
  fechaFin?: string;
  limit?: number;
  offset?: number;
}
export interface OrdenesListResponse extends PaginatedResponse<Orden> {}
export interface OrdenResponse extends ApiResponse<Orden> {}

export interface CreateOrdenRequest {
  items: CreateOrdenItem[];
  sede_id?: number;
  tipo_destino?: 'LOCAL' | 'MUNICIPIO_VEREDA';
  destino_detalle?: string;
  receptor_nombre: string;
  receptor_documento: string;
  receptor_telefono?: string;
  receptor_correo?: string;
  firma_data?: string;
  huella_registrada?: boolean;
  documento_adjunto_nombre?: string;
  documento_adjunto_data?: string;
  documento_adjunto_tipo?: string;
}

export interface CreateOrdenItem {
  medicamento_id: number;
  cantidad_cajas_solicitada?: number;
  cantidad_unidades_solicitada?: number;
  cantidad_total_solicitada?: number;
}

export interface CancelarOrdenRequest {
  motivo: string;
}

export interface ActualizarDocumentacionOrdenRequest {
  receptor_nombre?: string;
  receptor_documento?: string;
  receptor_telefono?: string;
  receptor_correo?: string;
  firma_data?: string;
  huella_registrada?: boolean;
  documento_adjunto_nombre?: string;
  documento_adjunto_data?: string;
  documento_adjunto_tipo?: string;
}

export interface DespachosListRequest {
  ordenId: number;
}
export interface DespachosListResponse extends ApiResponse<Despacho[]> {}

export interface CreateDespachoRequest {
  orden_id: number;
  items: CreateDespachoItem[];
}

export interface CreateDespachoItem {
  orden_detalle_id: number;
  lote_id: number;
  cantidad_cajas_despachada?: number;
  cantidad_unidades_sueltas_despachada?: number;
  cantidad_unidades_despachada?: number;
  cantidad_total_despachada?: number;
}

export interface EntregasListRequest {
  sedeId?: number;
  fechaInicio?: string;
  fechaFin?: string;
  documentacion_completa?: number;
  limit?: number;
  offset?: number;
}
export interface EntregasListResponse extends PaginatedResponse<Entrega> {}

export interface CreateEntregaRequest {
  despacho_id: number;
  orden_id: number;
  sede_id: number;
  receptor_nombre?: string;
  receptor_documento?: string;
  firma_data?: string;
  huella_registrada?: boolean;
  entregado_por: number;
  documento_adjunto_nombre?: string;
  documento_adjunto_data?: string;
  documento_adjunto_tipo?: string;
  tipo_destino?: string;
  destino_detalle?: string;
}

export interface ReceptorSearchRequest {
  documento: string;
}
export interface ReceptorResponse extends ApiResponse<Receptor> {}
export interface ReceptoresListResponse extends ApiResponse<Receptor[]> {}

export interface CreateReceptorRequest {
  documento: string;
  nombre: string;
  telefono?: string;
  correo_electronico?: string;
  firma_guardada?: string;
  huella_guardada?: number;
  documento_adjunto_nombre?: string;
  documento_adjunto_data?: string;
  documento_adjunto_tipo?: string;
  prioridad?: string;
  medicamentos_uso?: string;
  notas?: string;
}

export interface SolicitudesEliminacionListRequest {
  sedeId?: number;
  estado?: string;
  limit?: number;
  offset?: number;
}
export interface SolicitudesEliminacionListResponse extends PaginatedResponse<SolicitudEliminacion> {}

export interface CreateSolicitudEliminacionRequest {
  registro_id: number;
  motivo: string;
  tipo_registro?: 'LOTE';
  medicamento_id?: number;
}

export interface ResolverSolicitudEliminacionRequest {
  estado: 'APROBADA' | 'RECHAZADA';
  observacion_resolucion?: string;
}

export interface SolicitudesIntercambioListRequest {
  sedeOrigenId?: number;
  sedeDestinoId?: number;
  estado?: string;
  limit?: number;
  offset?: number;
}
export interface SolicitudesIntercambioListResponse extends PaginatedResponse<SolicitudIntercambio> {}

export interface CreateSolicitudIntercambioRequest {
  tipo: 'ENVIO' | 'INTERCAMBIO';
  sede_origen_id: number;
  sede_destino_id: number;
  lote_id: number;
  medicamento_id: number;
  cantidad_cajas: number;
  cantidad_unidades: number;
  cantidad_total_unidades: number;
  motivo: string;
  sede_recibe_id?: number;
  lote_recibe_id?: number;
  medicamento_recibe_id?: number;
  cantidad_recibe_total_unidades?: number;
}

export interface ResolverSolicitudIntercambioRequest {
  estado: 'APROBADA' | 'RECHAZADA';
  observacion_resolucion?: string;
}

export interface AuditoriaListRequest {
  usuarioId?: number;
  sedeId?: number;
  modulo?: string;
  accion?: string;
  fechaInicio?: string;
  fechaFin?: string;
  limit?: number;
  offset?: number;
}
export interface AuditoriaListResponse extends PaginatedResponse<Auditoria> {}

export interface ReportesRequest {
  sedeId?: number;
  fechaInicio?: string;
  fechaFin?: string;
}
export interface ReporteDiarioResponse extends ApiResponse<any> {}
export interface DashboardResponse extends ApiResponse<any> {}
export interface ConciliacionResponse extends ApiResponse<any> {}

export interface CatalogoCUMResponse extends PaginatedResponse<CatalogoCUM> {}
export interface CatalogoCUMItemResponse extends ApiResponse<CatalogoCUM> {}
export interface BuscarGTINRequest { gtin: string; }
export interface BuscarCUMRequest { cum: string; }
export interface BuscarProductoRequest { texto: string; limite?: number; }

export interface NotificacionesListRequest {
  leida?: number;
  limit?: number;
  offset?: number;
}
export interface NotificacionesListResponse extends PaginatedResponse<Notificacion> {}

export interface MensajesListRequest {
  leido?: number;
  limit?: number;
  offset?: number;
}
export interface MensajesListResponse extends PaginatedResponse<Mensaje> {}

export interface MarcaraLeidaRequest {
  ids: number[];
}

export interface SyncPullRequest {
  since?: string;
  limit?: number;
  tables?: string[];
}

export interface SyncPullResponse {
  ok: boolean;
  data?: {
    changes: SyncChange[];
    cursor: string;
    has_more: boolean;
  };
  error?: string;
}

export interface SyncChange {
  entity: string;
  operation: 'CREATE' | 'UPDATE' | 'DELETE';
  data: any;
  server_timestamp: string;
}

export interface SyncPushRequest {
  operations: SyncPushOperation[];
}

export interface SyncPushOperation {
  idempotency_key: string;
  operation: 'CREATE' | 'UPDATE' | 'DELETE';
  entity: string;
  entity_local_id: number;
  entity_remote_id?: number;
  payload: any;
  user_id: number;
  sede_id: number;
  timestamp: string;
  version: number;
}

export interface SyncPushResponse {
  ok: boolean;
  data?: {
    results: SyncPushResult[];
  };
  error?: string;
}

export interface SyncPushResult {
  idempotency_key: string;
  status: 'synced' | 'conflict' | 'error';
  remote_id?: number;
  error?: string;
  server_version?: number;
}

export interface ConflictsResponse {
  ok: boolean;
  data?: any[];
  error?: string;
}

export interface ResolveConflictRequest {
  conflict_id: number;
  resolution: 'SERVER_WINS' | 'LOCAL_WINS' | 'MANUAL_MERGE';
  merged_data?: any;
}

export interface UploadFileRequest {
  file_name: string;
  file_type: string;
  file_data: string;
  entity: string;
  entity_id: number;
}

export interface UploadFileResponse {
  ok: boolean;
  data?: { url: string; file_id: string };
  error?: string;
}