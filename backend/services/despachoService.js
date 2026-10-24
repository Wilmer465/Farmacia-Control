const despachoRepository = require('../repositories/despachoRepository');
const entregaRepository = require('../repositories/entregaRepository');
const ordenRepository = require('../repositories/ordenRepository');
const loteRepository = require('../repositories/loteRepository');
const permisoService = require('./permisoService');
const { validarItemsDespacho } = require('../validators/despachoValidator');

class ValidationError extends Error {}

const ESTADOS_DESPACHABLES = ['PENDIENTE', 'PARCIAL'];

function listarPorOrden(usuarioSesion, ordenId) {
  const orden = ordenRepository.findById(ordenId);
  if (!orden) throw new ValidationError('La orden no existe.');
  permisoService.verificarPerteneceASede(usuarioSesion, orden.sede_id);

  const despachos = despachoRepository.findAll({ ordenId });
  if (despachos.length === 0) return [];

  // Obtener todos los detalles en una sola query (evita N+1).
  // Se pasa el array de ids (no un string con join): el repositorio construye
  // un placeholder por elemento y hace spread; con string partía caracteres.
  const ids = despachos.map(d => d.id);
  const detalles = despachoRepository.findDetalleByDespachoIds(ids);
  
  // Agrupar detalles por despacho_id
  const detallesPorDespacho = {};
  for (const d of detalles) {
    if (!detallesPorDespacho[d.despacho_id]) detallesPorDespacho[d.despacho_id] = [];
    detallesPorDespacho[d.despacho_id].push(d);
  }

  return despachos.map(d => ({ ...d, detalle: detallesPorDespacho[d.id] || [] }));
}

function crear(usuarioSesion, { orden_id, items, firma_data, huella_registrada }) {
  permisoService.verificarDespacho(usuarioSesion);

  const orden = ordenRepository.findById(orden_id);
  if (!orden) throw new ValidationError('La orden no existe.');
  permisoService.verificarPerteneceASede(usuarioSesion, orden.sede_id);

  if (!ESTADOS_DESPACHABLES.includes(orden.estado)) {
    throw new ValidationError(`Solo se pueden despachar órdenes PENDIENTE o PARCIAL (actual: ${orden.estado}).`);
  }

  // Permite despachar sin firma y sin huella: se calculan los faltantes y se asocian a la entrega
  const esMunicipioVereda = orden.tipo_destino === 'MUNICIPIO_VEREDA';
  const firmaEfectiva = esMunicipioVereda ? null : (firma_data || orden.firma_data || null);
  const huellaEfectiva = esMunicipioVereda ? false : Boolean(huella_registrada ?? orden.huella_registrada);

  const faltantes = [];
  if (!orden.receptor_nombre) faltantes.push('RECEPTOR');
  if (!firmaEfectiva) faltantes.push('FIRMA');
  if (!huellaEfectiva) faltantes.push('HUELLA');

  const documentacionCompleta = esMunicipioVereda || faltantes.length === 0;
  const elementosFaltantes = esMunicipioVereda ? (faltantes.filter(f => f === 'FIRMA' || f === 'HUELLA')) : faltantes;

  const { valido, errores } = validarItemsDespacho(items);
  if (!valido) throw new ValidationError(errores.join(' '));

  const detallesPorId = new Map(orden.detalles.map((d) => [d.id, d]));

  const itemsPreparados = items.map((item, idx) => {
    const detalleOrden = detallesPorId.get(Number(item.orden_detalle_id));
    if (!detalleOrden) throw new ValidationError(`Línea ${idx + 1}: no pertenece a esta orden.`);

    const lote = loteRepository.findById(item.lote_id);
    if (!lote) throw new ValidationError(`Línea ${idx + 1}: el lote no existe.`);
    if (lote.sede_id !== orden.sede_id) {
      throw new ValidationError(`Línea ${idx + 1}: el lote pertenece a otra sede.`);
    }
    if (lote.medicamento_id !== detalleOrden.medicamento_id) {
      throw new ValidationError(`Línea ${idx + 1}: el lote no corresponde al medicamento de la orden.`);
    }

    const total = Number(item.cantidad_unidades_despachada ?? item.cantidad_total_despachada ?? item.cantidad_unidades_sueltas_despachada ?? (Number(item.cantidad_cajas_despachada || 0) * (lote.unidades_por_caja || 1) + Number(item.cantidad_unidades_sueltas_despachada || 0)));
    const cajas = 0;
    const sueltas = total;

    return {
      orden_detalle_id: detalleOrden.id,
      lote_id: lote.id,
      medicamento_id: detalleOrden.medicamento_id,
      cantidad_cajas_despachada: cajas,
      cantidad_unidades_sueltas_despachada: sueltas,
      cantidad_total_despachada: total
    };
  });

  let resultado;
  try {
    resultado = despachoRepository.crearConDetalles({
      orden_id: orden.id,
      sede_id: orden.sede_id,
      despachado_por: usuarioSesion.id,
      despachado_por_rol: usuarioSesion.rol_nombre,
      items: itemsPreparados
    });
  } catch (err) {
    // Errores lanzados dentro de la transacción (stock insuficiente, lote vencido, etc).
    throw new ValidationError(err.message);
  }

  // Registrar automáticamente la entrega asociada al despacho con sus faltantes
  try {
    const yaExisteEntrega = entregaRepository.findByDespachoId(resultado.despacho.id);
    if (!yaExisteEntrega) {
      entregaRepository.create({
        despacho_id: resultado.despacho.id,
        orden_id: orden.id,
        sede_id: orden.sede_id,
        receptor_nombre: orden.receptor_nombre || (esMunicipioVereda ? `Salida a: ${orden.destino_detalle || 'Municipio / Vereda'}` : 'Sin registrar'),
        receptor_documento: orden.receptor_documento || (esMunicipioVereda ? 'EXENTO_ENVIO' : 'SIN_DOCUMENTO'),
        firma_data: firmaEfectiva,
        huella_registrada: huellaEfectiva ? 1 : 0,
        entregado_por: usuarioSesion.id,
        documentacion_completa: documentacionCompleta ? 1 : 0,
        elementos_faltantes: elementosFaltantes.length ? JSON.stringify(elementosFaltantes) : null,
        tipo_destino: orden.tipo_destino,
        destino_detalle: orden.destino_detalle,
        documento_adjunto_nombre: orden.documento_adjunto_nombre || null,
        documento_adjunto_data: orden.documento_adjunto_data || null,
        documento_adjunto_tipo: orden.documento_adjunto_tipo || null
      });
    }

    // Si se enviaron datos de firma o huella al momento del despacho, sincronizarlos en la orden
    if (firma_data || huella_registrada !== undefined) {
      ordenRepository.actualizarDocumentacion(orden.id, {
        receptor_nombre: orden.receptor_nombre,
        receptor_documento: orden.receptor_documento,
        receptor_telefono: orden.receptor_telefono,
        receptor_correo: orden.receptor_correo,
        firma_data: firmaEfectiva,
        huella_registrada: huellaEfectiva ? 1 : 0,
        documento_adjunto_nombre: orden.documento_adjunto_nombre,
        documento_adjunto_data: orden.documento_adjunto_data,
        documento_adjunto_tipo: orden.documento_adjunto_tipo,
        documentacion_completa: documentacionCompleta ? 1 : 0,
        elementos_faltantes: elementosFaltantes.length ? JSON.stringify(elementosFaltantes) : null
      });
    }
  } catch (errEntrega) {
    console.warn('[despachoService] Advertencia al registrar entrega asociada:', errEntrega.message);
  }

  return resultado;
}

module.exports = { listarPorOrden, crear, ValidationError };
