/**
 * Script: crear_usuarios_sede.js
 * Ejecutar con: npx electron scripts/crear_usuarios_sede.js
 */
const path = require("path");
const bcrypt = require("bcryptjs");
const Database = require("better-sqlite3");

const DB_PATH = path.join(__dirname, "..", "data", "farmacia.db");
const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

const rolInventario = db.prepare("SELECT id FROM roles WHERE nombre = 'INVENTARIO'").get();
if (!rolInventario) {
  console.error("No existe el rol INVENTARIO");
  process.exit(1);
}

console.log("\n=== SEDES ACTUALES ===");
const sedes = db.prepare("SELECT * FROM sedes ORDER BY id").all();
sedes.forEach(s => console.log("ID=" + s.id + " | " + s.nombre + " | " + s.ciudad));

function getOCreateSede(nombre, ciudad) {
  const norm = str => str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  let sede = sedes.find(s =>
    norm(s.ciudad).includes(norm(ciudad)) || norm(s.nombre).includes(norm(nombre))
  );
  if (!sede) {
    const info = db.prepare(
      "INSERT INTO sedes (nombre, ciudad, estado) VALUES (?, ?, 'ACTIVO')"
    ).run(nombre, ciudad);
    sede = db.prepare("SELECT * FROM sedes WHERE id = ?").get(info.lastInsertRowid);
    console.log("Sede creada: " + sede.nombre + " (ID=" + sede.id + ")");
  }
  return sede;
}

const sedeQuibdo   = getOCreateSede("Sede Quibdo",   "Quibdo");
const sedeMedellin = getOCreateSede("Sede Medellin",  "Medellin");

const USUARIOS = [
  { nombre: "Inventario Quibdo",   username: "inv_quibdo",   password: "Quibdo123*",   sede: sedeQuibdo   },
  { nombre: "Inventario Medellin", username: "inv_medellin", password: "Medellin123*", sede: sedeMedellin }
];

console.log("\n=== CREANDO USUARIOS ===");
for (const u of USUARIOS) {
  const existe = db.prepare("SELECT id FROM usuarios WHERE username = ?").get(u.username);
  if (existe) {
    console.log("EXISTE: " + u.username + " (ID=" + existe.id + ")");
    continue;
  }
  const hash = bcrypt.hashSync(u.password, 10);
  const info = db.prepare(
    "INSERT INTO usuarios (nombre, username, password_hash, rol_id, sede_id, estado) VALUES (?, ?, ?, ?, ?, 'ACTIVO')"
  ).run(u.nombre, u.username, hash, rolInventario.id, u.sede.id);
  console.log("CREADO: " + u.username + " | pass: " + u.password + " | sede: " + u.sede.nombre + " (ID=" + info.lastInsertRowid + ")");
}

console.log("\nDone.");
process.exit(0);
