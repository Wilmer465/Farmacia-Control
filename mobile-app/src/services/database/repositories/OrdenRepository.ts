import { BaseRepository } from './BaseRepository';
import { Orden, OrdenDetalle } from '../../../types/domain';
import { sqliteService } from '../SQLiteService';

export class OrdenRepository extends BaseRepository<Orden> {
  protected tableName = 'ordenes';
  protected columns = [
    'id', 'numero', 'sede_id', 'estado', 'motivo_cancelacion', 'usuario_creador_id',
    'tipo_destino', 'destino_detalle', 'receptor_nombre', 'receptor_documento',
    'receptor_telefono', 'receptor_correo', 'firma_data', 'huella_registrada',
    'documento_adjunto_nombre', 'documento_adjunto_data', 'documento_adjunto_tipo',
    'documentacion_completa', 'elementos_faltantes', 'fecha_creacion', 'fecha_actualizacion'
  ];

  async findBySede(sedeId: number, filters?: {
    estado?: string;
    fechaInicio?: string;
    fechaFin?: string;
    limit?: number;
    offset?: number;
  }): Promise<Orden[]> {
    let sql = `
      SELECT o.*, s.nombre as sede_nombre, u.nombre as usuario_nombre
      FROM ${this.tableName} o
      JOIN sedes s ON o.sede_id = s.id
      JOIN usuarios u ON o.usuario_creador_id = u.id
      WHERE o.sede_id = ?
    `;
    const params: any[] = [sedeId];

    if (filters?.estado) {
      sql += ` AND o.estado = ?`;
      params.push(filters.estado);
    }

    if (filters?.fechaInicio) {
      sql += ` AND o.fecha_creacion >= ?`;
      params.push(filters.fechaInicio);
    }

    if (filters?.fechaFin) {
      sql += ` AND o.fecha_creacion <= ?`;
      params.push(filters.fechaFin);
    }

    sql += ` ORDER BY o.fecha_creacion DESC`;

    if (filters?.limit) {
      sql += ` LIMIT ?`;
      params.push(filters.limit);
      if (filters?.offset) {
        sql += ` OFFSET ?`;
        params.push(filters.offset);
      }
    }

    return await this.db.getAllAsync(sql, params) as Orden[];
  }

  async findByIdWithDetails(id: number): Promise<(Orden & { detalles: OrdenDetalle[] }) | null> {
    const orden = await this.findById(id);
    if (!orden) return null;

    const detallesSql = `
      SELECT od.*, m.codigo as medicamento_codigo, m.nombre as medicamento_nombre
      FROM orden_detalles od
      JOIN medicamentos m ON od.medicamento_id = m.id
      WHERE od.orden_id = ?
    `;
    const detalles = await this.db.getAllAsync(detallesSql, [id]) as OrdenDetalle[];
    
    return { ...orden, detalles };
  }

  async crearConDetalles(data: {
    sede_id: number;
    usuario_creador_id: number;
    items: Array<{
      medicamento_id: number;
      cantidad_cajas_solicitada: number;
      cantidad_unidades_solicitada: number;
      cantidad_total_solicitada: number;
    }>;
    tipo_destino: 'LOCAL' | 'MUNICIPIO_VEREDA';
    destino_detalle?: string;
    receptor_nombre: string;
    receptor_documento: string;
    receptor_telefono?: string;
    receptor_correo?: string;
    firma_data?: string;
    huella_registrada: number;
    documento_adjunto_nombre?: string;
    documento_adjunto_data?: string;
    documento_adjunto_tipo?: string;
    documentacion_completa: number;
    elementos_faltantes?: string;
  }): Promise<Orden> {
    return sqliteService.transaction(async (db) => {
      const numero = await this.generarNumeroOrden(db);
      
      const ordenSql = `
        INSERT INTO ${this.tableName} (
          numero, sede_id, usuario_creador_id, tipo_destino, destino_detalle,
          receptor_nombre, receptor_documento, receptor_telefono, receptor_correo,
          firma_data, huella_registrada, documento_adjunto_nombre,
          documento_adjunto_data, documento_adjunto_tipo,
          documentacion_completa, elementos_faltantes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      
      await db.runAsync(ordenSql, [
        numero, data.sede_id, data.usuario_creador_id, data.tipo_destino, data.destino_detalle,
        data.receptor_nombre, data.receptor_documento, data.receptor_telefono, data.receptor_correo,
        data.firma_data, data.huella_registrada, data.documento_adjunto_nombre,
        data.documento_adjunto_data, data.documento_adjunto_tipo,
        data.documentacion_completa, data.elementos_faltantes
      ]);
      
      const ordenId = await db.getFirstAsync('SELECT last_insert_rowid() as id') as { id: number };
      
      for (const item of data.items) {
        const detalleSql = `
          INSERT INTO orden_detalles (orden_id, medicamento_id, cantidad_cajas_solicitada, cantidad_unidades_solicitada, cantidad_total_solicitada)
          VALUES (?, ?, ?, ?, ?)
        `;
        await db.runAsync(detalleSql, [
          ordenId.id, item.medicamento_id, item.cantidad_cajas_solicitada,
          item.cantidad_unidades_solicitada, item.cantidad_total_solicitada
        ]);
      }
      
      return this.findByIdWithDetails(ordenId.id) as Promise<Orden>;
    });
  }

  private async generarNumeroOrden(db: any): Promise<string> {
    const hoy = new Date();
    const anio = hoy.getFullYear().toString().slice(-2);
    const mes = (hoy.getMonth() + 1).toString().padStart(2, '0');
    const dia = hoy.getDate().toString().padStart(2, '0');
    const prefijo = `ORD${anio}${mes}${dia}`;
    
    const result = await db.getFirstAsync(
      `SELECT MAX(numero) as max_num FROM ${this.tableName} WHERE numero LIKE ?`,
      [`${prefijo}%`]
    ) as { max_num: string | null };
    
    let secuencia = 1;
    if (result?.max_num) {
      const lastSeq = parseInt(result.max_num.replace(prefijo, ''), 10);
      secuencia = lastSeq + 1;
    }
    
    return `${prefijo}${secuencia.toString().padStart(4, '0')}`;
  }

  async cancelar(id: number, motivo: string): Promise<Orden> {
    const sql = `
      UPDATE ${this.tableName} 
      SET estado = 'CANCELADA', motivo_cancelacion = ?, fecha_actualizacion = datetime('now')
      WHERE id = ?
    `;
    await this.db.runAsync(sql, [motivo, id]);
    return this.findById(id) as Promise<Orden>;
  }

  async actualizarDocumentacion(id: number, data: {
    receptor_nombre?: string;
    receptor_documento?: string;
    receptor_telefono?: string;
    receptor_correo?: string;
    firma_data?: string;
    huella_registrada?: number;
    documento_adjunto_nombre?: string;
    documento_adjunto_data?: string;
    documento_adjunto_tipo?: string;
    documentacion_completa: number;
    elementos_faltantes?: string;
  }): Promise<Orden> {
    const keys = Object.keys(data).filter(k => data[k as keyof typeof data] !== undefined);
    const setClause = keys.map(k => `${k} = ?`).join(', ');
    const values = keys.map(k => data[k as keyof typeof data]);
    values.push(id);
    
    const sql = `UPDATE ${this.tableName} SET ${setClause}, fecha_actualizacion = datetime('now') WHERE id = ?`;
    await this.db.runAsync(sql, values);
    return this.findById(id) as Promise<Orden>;
  }

  async findAllPaginated(filters: {
    sedeId?: number;
    estado?: string;
    fechaInicio?: string;
    fechaFin?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ data: Orden[]; total: number }> {
    let whereClause = 'WHERE 1=1';
    const params: any[] = [];

    if (filters.sedeId) {
      whereClause += ` AND o.sede_id = ?`;
      params.push(filters.sedeId);
    }

    if (filters.estado) {
      whereClause += ` AND o.estado = ?`;
      params.push(filters.estado);
    }

    if (filters.fechaInicio) {
      whereClause += ` AND o.fecha_creacion >= ?`;
      params.push(filters.fechaInicio);
    }

    if (filters.fechaFin) {
      whereClause += ` AND o.fecha_creacion <= ?`;
      params.push(filters.fechaFin);
    }

    const countSql = `SELECT COUNT(*) as count FROM ${this.tableName} o ${whereClause}`;
    const total = (await this.db.getFirstAsync(countSql, params) as { count: number })?.count || 0;

    let dataSql = `
      SELECT o.*, s.nombre as sede_nombre, u.nombre as usuario_nombre
      FROM ${this.tableName} o
      JOIN sedes s ON o.sede_id = s.id
      JOIN usuarios u ON o.usuario_creador_id = u.id
      ${whereClause}
      ORDER BY o.fecha_creacion DESC
    `;
    
    if (filters.limit) {
      dataSql += ` LIMIT ?`;
      params.push(filters.limit);
      if (filters.offset) {
        dataSql += ` OFFSET ?`;
        params.push(filters.offset);
      }
    }

    const data = await this.db.getAllAsync(dataSql, params) as Orden[];
    return { data, total };
  }
}

