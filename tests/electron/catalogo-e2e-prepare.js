const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { runMigrations } = require('../../backend/database/migrate');
const { seed } = require('../../backend/database/seeds/seed');
const barcodeService = require('../../backend/services/barcodeService');

const dbPath = process.env.FARMACIA_TEST_DB_PATH;
if (process.env.NODE_ENV !== 'test' || !dbPath || !path.isAbsolute(dbPath)) {
  throw new Error('Defina NODE_ENV=test y una ruta absoluta en FARMACIA_TEST_DB_PATH.');
}
if (fs.existsSync(dbPath)) throw new Error('La base temporal ya existe; no se sobrescribe.');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

function crearEAN13(prefijo) {
  if (!/^\d{12}$/.test(prefijo)) throw new Error('El prefijo EAN debe contener 12 dígitos.');
  const suma = [...prefijo].reduce((total, digito, indice) => total + Number(digito) * (indice % 2 === 0 ? 1 : 3), 0);
  return `${prefijo}${(10 - (suma % 10)) % 10}`;
}

const codigoUnico = crearEAN13('770205770001');
const codigoAmbiguo = crearEAN13('770205770002');
const codigoDesconocido = crearEAN13('770205770003');
const codigoInvalido = `${codigoUnico.slice(0, 12)}${(Number(codigoUnico[12]) + 1) % 10}`;

const db = new Database(dbPath);
try {
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  seed({ db, isTest: true });
  const insertar = db.prepare(`
    INSERT INTO catalogo_cum (
      expediente, consecutivocum, cum, producto, descripcioncomercial,
      principio_activo, concentracion, forma_farmaceutica, registro_sanitario,
      estado_registro, estado_cum, gtin, fuente, version_catalogo
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'VIGENTE', 'ACTIVO', ?, 'INVIMA', 'e2e')
  `);
  const tx = db.transaction(() => {
    insertar.run(99100, 1, '99100-1', 'E2E MEDICAMENTO ÚNICO', 'Caja x 10 tabletas', 'Principio prueba A', '500 mg', 'TABLETA', 'RS-E2E-1', codigoUnico);
    insertar.run(99101, 1, '99101-1', 'E2E PRESENTACIÓN A', 'Caja x 10 tabletas', 'Principio prueba B', '250 mg', 'TABLETA', 'RS-E2E-2', codigoAmbiguo);
    insertar.run(99102, 1, '99102-1', 'E2E PRESENTACIÓN B', 'Frasco x 100 mL', 'Principio prueba C', '100 mg/5 mL', 'JARABE', 'RS-E2E-3', codigoAmbiguo);
  });
  tx();
  if (!barcodeService.parsearEntradaLector(codigoUnico).data.valido
    || !barcodeService.parsearEntradaLector(codigoAmbiguo).data.valido
    || !barcodeService.parsearEntradaLector(codigoDesconocido).data.valido
    || barcodeService.parsearEntradaLector(codigoInvalido).data.valido) {
    throw new Error('Los códigos sintéticos no pasaron las validaciones de checksum esperadas.');
  }
  console.log(JSON.stringify({
    database: dbPath,
    codigos: { unico: codigoUnico, ambiguo: codigoAmbiguo, desconocido: codigoDesconocido, invalido: codigoInvalido },
    baseline: {
      medicamentos: db.prepare('SELECT COUNT(*) AS n FROM medicamentos').get().n,
      lotes: db.prepare('SELECT COUNT(*) AS n FROM lotes').get().n,
      movimientos: db.prepare('SELECT COUNT(*) AS n FROM movimientos_inventario').get().n
    }
  }));
} finally {
  db.close();
}
