// Facturación local y cola documental. La validación DIAN solo se registra al recibir respuesta externa.
module.exports = {
  name: '030_facturacion_comercial',
  up(db) {
    db.exec(`
      CREATE TABLE clientes_facturacion (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sede_id INTEGER NOT NULL,
        tipo_documento TEXT NOT NULL DEFAULT 'CC',
        numero_documento TEXT NOT NULL,
        nombre TEXT NOT NULL,
        correo TEXT,
        telefono TEXT,
        direccion TEXT,
        municipio TEXT,
        departamento TEXT,
        responsabilidades_fiscales TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (sede_id) REFERENCES sedes(id),
        UNIQUE (sede_id, tipo_documento, numero_documento)
      );
      CREATE TABLE facturacion_config (
        sede_id INTEGER PRIMARY KEY,
        prefijo TEXT NOT NULL DEFAULT 'FC',
        consecutivo_actual INTEGER NOT NULL DEFAULT 0 CHECK (consecutivo_actual >= 0),
        rango_desde INTEGER,
        rango_hasta INTEGER,
        fecha_resolucion TEXT,
        fecha_vencimiento_resolucion TEXT,
        ambiente TEXT NOT NULL DEFAULT 'HABILITACION' CHECK (ambiente IN ('HABILITACION','PRODUCCION')),
        software_id TEXT,
        estado_habilitacion TEXT NOT NULL DEFAULT 'NO_CONFIGURADO' CHECK (estado_habilitacion IN ('NO_CONFIGURADO','EN_HABILITACION','HABILITADO')),
        FOREIGN KEY (sede_id) REFERENCES sedes(id)
      );
      CREATE TABLE facturas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sede_id INTEGER NOT NULL,
        cliente_id INTEGER,
        numero TEXT NOT NULL,
        fecha TEXT NOT NULL DEFAULT (datetime('now')),
        fecha_vencimiento TEXT,
        moneda TEXT NOT NULL DEFAULT 'COP',
        forma_pago TEXT NOT NULL DEFAULT 'CONTADO',
        estado_pago TEXT NOT NULL DEFAULT 'PENDIENTE' CHECK (estado_pago IN ('PENDIENTE','PARCIAL','PAGADA')),
        estado_dian TEXT NOT NULL DEFAULT 'LOCAL_PENDIENTE_TRANSMISION' CHECK (estado_dian IN ('LOCAL_PENDIENTE_TRANSMISION','ENVIADA','VALIDADA','RECHAZADA')),
        subtotal REAL NOT NULL,
        total_impuestos REAL NOT NULL,
        total REAL NOT NULL,
        saldo REAL NOT NULL,
        observaciones TEXT,
        tipo_documento TEXT NOT NULL DEFAULT 'FACTURA' CHECK (tipo_documento IN ('FACTURA','NOTA_CREDITO','NOTA_DEBITO')),
        factura_referencia_id INTEGER,
        motivo_nota TEXT,
        cufe TEXT,
        cude TEXT,
        xml_generado TEXT,
        xml_firmado TEXT,
        respuesta_dian TEXT,
        fecha_respuesta_dian TEXT,
        created_by INTEGER,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (sede_id, numero),
        FOREIGN KEY (sede_id) REFERENCES sedes(id),
        FOREIGN KEY (cliente_id) REFERENCES clientes_facturacion(id),
        FOREIGN KEY (factura_referencia_id) REFERENCES facturas(id),
        FOREIGN KEY (created_by) REFERENCES usuarios(id)
      );
      CREATE TABLE factura_detalles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        factura_id INTEGER NOT NULL,
        medicamento_id INTEGER NOT NULL,
        lote_id INTEGER,
        descripcion TEXT NOT NULL,
        cantidad INTEGER NOT NULL CHECK (cantidad > 0),
        precio_unitario REAL NOT NULL CHECK (precio_unitario >= 0),
        porcentaje_impuesto REAL NOT NULL DEFAULT 0 CHECK (porcentaje_impuesto >= 0 AND porcentaje_impuesto <= 100),
        base_imponible REAL NOT NULL,
        valor_impuesto REAL NOT NULL,
        total REAL NOT NULL,
        FOREIGN KEY (factura_id) REFERENCES facturas(id),
        FOREIGN KEY (medicamento_id) REFERENCES medicamentos(id),
        FOREIGN KEY (lote_id) REFERENCES lotes(id)
      );
      CREATE TABLE factura_pagos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        factura_id INTEGER NOT NULL,
        sede_id INTEGER NOT NULL,
        valor REAL NOT NULL CHECK (valor > 0),
        medio TEXT NOT NULL CHECK (medio IN ('EFECTIVO','TARJETA','TRANSFERENCIA','OTRO')),
        referencia TEXT,
        fecha TEXT NOT NULL DEFAULT (datetime('now')),
        usuario_id INTEGER,
        FOREIGN KEY (factura_id) REFERENCES facturas(id),
        FOREIGN KEY (sede_id) REFERENCES sedes(id),
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
      );
      CREATE TABLE factura_eventos_dian (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        factura_id INTEGER NOT NULL,
        estado TEXT NOT NULL CHECK (estado IN ('ENVIADA','VALIDADA','RECHAZADA')),
        codigo_respuesta TEXT,
        mensaje TEXT,
        cufe TEXT,
        xml_respuesta TEXT,
        registrado_en TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (factura_id) REFERENCES facturas(id)
      );
      CREATE INDEX idx_facturas_sede_fecha ON facturas(sede_id, fecha);
      CREATE INDEX idx_facturas_cartera ON facturas(sede_id, estado_pago, fecha_vencimiento);
      CREATE INDEX idx_facturas_dian ON facturas(estado_dian, created_at);
      CREATE INDEX idx_factura_detalles_factura ON factura_detalles(factura_id);
      CREATE INDEX idx_cliente_facturacion_sede ON clientes_facturacion(sede_id, nombre);
      ALTER TABLE movimientos_inventario ADD COLUMN referencia_factura_id INTEGER REFERENCES facturas(id);
      CREATE INDEX idx_movimientos_factura ON movimientos_inventario(referencia_factura_id);
    `);
  }
};
