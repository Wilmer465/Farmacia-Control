import { Notificacion, Mensaje } from '../../../types/domain';
import { sqliteService } from '../SQLiteService';

export class NotificacionRepository {
  protected get db() { return sqliteService.getDatabase(); }
  protected tableName = 'notificaciones_locales';

  async create(notificacion: Omit<Notificacion, 'id'>): Promise<number> {
    const keys = Object.keys(notificacion) as (keyof Omit<Notificacion, 'id'>)[];
    const placeholders = keys.map(() => '?').join(', ');
    const columns = keys.join(', ');
    
    const sql = `INSERT INTO ${this.tableName} (${columns}) VALUES (${placeholders})`;
    const values = keys.map(k => notificacion[k]);
    
    await this.db.runAsync(sql, values);
    const lastId = await this.db.getFirstAsync('SELECT last_insert_rowid() as id') as { id: number };
    return lastId.id;
  }

  async findAll(filters?: { leida?: number; limit?: number; offset?: number }): Promise<Notificacion[]> {
    let sql = `SELECT * FROM ${this.tableName} WHERE 1=1`;
    const params: any[] = [];

    if (filters?.leida !== undefined) {
      sql += ` AND leida = ?`;
      params.push(filters.leida);
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

    return await this.db.getAllAsync(sql, params) as Notificacion[];
  }

  async findUnreadCount(): Promise<number> {
    const sql = `SELECT COUNT(*) as count FROM ${this.tableName} WHERE leida = 0`;
    const result = await this.db.getFirstAsync(sql) as { count: number } | null;
    return result?.count || 0;
  }

  async markAsRead(ids: number[]): Promise<void> {
    if (ids.length === 0) return;
    const placeholders = ids.map(() => '?').join(',');
    const sql = `UPDATE ${this.tableName} SET leida = 1 WHERE id IN (${placeholders})`;
    await this.db.runAsync(sql, ids);
  }

  async markAllAsRead(): Promise<void> {
    const sql = `UPDATE ${this.tableName} SET leida = 1 WHERE leida = 0`;
    await this.db.runAsync(sql);
  }

  async deleteOld(olderThanDays: number = 90): Promise<number> {
    const sql = `DELETE FROM ${this.tableName} WHERE fecha < datetime('now', ?)`;
    await this.db.runAsync(sql, [`-${olderThanDays} days`]);
    const result = await this.db.getFirstAsync('SELECT changes() as count') as { count: number } | null;
    return result?.count || 0;
  }
}

export class MensajeRepository {
  protected get db() { return sqliteService.getDatabase(); }
  protected tableName = 'mensajes_locales';

  async create(mensaje: Omit<Mensaje, 'id'>): Promise<number> {
    const keys = Object.keys(mensaje) as (keyof Omit<Mensaje, 'id'>)[];
    const placeholders = keys.map(() => '?').join(', ');
    const columns = keys.join(', ');
    
    const sql = `INSERT INTO ${this.tableName} (${columns}) VALUES (${placeholders})`;
    const values = keys.map(k => mensaje[k]);
    
    await this.db.runAsync(sql, values);
    const lastId = await this.db.getFirstAsync('SELECT last_insert_rowid() as id') as { id: number };
    return lastId.id;
  }

  async findAll(filters?: { leido?: number; limit?: number; offset?: number }): Promise<Mensaje[]> {
    let sql = `SELECT * FROM ${this.tableName} WHERE 1=1`;
    const params: any[] = [];

    if (filters?.leido !== undefined) {
      sql += ` AND leido = ?`;
      params.push(filters.leido);
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

    return await this.db.getAllAsync(sql, params) as Mensaje[];
  }

  async findUnreadCount(): Promise<number> {
    const sql = `SELECT COUNT(*) as count FROM ${this.tableName} WHERE leido = 0`;
    const result = await this.db.getFirstAsync(sql) as { count: number } | null;
    return result?.count || 0;
  }

  async markAsRead(ids: number[]): Promise<void> {
    if (ids.length === 0) return;
    const placeholders = ids.map(() => '?').join(',');
    const sql = `UPDATE ${this.tableName} SET leido = 1 WHERE id IN (${placeholders})`;
    await this.db.runAsync(sql, ids);
  }
}

