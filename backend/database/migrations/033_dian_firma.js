// Datos públicos de autorización y proveedor necesarios para crear DianExtensions.
// Claves, PIN y certificados se guardan cifrados fuera de SQLite.
module.exports = {
  name: '033_dian_firma',
  up(db) {
    const columnas = new Set(db.prepare('PRAGMA table_info(facturacion_config)').all().map(columna => columna.name));
    const agregar = (nombre, tipo) => {
      if (!columnas.has(nombre)) db.exec(`ALTER TABLE facturacion_config ADD COLUMN ${nombre} ${tipo}`);
    };
    agregar('numero_autorizacion_dian', 'TEXT');
    agregar('nit_proveedor_software', 'TEXT');
    agregar('dv_proveedor_software', 'TEXT');
  }
};
