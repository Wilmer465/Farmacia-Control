import { BaseRepository } from './BaseRepository';
import { Lote } from '../../../types/domain';
import { sqliteService } from '../SQLiteService';
import { getLoteEstado } from '../../../utils/date';

export class LoteRepository extends BaseRepository<Lote> {
  protected tableName = 'lotes';
  protected columns = [
    'id', 'medicamento_id', 'sede_id', 'numero_lote', 'fecha_expedicion',
    'fecha_vencimiento', 'cantidad_cajas', 'cantidad_unidades_sueltas',
    'cantidad_total_unidades', 'estado_manual', 'empaque_nivel', 'empaque_gtin',
    'factor_conversion', 'created_at', 'updated_at'
  ];

  async findByMedicamentoAndSede(
    medicamentoId: number, 
    sedeId: number, 
    numeroLote: string
  ): Promise<Lote | null> {
    const sql = `
      SELECT * FROM ${this.tableName} 
      WHERE medicamento_id = ? AND sede_id = ? AND numero_lote = ?
    `;
    return await this.db.getFirstAsync(sql, [medicamentoId, sedeId, numeroLote]) as Lote | null;
  }

  async findDisponiblesByMedicamento(medicamentoId: number, sedeId: number): Promise<Lote[]> {
    const sql = `
      SELECT l.*, m.codigo as medicamento_codigo, m.nombre as medicamento_nombre, 
             m.unidades_por_caja, s.nombre as sede_nombre
      FROM ${this.tableName} l
      JOIN medicamentos m ON l.medicamento_id = m.id
      JOIN sedes s ON l.sede_id = s.id
      WHERE l.medicamento_id = ? AND l.sede_id = ? 
      AND l.cantidad_total_unidades > 0
      AND (l.estado_manual IS NULL OR l.estado_manual != 'DADO_DE_BAJA')
      ORDER BY l.fecha_vencimiento ASC
    `;
    const lotes = await this.db.getAllAsync(sql, [medicamentoId, sedeId]) as (Lote & {
      medicamento_codigo: string;
      medicamento_nombre: string;
      unidades_por_caja: number;
      sede_nombre: string;
    })[];
    
    return lotes.map(lote => ({
      ...lote,
      estado: getLoteEstado(lote.fecha_vencimiento, lote.cantidad_total_unidades, lote.estado_manual)
    }));
  }

  async findBySede(sedeId: number, filters?: {
    medicamentoId?: number;
    estado?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<Lote[]> {
    let sql = `
      SELECT l.*, m.codigo as medicamento_codigo, m.nombre as medicamento_nombre,
             m.unidades_por_caja, s.nombre as sede_nombre
      FROM ${this.tableName} l
      JOIN medicamentos m ON l.medicamento_id = m.id
      JOIN sedes s ON l.sede_id = s.id
      WHERE l.sede_id = ?
    `;
    const params: any[] = [sedeId];

    if (filters?.medicamentoId) {
      sql += ` AND l.medicamento_id = ?`;
      params.push(filters.medicamentoId);
    }

    if (filters?.search) {
      sql += ` AND (m.nombre LIKE ? OR m.codigo LIKE ? OR l.numero_lote LIKE ?)`;
      const searchTerm = `%${filters.search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }

    sql += ` ORDER BY l.fecha_vencimiento ASC`;

    if (filters?.limit) {
      sql += ` LIMIT ?`;
      params.push(filters.limit);
      if (filters?.offset) {
        sql += ` OFFSET ?`;
        params.push(filters.offset);
      }
    }

    const lotes = await this.db.getAllAsync(sql, params) as (Lote & {
      medicamento_codigo: string;
      medicamento_nombre: string;
      unidades_por_caja: number;
      sede_nombre: string;
    })[];

    return lotes.map(lote => ({
      ...lote,
      estado: getLoteEstado(lote.fecha_vencimiento, lote.cantidad_total_unidades, lote.estado_manual)
    }));
  }

  async countBySede(sedeId: number, filters?: { medicamentoId?: number; search?: string }): Promise<number> {
    let sql = `SELECT COUNT(*) as count FROM ${this.tableName} l JOIN medicamentos m ON l.medicamento_id = m.id WHERE l.sede_id = ?`;
    const params: any[] = [sedeId];

    if (filters?.medicamentoId) {
      sql += ` AND l.medicamento_id = ?`;
      params.push(filters.medicamentoId);
    }

    if (filters?.search) {
      sql += ` AND (m.nombre LIKE ? OR m.codigo LIKE ? OR l.numero_lote LIKE ?)`;
      const searchTerm = `%${filters.search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }

    const result = await this.db.getFirstAsync(sql, params) as { count: number } | null;
    return result?.count || 0;
  }

  async crearConMovimiento(data: any, usuarioId: number): Promise<Lote> {
    return sqliteService.transaction(async (db) => {
      const keys = Object.keys(data);
      const placeholders = keys.map(() => '?').join(', ');
      const columns = keys.join(', ');
      
      const sql = `INSERT INTO ${this.tableName} (${columns}) VALUES (${placeholders})`;
      const values = keys.map(k => data[k]);
      
      await db.runAsync(sql, values);
      const lastId = await db.getFirstAsync('SELECT last_insert_rowid() as id') as { id: number };
      
      const movimientoSql = `
        INSERT INTO movimientos_inventario (lote_id, medicamento_id, sede_id, tipo, cantidad, usuario_id)
        VALUES (?, ?, ?, 'ENTRADA', ?, ?)
      `;
      await db.runAsync(movimientoSql, [lastId.id, data.medicamento_id, data.sede_id, data.cantidad_total_unidades, usuarioId]);
      
      return this.findById(lastId.id) as Promise<Lote>;
    });
  }

  async ajustarConMovimiento(loteId: number, data: { cantidad_cajas: number; cantidad_unidades_sueltas: number; cantidad_total_unidades: number }, usuarioId: number): Promise<Lote> {
    return sqliteService.transaction(async (db) => {
      const lote = await this.findById(loteId);
      if (!lote) throw new Error('Lote no encontrado');

      const cantidadAnterior = lote.cantidad_total_unidades;
      const diferencia = data.cantidad_total_unidades - cantidadAnterior;

      const updateSql = `
        UPDATE ${this.tableName} 
        SET cantidad_cajas = ?, cantidad_unidades_sueltas = ?, cantidad_total_unidades = ?, updated_at = datetime('now')
        WHERE id = ?
      `;
      await db.runAsync(updateSql, [data.cantidad_cajas, data.cantidad_unidades_sueltas, data.cantidad_total_unidades, loteId]);

      const movimientoSql = `
        INSERT INTO movimientos_inventario (lote_id, medicamento_id, sede_id, tipo, cantidad, usuario_id)
        VALUES (?, ?, ?, 'AJUSTE', ?, ?)
      `;
      await db.runAsync(movimientoSql, [loteId, lote.medicamento_id, lote.sede_id, diferencia, usuarioId]);

      return this.findById(loteId) as Promise<Lote>;
    });
  }
}

