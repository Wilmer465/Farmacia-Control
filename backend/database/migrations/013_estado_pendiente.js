// Migración 013: el estado inicial de la orden pasa a llamarse PENDIENTE
// (antes CONFIRMADA). Las órdenes siguen naciendo listas para despachar, sin
// flujo de confirmación previo.
module.exports = {
  name: '013_estado_pendiente',
  up(db) {
    db.exec("UPDATE ordenes SET estado = 'PENDIENTE' WHERE estado = 'CONFIRMADA';");
  }
};