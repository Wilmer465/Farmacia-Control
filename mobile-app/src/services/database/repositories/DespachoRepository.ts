import { BaseRepository } from './BaseRepository';
import { Despacho, DespachoDetalle } from '../../../types/domain';
import { sqliteService } from '../SQLiteService';

export class DespachoRepository extends BaseRepository<Despacho> {
  protected tableName = 'despachos';
  protected columns = [
    'id', 'orden_id', 'sede_id', 'despachado_por', 'fecha'
  ];

  async findByOrden(ordenId: number): Promise<Despacho[]> {
    const sql = `
      SELECT d.*, u.nombre as despachado_por_nombre
      FROM ${this.tableName} d
      JOIN usuarios u ON d.despachado_por = u.id
      WHERE d.orden_id = ?
      ORDER BY d.fecha DESC
    `;
    return await this.db.getAllAsync(sql, [ordenId]) as Despacho[];
  }

  async findByOrdenWithDetails(ordenId: number): Promise<(Despacho & { detalle: DespachoDetalle[] })[]> {
    const despachos = await this.findByOrden(ordenId);
    
    for (const despacho of despachos) {
      const detalleSql = `
        SELECT dd.*, l.numero_lote as lote_numero, m.nombre as medicamento_nombre
        FROM despacho_detalle dd
        JOIN lotes l ON dd.lote_id = l.id
        JOIN medicamentos m ON dd.medicamento_id = m.id
        WHERE dd.despacho_id = ?
      `;
      const detalle = await this.db.getAllAsync(detalleSql, [despacho.id]) as DespachoDetalle[];
      (despacho as any).detalle = detalle;
    }
    
    return despachos;
  }

  async crearConDetalles(data: {
    orden_id: number;
    sede_id: number;
    despachado_por: number;
    items: Array<{
      orden_detalle_id: number;
      lote_id: number;
      medicamento_id: number;
      cantidad_cajas_despachada: number;
      cantidad_unidades_sueltas_despachada: number;
      cantidad_total_despachada: number;
    }>;
  }): Promise<{ despacho: Despacho; nuevoEstadoOrden: string }> {
    return sqliteService.transaction(async (db) => {
      const despachoSql = `
        INSERT INTO ${this.tableName} (orden_id, sede_id, despachado_por)
        VALUES (?, ?, ?)
      `;
      await db.runAsync(despachoSql, [data.orden_id, data.sede_id, data.despachado_por]);
      
      const despachoId = await db.getFirstAsync('SELECT last_insert_rowid() as id') as { id: number };
      
      for (const item of data.items) {
        const detalleSql = `
          INSERT INTO despacho_detalle (despacho_id, orden_detalle_id, lote_id, medicamento_id, cantidad_cajas_despachada, cantidad_unidades_sueltas_despachada, cantidad_total_despachada)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `;
        await db.runAsync(detalleSql, [
          despachoId.id, item.orden_detalle_id, item.lote_id, item.medicamento_id,
          item.cantidad_cajas_despachada, item.cantidad_unidades_sueltas_despachada, item.cantidad_total_despachada
        ]);

        // Actualizar lote - restar stock
        const loteSql = `
          UPDATE lotes 
          SET cantidad_cajas = cantidad_cajas - ?,
              cantidad_unidades_sueltas = cantidad_unidades_sueltas - ?,
              cantidad_total_unidades = cantidad_total_unidades - ?,
              updated_at = datetime('now')
          WHERE id = ?
        `;
        await db.runAsync(loteSql, [
          item.cantidad_cajas_despachada,
          item.cantidad_unidades_sueltas_despachada,
          item.cantidad_total_despachada,
          item.lote_id
        ]);

        // Registrar movimiento
        const movimientoSql = `
          INSERT INTO movimientos_inventario (lote_id, medicamento_id, sede_id, tipo, cantidad, referencia_orden_id, usuario_id)
          VALUES (?, ?, ?, 'SALIDA_ORDEN', ?, ?, ?)
        `;
        await db.runAsync(movimientoSql, [
          item.lote_id, item.medicamento_id, data.sede_id,
          -item.cantidad_total_despachada, data.orden_id, data.despachado_por
        ]);
      }

      // Actualizar orden_detalles - sumar despachado
      for (const item of data.items) {
        const updateDetalleSql = `
          UPDATE orden_detalles 
          SET cantidad_total_despachada = cantidad_total_despachada + ?
          WHERE id = ?
        `;
        await db.runAsync(updateDetalleSql, [item.cantidad_total_despachada, item.orden_detalle_id]);
      }

      // Calcular nuevo estado de la orden
      const ordenDetalles = await db.getAllAsync(`
        SELECT cantidad_total_solicitada, cantidad_total_despachada 
        FROM orden_detalles WHERE orden_id = ?
      `, [data.orden_id]) as { cantidad_total_solicitada: number; cantidad_total_despachada: number }[];

      let nuevoEstado: string;
      const totalSolicitado = ordenDetalles.reduce((sum, d) => sum + d.cantidad_total_solicitada, 0);
      const totalDespachado = ordenDetalles.reduce((sum, d) => sum + d.cantidad_total_despachada, 0);

      if (totalDespachado >= totalSolicitado) {
        nuevoEstado = 'COMPLETADA';
      } else if (totalDespachado > 0) {
        nuevoEstado = 'PARCIAL';
      } else {
        nuevoEstado = 'PENDIENTE';
      }

      await db.runAsync(`
        UPDATE ordenes SET estado = ?, fecha_actualizacion = datetime('now') WHERE id = ?
      `, [nuevoEstado, data.orden_id]);

      const despacho = await this.findById(despachoId.id);
      return { despacho: despacho as Despacho, nuevoEstadoOrden: nuevoEstado };
    });
  }
}

