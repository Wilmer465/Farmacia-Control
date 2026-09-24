import { sqliteService } from '../SQLiteService';
import { Repository } from '../../../types/database';

export abstract class BaseRepository<T extends { id: number }> implements Repository<T> {
  protected abstract tableName: string;
  protected abstract columns: string[];

  protected get db() {
    return sqliteService.getDatabase();
  }

  async findAll(filters?: Record<string, any>): Promise<T[]> {
    let sql = `SELECT * FROM ${this.tableName}`;
    const params: any[] = [];

    if (filters && Object.keys(filters).length > 0) {
      const conditions: string[] = [];
      for (const [key, value] of Object.entries(filters)) {
        if (value !== undefined && value !== null) {
          conditions.push(`${key} = ?`);
          params.push(value);
        }
      }
      if (conditions.length > 0) {
        sql += ` WHERE ${conditions.join(' AND ')}`;
      }
    }

    sql += ` ORDER BY id DESC`;
    return await this.db.getAllAsync(sql, params) as T[];
  }

  async findById(id: number): Promise<T | null> {
    const sql = `SELECT * FROM ${this.tableName} WHERE id = ?`;
    return await this.db.getFirstAsync(sql, [id]) as T | null;
  }

  async create(data: Omit<T, 'id'>): Promise<T> {
    const keys = Object.keys(data) as string[];
    const placeholders = keys.map(() => '?').join(', ');
    const columns = keys.join(', ');
    
    const sql = `INSERT INTO ${this.tableName} (${columns}) VALUES (${placeholders})`;
    const values = keys.map(k => (data as any)[k]) as any[];
    
    await this.db.runAsync(sql, values);
    const lastId = await this.db.getFirstAsync('SELECT last_insert_rowid() as id') as { id: number };
    
    return this.findById(lastId.id) as Promise<T>;
  }

  async update(id: number, data: Partial<T>): Promise<T> {
    const keys = Object.keys(data) as string[];
    if (keys.length === 0) return this.findById(id) as Promise<T>;
    
    const setClause = keys.map(k => `${k} = ?`).join(', ');
    const values = keys.map(k => (data as any)[k]) as any[];
    values.push(id);
    
    const sql = `UPDATE ${this.tableName} SET ${setClause} WHERE id = ?`;
    await this.db.runAsync(sql, values);
    
    return this.findById(id) as Promise<T>;
  }

  async delete(id: number): Promise<void> {
    const sql = `DELETE FROM ${this.tableName} WHERE id = ?`;
    await this.db.runAsync(sql, [id]);
  }

  async count(filters?: Record<string, any>): Promise<number> {
    let sql = `SELECT COUNT(*) as count FROM ${this.tableName}`;
    const params: any[] = [];

    if (filters && Object.keys(filters).length > 0) {
      const conditions: string[] = [];
      for (const [key, value] of Object.entries(filters)) {
        if (value !== undefined && value !== null) {
          conditions.push(`${key} = ?`);
          params.push(value);
        }
      }
      if (conditions.length > 0) {
        sql += ` WHERE ${conditions.join(' AND ')}`;
      }
    }

    const result = await this.db.getFirstAsync(sql, params) as { count: number } | null;
    return result?.count || 0;
  }

  protected mapRow(row: any): T {
    return row as T;
  }
}

