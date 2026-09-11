const solicitudRepository = require('../repositories/solicitudEliminacionRepository');
const loteRepository = require('../repositories/loteRepository');
const auditoriaRepository = require('../repositories/auditoriaRepository');
const permisoService = require('./permisoService');
const { validarSolicitud, validarResolucion } = require('../validators/solicitudEliminacionValidator');
const { AUDIT_ACTIONS, ROLES } = require('../../shared/constants');

class ValidationError extends Error {}

function listar(usuarioSesion, filtros = {}) {
  const sedeEfectiva = permisoService.resolverSedeEfectiva(usuarioSesion, filtros.sedeId);
  return solicitudRepository.findAll({ sedeId: sedeEfectiva, estado: filtros.estado });
}

// Cualquiera con permiso de escritura de inventario puede solicitar eliminar un lote.
// Nunca se borra directo — sección 17.
function crear(usuarioSesion, data) {
  permisoService.verificarEscrituraInventario(usuarioSesion);

  const { valido, errores } = validarSolicitud(data);
  if (!valido) throw new ValidationError(errores.join(' '));

  const lote = loteRepository.findById(data.registro_id);
  if (!lote) throw new ValidationError('El lote no existe.');
  permisoService.verificarPerteneceASede(usuarioSesion, lote.sede_id);

  const solicitud = solicitudRepository.create({
    sede_id: lote.sede_id,
    usuario_solicitante_id: usuarioSesion.id,
    tipo_registro: 'LOTE',
    registro_id: lote.id,
    medicamento_id: lote.medicamento_id,
    motivo: data.motivo.trim()
  });

  auditoriaRepository.registrar({
    usuario_id: usuarioSesion.id,
    rol: usuarioSesion.rol_nombre,
    sede_id: lote.sede_id,
    accion: AUDIT_ACTIONS.SOLICITAR_ELIMINACION,
    modulo: 'ELIMINACIONES',
    registro_afectado: `lote:${lote.id}`,
    resultado: 'EXITO',
    valores_nuevos: solicitud
  });

  return solicitud;
}

// Solo SUPERADMIN resuelve. No puede aprobar su propia solicitud (sección 4).
function resolver(usuarioSesion, id, { decision, observacion }) {
  if (usuarioSesion.rol_nombre !== ROLES.SUPERADMIN) {
    throw new permisoService.PermisoError('Solo el Superadmin puede aprobar o rechazar solicitudes.');
  }

  const { valido, errores } = validarResolucion({ decision });
  if (!valido) throw new ValidationError(errores.join(' '));

  const solicitud = solicitudRepository.findById(id);
  if (!solicitud) throw new ValidationError('La solicitud no existe.');

  if (solicitud.estado !== 'PENDIENTE') {
    throw new ValidationError(`Esta solicitud ya fue resuelta (${solicitud.estado}).`);
  }

  const actualizada = solicitudRepository.resolver(id, {
    estado: decision,
    usuario_resolutor_id: usuarioSesion.id,
    observacion_resolucion: observacion?.trim() || null
  });

  if (decision === 'APROBADA' && solicitud.tipo_registro === 'LOTE') {
    // Se marca como DADO_DE_BAJA preservando integridad referencial
    loteRepository.setEstadoManual(solicitud.registro_id, 'DADO_DE_BAJA');
  }

  auditoriaRepository.registrar({
    usuario_id: usuarioSesion.id,
    rol: usuarioSesion.rol_nombre,
    sede_id: solicitud.sede_id,
    accion: decision === 'APROBADA' ? AUDIT_ACTIONS.APROBAR_ELIMINACION : AUDIT_ACTIONS.RECHAZAR_ELIMINACION,
    modulo: 'ELIMINACIONES',
    registro_afectado: `solicitud:${id}`,
    resultado: 'EXITO',
    valores_anteriores: { estado: 'PENDIENTE' },
    valores_nuevos: { estado: decision, observacion: observacion?.trim() || null }
  });

  return actualizada;
}

module.exports = { listar, crear, resolver, ValidationError };
