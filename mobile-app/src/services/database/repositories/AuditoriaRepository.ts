import { Auditoria } from '../../../types/domain';
import { sqliteService } from '../SQLiteService';

export class AuditoriaRepository {
  protected db = sqliteService.getDatabase();
  protected tableName = 'auditoria';

  async registrar(auditoria: Omit<Auditoria, 'id'>): Promise<number> {
    const keys = Object.keys(auditoria) as (keyof Omit<Auditoria, 'id'>)[];
    const placeholders = keys.map(() => '?').join(', ');
    const columns = keys.join(', ');
    
    const sql = `INSERT INTO ${this.tableName} (${columns}) VALUES (${placeholders})`;
    const values = keys.map(k => auditoria[k]);
    
    await this.db.runAsync(sql, values);
    const lastId = await this.db.getFirstAsync('SELECT last_insert_rowid() as id') as { id: number };
    return lastId.id;
  }

  async findAll(filters?: {
    usuarioId?: number;
    sedeId?: number;
    modulo?: string;
    accion?: string;
    fechaInicio?: string;
    fechaFin?: string;
    limit?: number;
    offset?: number;
  }): Promise<Auditoria[]> {
    let sql = `
      SELECT a.*, u.nombre as usuario_nombre
      FROM ${this.tableName} a
      LEFT JOIN usuarios u ON a.usuario_id = u.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (filters?.usuarioId) {
      sql += ` AND a.usuario_id = ?`;
      params.push(filters.usuarioId);
    }

    if (filters?.sedeId) {
      sql += ` AND a.sede_id = ?`;
      params.push(filters.sedeId);
    }

    if (filters?.modulo) {
      sql += ` AND a.modulo = ?`;
      params.push(filters.modulo);
    }

    if (filters?.accion) {
      sql += ` AND a.accion = ?`;
      params.push(filters.accion);
    }

    if (filters?.fechaInicio) {
      sql += ` AND a.fecha >= ?`;
      params.push(filters.fechaInicio);
    }

    if (filters?.fechaFin) {
      sql += ` AND a.fecha <= ?`;
      params.push(filters.fechaFin);
    }

    sql += ` ORDER BY a.fecha DESC`;

    if (filters?.limit) {
      sql += ` LIMIT ?`;
      params.push(filters.limit);
      if (filters?.offset) {
        sql += ` OFFSET ?`;
        params.push(filters.offset);
      }
    }

    return await this.db.getAllAsync(sql, params) as Auditoria[];
  }

  async count(filters?: any): Promise<number> {
    let sql = `SELECT COUNT(*) as count FROM ${this.tableName} WHERE 1=1`;
    const params: any[] = [];

    if (filters?.usuarioId) {
      sql += ` AND usuario_id = ?`;
      params.push(filters.usuarioId);
    }
    if (filters?.sedeId) {
      sql += ` AND sede_id = ?`;
      params.push(filters.sedeId);
    }
    if (filters?.fechaInicio) {
      sql += ` AND fecha >= ?`;
      params.push(filters.fechaInicio);
    }
    if (filters?.fechaFin) {
      sql += ` AND fecha <= ?`;
      params.push(filters.fechaFin);
    }

    const result = await this.db.getFirstAsync(sql, params) as { count: number } | null;
    return result?.count || 0;
  }
}

export class AuditoriaLocalRepository {
  protected db = sqliteService.getDatabase();
  protected tableName = 'auditoria_local';

  async registrar(auditoria: Omit<Auditoria, 'id' | 'sync_id'> & { sync_id?: string }): Promise<number> {
    const keys = Object.keys(auditoria) as (keyof typeof auditoria)[];
    const placeholders = keys.map(() => '?').join(', ');
    const columns = keys.join(', ');
    
    const sql = `INSERT INTO ${this.tableName} (${columns}) VALUES (${placeholders})`;
    const values = keys.map(k => auditoria[k]);
    
    await this.db.runAsync(sql, values);
    const lastId = await this.db.getFirstAsync('SELECT last_insert_rowid() as id') as { id: number };
    return lastId.id;
  }

  async findAll(filters?: {
    usuarioId?: number;
    sedeId?: number;
    fechaInicio?: string;
    fechaFin?: string;
    limit?: number;
    offset?: number;
  }): Promise<any[]> {
    let sql = `SELECT * FROM ${this.tableName} WHERE 1=1`;
    const params: any[] = [];

    if (filters?.usuarioId) {
      sql += ` AND usuario_id = ?`;
      params.push(filters.usuarioId);
    }
    if (filters?.sedeId) {
      sql += ` AND sede_id = ?`;
      params.push(filters.sedeId);
    }
    if (filters?.fechaInicio) {
      sql += ` AND fecha >= ?`;
      params.push(filters.fechaInicio);
    }
    if (filters?.fechaFin) {
      sql += ` AND fecha <= ?`;
      params.push(filters.fechaFin);
    }

    sql += ` ORDER BY fecha DESC`;

    if (filters?.limit) {
      sql += ` LIMIT ?`;
      params.push(filters.limit);
      if (filters?.offset) {
        sql += ` OFFSET ?`;
        params.push(filters.offset);
      }
    }

    return await this.db.getAllAsync(sql, params);
  }
}

