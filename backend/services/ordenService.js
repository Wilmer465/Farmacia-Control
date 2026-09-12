const ordenRepository = require('../repositories/ordenRepository');
const medicamentoRepository = require('../repositories/medicamentoRepository');
const loteRepository = require('../repositories/loteRepository');
const auditoriaRepository = require('../repositories/auditoriaRepository');
const permisoService = require('./permisoService');
const receptorService = require('./receptorService');
const { validarItemsOrden } = require('../validators/ordenValidator');
const { AUDIT_ACTIONS, ROLES } = require('../../shared/constants');

class ValidationError extends Error {}

const ESTADOS_CANCELABLES = ['PENDIENTE', 'PARCIAL'];

function listar(usuarioSesion, { sedeId } = {}) {
  const sedeEfectiva = permisoService.resolverSedeEfectiva(usuarioSesion, sedeId);
  return ordenRepository.findAll({ sedeId: sedeEfectiva });
}

function obtener(usuarioSesion, id) {
  const orden = ordenRepository.findById(id);
  if (!orden) throw new ValidationError('La orden no existe.');
  permisoService.verificarPerteneceASede(usuarioSesion, orden.sede_id);
  return orden;
}

function crear(usuarioSesion, {
  items, sede_id, tipo_destino = 'LOCAL', destino_detalle = null,
  receptor_nombre, receptor_documento, receptor_telefono, receptor_correo,
  firma_data, huella_registrada,
  documento_adjunto_nombre, documento_adjunto_data, documento_adjunto_tipo,
  numero_factura, factura_electronica
} = {}) {
  permisoService.verificarGestionOrdenes(usuarioSesion);

  // Si el usuario tiene sede propia, SIEMPRE se usa esa (se ignora cualquier sede_id
  // que venga del frontend). Si es visión global (SUPERADMIN sin sede), debe indicar
  // explícitamente para qué sede es la orden.
  const sedeId = usuarioSesion.sede_id ?? sede_id;
  if (!sedeId) {
    throw new ValidationError('Debe indicar la sede para la cual se crea la orden.');
  }

  const { valido, errores } = validarItemsOrden(items);
  if (!valido) throw new ValidationError(errores.join(' '));

  const esMunicipioVereda = tipo_destino === 'MUNICIPIO_VEREDA';
  const receptorNombre = (receptor_nombre || '').trim() || null;
  const receptorDocumento = (receptor_documento || '').trim() || null;
  const receptorTelefono = (receptor_telefono || '').trim() || null;
  const receptorCorreo = (receptor_correo || '').trim() || null;
  const firma = firma_data || null;
  const huella = Boolean(huella_registrada);
  const numeroFactura = numero_factura || null;
  const facturaElectronica = factura_electronica || null;

  // Documentación de quien recibe: la identidad (nombre y documento) siempre es
  // obligatoria. La firma y la huella son obligatorias para entregas locales y
  // quedan "pendientes" en los envíos a municipio/vereda.
  const faltantes = [];
  const pendientes = [];
  if (!receptorNombre) faltantes.push('NOMBRE_RECEPTOR');
  if (!receptorDocumento) faltantes.push('DOCUMENTO');
  if (esMunicipioVereda) {
    if (!firma) pendientes.push('FIRMA');
    if (!huella) pendientes.push('HUELLA');
  } else {
    if (!firma) faltantes.push('FIRMA');
    if (!huella) faltantes.push('HUELLA');
  }
  if (faltantes.length > 0) {
    throw new ValidationError(`La orden requiere la documentación de quien recibe (faltan: ${faltantes.join(', ')}).`);
  }
  const documentacionCompleta = faltantes.length === 0 && pendientes.length === 0;
  const elementosFaltantes = [...faltantes, ...pendientes];

  const itemsPreparados = items.map((item) => {
    const medicamento = medicamentoRepository.findById(item.medicamento_id);
    if (!medicamento) throw new ValidationError(`El medicamento seleccionado no existe.`);

    // Seguridad: el medicamento debe tener lotes con stock en la sede del usuario.
    if (!loteRepository.existeEnSede(medicamento.id, sedeId)) {
      throw new ValidationError(`El medicamento "${medicamento.nombre}" no tiene stock disponible en su sede.`);
    }

    const total = Number(item.cantidad_unidades_solicitada ?? item.cantidad_total_solicitada ?? (Number(item.cantidad_cajas_solicitada || 0) * (medicamento.unidades_por_caja || 1) + Number(item.cantidad_unidades_solicitada || 0)));
    const cajas = 0;
    const sueltas = total;

    return {
      medicamento_id: medicamento.id,
      cantidad_cajas_solicitada: cajas,
      cantidad_unidades_solicitada: sueltas,
      cantidad_total_solicitada: total
    };
  });

  // Guardar/actualizar en el catálogo de receptores para reutilización futura (autocompletado).
  if (receptorDocumento && receptorNombre) {
    try {
      receptorService.guardarOActualizar({
        documento: receptorDocumento,
        nombre: receptorNombre,
        telefono: receptorTelefono,
        correo_electronico: receptorCorreo,
        firma_guardada: esMunicipioVereda ? null : firma,
        huella_guardada: esMunicipioVereda ? 0 : (huella ? 1 : 0),
        documento_adjunto_nombre,
        documento_adjunto_data,
        documento_adjunto_tipo
      });
    } catch (err) {
      console.warn('[ordenService] Error no bloqueante al guardar receptor:', err.message);
    }
  }

  const orden = ordenRepository.crearConDetalles({
    sede_id: sedeId,
    usuario_creador_id: usuarioSesion.id,
    items: itemsPreparados,
    tipo_destino: esMunicipioVereda ? 'MUNICIPIO_VEREDA' : 'LOCAL',
    destino_detalle: destino_detalle ? destino_detalle.trim() : null,
    receptor_nombre: receptorNombre,
    receptor_documento: receptorDocumento,
    receptor_telefono: receptorTelefono,
    receptor_correo: receptorCorreo,
    firma_data: esMunicipioVereda ? null : firma,
    huella_registrada: esMunicipioVereda ? 0 : (huella ? 1 : 0),
    documento_adjunto_nombre,
    documento_adjunto_data,
    documento_adjunto_tipo,
    documentacion_completa: documentacionCompleta ? 1 : 0,
    elementos_faltantes: elementosFaltantes.length ? JSON.stringify(elementosFaltantes) : null
  });

  auditoriaRepository.registrar({
    usuario_id: usuarioSesion.id,
    rol: usuarioSesion.rol_nombre,
    sede_id: sedeId,
    accion: AUDIT_ACTIONS.CREAR_ORDEN,
    modulo: 'ORDENES',
    registro_afectado: `orden:${orden.id}`,
    resultado: documentacionCompleta ? 'EXITO' : 'DOCUMENTACION_INCOMPLETA',
    valores_nuevos: orden
  });

  return orden;
}

function cancelar(usuarioSesion, id, { motivo } = {}) {
  permisoService.verificarGestionOrdenes(usuarioSesion);

  if (!motivo || !motivo.trim()) {
    throw new ValidationError('Debe indicar el motivo de la cancelación.');
  }

  const orden = ordenRepository.findById(id);
  if (!orden) throw new ValidationError('La orden no existe.');
  permisoService.verificarPerteneceASede(usuarioSesion, orden.sede_id);

  if (!ESTADOS_CANCELABLES.includes(orden.estado)) {
    throw new ValidationError(`No se puede cancelar una orden en estado ${orden.estado}.`);
  }

  const actualizada = ordenRepository.cancelar(id, motivo.trim());

  auditoriaRepository.registrar({
    usuario_id: usuarioSesion.id,
    rol: usuarioSesion.rol_nombre,
    sede_id: orden.sede_id,
    accion: AUDIT_ACTIONS.CANCELAR_ORDEN,
    modulo: 'ORDENES',
    registro_afectado: `orden:${id}`,
    resultado: 'EXITO',
    valores_anteriores: { estado: orden.estado },
    valores_nuevos: { estado: 'CANCELADA', motivo: motivo.trim() }
  });

  return actualizada;
}

// Completa o corrige después la documentación de quien recibe de una orden ya creada.
// Solo aplica a órdenes no cerradas (PENDIENTE o PARCIAL); las COMPLETADA/CANCELADA no se modifican.
function actualizarDocumentacion(usuarioSesion, id, {
  receptor_nombre, receptor_documento, receptor_telefono, receptor_correo,
  firma_data, huella_registrada,
  documento_adjunto_nombre, documento_adjunto_data, documento_adjunto_tipo
} = {}) {
  // Modificar la documentación de una orden requiere autorización de Superadmin o Administrador de sede.
  if (![ROLES.SUPERADMIN, ROLES.ADMIN].includes(usuarioSesion?.rol_nombre)) {
    throw new permisoService.PermisoError('Solo el Superadmin o el Administrador de sede pueden modificar la documentación de una orden.');
  }

  const orden = ordenRepository.findById(id);
  if (!orden) throw new ValidationError('La orden no existe.');
  permisoService.verificarPerteneceASede(usuarioSesion, orden.sede_id);

  // Las órdenes PENDIENTE, PARCIAL o COMPLETADA pueden corregirse; CANCELADA no.
  if (!['PENDIENTE', 'PARCIAL', 'COMPLETADA'].includes(orden.estado)) {
    throw new ValidationError(`No se puede modificar la documentación de una orden en estado ${orden.estado}.`);
  }

  const esMunicipioVereda = orden.tipo_destino === 'MUNICIPIO_VEREDA';
  const nombre = (receptor_nombre || '').trim() || null;
  const documento = (receptor_documento || '').trim() || null;
  const telefono = (receptor_telefono || '').trim() || null;
  const correo = (receptor_correo || '').trim() || null;
  const firma = firma_data || null;
  const huella = Boolean(huella_registrada);

  const faltantes = [];
  const pendientes = [];
  if (!nombre) faltantes.push('NOMBRE_RECEPTOR');
  if (!documento) faltantes.push('DOCUMENTO');
  if (esMunicipioVereda) {
    if (!firma) pendientes.push('FIRMA');
    if (!huella) pendientes.push('HUELLA');
  } else {
    if (!firma) faltantes.push('FIRMA');
    if (!huella) faltantes.push('HUELLA');
  }
  if (faltantes.length > 0) {
    throw new ValidationError(`La documentación requiere al menos el nombre y documento de quien recibe${esMunicipioVereda ? '' : ' y, para entregas locales, la firma y huella'} (faltan: ${faltantes.join(', ')}).`);
  }
  const documentacionCompleta = faltantes.length === 0 && pendientes.length === 0;
  const elementosFaltantes = [...faltantes, ...pendientes];

  if (receptor_documento && nombre) {
    try {
      receptorService.guardarOActualizar({
        documento,
        nombre,
        telefono,
        correo_electronico: correo,
        firma_guardada: esMunicipioVereda ? null : firma,
        huella_guardada: esMunicipioVereda ? 0 : (huella ? 1 : 0),
        documento_adjunto_nombre,
        documento_adjunto_data,
        documento_adjunto_tipo
      });
    } catch (err) {
      console.warn('[ordenService] Error no bloqueante al guardar receptor:', err.message);
    }
  }

  const actualizada = ordenRepository.actualizarDocumentacion(id, {
    receptor_nombre: nombre,
    receptor_documento: documento,
    receptor_telefono: telefono,
    receptor_correo: correo,
    firma_data: esMunicipioVereda ? null : firma,
    huella_registrada: esMunicipioVereda ? 0 : (huella ? 1 : 0),
    documento_adjunto_nombre,
    documento_adjunto_data,
    documento_adjunto_tipo,
    documentacion_completa: documentacionCompleta ? 1 : 0,
    elementos_faltantes: elementosFaltantes.length ? JSON.stringify(elementosFaltantes) : null
  });

  auditoriaRepository.registrar({
    usuario_id: usuarioSesion.id,
    rol: usuarioSesion.rol_nombre,
    sede_id: orden.sede_id,
    accion: AUDIT_ACTIONS.CREAR_ORDEN,
    modulo: 'ORDENES',
    registro_afectado: `orden:${id}`,
    resultado: documentacionCompleta ? 'EXITO' : 'DOCUMENTACION_INCOMPLETA',
    valores_anteriores: { documentacion_completa: orden.documentacion_completa, elementos_faltantes: orden.elementos_faltantes },
    valores_nuevos: { documentacion_completa: actualizada.documentacion_completa, elementos_faltantes: actualizada.elementos_faltantes }
  });

  return actualizada;
}

module.exports = { listar, obtener, crear, cancelar, actualizarDocumentacion, ValidationError };
