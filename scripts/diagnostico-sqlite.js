#!/usr/bin/env node
// Diagnóstico SQLite de solo lectura. No crea carpetas ni cambia pragmas
// persistentes; no imprime valores de filas, firmas, documentos ni credenciales.
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

function leerArgumentos(argv) {
  const args = argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) return { ayuda: true };
  const indice = args.indexOf('--db');
  if (indice >= 0 && !args[indice + 1]) throw new Error('Indica la ruta después de --db.');
  if (args.some((arg) => arg.startsWith('--') && arg !== '--db' && arg !== '--help')) {
    throw new Error('Opción no reconocida. Usa --help para ver el uso.');
  }
  const ruta = indice >= 0 ? args[indice + 1] : path.join(__dirname, '..', 'data', 'farmacia.db');
  return { ruta: path.resolve(ruta) };
}

function tamanoArchivo(ruta) {
  try { return fs.statSync(ruta).size; } catch { return 0; }
}

function diagnosticar(ruta) {
  if (!fs.existsSync(ruta)) throw new Error(`No existe el archivo indicado: ${ruta}`);
  const db = new Database(ruta, { readonly: true, fileMustExist: true });
  try {
    // PRAGMA foreign_keys es una opción por conexión; activarla aquí no modifica
    // el archivo y permite que foreign_key_check use la misma regla que Electron.
    db.pragma('foreign_keys = ON');
    const tablas = db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `).all().map(({ name }) => name);
    const conteos = tablas.map((tabla) => {
      const identificador = `"${tabla.replace(/"/g, '""')}"`;
      return { tabla, filas: db.prepare(`SELECT COUNT(*) AS filas FROM ${identificador}`).get().filas };
    });
    const adjuntos = [];
    const camposAdjunto = new Set(['firma_data', 'documento_adjunto_data']);
    for (const tabla of tablas) {
      const identificador = `"${tabla.replace(/"/g, '""')}"`;
      const columnas = db.prepare(`PRAGMA table_info(${identificador})`).all();
      for (const columna of columnas) {
        if (!camposAdjunto.has(columna.name)) continue;
        const campo = `"${columna.name.replace(/"/g, '""')}"`;
        const agregado = db.prepare(`
          SELECT COUNT(${campo}) AS valores,
            COALESCE(SUM(length(CAST(${campo} AS BLOB))), 0) AS bytes,
            COALESCE(MAX(length(CAST(${campo} AS BLOB))), 0) AS maximoBytes
          FROM ${identificador} WHERE ${campo} IS NOT NULL
        `).get();
        adjuntos.push({ tabla, campo: columna.name, ...agregado });
      }
    }

    let usoPorObjeto = null;
    let tamanosPorTipo = null;
    try {
      usoPorObjeto = db.prepare(`
        SELECT s.name, COALESCE(m.type, 'internal') AS tipo,
          COUNT(*) AS paginas, SUM(s.pgsize) AS bytes
        FROM dbstat s
        LEFT JOIN sqlite_master m ON m.name = s.name
        GROUP BY s.name, m.type ORDER BY bytes DESC LIMIT 30
      `).all();
      tamanosPorTipo = db.prepare(`
        SELECT COALESCE(m.type, 'internal') AS tipo, SUM(s.pgsize) AS bytes
        FROM dbstat s
        LEFT JOIN sqlite_master m ON m.name = s.name
        GROUP BY m.type ORDER BY bytes DESC
      `).all();
    } catch { /* dbstat depende de la compilación SQLite disponible */ }

    return {
      archivo: {
        bytes: tamanoArchivo(ruta),
        walBytes: tamanoArchivo(`${ruta}-wal`),
        shmBytes: tamanoArchivo(`${ruta}-shm`)
      },
      pragmas: Object.fromEntries(['page_count', 'page_size', 'freelist_count', 'journal_mode', 'foreign_keys']
        .map((nombre) => [nombre, db.pragma(nombre, { simple: true })])),
      integridad: db.pragma('integrity_check', { simple: true }),
      violacionesClavesForaneas: db.pragma('foreign_key_check').length,
      tablas: conteos,
      adjuntos: adjuntos.map(({ tabla, campo, valores, bytes, maximoBytes }) => ({
        tabla, campo, valoresNoNulos: valores, bytesTotales: bytes, maximoBytes
      })),
      usoPorObjeto,
      tamanosPorTipo,
      notaDbstat: usoPorObjeto ? undefined : 'dbstat no disponible en esta compilación de SQLite.'
    };
  } finally {
    db.close();
  }
}

function main() {
  const opciones = leerArgumentos(process.argv);
  if (opciones.ayuda) {
    console.log('Uso: electron.exe scripts/diagnostico-sqlite.js [--db RUTA]');
    console.log('Abre SQLite en modo solo lectura e imprime metadatos y agregados sin contenido de filas.');
    return;
  }
  console.log(JSON.stringify(diagnosticar(opciones.ruta), null, 2));
}

try {
  main();
} catch (err) {
  console.error(`Diagnóstico cancelado: ${err.message}`);
  process.exitCode = 1;
}
