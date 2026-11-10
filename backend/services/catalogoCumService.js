const crypto = require('crypto');
const { getDb } = require('../database/connection');
const auditoriaRepository = require('../repositories/auditoriaRepository');
const permisoService = require('./permisoService');
const { AUDIT_ACTIONS } = require('../../shared/constants');
const barcodeService = require('./barcodeService');

const INVIMA_CUM_URL = 'https://www.datos.gov.co/resource/i7cb-raxc.json';
const CHUNK_SIZE = 5000;
const TIMEOUT_MS = 120000;

// Estado de progreso y cancelación para actualización de catálogo
let progresoActualizacion = { activo: false, paso: '', descargados: 0, total: 0, registros: 0 };
let cancelarActualizacionFlag = false;
let actualizacionEnProgreso = false;

function obtenerProgreso() {
  return { ...progresoActualizacion };
}

function cancelarActualizacion() {
  cancelarActualizacionFlag = true;
}

class CatalogoCumError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CatalogoCumError';
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

function generarHashFila(row) {
  const camposClave = [
    row.expediente,
    row.consecutivocum,
    row.producto,
    row.descripcioncomercial,
    row.principio_activo,
    row.concentracion,
    row.forma_farmaceutica,
    row.via_administracion,
    row.unidad_medida,
    row.cantidad_presentacion,
    row.registro_sanitario,
    row.fecha_expedicion_registro,
    row.fecha_vencimiento_registro,
    row.estado_registro,
    row.estado_cum || row.estadocum,
    row.fecha_activo,
    row.fecha_inactivo,
    row.titular,
    row.laboratorio,
    row.fabricante,
    row.pais_fabricante,
    row.condicion_venta,
    row.tipo_producto,
    row.atc_codigo,
    row.atc_descripcion,
    row.gtin,
    row.gtin_empaque_logistico,
    row.gtin_empaque_venta,
    row.ium,
    row.importador
  ].filter(v => v != null && v !== '').join('|');
  return crypto.createHash('sha256').update(camposClave).digest('hex');
}

function mapearRegistroINVIMA(item, versionCatalogo) {
  const filas = Array.isArray(item.filas) ? item.filas : [item];
  const valoresRol = (rol) => [...new Set(filas
    .filter((fila) => String(fila.tiporol || '').toUpperCase().includes(rol))
    .map((fila) => fila.nombrerol).filter(Boolean))].sort((a, b) => a.localeCompare(b)).join('; ') || null;
  const activos = [...new Set(filas.map((fila) => fila.principioactivo).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
  const concentracionesNormalizadas = [...new Set(filas.map((fila) => {
    if (!fila.cantidad || !fila.unidadmedida) return null;
    const unidadReferencia = fila.unidadreferencia ? `/${fila.unidadreferencia}` : '';
    return `${fila.cantidad} ${fila.unidadmedida}${unidadReferencia}`;
  }).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const concentracion = /^\d+(?:[.,]\d+)?\s*\S+/.test(item.concentracion || '')
    ? item.concentracion
    : concentracionesNormalizadas.join(' + ') || item.concentracion || null;
  const fuenteUrl = INVIMA_CUM_URL;
  const fechaVerificacion = new Date().toISOString();
  const valoresCampo = {
    producto: item.producto,
    descripcioncomercial: item.descripcioncomercial,
    principio_activo: activos.join(' + '),
    concentracion,
    forma_farmaceutica: item.formafarmaceutica,
    via_administracion: item.viaadministracion,
    unidad_medida: item.unidadmedida,
    cantidad_presentacion: item.cantidadcum,
    registro_sanitario: item.registrosanitario,
    fecha_expedicion_registro: item.fechaexpedicion,
    fecha_vencimiento_registro: item.fechavencimiento,
    estado_registro: item.estadoregistro,
    estado_cum: item.estadocum,
    titular: item.titular,
    fabricante: valoresRol('FABRICANTE'),
    importador: valoresRol('IMPORTADOR'),
    atc_codigo: item.atc,
    atc_descripcion: item.descripcionatc,
    ium: item.ium
  };
  const proveniencia = Object.fromEntries(Object.entries(valoresCampo).filter(([, valor]) => valor)
    .map(([campo]) => [campo, { fuente: 'INVIMA_DATOS_ABIERTOS', fuente_url: fuenteUrl, fecha_verificacion: fechaVerificacion, estado: 'VERIFICADO' }]));
  return {
    expediente: (item.expedientecum || item.expediente) ? Number(item.expedientecum || item.expediente) : null,
    consecutivocum: item.consecutivocum ? Number(item.consecutivocum) : null,
    cum: (item.expedientecum || item.expediente) && item.consecutivocum
      ? `${item.expedientecum || item.expediente}-${item.consecutivocum}`
      : null,
    producto: item.producto || '',
    descripcioncomercial: item.descripcioncomercial || null,
    principio_activo: activos.join(' + ') || null,
    concentracion,
    forma_farmaceutica: item.formafarmaceutica || null,
    via_administracion: item.viaadministracion || null,
    unidad_medida: item.unidadmedida || null,
    cantidad_presentacion: (() => {
        const val = item.cantidadcum ? Number(item.cantidadcum) : null;
        return (val !== null && Number.isFinite(val)) ? val : null;
      })(),
    registro_sanitario: item.registrosanitario || null,
    fecha_expedicion_registro: item.fechaexpedicion || null,
    fecha_vencimiento_registro: item.fechavencimiento || null,
    estado_registro: item.estadoregistro ? item.estadoregistro.toUpperCase() : null,
    estado_cum: item.estadocum ? item.estadocum.toUpperCase() : null,
    fecha_activo: item.fechaactivo || null,
    fecha_inactivo: item.fechainactivo || null,
    titular: item.titular || null,
    laboratorio: valoresRol('FABRICANTE'),
    fabricante: valoresRol('FABRICANTE'),
    pais_fabricante: null,
    importador: valoresRol('IMPORTADOR'),
    ium: item.ium || null,
    proveniencia_json: JSON.stringify(proveniencia),
    condicion_venta: null,
    tipo_producto: item.tipoproducto || null,
    atc_codigo: item.atc || null,
    atc_descripcion: item.descripcionatc || null,
    gtin: null,
    gtin_empaque_logistico: null,
    gtin_empaque_venta: null,
    fuente: 'INVIMA',
    version_catalogo: versionCatalogo,
    fecha_importacion: new Date().toISOString(),
    hash_fila: null
  };
}

function validarRegistro(registro) {
  const errores = [];
  if (!registro.expediente) errores.push('expediente requerido');
  if (!registro.consecutivocum) errores.push('consecutivocum requerido');
  if (!registro.cum) errores.push('CUM no generable');
  if (!registro.producto) errores.push('producto requerido');
  if (!registro.registro_sanitario) errores.push('registro_sanitario requerido');
  return { valido: errores.length === 0, errores };
}

async function descargarCatalogoCompleto() {
  let allData = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const url = `${INVIMA_CUM_URL}?$limit=${CHUNK_SIZE}&$offset=${offset}&$order=expedientecum,consecutivocum,principioactivo,tiporol,nombrerol,ium`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      
      if (!res.ok) {
        throw new CatalogoCumError(`HTTP ${res.status}: ${res.statusText}`);
      }
      
      const chunk = await res.json();
      if (!chunk.length) {
        hasMore = false;
        break;
      }
      
      allData.push(...chunk);
      offset += CHUNK_SIZE;
      hasMore = chunk.length === CHUNK_SIZE;
      progresoActualizacion.descargados = offset;
      if (cancelarActualizacionFlag) {
        throw new CatalogoCumError('Actualización cancelada por el usuario');
      }
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        throw new CatalogoCumError('Timeout descargando catálogo INVIMA');
      }
      throw new CatalogoCumError(`Error descargando: ${err.message}`);
    }
  }

  return allData;
}

function importarATemporal(db, registros) {
  // El staging es exclusivo de esta conexión. Una tabla persistente dejaba sus
  // páginas en freelist al borrarse, inflando cada SQLite local tras actualizar.
  db.exec(`DROP TABLE IF EXISTS temp.catalogo_cum_temp`);
  db.exec(`
    CREATE TEMP TABLE catalogo_cum_temp (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      expediente INTEGER,
      consecutivocum INTEGER,
      cum TEXT UNIQUE,
      producto TEXT,
      descripcioncomercial TEXT,
      principio_activo TEXT,
      concentracion TEXT,
      forma_farmaceutica TEXT,
      via_administracion TEXT,
      unidad_medida TEXT,
      cantidad_presentacion REAL,
      registro_sanitario TEXT,
      fecha_expedicion_registro TEXT,
      fecha_vencimiento_registro TEXT,
      estado_registro TEXT,
      estado_cum TEXT,
      fecha_activo TEXT,
      fecha_inactivo TEXT,
      titular TEXT,
      laboratorio TEXT,
      fabricante TEXT,
      pais_fabricante TEXT,
      condicion_venta TEXT,
      tipo_producto TEXT,
      atc_codigo TEXT,
      atc_descripcion TEXT,
      gtin TEXT,
      gtin_empaque_logistico TEXT,
      gtin_empaque_venta TEXT,
      ium TEXT,
      importador TEXT,
      proveniencia_json TEXT,
      fuente TEXT,
      version_catalogo TEXT,
      fecha_importacion TEXT,
      hash_fila TEXT
    )
  `);

  const stmt = db.prepare(`
     INSERT OR IGNORE INTO catalogo_cum_temp (
      expediente, consecutivocum, cum, producto, descripcioncomercial,
      principio_activo, concentracion, forma_farmaceutica, via_administracion,
      unidad_medida, cantidad_presentacion, registro_sanitario,
      fecha_expedicion_registro, fecha_vencimiento_registro, estado_registro,
      estado_cum, fecha_activo, fecha_inactivo, titular, laboratorio,
      fabricante, pais_fabricante, condicion_venta, tipo_producto,
      atc_codigo, atc_descripcion, gtin, gtin_empaque_logistico, gtin_empaque_venta,
      fuente, version_catalogo, fecha_importacion, hash_fila, ium, importador, proveniencia_json
    ) VALUES (
      @expediente, @consecutivocum, @cum, @producto, @descripcioncomercial,
      @principio_activo, @concentracion, @forma_farmaceutica, @via_administracion,
      @unidad_medida, @cantidad_presentacion, @registro_sanitario,
      @fecha_expedicion_registro, @fecha_vencimiento_registro, @estado_registro,
      @estado_cum, @fecha_activo, @fecha_inactivo, @titular, @laboratorio,
      @fabricante, @pais_fabricante, @condicion_venta, @tipo_producto,
      @atc_codigo, @atc_descripcion, @gtin, @gtin_empaque_logistico, @gtin_empaque_venta,
      @fuente, @version_catalogo, @fecha_importacion, @hash_fila, @ium, @importador, @proveniencia_json
    )
  `);

  const insertTx = db.transaction((items) => {
    for (const item of items) {
      stmt.run(item);
    }
  });

  insertTx(registros);
}

function compararYMerge(db) {
  const resultado = {
    nuevos: 0,
    actualizados: 0,
    sinCambios: 0,
    errores: []
  };

  const mergeTx = db.transaction(() => {
    const sinCambios = db.prepare(`
      SELECT COUNT(*) as cnt FROM catalogo_cum c
      JOIN catalogo_cum_temp t ON c.cum = t.cum
      WHERE c.hash_fila = t.hash_fila AND c.fuente = 'INVIMA'
    `).get();
    resultado.sinCambios = sinCambios?.cnt || 0;

    // 1. Insertar nuevos (CUM no existe en tabla principal)
    const insertados = db.prepare(`
      INSERT INTO catalogo_cum (
        expediente, consecutivocum, cum, producto, descripcioncomercial,
        principio_activo, concentracion, forma_farmaceutica, via_administracion,
        unidad_medida, cantidad_presentacion, registro_sanitario,
        fecha_expedicion_registro, fecha_vencimiento_registro, estado_registro,
        estado_cum, fecha_activo, fecha_inactivo, titular, laboratorio,
        fabricante, pais_fabricante, condicion_venta, tipo_producto,
        atc_codigo, atc_descripcion, gtin, gtin_empaque_logistico, gtin_empaque_venta,
        ium, importador, proveniencia_json,
        fuente, version_catalogo, fecha_importacion, hash_fila, creado_en, actualizado_en
      )
      SELECT 
        t.expediente, t.consecutivocum, t.cum, t.producto, t.descripcioncomercial,
        t.principio_activo, t.concentracion, t.forma_farmaceutica, t.via_administracion,
        t.unidad_medida, t.cantidad_presentacion, t.registro_sanitario,
        t.fecha_expedicion_registro, t.fecha_vencimiento_registro, t.estado_registro,
        t.estado_cum, t.fecha_activo, t.fecha_inactivo, t.titular, t.laboratorio,
        t.fabricante, t.pais_fabricante, t.condicion_venta, t.tipo_producto,
        t.atc_codigo, t.atc_descripcion, t.gtin, t.gtin_empaque_logistico, t.gtin_empaque_venta,
        t.ium, t.importador, t.proveniencia_json,
        t.fuente, t.version_catalogo, t.fecha_importacion, t.hash_fila,
        datetime('now'), datetime('now')
      FROM catalogo_cum_temp t
      LEFT JOIN catalogo_cum c ON c.cum = t.cum
      WHERE c.id IS NULL
    `).run();
    resultado.nuevos = insertados.changes;

    // 2. Actualizar existentes con hash diferente (datos cambiaron)
    const actualizados = db.prepare(`
      UPDATE catalogo_cum SET
        producto = t.producto,
        descripcioncomercial = t.descripcioncomercial,
        principio_activo = t.principio_activo,
        concentracion = t.concentracion,
        forma_farmaceutica = t.forma_farmaceutica,
        via_administracion = t.via_administracion,
        unidad_medida = t.unidad_medida,
        cantidad_presentacion = t.cantidad_presentacion,
        registro_sanitario = t.registro_sanitario,
        fecha_expedicion_registro = t.fecha_expedicion_registro,
        fecha_vencimiento_registro = t.fecha_vencimiento_registro,
        estado_registro = t.estado_registro,
        estado_cum = t.estado_cum,
        fecha_activo = t.fecha_activo,
        fecha_inactivo = t.fecha_inactivo,
        titular = t.titular,
        laboratorio = t.laboratorio,
        fabricante = t.fabricante,
        pais_fabricante = t.pais_fabricante,
        condicion_venta = t.condicion_venta,
        tipo_producto = t.tipo_producto,
        atc_codigo = t.atc_codigo,
        atc_descripcion = t.atc_descripcion,
        gtin = t.gtin,
        gtin_empaque_logistico = t.gtin_empaque_logistico,
        gtin_empaque_venta = t.gtin_empaque_venta,
        ium = t.ium,
        importador = t.importador,
        proveniencia_json = t.proveniencia_json,
        version_catalogo = t.version_catalogo,
        fecha_importacion = t.fecha_importacion,
        hash_fila = t.hash_fila,
        actualizado_en = datetime('now')
      FROM catalogo_cum_temp t
      WHERE catalogo_cum.cum = t.cum
        AND catalogo_cum.hash_fila IS NOT t.hash_fila
        AND catalogo_cum.fuente = 'INVIMA'
    `).run();
    resultado.actualizados = actualizados.changes;

    // 3. Marcar como HISTORICO los que están en INVIMA como INACTIVO pero tenemos como ACTIVO
    db.prepare(`
      UPDATE catalogo_cum SET
        estado_cum = 'HISTORICO',
        actualizado_en = datetime('now')
      WHERE fuente = 'INVIMA'
        AND estado_cum = 'ACTIVO'
        AND cum IN (
          SELECT cum FROM catalogo_cum_temp WHERE estado_cum IN ('INACTIVO', 'VENCIDO', 'ANULADO')
        )
    `).run();
    // No contamos como error, es transición de estado normal

    // 4. Limpiar tabla temporal
    db.exec(`DROP TABLE temp.catalogo_cum_temp`);
  });

  mergeTx();
  return resultado;
}

function registrarActualizacion(db, usuarioId, versionCatalogo, hashArchivo, stats, errores) {
  const resultado = errores.length > 0 && stats.nuevos === 0 && stats.actualizados === 0
    ? 'ERROR'
    : errores.length > 0 ? 'PARCIAL' : 'EXITO';

  db.prepare(`
    INSERT INTO catalogo_actualizaciones (
      version, fuente_url, fecha_descarga, fecha_importacion,
      registros_descargados, registros_nuevos, registros_actualizados,
      registros_sin_cambios, resultado, errores, hash_archivo, usuario_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    versionCatalogo,
    INVIMA_CUM_URL,
    new Date().toISOString(),
    new Date().toISOString(),
    stats.descargados || (stats.nuevos + stats.actualizados + stats.sinCambios),
    stats.nuevos,
    stats.actualizados,
    stats.sinCambios,
    resultado,
    JSON.stringify(errores),
    hashArchivo,
    usuarioId
  );

  return resultado;
}

async function actualizarCatalogo(usuarioSesion, opciones = {}) {
  const { forzar = false, usuarioId = usuarioSesion?.id, descargar = descargarCatalogoCompleto } = opciones;
  const db = getDb();
  const versionCatalogo = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const errores = [];
  let hashArchivo = null;
  let datosDescargados = [];

  // Rate limiting: prevenir llamadas concurrentes
  if (actualizacionEnProgreso) {
    throw new CatalogoCumError('Ya hay una actualización de catálogo en progreso');
  }
  actualizacionEnProgreso = true;

  try {
    // Verificar permisos (solo ADMIN/SUPERADMIN)
    permisoService.verificarEsAdmin(usuarioSesion);

    cancelarActualizacionFlag = false;
    progresoActualizacion = { activo: true, paso: 'descargando', descargados: 0, total: 0, registros: 0 };
    console.log('[catalogoCum] Iniciando actualización catálogo INVIMA...');

    // 1. Descargar
    progresoActualizacion.paso = 'descargando';
    console.log('[catalogoCum] Descargando desde datos.gov.co...');
    datosDescargados = await descargar();
    progresoActualizacion.registros = datosDescargados.length;
    progresoActualizacion.total = datosDescargados.length;
    console.log(`[catalogoCum] Descargados ${datosDescargados.length} registros`);

    if (!datosDescargados.length) {
      throw new CatalogoCumError('Catálogo descargado vacío');
    }

    // Calcular hash del archivo para detectar si ya tenemos esta versión
    const huellasFilas = datosDescargados.map((fila) => crypto.createHash('sha256')
      .update(JSON.stringify(Object.keys(fila).sort().map((campo) => [campo, fila[campo]])))
      .digest('hex')).sort();
    const contenidoHash = crypto.createHash('sha256').update(huellasFilas.join('')).digest('hex');
    hashArchivo = contenidoHash.substring(0, 32);

    // Verificar si ya importamos esta versión
    const yaImportado = db.prepare(`
      SELECT 1 FROM catalogo_actualizaciones 
      WHERE hash_archivo = ? AND resultado = 'EXITO'
    `).get(hashArchivo);
    
    if (yaImportado && !forzar) {
      actualizacionEnProgreso = false;
      return {
        ok: true,
        mensaje: 'Catálogo ya está actualizado (misma versión)',
        yaActualizado: true,
        version: versionCatalogo
      };
    }

    // 2. Mapear y validar
    progresoActualizacion.paso = 'mapeando';
    console.log('[catalogoCum] Mapeando y validando registros...');
    const registrosValidos = [];
    const porCum = new Map();
    let duplicados = 0;
    for (const [indice, item] of datosDescargados.entries()) {
      const expediente = item.expedientecum || item.expediente;
      const consecutivo = item.consecutivocum;
      const claveCum = expediente && consecutivo ? `${String(expediente).trim()}-${String(consecutivo).trim()}` : null;
      if (!claveCum) {
        errores.push({ fila: indice + 1, errores: ['expedientecum/expediente o consecutivocum ausente'] });
        continue;
      }
      if (!porCum.has(claveCum)) porCum.set(claveCum, { ...item, expedientecum: expediente, filas: [] });
      porCum.get(claveCum).filas.push(item);
      for (const campo of ['ium', 'producto', 'descripcioncomercial', 'registrosanitario', 'estadoregistro', 'fechavencimiento', 'fechaexpedicion', 'estadocum', 'fechaactivo', 'fechainactivo', 'concentracion', 'unidadmedida', 'formafarmaceutica', 'viaadministracion', 'atc', 'descripcionatc', 'cantidadcum', 'cantidad', 'unidadreferencia', 'unidad', 'titular']) {
        if (!porCum.get(claveCum)[campo] && item[campo]) porCum.get(claveCum)[campo] = item[campo];
      }
    }
    duplicados = datosDescargados.length - porCum.size - errores.length;
    for (const item of porCum.values()) {
      try {
        const registro = mapearRegistroINVIMA(item, versionCatalogo);
        registro.hash_fila = generarHashFila(registro);
        const { valido, errores: errs } = validarRegistro(registro);
        if (valido) {
          registrosValidos.push(registro);
        } else {
          errores.push({ cum: registro.cum, errores: errs });
        }
      } catch (e) {
        errores.push({ item, error: e.message });
      }
    }
    console.log(`[catalogoCum] ${registrosValidos.length} válidos, ${errores.length} con errores, ${duplicados} filas repetidas consolidadas`);

    if (!registrosValidos.length) {
      throw new CatalogoCumError('La fuente no contiene registros válidos; se conserva el catálogo anterior.');
    }

    // 3. Importar a temporal
    progresoActualizacion.paso = 'importando';
    console.log('[catalogoCum] Importando a tabla temporal...');
      importarATemporal(db, registrosValidos);

    // 4. Merge (UPSERT)
    progresoActualizacion.paso = 'fusionando';
    console.log('[catalogoCum] Fusionando con catálogo principal...');
    const resultadoActualizacion = db.transaction(() => {
      const stats = compararYMerge(db);
      stats.descargados = datosDescargados.length;
      stats.cumConsolidados = registrosValidos.length;
      stats.filasConsolidadas = duplicados;
      const resultado = registrarActualizacion(db, usuarioId, versionCatalogo, hashArchivo, stats, errores);
      auditoriaRepository.registrar({
        usuario_id: usuarioId,
        rol: usuarioSesion.rol_nombre,
        sede_id: usuarioSesion.sede_id,
        accion: AUDIT_ACTIONS.CATALOGO_CUM_ACTUALIZAR,
        modulo: 'CATALOGO_CUM',
        registro_afectado: `catalogo:${versionCatalogo}`,
        resultado,
        valores_nuevos: { version: versionCatalogo, ...stats, errores: errores.length }
      });
      return { stats, resultado };
    })();
    const { stats, resultado } = resultadoActualizacion;

    console.log('[catalogoCum] Actualización completada:', stats);

    progresoActualizacion.activo = false;
    progresoActualizacion.paso = 'completado';
    return {
      ok: true,
      version: versionCatalogo,
      ...stats,
      errores: errores.length,
      resultado
    };

  } catch (err) {
    console.error('[catalogoCum] Error:', err.message);
    
    // Registrar error en historial
    try {
      registrarActualizacion(db, usuarioId, versionCatalogo, hashArchivo, 
        { descargados: datosDescargados.length, nuevos: 0, actualizados: 0, sinCambios: 0 },
        [{ error: err.message }]);
    } catch {}

    progresoActualizacion.activo = false;
    progresoActualizacion.paso = 'error';
    return { ok: false, error: err.message };
  } finally {
    actualizacionEnProgreso = false;
  }
}

function obtenerEstadoCatalogo() {
  const db = getDb();
  const actualizacion = db.prepare(`
    SELECT * FROM catalogo_actualizaciones 
    ORDER BY fecha_importacion DESC LIMIT 1
  `).get();

  const stats = db.prepare(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN fuente = 'INVIMA' THEN 1 ELSE 0 END) as de_invima,
      SUM(CASE WHEN fuente = 'MANUAL' THEN 1 ELSE 0 END) as manuales,
      SUM(CASE WHEN estado_cum = 'ACTIVO' THEN 1 ELSE 0 END) as activos,
      SUM(CASE WHEN estado_cum = 'HISTORICO' THEN 1 ELSE 0 END) as historicos
    FROM catalogo_cum
  `).get();

  const empaques = db.prepare(`
    SELECT COUNT(*) as total, nivel FROM catalogo_empaques GROUP BY nivel
  `).all();

  return {
    ultimaActualizacion: actualizacion || null,
    estadisticas: stats,
    empaquesPorNivel: empaques
  };
}

function buscarPorGTIN(gtin) {
  if (!gtin) return null;
  const gtinNormalizado = barcodeService.normalizarGTIN(gtin);
  const gtinOriginal = barcodeService.limpiarCodigo(gtin);
  // Mantener dos parámetros en cada IN aunque ambos códigos coincidan.
  const codigos = [gtinNormalizado, gtinOriginal];
  const db = getDb();
  const resultados = db.prepare(`
    SELECT c.*, e.nivel AS nivel_empaque, e.nivel AS nivel_encontrado,
      'empaque' AS fuente_busqueda, 0 AS prioridad
    FROM catalogo_empaques e
    JOIN catalogo_cum c ON c.id = e.catalogo_cum_id
    WHERE e.gtin IN (?, ?)
    UNION ALL
    SELECT c.*, NULL AS nivel_empaque, 3 AS nivel_encontrado,
      'catalogo' AS fuente_busqueda, 1 AS prioridad
    FROM catalogo_cum c WHERE c.gtin IN (?, ?)
    UNION ALL
    SELECT c.*, NULL AS nivel_empaque, 1 AS nivel_encontrado,
      'catalogo_logistico' AS fuente_busqueda, 2 AS prioridad
    FROM catalogo_cum c WHERE c.gtin_empaque_logistico IN (?, ?)
    UNION ALL
    SELECT c.*, NULL AS nivel_empaque, 2 AS nivel_encontrado,
      'catalogo_venta' AS fuente_busqueda, 3 AS prioridad
    FROM catalogo_cum c WHERE c.gtin_empaque_venta IN (?, ?)
    ORDER BY prioridad, id
  `).all(
    ...codigos, ...codigos, ...codigos, ...codigos
  );
  const unicos = [...new Map(resultados.map((fila) => [fila.id, fila])).values()];
  if (unicos.length > 1) return { ambigua: true, candidatos: unicos };
  return unicos[0] || null;
}

function buscarPorCUM(cum) {
  if (!cum) return null;
  const db = getDb();
  return db.prepare(`SELECT * FROM catalogo_cum WHERE cum = ?`).get(cum);
}

function buscarPorProducto(texto, limite = 20) {
  const db = getDb();
  if (!texto) {
    return db.prepare(`
      SELECT * FROM catalogo_cum 
      ORDER BY actualizado_en DESC, creado_en DESC
      LIMIT ?
    `).all(limite);
  }
  const consulta = texto.trim();
  if (!consulta) return [];
  const limiteSeguro = Math.max(1, Math.min(Number(limite) || 20, 100));
  const ftsDisponible = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'catalogo_cum_fts'").get();
  // El tokenizador trigram encuentra substrings (incluidas concentraciones y
  // presentaciones). Términos cortos o SQLite sin FTS5 conservan el camino LIKE.
  if (ftsDisponible && [...consulta].length >= 3) {
    const frase = `"${consulta.replace(/"/g, '""')}"`;
    try {
      return db.prepare(`
        SELECT c.* FROM catalogo_cum_fts f
        JOIN catalogo_cum c ON c.id = f.rowid
        WHERE catalogo_cum_fts MATCH ?
        ORDER BY CASE WHEN c.producto LIKE ? THEN 0 ELSE 1 END, c.producto
        LIMIT ?
      `).all(frase, `${consulta.replace(/[%_]/g, '\\$&')}%`, limiteSeguro);
    } catch (error) {
      if (!/no such table|no such module|fts5|malformed MATCH/i.test(error.message)) throw error;
    }
  }
  // Escapar wildcards % y _ para que se traten literalmente
  const textoEscapado = consulta.replace(/[%_]/g, '\\$&');
  const like = `%${textoEscapado}%`;
  const startsWith = `${textoEscapado}%`;
  return db.prepare(`
    SELECT * FROM catalogo_cum
    WHERE producto LIKE ? ESCAPE '\\' OR descripcioncomercial LIKE ? ESCAPE '\\'
      OR principio_activo LIKE ? ESCAPE '\\' OR fabricante LIKE ? ESCAPE '\\'
      OR laboratorio LIKE ? ESCAPE '\\' OR concentracion LIKE ? ESCAPE '\\'
      OR forma_farmaceutica LIKE ? ESCAPE '\\' OR registro_sanitario LIKE ? ESCAPE '\\'
    ORDER BY
      CASE WHEN producto LIKE ? ESCAPE '\\' THEN 0 ELSE 1 END,
      producto
    LIMIT ?
  `).all(like, like, like, like, like, like, like, like, startsWith, limiteSeguro);
}

function crearRegistroManual(usuarioSesion, data) {
  permisoService.verificarEsAdmin(usuarioSesion);
  const db = getDb();
  
  const cum = data.cum || `MAN-${Date.now()}`;
  const hash = generarHashFila({ ...data, expediente: 0, consecutivocum: 0, cum, producto: data.producto });
  
  const stmt = db.prepare(`
    INSERT INTO catalogo_cum (
      expediente, consecutivocum, cum, producto, descripcioncomercial,
      principio_activo, concentracion, forma_farmaceutica, via_administracion,
      unidad_medida, cantidad_presentacion, registro_sanitario,
      fecha_expedicion_registro, fecha_vencimiento_registro, estado_registro,
      estado_cum, titular, laboratorio, fabricante, pais_fabricante,
      condicion_venta, tipo_producto, atc_codigo, atc_descripcion,
      gtin, gtin_empaque_logistico, gtin_empaque_venta,
      fuente, version_catalogo, fecha_importacion, hash_fila, creado_en, actualizado_en
    ) VALUES (
      @expediente, @consecutivocum, @cum, @producto, @descripcioncomercial,
      @principio_activo, @concentracion, @forma_farmaceutica, @via_administracion,
      @unidad_medida, @cantidad_presentacion, @registro_sanitario,
      @fecha_expedicion_registro, @fecha_vencimiento_registro, @estado_registro,
      @estado_cum, @titular, @laboratorio, @fabricante, @pais_fabricante,
      @condicion_venta, @tipo_producto, @atc_codigo, @atc_descripcion,
      @gtin, @gtin_empaque_logistico, @gtin_empaque_venta,
      @fuente, @version_catalogo, @fecha_importacion, @hash_fila, datetime('now'), datetime('now')
    )
  `);
  
  const info = stmt.run({
    expediente: 0,
    consecutivocum: 0,
    cum,
    producto: data.producto,
    descripcioncomercial: data.descripcioncomercial || null,
    principio_activo: data.principio_activo || null,
    concentracion: data.concentracion || null,
    forma_farmaceutica: data.forma_farmaceutica || null,
    via_administracion: data.via_administracion || null,
    unidad_medida: data.unidad_medida || null,
    cantidad_presentacion: data.cantidad_presentacion || null,
    registro_sanitario: data.registro_sanitario || null,
    fecha_expedicion_registro: data.fecha_expedicion_registro || null,
    fecha_vencimiento_registro: data.fecha_vencimiento_registro || null,
    estado_registro: data.estado_registro || 'MANUAL',
    estado_cum: 'ACTIVO',
    titular: data.titular || null,
    laboratorio: data.laboratorio || null,
    fabricante: data.fabricante || null,
    pais_fabricante: data.pais_fabricante || null,
    condicion_venta: data.condicion_venta || null,
    tipo_producto: data.tipo_producto || 'MEDICAMENTO',
    atc_codigo: data.atc_codigo || null,
    atc_descripcion: data.atc_descripcion || null,
    gtin: data.gtin || null,
    gtin_empaque_logistico: data.gtin_empaque_logistico || null,
    gtin_empaque_venta: data.gtin_empaque_venta || null,
    fuente: 'MANUAL',
    version_catalogo: 'MANUAL',
    fecha_importacion: new Date().toISOString(),
    hash_fila: hash
  });

  const creado = db.prepare('SELECT * FROM catalogo_cum WHERE id = ?').get(info.lastInsertRowid);

  auditoriaRepository.registrar({
    usuario_id: usuarioSesion.id,
    rol: usuarioSesion.rol_nombre,
    sede_id: usuarioSesion.sede_id,
    accion: AUDIT_ACTIONS.CATALOGO_CUM_MANUAL,
    modulo: 'CATALOGO_CUM',
    registro_afectado: `catalogo:${creado.id}`,
    resultado: 'EXITO',
    valores_nuevos: creado
  });

  return creado;
}

function crearEmpaque(usuarioSesion, data) {
  permisoService.verificarEsAdmin(usuarioSesion);
  const db = getDb();

  // Validar nivel explícitamente (solo 1, 2, 3 permitidos)
  if (![1, 2, 3].includes(data.nivel)) {
    throw new CatalogoCumError('Nivel de empaque inválido. Debe ser 1, 2 o 3.');
  }
  
  const stmt = db.prepare(`
    INSERT INTO catalogo_empaques (catalogo_cum_id, nivel, gtin, descripcion, contenido_cantidad, contenido_unidad, factor_conversion, es_principal)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  const info = stmt.run(
    data.catalogo_cum_id,
    data.nivel,
    data.gtin,
    data.descripcion || null,
    data.contenido_cantidad,
    data.contenido_unidad,
    data.factor_conversion || 1,
    data.es_principal ? 1 : 0
  );

  // Si es principal, actualizar gtin en catalogo_cum
  if (data.es_principal) {
    const campoGtin = data.nivel === 1 ? 'gtin_empaque_logistico' : 
                      data.nivel === 2 ? 'gtin_empaque_venta' : 'gtin';
    db.prepare(`UPDATE catalogo_cum SET ${campoGtin} = ? WHERE id = ?`).run(data.gtin, data.catalogo_cum_id);
  }

  const creado = db.prepare('SELECT * FROM catalogo_empaques WHERE id = ?').get(info.lastInsertRowid);

  auditoriaRepository.registrar({
    usuario_id: usuarioSesion.id,
    rol: usuarioSesion.rol_nombre,
    sede_id: usuarioSesion.sede_id,
    accion: AUDIT_ACTIONS.CATALOGO_EMPAQUE_CREAR,
    modulo: 'CATALOGO_CUM',
    registro_afectado: `empaque:${creado.id}`,
    resultado: 'EXITO',
    valores_nuevos: creado
  });

  return creado;
}

function adjuntarDocumento(usuarioSesion, cumId, data) {
  permisoService.verificarEsAdmin(usuarioSesion);
  const db = getDb();

  const existe = db.prepare('SELECT id FROM catalogo_cum WHERE id = ?').get(cumId);
  if (!existe) throw new CatalogoCumError('Registro CUM no encontrado');

  db.prepare(`
    UPDATE catalogo_cum
    SET documento_adjunto_nombre = ?,
        documento_adjunto_data = ?,
        documento_adjunto_tipo = ?,
        actualizado_en = datetime('now')
    WHERE id = ?
  `).run(
    data.documento_adjunto_nombre || null,
    data.documento_adjunto_data || null,
    data.documento_adjunto_tipo || null,
    cumId
  );

  const actualizado = db.prepare('SELECT * FROM catalogo_cum WHERE id = ?').get(cumId);

  auditoriaRepository.registrar({
    usuario_id: usuarioSesion.id,
    rol: usuarioSesion.rol_nombre,
    sede_id: usuarioSesion.sede_id,
    accion: AUDIT_ACTIONS.CATALOGO_CUM_DOCUMENTO,
    modulo: 'CATALOGO_CUM',
    registro_afectado: `catalogo:${cumId}`,
    resultado: 'EXITO',
    valores_nuevos: {
      documento_adjunto_nombre: data.documento_adjunto_nombre || null,
      documento_adjunto_tipo: data.documento_adjunto_tipo || null
    }
  });

  return actualizado;
}

function obtenerDocumento(usuarioSesion, cumId) {
  permisoService.verificarEsAdmin(usuarioSesion);
  const db = getDb();
  return db.prepare(`
    SELECT documento_adjunto_nombre, documento_adjunto_data, documento_adjunto_tipo
    FROM catalogo_cum WHERE id = ?
  `).get(cumId);
}

module.exports = {
  actualizarCatalogo,
  obtenerEstadoCatalogo,
  buscarPorGTIN,
  buscarPorCUM,
  buscarPorProducto,
  crearRegistroManual,
  crearEmpaque,
  adjuntarDocumento,
  obtenerDocumento,
  obtenerProgreso,
  cancelarActualizacion,
  CatalogoCumError,
  mapearRegistroINVIMA,
  validarRegistro,
  descargarCatalogoCompleto
};
