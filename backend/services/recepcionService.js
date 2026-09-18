// Servicio de Recepción de Medicamentos con Escaneo de Código de Barras
// Integra: catálogo CUM, parseo de códigos, niveles de empaque, lotes, movimientos

const { getDb } = require('../database/connection');
const catalogoCumService = require('./catalogoCumService');
const barcodeService = require('./barcodeService');
const loteService = require('./loteService');
const movimientoRepository = require('../repositories/movimientoRepository');
const auditoriaRepository = require('../repositories/auditoriaRepository');
const permisoService = require('./permisoService');
const { AUDIT_ACTIONS } = require('../../shared/constants');

class RecepcionError extends Error {}

function calcularUnidadesBase(cantidadEscaneada, factorConversion) {
  return Math.round(cantidadEscaneada * (factorConversion || 1));
}

function obtenerInfoEmpaque(catalogoCumId, nivel, gtinEscaneado) {
  const db = getDb();
  let empaque = null;
  
  if (gtinEscaneado) {
    empaque = db.prepare(`
      SELECT * FROM catalogo_empaques WHERE gtin = ?
    `).get(gtinEscaneado);
  }
  
  if (!empaque && catalogoCumId && nivel) {
    empaque = db.prepare(`
      SELECT * FROM catalogo_empaques WHERE catalogo_cum_id = ? AND nivel = ?
    `).get(catalogoCumId, nivel);
  }
  
  if (!empaque && catalogoCumId) {
    // Buscar empaque principal
    empaque = db.prepare(`
      SELECT * FROM catalogo_empaques WHERE catalogo_cum_id = ? AND es_principal = 1
    `).get(catalogoCumId);
  }
  
  return empaque;
}

function identificarNivelEmpaque(empaque) {
  if (!empaque) return { nivel: 3, factor: 1, descripcion: 'Unidad individual (sin catálogo)' };
  return {
    nivel: empaque.nivel,
    factor: empaque.factor_conversion,
    descripcion: empaque.descripcion || `Nivel ${empaque.nivel}`,
    contenido_cantidad: empaque.contenido_cantidad,
    contenido_unidad: empaque.contenido_unidad
  };
}

async function procesarEscaneo(usuarioSesion, codigoBarras) {
  // 1. Parsear código de barras
  const parseado = barcodeService.parsearEntradaLector(codigoBarras);
  if (!parseado.ok) {
    return { ok: false, error: parseado.error, codigo: codigoBarras };
  }
  
  const { gtin, lote: loteCodigo, vencimiento: vencimientoCodigo, serial } = parseado.data;
  
  // 2. Buscar en catálogo CUM por GTIN
  let catalogo = null;
  let empaque = null;
  let fuenteBusqueda = 'ninguna';
  
  if (gtin) {
    catalogo = catalogoCumService.buscarPorGTIN(gtin);
    if (catalogo) {
      fuenteBusqueda = catalogo.fuente_busqueda || 'catalogo';
      empaque = obtenerInfoEmpaque(catalogo.id, catalogo.nivel_encontrado, gtin);
    }
  }
  
  // 3. Preparar respuesta con información encontrada
  const respuesta = {
    ok: true,
    codigoOriginal: codigoBarras,
    parseado: parseado.data,
    catalogo: catalogo ? {
      id: catalogo.id,
      cum: catalogo.cum,
      producto: catalogo.producto,
      principio_activo: catalogo.principio_activo,
      concentracion: catalogo.concentracion,
      forma_farmaceutica: catalogo.forma_farmaceutica,
      presentacion: catalogo.descripcioncomercial,
      laboratorio: catalogo.laboratorio,
      titular: catalogo.titular,
      registro_sanitario: catalogo.registro_sanitario,
      estado_cum: catalogo.estado_cum,
      fuente: catalogo.fuente,
      gtin_principal: catalogo.gtin
    } : null,
    empaque: empaque ? {
      nivel: empaque.nivel,
      gtin: empaque.gtin,
      descripcion: empaque.descripcion,
      contenido_cantidad: empaque.contenido_cantidad,
      contenido_unidad: empaque.contenido_unidad,
      factor_conversion: empaque.factor_conversion
    } : null,
    lote_detectado: loteCodigo || null,
    vencimiento_detectado: vencimientoCodigo || null,
    serial_detectado: serial || null,
    fuente_busqueda: fuenteBusqueda,
    requiere_registro_manual: !catalogo
  };
  
  // 4. Si tiene empaque, calcular equivalencias
  if (respuesta.empaque) {
    respuesta.equivalencias = {
      nivel: respuesta.empaque.nivel,
      factor: respuesta.empaque.factor_conversion,
      descripcion: `1 ${respuesta.empaque.descripcion} = ${respuesta.empaque.factor_conversion} unidades base`
    };
  }
  
  return respuesta;
}

async function registrarRecepcion(usuarioSesion, datos) {
  const {
    catalogo_cum_id,
    empaque_nivel,
    empaque_gtin,
    factor_conversion,
    lote,
    fecha_vencimiento,
    cantidad,              // Cantidad en el nivel escaneado (ej: 3 cajas logísticas)
    sede_id,
    observaciones
  } = datos;

  permisoService.verificarEscrituraInventario(usuarioSesion);
  const sedeEfectiva = permisoService.resolverSedeEfectiva(usuarioSesion, sede_id);

  if (!catalogo_cum_id) throw new RecepcionError('Se requiere catálogo CUM (catalogo_cum_id)');
  if (!lote || !lote.trim()) throw new RecepcionError('Lote es obligatorio');
  if (!fecha_vencimiento) throw new RecepcionError('Fecha de vencimiento es obligatoria');
  if (!cantidad || cantidad <= 0) throw new RecepcionError('Cantidad debe ser mayor a 0');
  if (!sedeEfectiva) throw new RecepcionError('Sede no determinada');

  const db = getDb();
  const catalogo = db.prepare('SELECT * FROM catalogo_cum WHERE id = ?').get(catalogo_cum_id);
  if (!catalogo) throw new RecepcionError('Catálogo CUM no encontrado');

  // Obtener o crear medicamento local vinculado al catálogo
  let medicamento = db.prepare('SELECT * FROM medicamentos WHERE catalogo_cum_id = ?').get(catalogo_cum_id);
  
  if (!medicamento) {
    // Crear medicamento local basado en catálogo
    const payload = {
      codigo: `CUM-${catalogo.cum}`,
      nombre: catalogo.producto,
      principio_activo: catalogo.principio_activo,
      presentacion: catalogo.descripcioncomercial,
      concentracion: catalogo.concentracion,
      laboratorio: catalogo.laboratorio,
      unidad_medida: catalogo.unidad_medida || 'UNIDAD',
      unidades_por_caja: 1,
      estado: 'ACTIVO',
      catalogo_cum_id: catalogo.id,
      fuente: catalogo.fuente,
      gtin_principal: catalogo.gtin
    };
    
    const stmt = db.prepare(`
      INSERT INTO medicamentos (codigo, nombre, principio_activo, presentacion, concentracion, laboratorio, 
        unidad_medida, unidades_por_caja, estado, catalogo_cum_id, fuente, gtin_principal)
      VALUES (@codigo, @nombre, @principio_activo, @presentacion, @concentracion, @laboratorio,
        @unidad_medida, @unidades_por_caja, @estado, @catalogo_cum_id, @fuente, @gtin_principal)
    `);
    const info = stmt.run(payload);
    medicamento = db.prepare('SELECT * FROM medicamentos WHERE id = ?').get(info.lastInsertRowid);
  }

  // Calcular unidades base (nivel 3 = unidad individual)
  const unidadesBase = calcularUnidadesBase(cantidad, factor_conversion);

  // Crear/actualizar lote
  const loteExistente = db.prepare(`
    SELECT * FROM lotes 
    WHERE medicamento_id = ? AND sede_id = ? AND numero_lote = ? AND empaque_nivel = ? AND empaque_gtin = ?
  `).get(medicamento.id, sedeEfectiva, lote.trim(), empaque_nivel, empaque_gtin);

  let loteFinal;
  if (loteExistente) {
    // Actualizar cantidad existente
    const nuevasUnidadesBase = loteExistente.cantidad_total_unidades + unidadesBase;
    const nuevasCajas = loteExistente.cantidad_cajas + cantidad;
    
    loteFinal = loteService.ajustarCantidades(usuarioSesion, loteExistente.id, {
      cantidad_cajas: nuevasCajas,
      cantidad_unidades_sueltas: nuevasUnidadesBase % (medicamento.unidades_por_caja || 1),
      motivo: `Recepción: +${cantidad} ${empaque_nivel === 1 ? 'cajas logísticas' : empaque_nivel === 2 ? 'cajas' : 'unidades'}`
    });
  } else {
    // Crear nuevo lote
    loteFinal = loteService.crear(usuarioSesion, {
      medicamento_id: medicamento.id,
      sede_id: sedeEfectiva,
      numero_lote: lote.trim(),
      fecha_expedicion: new Date().toISOString().split('T')[0],
      fecha_vencimiento,
      cantidad_cajas: cantidad,
      cantidad_unidades_sueltas: 0,
      empaque_nivel,
      empaque_gtin,
      factor_conversion
    });
  }

  // Registrar movimiento de entrada con trazabilidad completa
  const movimiento = movimientoRepository.crear({
    lote_id: loteFinal.id,
    medicamento_id: medicamento.id,
    sede_id: sedeEfectiva,
    tipo: 'ENTRADA',
    cantidad: unidadesBase,
    referencia_orden_id: null,
    usuario_id: usuarioSesion.id,
    fecha: new Date().toISOString(),
    empaque_nivel,
    cantidad_unidades_base: unidadesBase
  });

  // Auditoría
  auditoriaRepository.registrar({
    usuario_id: usuarioSesion.id,
    rol: usuarioSesion.rol_nombre,
    sede_id: sedeEfectiva,
    accion: AUDIT_ACTIONS.RECEPCION_REGISTRAR,
    modulo: 'RECEPCION',
    registro_afectado: `lote:${loteFinal.id}`,
    resultado: 'EXITO',
    valores_nuevos: {
      catalogo_cum_id,
      medicamento_id: medicamento.id,
      lote: lote.trim(),
      fecha_vencimiento,
      cantidad_recibida: cantidad,
      empaque_nivel,
      empaque_gtin,
      factor_conversion,
      unidades_base: unidadesBase,
      movimiento_id: movimiento.id
    }
  });

  return {
    ok: true,
    medicamento: {
      id: medicamento.id,
      codigo: medicamento.codigo,
      nombre: medicamento.nombre
    },
    lote: {
      id: loteFinal.id,
      numero_lote: loteFinal.numero_lote,
      fecha_vencimiento: loteFinal.fecha_vencimiento,
      cantidad_total_unidades: loteFinal.cantidad_total_unidades
    },
    movimiento: {
      id: movimiento.id,
      tipo: movimiento.tipo,
      cantidad: movimiento.cantidad,
      empaque_nivel: movimiento.empaque_nivel,
      cantidad_unidades_base: movimiento.cantidad_unidades_base
    },
    equivalencias: {
      recibido_nivel_escan: cantidad,
      factor_conversion,
      unidades_base_calculadas: unidadesBase
    }
  };
}

function obtenerHistorialRecepciones(filtros = {}) {
  const db = getDb();
  let where = 'WHERE 1=1';
  const params = [];
  
  if (filtros.sede_id) {
    where += ' AND m.sede_id = ?';
    params.push(filtros.sede_id);
  }
  if (filtros.fecha_desde) {
    where += ' AND date(m.fecha) >= date(?)';
    params.push(filtros.fecha_desde);
  }
  if (filtros.fecha_hasta) {
    where += ' AND date(m.fecha) <= date(?)';
    params.push(filtros.fecha_hasta);
  }
  if (filtros.catalogo_cum_id) {
    where += ' AND med.catalogo_cum_id = ?';
    params.push(filtros.catalogo_cum_id);
  }
  
  const query = `
    SELECT 
      m.*, 
      med.codigo as med_codigo, med.nombre as med_nombre, med.catalogo_cum_id,
      l.numero_lote, l.fecha_vencimiento, l.empaque_nivel, l.empaque_gtin, l.factor_conversion,
      s.nombre as sede_nombre,
      u.nombre as usuario_nombre
    FROM movimientos_inventario m
    JOIN medicamentos med ON med.id = m.medicamento_id
    JOIN lotes l ON l.id = m.lote_id
    JOIN sedes s ON s.id = m.sede_id
    JOIN usuarios u ON u.id = m.usuario_id
    ${where}
    AND m.tipo = 'ENTRADA'
    ORDER BY m.fecha DESC
    LIMIT ?
  `;
  
  params.push(filtros.limite || 100);
  return db.prepare(query).all(...params);
}

module.exports = {
  procesarEscaneo,
  registrarRecepcion,
  obtenerHistorialRecepciones,
  RecepcionError,
  calcularUnidadesBase,
  identificarNivelEmpaque
};