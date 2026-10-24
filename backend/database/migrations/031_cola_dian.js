// Cola local y trazabilidad de transmisión. No representa una validación DIAN.
module.exports = {
  name: '031_cola_dian',
  up(db) {
    db.exec(`
      CREATE TABLE facturacion_cola_dian (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        factura_id INTEGER NOT NULL UNIQUE,
        clave_idempotencia TEXT NOT NULL UNIQUE,
        estado TEXT NOT NULL DEFAULT 'PENDIENTE_PREPARACION'
          CHECK (estado IN ('PENDIENTE_PREPARACION','PREPARADO','ENVIADO','VALIDADO','RECHAZADO','ERROR_TRANSMISION')),
        intentos INTEGER NOT NULL DEFAULT 0 CHECK (intentos >= 0),
        ultimo_error TEXT,
        proximo_intento TEXT,
        creado_en TEXT NOT NULL DEFAULT (datetime('now')),
        actualizado_en TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (factura_id) REFERENCES facturas(id)
      );
      CREATE TABLE facturacion_eventos_dian (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        factura_id INTEGER NOT NULL,
        cola_id INTEGER,
        tipo TEXT NOT NULL CHECK (tipo IN ('DOCUMENTO_ENCOLADO','DOCUMENTO_PREPARADO','INTENTO_TRANSMISION','RESPUESTA_RECIBIDA','ERROR_TRANSMISION')),
        detalle TEXT,
        huella_sha256 TEXT,
        creado_en TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (factura_id) REFERENCES facturas(id),
        FOREIGN KEY (cola_id) REFERENCES facturacion_cola_dian(id)
      );
      CREATE INDEX idx_facturacion_cola_estado ON facturacion_cola_dian(estado, proximo_intento, creado_en);
    `);
    db.prepare(`INSERT INTO facturacion_cola_dian (factura_id, clave_idempotencia)
      SELECT id, 'FACTURA-LOCAL-' || id FROM facturas
      WHERE estado_dian='LOCAL_PENDIENTE_TRANSMISION'`).run();
    db.prepare(`INSERT INTO facturacion_eventos_dian (factura_id, cola_id, tipo, detalle)
      SELECT factura_id, id, 'DOCUMENTO_ENCOLADO', 'Registro local pendiente de generación electrónica.'
      FROM facturacion_cola_dian`).run();
  }
};
