// Migración 026: peso de la base de datos.
//
// Los respaldos medían ~81 MB con apenas 65.335 filas de `catalogo_cum`, 1
// medicamento y 3 lotes. El peso no estaba en los datos sino en dos sitios:
//
// 1. Índices. La migración 018 creó 10 índices sobre `catalogo_cum`, 9 de ellos
//    sobre columnas TEXT largas. SQLite duplica el texto indexado en cada índice:
//    medido con dbstat, `principio_activo` ocupa 3.0 MB, `producto` 2.4 MB y
//    `registro_sanitario` 2.1 MB, frente a 1.1-1.3 MB de los cortos.
// 2. Espacio libre. La base tenía 8.134 páginas libres de 20.771 (39 %). `VACUUM`
//    no lo libera porque se omite al respaldar; `auto_vacuum=INCREMENTAL` de
//    connection.js:44 tampoco ayuda: se aplica sobre una base que ya tenía tablas
//    y SQLite lo ignora hasta un VACUUM completo.
//
// LA DECISIÓN ES DINÁMICA, NO CODIFICADA. Antes de tocar nada se ejecutan las
// consultas REALES del catálogo con EXPLAIN QUERY PLAN sobre los datos actuales.
// Un índice solo se elimina si ninguna consulta de la aplicación lo menciona en
// su plan. Si alguien añade mañana un filtro por `estado_cum`, el plan lo delata y
// el índice sobrevive: no depende de que esta lista siga actualizada, la verifica.
//
// Verificado sobre la base de desarrollo (65.335 filas) antes de escribir esto:
//   - `WHERE gtin = ?` / `gtin_empaque_logistico` / `gtin_empaque_venta` → hoy
//     SCAN porque las tres columnas están a NULL en el 100 % de las filas, pero son
//     índices de igualdad directa y el plan los usará en cuanto haya GTIN
//     importado. Se conservan.
//   - `WHERE cum = ?` → usa `sqlite_autoindex_catalogo_cum_1` (el UNIQUE de la
//     columna), nunca `idx_catalogo_cum_cum`.
//   - PERO el cruce de la importación (`JOIN catalogo_cum_temp ON c.cum = t.cum`)
//     sí elige `idx_catalogo_cum_cum` como índice COVERING: solo necesita `cum`, y
//     recorrer un índice de 1,3 MB sale más barato que leer la tabla de 35 MB.
//     El plan dice que este índice NO es redundante, al contrario de lo que
//     suponía el análisis inicial, y por eso se conserva.
//   - La búsqueda de texto (`LIKE ... OR` sobre tres columnas, sin COLLATE NOCASE)
//     → SCAN. Ninguno de los tres índices de texto interviene.
//
// MEDIDO sobre una copia de la base de desarrollo (65.335 filas, 81,14 MB):
// 81,14 MB → 37,91 MB, un 53,3 % menos. `integrity_check` ok y los conteos intactos.
//
// `atomic: false` es obligatorio: SQLite rechaza VACUUM dentro de una transacción,
// que es justo el envoltorio que aplica el runner por defecto.
module.exports = {
  name: '026_optimizar_catalogo_cum',
  atomic: false,

  up(db) {
    // Índices candidatos: los que NO respaldan ninguna consulta por igualdad.
    // Los tres de GTIN quedan fuera a propósito, ver cabecera.
    const CANDIDATOS = [
      'idx_catalogo_cum_cum',
      'idx_catalogo_cum_fuente',
      'idx_catalogo_cum_estado',
      'idx_catalogo_cum_version',
      'idx_catalogo_cum_producto',
      'idx_catalogo_cum_principio',
      'idx_catalogo_cum_registro'
    ];

    // Las consultas REALES de la aplicación, copiadas de catalogoCumService.js y
    // recepcionService.js, con literales en lugar de `?`: el plan de un parámetro
    // sin valor puede ser genérico y no mencionar el índice aunque luego sí se use.
    //
    // NO se inventan consultas de prueba. Suena inofensivo pero falsea la
    // comprobación: un `SELECT COUNT(*) ... WHERE fuente = 'INVIMA'` que la
    // aplicación no ejecuta encuentra el índice `_fuente` y lo declara "usado",
    // mientras que la consulta real —un SUM(CASE WHEN fuente = 'INVIMA') sobre
    // toda la tabla— no filtra por esa columna. Añadido así, el índice sobrevive
    // por un motivo falso. Si una consulta nueva de la aplicación empieza a usar
    // un índice, hay que añadirla AQUÍ; por eso la lista es corta y explícita.
    const CONSULTAS = [
      // buscarPorGTIN, niveles 0/1/2 (líneas 556, 563, 570).
      "SELECT *, 'catalogo' as fuente_busqueda, 0 as nivel_encontrado FROM catalogo_cum WHERE gtin = '7501234567890'",
      "SELECT *, 'catalogo_logistico' as fuente_busqueda, 1 as nivel_encontrado FROM catalogo_cum WHERE gtin_empaque_logistico = '7501234567890'",
      "SELECT *, 'catalogo_venta' as fuente_busqueda, 2 as nivel_encontrado FROM catalogo_cum WHERE gtin_empaque_venta = '7501234567890'",
      // buscarPorCum (línea 579).
      "SELECT * FROM catalogo_cum WHERE cum = '1-1'",
      // listarCatalogo sin texto de búsqueda (líneas 585-589).
      "SELECT * FROM catalogo_cum ORDER BY actualizado_en DESC, creado_en DESC LIMIT 50",
      // listarCatalogo con texto de búsqueda (líneas 595-602).
      "SELECT * FROM catalogo_cum WHERE producto LIKE '%abc%' OR principio_activo LIKE '%abc%' "
        + "OR registro_sanitario LIKE '%abc%' "
        + "ORDER BY CASE WHEN producto LIKE 'abc%' THEN 0 ELSE 1 END, producto LIMIT 50",
      // obtenerEstadoCatalogo (líneas 519-527): agrega sobre toda la tabla, no
      // filtra. Se incluye para dejar constancia de que es un SCAN a propósito.
      "SELECT COUNT(*) as total, SUM(CASE WHEN fuente = 'INVIMA' THEN 1 ELSE 0 END) as de_invima, "
        + "SUM(CASE WHEN estado_cum = 'ACTIVO' THEN 1 ELSE 0 END) as activos FROM catalogo_cum",
      // Documentos y recepción: búsqueda por clave primaria.
      "SELECT * FROM catalogo_cum WHERE id = 1",
      // El UPDATE de la línea 309, que también resuelve por cum.
      "UPDATE catalogo_cum SET fuente = fuente WHERE catalogo_cum.cum = '1-1'"
    ];

    const existentes = new Set(
      db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='catalogo_cum'")
        .all()
        .map((r) => r.name)
    );

    const filas = db.prepare('SELECT COUNT(*) AS total FROM catalogo_cum').get().total;

    // Con la tabla vacía (bases de prueba) el planificador no produce un plan
    // representativo, así que no se deduce nada y no se borra nada.
    const analizable = filas > 0;
    const menciones = new Set();
    if (analizable) {
      const planes = CONSULTAS.map((sql) => db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all());

      // La importación cruza contra `catalogo_cum_temp`, que solo existe durante
      // esa operación. Aquí se replica con una temporal real y unas pocas filas:
      // sustituirla por un auto-UNION cambia el plan —un covering index sobre
      // catalogo_cum en lugar del de la temporal— y por tanto la decisión sobre
      // qué índices sobreviven.
      db.exec('CREATE TEMP TABLE catalogo_cum_temp (cum TEXT NOT NULL)');
      db.exec('INSERT INTO catalogo_cum_temp (cum) SELECT cum FROM catalogo_cum LIMIT 1000');
      planes.push(
        db.prepare('EXPLAIN QUERY PLAN SELECT c.cum FROM catalogo_cum c JOIN catalogo_cum_temp t ON c.cum = t.cum').all(),
        db.prepare('EXPLAIN QUERY PLAN UPDATE catalogo_cum SET fuente = fuente FROM catalogo_cum_temp t WHERE catalogo_cum.cum = t.cum').all()
      );
      db.exec('DROP TABLE catalogo_cum_temp');

      for (const plan of planes) {
        for (const fila of plan) {
          const detalle = String(fila.detail || '');
          for (const nombre of existentes) {
            if (detalle.includes(nombre)) menciones.add(nombre);
          }
        }
      }
    }

    for (const indice of CANDIDATOS) {
      if (!existentes.has(indice)) continue;
      if (!analizable) {
        console.log(`[026] ${indice}: conservado (catálogo vacío, plan no concluyente)`);
        continue;
      }
      if (menciones.has(indice)) {
        console.log(`[026] ${indice}: CONSERVADO (aparece en el plan de una consulta real)`);
        continue;
      }
      db.exec(`DROP INDEX IF EXISTS ${indice}`);
      console.log(`[026] ${indice}: eliminado (ninguna consulta real lo usa)`);
    }

    // VACUUM reconstruye el archivo y devuelve las páginas libres al sistema
    // operativo, que es lo que hace que el respaldo deje de pesar ~81 MB.
    db.exec('VACUUM');
    // Las estadísticas de índice quedaron obsoletas tras el VACUUM sobre una tabla
    // de 65k filas; sin ANALYZE el planificador trabaja con datos viejos.
    db.exec('ANALYZE');
  },

  down(db) {
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_catalogo_cum_cum ON catalogo_cum(cum);
      CREATE INDEX IF NOT EXISTS idx_catalogo_cum_fuente ON catalogo_cum(fuente);
      CREATE INDEX IF NOT EXISTS idx_catalogo_cum_estado ON catalogo_cum(estado_cum);
      CREATE INDEX IF NOT EXISTS idx_catalogo_cum_version ON catalogo_cum(version_catalogo);
      CREATE INDEX IF NOT EXISTS idx_catalogo_cum_producto ON catalogo_cum(producto);
      CREATE INDEX IF NOT EXISTS idx_catalogo_cum_principio ON catalogo_cum(principio_activo);
      CREATE INDEX IF NOT EXISTS idx_catalogo_cum_registro ON catalogo_cum(registro_sanitario);
      ANALYZE;
    `);
  }
};
