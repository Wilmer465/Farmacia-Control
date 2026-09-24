import { BaseRepository } from './BaseRepository';
import { SolicitudEliminacion } from '../../../types/domain';
import { sqliteService } from '../SQLiteService';

export class SolicitudEliminacionRepository extends BaseRepository<SolicitudEliminacion> {
  protected tableName = 'solicitudes_eliminacion';
  protected columns = [
    'id', 'sede_id', 'usuario_solicitante_id', 'tipo_registro', 'registro_id',
    'medicamento_id', 'motivo', 'estado', 'usuario_resolutor_id',
    'fecha_resolucion', 'observacion_resolucion', 'fecha_solicitud'
  ];

  async findBySede(sedeId: number, filters?: {
    estado?: string;
    limit?: number;
    offset?: number;
  }): Promise<SolicitudEliminacion[]> {
    let sql = `
      SELECT se.*, s.nombre as sede_nombre, u1.nombre as solicitante_nombre, u2.nombre as resolutor_nombre
      FROM ${this.tableName} se
      JOIN sedes s ON se.sede_id = s.id
      JOIN usuarios u1 ON se.usuario_solicitante_id = u1.id
      LEFT JOIN usuarios u2 ON se.usuario_resolutor_id = u2.id
      WHERE se.sede_id = ?
    `;
    const params: any[] = [sedeId];

    if (filters?.estado) {
      sql += ` AND se.estado = ?`;
      params.push(filters.estado);
    }

    sql += ` ORDER BY se.fecha_solicitud DESC`;

    if (filters?.limit) {
      sql += ` LIMIT ?`;
      params.push(filters.limit);
      if (filters?.offset) {
        sql += ` OFFSET ?`;
        params.push(filters.offset);
      }
    }

    return await this.db.getAllAsync(sql, params) as SolicitudEliminacion[];
  }

  async resolver(id: number, usuarioResolutorId: number, estado: 'APROBADA' | 'RECHAZADA', observacion?: string): Promise<SolicitudEliminacion> {
    const sql = `
      UPDATE ${this.tableName} 
      SET estado = ?, usuario_resolutor_id = ?, fecha_resolucion = datetime('now'), observacion_resolucion = ?
      WHERE id = ?
    `;
    await this.db.runAsync(sql, [estado, usuarioResolutorId, observacion || null, id]);
    return this.findById(id) as Promise<SolicitudEliminacion>;
  }
}

