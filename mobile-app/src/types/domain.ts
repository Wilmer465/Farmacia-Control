export interface Usuario {
  id: number;
  nombre: string;
  username: string;
  rol_id: number;
  rol_nombre: string;
  sede_id: number | null;
  sede_nombre?: string;
  estado: 'ACTIVO' | 'INACTIVO';
  es_superadmin_principal?: number;
  created_at: string;
  password_hash?: never;
}

export interface Rol {
  id: number;
  nombre: string;
  descripcion?: string;
}

export interface Sede {
  id: number;
  nombre: string;
  ciudad?: string;
  estado: 'ACTIVO' | 'INACTIVO';
  created_at: string;
}

export interface Medicamento {
  id: number;
  codigo: string;
  nombre: string;
  principio_activo?: string;
  presentacion?: string;
  concentracion?: string;
  laboratorio?: string;
  unidad_medida: string;
  unidades_por_caja: number;
  estado: 'ACTIVO' | 'INACTIVO';
  catalogo_cum_id?: number;
  fuente?: 'INVIMA' | 'MANUAL';
  gtin_principal?: string;
  created_at: string;
}

export interface Lote {
  id: number;
  medicamento_id: number;
  sede_id: number;
  numero_lote: string;
  fecha_expedicion: string;
  fecha_vencimiento: string;
  cantidad_cajas: number;
  cantidad_unidades_sueltas: number;
  cantidad_total_unidades: number;
  estado_manual?: string;
  empaque_nivel?: 1 | 2 | 3;
  empaque_gtin?: string;
  factor_conversion?: number;
  unidades_por_caja?: number;
  medicamento_codigo?: string;
  medicamento_nombre?: string;
  sede_nombre?: string;
  estado?: 'DISPONIBLE' | 'PROXIMO_VENCER' | 'VENCIDO' | 'AGOTADO' | 'DADO_DE_BAJA';
  created_at: string;
  updated_at: string;
}

export interface MovimientoInventario {
  id: number;
  lote_id: number;
  medicamento_id: number;
  sede_id: number;
  tipo: 'ENTRADA' | 'SALIDA_ORDEN' | 'AJUSTE';
  cantidad: number;
  referencia_orden_id?: number;
  usuario_id?: number;
  empaque_nivel?: number;
  cantidad_unidades_base?: number;
  fecha: string;
}

export interface Orden {
  id: number;
  numero: string;
  sede_id: number;
  estado: 'PENDIENTE' | 'PARCIAL' | 'COMPLETADA' | 'CANCELADA';
  motivo_cancelacion?: string;
  usuario_creador_id: number;
  tipo_destino: 'LOCAL' | 'MUNICIPIO_VEREDA';
  destino_detalle?: string;
  receptor_nombre?: string;
  receptor_documento?: string;
  receptor_telefono?: string;
  receptor_correo?: string;
  firma_data?: string;
  huella_registrada: number;
  documento_adjunto_nombre?: string;
  documento_adjunto_data?: string;
  documento_adjunto_tipo?: string;
  documentacion_completa: number;
  elementos_faltantes?: string;
  fecha_creacion: string;
  fecha_actualizacion: string;
  sede_nombre?: string;
  usuario_nombre?: string;
  detalles?: OrdenDetalle[];
}

export interface OrdenDetalle {
  id: number;
  orden_id: number;
  medicamento_id: number;
  cantidad_cajas_solicitada: number;
  cantidad_unidades_solicitada: number;
  cantidad_total_solicitada: number;
  cantidad_total_despachada: number;
  medicamento_codigo?: string;
  medicamento_nombre?: string;
  created_at: string;
}

export interface Despacho {
  id: number;
  orden_id: number;
  sede_id: number;
  despachado_por: number;
  fecha: string;
  orden_numero?: string;
  sede_nombre?: string;
  despachado_por_nombre?: string;
  detalle?: DespachoDetalle[];
}

export interface DespachoDetalle {
  id: number;
  despacho_id: number;
  orden_detalle_id: number;
  lote_id: number;
  medicamento_id: number;
  cantidad_cajas_despachada: number;
  cantidad_unidades_sueltas_despachada: number;
  cantidad_total_despachada: number;
  lote_numero?: string;
  medicamento_nombre?: string;
}

export interface Entrega {
  id: number;
  despacho_id: number;
  orden_id: number;
  sede_id: number;
  receptor_nombre?: string;
  receptor_documento?: string;
  firma_data?: string;
  huella_registrada: number;
  entregado_por: number;
  fecha: string;
  documentacion_completa: number;
  elementos_faltantes?: string;
  documento_adjunto_nombre?: string;
  documento_adjunto_data?: string;
  documento_adjunto_tipo?: string;
  tipo_destino?: string;
  destino_detalle?: string;
}

export interface Receptor {
  id: number;
  documento: string;
  nombre: string;
  telefono?: string;
  correo_electronico?: string;
  firma_guardada?: string;
  huella_guardada: number;
  documento_adjunto_nombre?: string;
  documento_adjunto_data?: string;
  documento_adjunto_tipo?: string;
  prioridad?: string;
  medicamentos_uso?: string;
  notas?: string;
  created_at: string;
  updated_at: string;
}

export interface SolicitudEliminacion {
  id: number;
  sede_id: number;
  usuario_solicitante_id: number;
  tipo_registro: string;
  registro_id: number;
  medicamento_id?: number;
  motivo: string;
  estado: 'PENDIENTE' | 'APROBADA' | 'RECHAZADA';
  usuario_resolutor_id?: number;
  fecha_resolucion?: string;
  observacion_resolucion?: string;
  fecha_solicitud: string;
  sede_nombre?: string;
  solicitante_nombre?: string;
  resolutor_nombre?: string;
}

export interface SolicitudIntercambio {
  id: number;
  tipo: 'ENVIO' | 'INTERCAMBIO';
  sede_origen_id: number;
  sede_destino_id: number;
  lote_id: number;
  medicamento_id: number;
  cantidad_cajas: number;
  cantidad_unidades: number;
  cantidad_total_unidades: number;
  motivo: string;
  estado: 'PENDIENTE' | 'APROBADA' | 'RECHAZADA';
  usuario_solicitante_id: number;
  usuario_resolutor_id?: number;
  fecha_solicitud: string;
  fecha_resolucion?: string;
  observacion_resolucion?: string;
  sede_recibe_id?: number;
  lote_recibe_id?: number;
  medicamento_recibe_id?: number;
  cantidad_recibe_total_unidades?: number;
  sede_origen_nombre?: string;
  sede_destino_nombre?: string;
  medicamento_nombre?: string;
}

export interface Auditoria {
  id: number;
  usuario_id?: number;
  rol?: string;
  sede_id?: number;
  accion: string;
  modulo: string;
  registro_afectado?: string;
  resultado: 'EXITO' | 'FALLIDO' | 'CONFLICTO';
  valores_anteriores?: string;
  valores_nuevos?: string;
  fecha: string;
  device_id?: string;
  sync_id?: string;
  plataforma?: string;
}

export interface CatalogoCUM {
  id: number;
  expediente: number;
  consecutivocum: number;
  cum: string;
  producto: string;
  descripcioncomercial?: string;
  principio_activo?: string;
  concentracion?: string;
  forma_farmaceutica?: string;
  via_administracion?: string;
  unidad_medida?: string;
  cantidad_presentacion?: number;
  registro_sanitario?: string;
  fecha_expedicion_registro?: string;
  fecha_vencimiento_registro?: string;
  estado_registro?: string;
  estado_cum?: string;
  fecha_activo?: string;
  fecha_inactivo?: string;
  titular?: string;
  laboratorio?: string;
  fabricante?: string;
  pais_fabricante?: string;
  condicion_venta?: string;
  tipo_producto?: string;
  atc_codigo?: string;
  atc_descripcion?: string;
  gtin?: string;
  gtin_empaque_logistico?: string;
  gtin_empaque_venta?: string;
  fuente: 'INVIMA' | 'MANUAL';
  version_catalogo: string;
  fecha_importacion: string;
  hash_fila?: string;
  documento_adjunto_nombre?: string;
  documento_adjunto_data?: string;
  documento_adjunto_tipo?: string;
  creado_en: string;
  actualizado_en: string;
}

export interface CatalogoEmpaque {
  id: number;
  catalogo_cum_id: number;
  nivel: 1 | 2 | 3;
  gtin: string;
  descripcion?: string;
  contenido_cantidad: number;
  contenido_unidad: string;
  factor_conversion: number;
  es_principal: number;
}

export interface Notificacion {
  id: number;
  remote_id?: string;
  tipo: 'PUSH' | 'LOCAL' | 'SYSTEM';
  titulo: string;
  mensaje: string;
  datos_json?: string;
  leida: number;
  fecha: string;
}

export interface Mensaje {
  id: number;
  remote_id?: string;
  asunto: string;
  contenido: string;
  solicitud_relacionada_id?: number;
  leido: number;
  fecha: string;
}

export interface Dispositivo {
  id: number;
  usuario_id: number;
  device_id: string;
  platform: 'ios' | 'android';
  app_version: string;
  push_token?: string;
  ultima_sync?: string;
  activo: number;
  created_at: string;
  updated_at: string;
}

export interface SyncQueueItem {
  id: number;
  local_id: string;
  remote_id?: string;
  operation_type: 'CREATE' | 'UPDATE' | 'DELETE' | 'UPLOAD_FILE';
  entity: string;
  entity_id?: number;
  payload: string;
  user_id: number;
  sede_id?: number;
  created_at: string;
  synced_at?: string;
  status: 'PENDING' | 'SYNCING' | 'SYNCED' | 'FAILED' | 'CONFLICT';
  attempts: number;
  last_error?: string;
  version: number;
  idempotency_key: string;
}

export interface SyncMetadata {
  key: string;
  value: string;
  updated_at: string;
}

export interface ConflictInfo {
  id: number;
  entity: string;
  local_data: any;
  server_data: any;
  conflict_type: 'VERSION_MISMATCH' | 'STOCK_NEGATIVE' | 'FK_MISSING' | 'DUPLICATE' | 'DELETED_ON_SERVER';
  suggested_resolution: 'SERVER_WINS' | 'LOCAL_WINS' | 'MANUAL_MERGE';
  created_at: string;
  resolved_at?: string;
  resolution?: 'SERVER_WINS' | 'LOCAL_WINS' | 'MANUAL_MERGE';
  resolved_by?: number;
}