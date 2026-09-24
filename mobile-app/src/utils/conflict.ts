import { ConflictItem, ConflictResolution, ServerChange } from '../types/sync';
import { Lote, MovimientoInventario } from '../types/domain';
import { getLoteEstado } from './date';

export type { ConflictItem, ConflictResolution, ServerChange };

export interface ResolvedConflict {
  conflictId: number;
  resolution: ConflictResolution;
  mergedData?: any;
}

export function detectStockNegativeConflict(localData: any, serverData: any): boolean {
  if (!localData || !serverData) return false;
  
  const localCantidad = Number(localData.cantidad_total_unidades || 0);
  const serverCantidad = Number(serverData.cantidad_total_unidades || 0);
  
  return localCantidad < 0 || serverCantidad < 0;
}

export function detectVersionMismatch(localVersion: number, serverVersion: number): boolean {
  return localVersion !== serverVersion;
}

export function detectFkMissing(entity: string, localData: any, serverData: any): string[] {
  const missing: string[] = [];
  
  const fkMap: Record<string, string[]> = {
    lotes: ['medicamento_id', 'sede_id'],
    ordenes: ['sede_id', 'usuario_creador_id'],
    orden_detalles: ['orden_id', 'medicamento_id'],
    despachos: ['orden_id', 'sede_id', 'despachado_por'],
    despacho_detalle: ['despacho_id', 'orden_detalle_id', 'lote_id', 'medicamento_id'],
    entregas: ['despacho_id', 'orden_id', 'sede_id', 'entregado_por'],
    movimientos_inventario: ['lote_id', 'medicamento_id', 'sede_id'],
    solicitudes_eliminacion: ['sede_id', 'usuario_solicitante_id', 'registro_id'],
    solicitudes_intercambio: ['sede_origen_id', 'sede_destino_id', 'lote_id', 'medicamento_id', 'usuario_solicitante_id'],
  };
  
  const requiredFks = fkMap[entity] || [];
  
  for (const fk of requiredFks) {
    const localValue = localData[fk];
    const serverValue = serverData[fk];
    
    if (localValue && !serverValue) {
      missing.push(fk);
    }
  }
  
  return missing;
}

export function suggestResolution(conflict: ConflictItem): ConflictResolution {
  switch (conflict.conflictType) {
    case 'STOCK_NEGATIVE':
      return 'SERVER_WINS';
    case 'FK_MISSING':
      return 'SERVER_WINS';
    case 'VERSION_MISMATCH':
      return 'SERVER_WINS';
    case 'DUPLICATE':
      return 'SERVER_WINS';
    case 'DELETED_ON_SERVER':
      return 'SERVER_WINS';
    case 'CONSTRAINT_VIOLATION':
      return 'SERVER_WINS';
    default:
      return 'SERVER_WINS';
  }
}

export function mergeLoteData(local: Lote, server: Lote, resolution: ConflictResolution): Lote {
  switch (resolution) {
    case 'LOCAL_WINS':
      return {
        ...server,
        ...local,
        id: server.id,
        cantidad_total_unidades: local.cantidad_total_unidades,
        cantidad_cajas: local.cantidad_cajas,
        cantidad_unidades_sueltas: local.cantidad_unidades_sueltas,
        estado: getLoteEstado(local.fecha_vencimiento, local.cantidad_total_unidades, local.estado_manual),
      };
    case 'SERVER_WINS':
      return {
        ...server,
        estado: getLoteEstado(server.fecha_vencimiento, server.cantidad_total_unidades, server.estado_manual),
      };
    case 'MANUAL_MERGE':
      return {
        ...server,
        ...local,
        id: server.id,
        cantidad_total_unidades: Math.max(local.cantidad_total_unidades, server.cantidad_total_unidades),
        cantidad_cajas: Math.max(local.cantidad_cajas, server.cantidad_cajas),
        cantidad_unidades_sueltas: Math.max(local.cantidad_unidades_sueltas, server.cantidad_unidades_sueltas),
        estado: getLoteEstado(server.fecha_vencimiento, server.cantidad_total_unidades, server.estado_manual),
      };
    default:
      return server;
  }
}

export function mergeMovimientoData(local: MovimientoInventario, server: MovimientoInventario, resolution: ConflictResolution): MovimientoInventario {
  switch (resolution) {
    case 'LOCAL_WINS':
      return { ...server, ...local, id: server.id };
    case 'SERVER_WINS':
      return server;
    case 'MANUAL_MERGE':
      return {
        ...server,
        ...local,
        id: server.id,
        cantidad: local.cantidad + server.cantidad,
      };
    default:
      return server;
  }
}

export function applyResolutionToEntity(
  entity: string,
  localData: any,
  serverData: any,
  resolution: ConflictResolution,
  mergedData?: any
): any {
  if (mergedData) return mergedData;
  
  switch (entity) {
    case 'lotes':
      return mergeLoteData(localData, serverData, resolution);
    case 'movimientos_inventario':
      return mergeMovimientoData(localData, serverData, resolution);
    default:
      switch (resolution) {
        case 'LOCAL_WINS':
          return { ...serverData, ...localData, id: serverData.id };
        case 'SERVER_WINS':
          return serverData;
        case 'MANUAL_MERGE':
          return { ...serverData, ...localData, id: serverData.id };
        default:
          return serverData;
      }
  }
}

export function createConflictFromSyncError(
  queueItem: any,
  serverResponse: any
): ConflictItem {
  const conflictType = determineConflictType(serverResponse.error);
  const suggestedResolution = suggestResolution({
    conflictType,
  } as ConflictItem);
  
  return {
    id: Date.now(),
    entity: queueItem.entity,
    localData: queueItem.payloadParsed,
    serverData: serverResponse.server_data,
    conflictType,
    suggestedResolution,
    localQueueItem: queueItem,
    createdAt: new Date().toISOString(),
  };
}

function determineConflictType(error: string): ConflictItem['conflictType'] {
  const errorLower = error.toLowerCase();
  
  if (errorLower.includes('stock') || errorLower.includes('negativo') || errorLower.includes('insuficient')) {
    return 'STOCK_NEGATIVE';
  }
  if (errorLower.includes('foreign key') || errorLower.includes('fk_') || errorLower.includes('references')) {
    return 'FK_MISSING';
  }
  if (errorLower.includes('duplicate') || errorLower.includes('unique') || errorLower.includes('ya existe')) {
    return 'DUPLICATE';
  }
  if (errorLower.includes('version') || errorLower.includes('optimistic') || errorLower.includes('conflict')) {
    return 'VERSION_MISMATCH';
  }
  if (errorLower.includes('deleted') || errorLower.includes('not found') || errorLower.includes('no existe')) {
    return 'DELETED_ON_SERVER';
  }
  if (errorLower.includes('constraint') || errorLower.includes('check')) {
    return 'CONSTRAINT_VIOLATION';
  }
  
  return 'VERSION_MISMATCH';
}

export function resolveConflictsBatch(
  conflicts: ConflictItem[],
  resolutions: Map<number, ConflictResolution>
): ResolvedConflict[] {
  return conflicts.map(conflict => ({
    conflictId: conflict.id,
    resolution: resolutions.get(conflict.id) || conflict.suggestedResolution,
  }));
}