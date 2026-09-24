import { Dispositivo } from '../../../types/domain';
import { sqliteService } from '../SQLiteService';

export class DispositivoRepository {
  protected db = sqliteService.getDatabase();
  protected tableName = 'dispositivos';

  async findByDeviceId(deviceId: string): Promise<Dispositivo | null> {
    const sql = `SELECT * FROM ${this.tableName} WHERE device_id = ?`;
    return await this.db.getFirstAsync(sql, [deviceId]) as Dispositivo | null;
  }

  async findByUsuario(usuarioId: number): Promise<Dispositivo[]> {
    const sql = `SELECT * FROM ${this.tableName} WHERE usuario_id = ? AND activo = 1`;
    return await this.db.getAllAsync(sql, [usuarioId]) as Dispositivo[];
  }

  async register(data: Omit<Dispositivo, 'id' | 'created_at' | 'updated_at'>): Promise<number> {
    const existente = await this.findByDeviceId(data.device_id);
    
    if (existente) {
      const sql = `
        UPDATE ${this.tableName} 
        SET platform = ?, app_version = ?, push_token = ?, ultima_sync = datetime('now'), activo = 1, updated_at = datetime('now')
        WHERE id = ?
      `;
      await this.db.runAsync(sql, [data.platform, data.app_version, data.push_token || null, existente.id]);
      return existente.id;
    }

    const keys = Object.keys(data) as (keyof Omit<Dispositivo, 'id' | 'created_at' | 'updated_at'>)[];
    const placeholders = keys.map(() => '?').join(', ');
    const columns = keys.join(', ');
    
    const sql = `INSERT INTO ${this.tableName} (${columns}, created_at, updated_at) VALUES (${placeholders}, datetime('now'), datetime('now'))`;
    const values = keys.map(k => data[k]);
    
    await this.db.runAsync(sql, values);
    const lastId = await this.db.getFirstAsync('SELECT last_insert_rowid() as id') as { id: number };
    return lastId.id;
  }

  async updateSync(deviceId: string): Promise<void> {
    const sql = `UPDATE ${this.tableName} SET ultima_sync = datetime('now'), updated_at = datetime('now') WHERE device_id = ?`;
    await this.db.runAsync(sql, [deviceId]);
  }

  async updatePushToken(deviceId: string, pushToken: string): Promise<void> {
    const sql = `UPDATE ${this.tableName} SET push_token = ?, updated_at = datetime('now') WHERE device_id = ?`;
    await this.db.runAsync(sql, [pushToken, deviceId]);
  }

  async deactivate(deviceId: string): Promise<void> {
    const sql = `UPDATE ${this.tableName} SET activo = 0, updated_at = datetime('now') WHERE device_id = ?`;
    await this.db.runAsync(sql, [deviceId]);
  }
}

