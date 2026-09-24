import { BaseRepository } from './BaseRepository';
import { Medicamento } from '../../../types/domain';
import { sqliteService } from '../SQLiteService';

export class MedicamentoRepository extends BaseRepository<Medicamento> {
  protected tableName = 'medicamentos';
  protected columns = [
    'id', 'codigo', 'nombre', 'principio_activo', 'presentacion', 
    'concentracion', 'laboratorio', 'unidad_medida', 'unidades_por_caja',
    'estado', 'catalogo_cum_id', 'fuente', 'gtin_principal', 'created_at'
  ];

  async findByCodigo(codigo: string): Promise<Medicamento | null> {
    const sql = `SELECT * FROM ${this.tableName} WHERE codigo = ?`;
    return await this.db.getFirstAsync(sql, [codigo]) as Medicamento | null;
  }

  async findByGtin(gtin: string): Promise<Medicamento | null> {
    const sql = `SELECT * FROM ${this.tableName} WHERE gtin_principal = ?`;
    return await this.db.getFirstAsync(sql, [gtin]) as Medicamento | null;
  }

  async search(texto: string, limit: number = 20): Promise<Medicamento[]> {
    const sql = `
      SELECT * FROM ${this.tableName} 
      WHERE (nombre LIKE ? OR codigo LIKE ? OR principio_activo LIKE ?)
      AND estado = 'ACTIVO'
      ORDER BY nombre
      LIMIT ?
    `;
    const searchTerm = `%${texto}%`;
    return await this.db.getAllAsync(sql, [searchTerm, searchTerm, searchTerm, limit]) as Medicamento[];
  }
}

