// Datos fiscales de generación UBL. No se almacenan certificados, PIN ni claves privadas.
module.exports = {
  name: '032_dian_datos_fiscales',
  up(db) {
    const columnasPorTabla = new Map();
    const cols = (table) => {
      if (!columnasPorTabla.has(table)) {
        columnasPorTabla.set(table, new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name)));
      }
      return columnasPorTabla.get(table);
    };
    const add = (table, column, definition) => {
      const columnas = cols(table);
      if (!columnas.has(column)) {
        db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
        columnas.add(column);
      }
    };
    for (const [name, def] of Object.entries({ nit_emisor: 'TEXT', dv_emisor: 'TEXT', nombre_legal: 'TEXT', tipo_identificacion_emisor: 'TEXT',
      direccion_emisor: 'TEXT', municipio_emisor: 'TEXT', codigo_municipio_emisor: 'TEXT', departamento_emisor: 'TEXT', codigo_departamento_emisor: 'TEXT',
      responsabilidades_emisor: 'TEXT', impuesto_emisor_id: 'TEXT', impuesto_emisor_nombre: 'TEXT', codigo_medio_pago: 'TEXT' })) add('facturacion_config', name, def);
    for (const [name, def] of Object.entries({ codigo_identificacion_dian: 'TEXT', digito_verificacion: 'TEXT', codigo_municipio: 'TEXT',
      codigo_departamento: 'TEXT', codigo_pais: "TEXT NOT NULL DEFAULT 'CO'", tipo_persona: 'TEXT', impuesto_id: 'TEXT', impuesto_nombre: 'TEXT' })) add('clientes_facturacion', name, def);
    for (const [name, def] of Object.entries({ codigo_impuesto: 'TEXT', nombre_impuesto: 'TEXT', codigo_producto: 'TEXT', unidad_codigo: "TEXT NOT NULL DEFAULT 'NIU'" })) add('factura_detalles', name, def);
    add('facturas', 'hora_emision', 'TEXT');
    add('facturas', 'numero_resolucion', 'TEXT');
    add('facturas', 'codigo_motivo_nota', 'TEXT');
    add('facturas', 'factura_referencia_cufe', 'TEXT');
    db.exec("CREATE INDEX IF NOT EXISTS idx_facturacion_cola_factura_estado ON facturacion_cola_dian(factura_id, estado)");
  }
};
