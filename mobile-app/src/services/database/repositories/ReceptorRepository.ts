import { BaseRepository } from './BaseRepository';
import { Receptor } from '../../../types/domain';
import { sqliteService } from '../SQLiteService';

export class ReceptorRepository extends BaseRepository<Receptor> {
  protected tableName = 'receptores';
  protected columns = [
    'id', 'documento', 'nombre', 'telefono', 'correo_electronico',
    'firma_guardada', 'huella_guardada', 'documento_adjunto_nombre',
    'documento_adjunto_data', 'documento_adjunto_tipo', 'prioridad',
    'medicamentos_uso', 'notas', 'created_at', 'updated_at'
  ];

  async findByDocumento(documento: string): Promise<Receptor | null> {
    const sql = `SELECT * FROM ${this.tableName} WHERE documento = ?`;
    return await this.db.getFirstAsync(sql, [documento]) as Receptor | null;
  }

  async guardarOActualizar(data: Partial<Receptor> & { documento: string; nombre: string }): Promise<Receptor> {
    const existente = await this.findByDocumento(data.documento);
    
    if (existente) {
      return this.update(existente.id, data);
    } else {
      return this.create(data as Omit<Receptor, 'id'>);
    }
  }

  async search(texto: string, limit: number = 10): Promise<Receptor[]> {
    const sql = `
      SELECT * FROM ${this.tableName} 
      WHERE (nombre LIKE ? OR documento LIKE ?)
      ORDER BY nombre
      LIMIT ?
    `;
    const searchTerm = `%${texto}%`;
    return await this.db.getAllAsync(sql, [searchTerm, searchTerm, limit]) as Receptor[];
  }
}

