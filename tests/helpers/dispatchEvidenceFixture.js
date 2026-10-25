// Fixture de reglas de despacho en SQLite :memory: solamente. No invoca ni
// simula el hardware y no debe usarse como evidencia de pruebas físicas.
function marcarEvidenciasInternas(db, ordenId) {
  db.prepare(`UPDATE ordenes
    SET firma_wacom_verificada = 1, huella_identidad_verificada = 1
    WHERE id = ?`).run(ordenId);
}

module.exports = { marcarEvidenciasInternas };
