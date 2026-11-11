// Conserva solicitudes y respuestas SOAP. Una llamada sin respuesta no es reenviable automáticamente.
module.exports = {
  name: '034_dian_transmisiones',
  up(db) {
    const columnas = new Set(db.prepare('PRAGMA table_info(facturacion_config)').all().map(columna => columna.name));
    if (!columnas.has('test_set_id')) db.exec('ALTER TABLE facturacion_config ADD COLUMN test_set_id TEXT');
    const cola = new Set(db.prepare('PRAGMA table_info(facturacion_cola_dian)').all().map(columna => columna.name));
    if (!cola.has('zip_key')) db.exec('ALTER TABLE facturacion_cola_dian ADD COLUMN zip_key TEXT');
    if (!cola.has('xml_file_name')) db.exec('ALTER TABLE facturacion_cola_dian ADD COLUMN xml_file_name TEXT');
    db.exec(`
      CREATE TABLE IF NOT EXISTS facturacion_transmisiones_dian (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        factura_id INTEGER NOT NULL,
        cola_id INTEGER NOT NULL,
        operacion TEXT NOT NULL CHECK (operacion IN ('ENVIO_SET_HABILITACION','CONSULTA_ESTADO_ZIP')),
        clave_idempotencia TEXT NOT NULL UNIQUE,
        huella_xml_sha256 TEXT NOT NULL,
        soap_request_xml TEXT NOT NULL,
        soap_response_xml TEXT,
        http_status INTEGER,
        resultado TEXT NOT NULL CHECK (resultado IN ('PREPARADA','RESULTADO_DESCONOCIDO','ZIP_RECIBIDO','VALIDADO','RECHAZADO','CONSULTA_SIN_RESULTADO','ERROR_LOCAL')),
        zip_key TEXT,
        codigo_estado_dian TEXT,
        descripcion_estado_dian TEXT,
        mensajes_dian TEXT,
        creado_en TEXT NOT NULL DEFAULT (datetime('now')),
        respondido_en TEXT,
        FOREIGN KEY (factura_id) REFERENCES facturas(id),
        FOREIGN KEY (cola_id) REFERENCES facturacion_cola_dian(id)
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_dian_un_envio_por_documento
        ON facturacion_transmisiones_dian(factura_id) WHERE operacion='ENVIO_SET_HABILITACION';
      CREATE INDEX IF NOT EXISTS idx_dian_transmisiones_fecha
        ON facturacion_transmisiones_dian(factura_id, creado_en);
    `);
  }
};
