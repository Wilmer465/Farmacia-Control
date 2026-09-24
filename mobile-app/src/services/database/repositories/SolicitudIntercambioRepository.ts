import { BaseRepository } from './BaseRepository';
import { SolicitudIntercambio } from '../../../types/domain';
import { sqliteService } from '../SQLiteService';

export class SolicitudIntercambioRepository extends BaseRepository<SolicitudIntercambio> {
  protected tableName = 'solicitudes_intercambio';
  protected columns = [
    'id', 'tipo', 'sede_origen_id', 'sede_destino_id', 'lote_id', 'medicamento_id',
    'cantidad_cajas', 'cantidad_unidades', 'cantidad_total_unidades', 'motivo',
    'estado', 'usuario_solicitante_id', 'usuario_resolutor_id', 'fecha_solicitud',
    'fecha_resolucion', 'observacion_resolucion', 'sede_recibe_id', 'lote_recibe_id',
    'medicamento_recibe_id', 'cantidad_recibe_total_unidades'
  ];

  async findBySedes(sedeOrigenId?: number, sedeDestinoId?: number, filters?: {
    estado?: string;
    limit?: number;
    offset?: number;
  }): Promise<SolicitudIntercambio[]> {
    let sql = `
      SELECT si.*, 
             so.nombre as sede_origen_nombre, sd.nombre as sede_destino_nombre,
             m.nombre as medicamento_nombre,
             u1.nombre as solicitante_nombre, u2.nombre as resolutor_nombre
      FROM ${this.tableName} si
      JOIN sedes so ON si.sede_origen_id = so.id
      JOIN sedes sd ON si.sede_destino_id = sd.id
      JOIN medicamentos m ON si.medicamento_id = m.id
      JOIN usuarios u1 ON si.usuario_solicitante_id = u1.id
      LEFT JOIN usuarios u2 ON si.usuario_resolutor_id = u2.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (sedeOrigenId) {
      sql += ` AND si.sede_origen_id = ?`;
      params.push(sedeOrigenId);
    }

    if (sedeDestinoId) {
      sql += ` AND si.sede_destino_id = ?`;
      params.push(sedeDestinoId);
    }

    if (filters?.estado) {
      sql += ` AND si.estado = ?`;
      params.push(filters.estado);
    }

    sql += ` ORDER BY si.fecha_solicitud DESC`;

    if (filters?.limit) {
      sql += ` LIMIT ?`;
      params.push(filters.limit);
      if (filters?.offset) {
        sql += ` OFFSET ?`;
        params.push(filters.offset);
      }
    }

    return await this.db.getAllAsync(sql, params) as SolicitudIntercambio[];
  }

  async resolver(id: number, usuarioResolutorId: number, estado: 'APROBADA' | 'RECHAZADA', observacion?: string): Promise<SolicitudIntercambio> {
    return sqliteService.transaction(async (db) => {
      const solicitud = await this.findById(id);
      if (!solicitud) throw new Error('Solicitud no encontrada');

      // Si es APROBADA y es ENVIO, mover stock
      if (estado === 'APROBADA' && solicitud.tipo === 'ENVIO') {
        // Restar de sede origen
        await db.runAsync(`
          UPDATE lotes SET cantidad_total_unidades = cantidad_total_unidades - ?, updated_at = datetime('now')
          WHERE id = ?
        `, [solicitud.cantidad_total_unidades, solicitud.lote_id]);

        // Registrar movimiento de salida
        await db.runAsync(`
          INSERT INTO movimientos_inventario (lote_id, medicamento_id, sede_id, tipo, cantidad, referencia_orden_id, usuario_id)
          VALUES (?, ?, ?, 'SALIDA_ORDEN', ?, NULL, ?)
        `, [solicitud.lote_id, solicitud.medicamento_id, solicitud.sede_origen_id, -solicitud.cantidad_total_unidades, usuarioResolutorId]);

        // TODO: Crear lote en sede destino si no existe
      }

      const sql = `
        UPDATE ${this.tableName} 
        SET estado = ?, usuario_resolutor_id = ?, fecha_resolucion = datetime('now'), observacion_resolucion = ?
        WHERE id = ?
      `;
      await db.runAsync(sql, [estado, usuarioResolutorId, observacion || null, id]);
      
      return this.findById(id) as Promise<SolicitudIntercambio>;
    });
  }
}

