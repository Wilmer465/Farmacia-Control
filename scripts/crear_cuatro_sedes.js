const { getDb } = require('../backend/database/connection');

function main() {
  const db = getDb();
  const sedes = [
    { nombre: 'Sede Norte', ciudad: 'Bogotá' },
    { nombre: 'Sede Sur', ciudad: 'Medellín' },
    { nombre: 'Sede Oriente', ciudad: 'Cali' },
    { nombre: 'Sede Occidente', ciudad: 'Barranquilla' },
  ];

  const stmt = db.prepare("INSERT INTO sedes (nombre, ciudad, estado) VALUES (?, ?, 'ACTIVO')");
  const check = db.prepare("SELECT id FROM sedes WHERE nombre = ?");

  let creadas = 0;
  for (const s of sedes) {
    if (check.get(s.nombre)) {
      continue;
    }
    stmt.run(s.nombre, s.ciudad);
    creadas++;
  }

  console.log(`Sedes creadas: ${creadas}`);
  const todas = db.prepare("SELECT id, nombre, ciudad, estado FROM sedes ORDER BY id").all();
  console.table(todas);
}

main();
