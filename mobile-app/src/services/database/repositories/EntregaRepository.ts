import { BaseRepository } from './BaseRepository';
import { Entrega } from '../../../types/domain';
import { sqliteService } from '../SQLiteService';

export class EntregaRepository extends BaseRepository<Entrega> {
  protected tableName = 'entregas';
  protected columns = [
    'id', 'despacho_id', 'orden_id', 'sede_id', 'receptor_nombre', 'receptor_documento',
    'firma_data', 'huella_registrada', 'entregado_por', 'fecha',
    'documentacion_completa', 'elementos_faltantes', 'documento_adjunto_nombre',
    'documento_adjunto_data', 'documento_adjunto_tipo', 'tipo_destino', 'destino_detalle'
  ];

  async findByOrden(ordenId: number): Promise<Entrega | null> {
    const sql = `SELECT * FROM ${this.tableName} WHERE orden_id = ?`;
    return await this.db.getFirstAsync(sql, [ordenId]) as Entrega | null;
  }

  async findByDespacho(despachoId: number): Promise<Entrega | null> {
    const sql = `SELECT * FROM ${this.tableName} WHERE despacho_id = ?`;
    return await this.db.getFirstAsync(sql, [despachoId]) as Entrega | null;
  }

  async findBySede(sedeId: number, filters?: {
    fechaInicio?: string;
    fechaFin?: string;
    documentacionCompleta?: number;
    limit?: number;
    offset?: number;
  }): Promise<Entrega[]> {
    let sql = `
      SELECT e.*, o.numero as orden_numero, u.nombre as entregado_por_nombre
      FROM ${this.tableName} e
      JOIN ordenes o ON e.orden_id = o.id
      JOIN usuarios u ON e.entregado_por = u.id
      WHERE e.sede_id = ?
    `;
    const params: any[] = [sedeId];

    if (filters?.fechaInicio) {
      sql += ` AND e.fecha >= ?`;
      params.push(filters.fechaInicio);
    }

    if (filters?.fechaFin) {
      sql += ` AND e.fecha <= ?`;
      params.push(filters.fechaFin);
    }

    if (filters?.documentacionCompleta !== undefined) {
      sql += ` AND e.documentacion_completa = ?`;
      params.push(filters.documentacionCompleta);
    }

    sql += ` ORDER BY e.fecha DESC`;

    if (filters?.limit) {
      sql += ` LIMIT ?`;
      params.push(filters.limit);
      if (filters?.offset) {
        sql += ` OFFSET ?`;
        params.push(filters.offset);
      }
    }

    return await this.db.getAllAsync(sql, params) as Entrega[];
  }

  async crear(data: Entrega): Promise<Entrega> {
    const keys = Object.keys(data) as (keyof Entrega)[];
    const placeholders = keys.map(() => '?').join(', ');
    const columns = keys.join(', ');
    
    const sql = `INSERT INTO ${this.tableName} (${columns}) VALUES (${placeholders})`;
    const values = keys.map(k => data[k]);
    
    await this.db.runAsync(sql, values);
    const lastId = await this.db.getFirstAsync('SELECT last_insert_rowid() as id') as { id: number };
    
    return this.findById(lastId.id) as Promise<Entrega>;
  }
}

