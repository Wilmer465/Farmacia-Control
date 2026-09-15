const entregaRepository = require('../repositories/entregaRepository');
const despachoRepository = require('../repositories/despachoRepository');
const ordenRepository = require('../repositories/ordenRepository');
const auditoriaRepository = require('../repositories/auditoriaRepository');
const receptorService = require('./receptorService');
const permisoService = require('./permisoService');
const biometricService = require('./biometricService');
const { validarEntrega } = require('../validators/entregaValidator');
const { AUDIT_ACTIONS } = require('../../shared/constants');

class ValidationError extends Error {}

function listar(usuarioSesion, filtros = {}) {
  const sedeEfectiva = permisoService.resolverSedeEfectiva(usuarioSesion, filtros.sedeId);
  if (filtros.limit !== undefined || filtros.offset !== undefined) {
    return entregaRepository.findAllPaginated({
      sedeId: sedeEfectiva, limit: filtros.limit, offset: filtros.offset
    });
  }
  return entregaRepository.findAll({ sedeId: sedeEfectiva });
}

async function capturarHuella() {
  return biometricService.capturarHuella();
}

function crear(usuarioSesion, data) {
  permisoService.verificarDespacho(usuarioSesion);

  const { valido, errores } = validarEntrega(data);
  if (!valido) throw new ValidationError(errores.join(' '));

  const despacho = despachoRepository.findById(data.despacho_id);
  if (!despacho) throw new ValidationError('El despacho no existe.');
  permisoService.verificarPerteneceASede(usuarioSesion, despacho.sede_id);

  const yaExiste = entregaRepository.findByDespachoId(despacho.id);
  if (yaExiste) throw new ValidationError('Este despacho ya tiene una entrega registrada.');

  const orden = ordenRepository.findById(despacho.orden_id);
  const esMunicipioVereda = data.tipo_destino === 'MUNICIPIO_VEREDA' || orden?.tipo_destino === 'MUNICIPIO_VEREDA';
  const destinoDetalle = data.destino_detalle || orden?.destino_detalle || null;

  const receptorNombre = data.receptor_nombre?.trim() || (esMunicipioVereda ? `Salida a: ${destinoDetalle || 'Municipio / Vereda'}` : null);
  const receptorDocumento = data.receptor_documento?.trim() || (esMunicipioVereda ? 'EXENTO_ENVIO' : null);
  const receptorTelefono = data.receptor_telefono?.trim() || null;
  const receptorCorreo = data.receptor_correo?.trim() || null;
  const firma = data.firma_data || null;
  // HUELLA: sin lector real no hay verificación biométrica. Si el cliente declara
  // huella_registrada=true se acepta como "declaración manual pendiente de
  // verificación", NUNCA como evidencia biométrica. La auditoría lo registra así.
  const huella = Boolean(data.huella_registrada);
  const huellaOrigen = huella ? 'DECLARACION_MANUAL_SIN_LECTOR' : null;
  const docAdjuntoNombre = data.documento_adjunto_nombre || null;
  const docAdjuntoData = data.documento_adjunto_data || null;
  const docAdjuntoTipo = data.documento_adjunto_tipo || null;

  const elementosFaltantes = [];
  if (!esMunicipioVereda) {
    if (!receptorNombre) elementosFaltantes.push('RECEPTOR');
    if (!firma) elementosFaltantes.push('FIRMA');
    if (!huella) elementosFaltantes.push('HUELLA');
  }

  const documentacionCompleta = esMunicipioVereda || elementosFaltantes.length === 0;

  // Persistir/actualizar en el catalogo de receptores para reutilizacion futura de firma, huella y documento
  if (!esMunicipioVereda && receptorDocumento && receptorNombre) {
    try {
      receptorService.guardarOActualizar({
        documento: receptorDocumento,
        nombre: receptorNombre,
        telefono: receptorTelefono,
        correo_electronico: receptorCorreo,
        firma_guardada: firma,
        huella_guardada: huella ? 1 : 0,
        documento_adjunto_nombre: docAdjuntoNombre,
        documento_adjunto_data: docAdjuntoData,
        documento_adjunto_tipo: docAdjuntoTipo
      });
    } catch (err) {
      console.warn('[entregaService] Error no bloqueante al guardar receptor:', err.message);
    }
  }

  const entrega = entregaRepository.create({
    despacho_id: despacho.id,
    orden_id: despacho.orden_id,
    sede_id: despacho.sede_id,
    receptor_nombre: receptorNombre,
    receptor_documento: receptorDocumento,
    firma_data: firma,
    huella_registrada: huella ? 1 : 0,
    entregado_por: usuarioSesion.id,
    documentacion_completa: documentacionCompleta ? 1 : 0,
    elementos_faltantes: elementosFaltantes.length ? JSON.stringify(elementosFaltantes) : null,
    tipo_destino: esMunicipioVereda ? 'MUNICIPIO_VEREDA' : 'LOCAL',
    destino_detalle: destinoDetalle,
    documento_adjunto_nombre: docAdjuntoNombre,
    documento_adjunto_data: docAdjuntoData,
    documento_adjunto_tipo: docAdjuntoTipo
  });

  auditoriaRepository.registrar({
    usuario_id: usuarioSesion.id,
    rol: usuarioSesion.rol_nombre,
    sede_id: despacho.sede_id,
    accion: AUDIT_ACTIONS.CREAR_ENTREGA,
    modulo: 'ENTREGAS',
    registro_afectado: `entrega:${entrega.id}`,
    resultado: documentacionCompleta ? 'EXITO' : 'DOCUMENTACION_INCOMPLETA',
    valores_nuevos: { ...entrega, elementos_faltantes: elementosFaltantes }
  });

  if (huella) {
    auditoriaRepository.registrar({
      usuario_id: usuarioSesion.id,
      rol: usuarioSesion.rol_nombre,
      sede_id: despacho.sede_id,
      accion: AUDIT_ACTIONS.REGISTRAR_HUELLA,
      modulo: 'ENTREGAS',
      registro_afectado: `entrega:${entrega.id}`,
      resultado: 'EXITO',
      valores_nuevos: { origen: huellaOrigen, verificada_biometricamente: false }
    });
  }
  if (firma) {
    auditoriaRepository.registrar({
      usuario_id: usuarioSesion.id,
      rol: usuarioSesion.rol_nombre,
      sede_id: despacho.sede_id,
      accion: AUDIT_ACTIONS.REGISTRAR_FIRMA,
      modulo: 'ENTREGAS',
      registro_afectado: `entrega:${entrega.id}`,
      resultado: 'EXITO'
    });
  }

  return { ...entrega, elementos_faltantes: elementosFaltantes };
}

module.exports = { listar, crear, capturarHuella, ValidationError };
