const solicitudRepository = require('../repositories/solicitudEliminacionRepository');
const loteRepository = require('../repositories/loteRepository');
const auditoriaRepository = require('../repositories/auditoriaRepository');
const permisoService = require('./permisoService');
const { getDb } = require('../database/connection');
const { validarSolicitud, validarResolucion } = require('../validators/solicitudEliminacionValidator');
const { AUDIT_ACTIONS } = require('../../shared/constants');

class ValidationError extends Error {}

const MENSAJE_SOLICITUD_DUPLICADA = 'Ya existe una solicitud de baja PENDIENTE para este registro.';

// El índice único parcial idx_solicitudes_elim_pendiente (migración 024) salta con
// esta forma de error. Se traduce al mismo mensaje de negocio que da la
// comprobación previa: la protección de la UI no depende de cuál de las dos venció.
function esViolacionDeDuplicado(err) {
  const code = err?.code || '';
  const mensaje = String(err?.message || '');
  return code === 'SQLITE_CONSTRAINT_UNIQUE'
    || code === 'SQLITE_CONSTRAINT_PRIMARYKEY'
    || mensaje.includes('idx_solicitudes_elim_pendiente')
    || /UNIQUE constraint failed: solicitudes_eliminacion/i.test(mensaje);
}

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

  const db = getDb();

  // El INSERT y la auditoría van en la misma transacción: antes, si la auditoría
  // fallaba la solicitud quedaba creada y el usuario veía "Error interno", de modo
  // que al reintentar se duplicaba. Además se comprueba el duplicado DENTRO de esa
  // transacción, para que la comprobación y el INSERT no puedan separarse.
  const tx = db.transaction(() => {
    if (solicitudRepository.existePendiente({ tipoRegistro: 'LOTE', registroId: lote.id })) {
      throw new ValidationError(MENSAJE_SOLICITUD_DUPLICADA);
    }

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
  });

  try {
    return tx();
  } catch (err) {
    // El índice único es la garantía real: si otra petición se coló entre la
    // comprobación y el INSERT, esto la traduce al mismo mensaje de negocio.
    if (err instanceof ValidationError) throw err;
    if (esViolacionDeDuplicado(err)) throw new ValidationError(MENSAJE_SOLICITUD_DUPLICADA);
    throw err;
  }
}

// SUPERADMIN resuelve en cualquier sede; ADMIN solo en la suya (verificado en
// permisoService). Nadie puede aprobar su propia solicitud (sección 4).
function resolver(usuarioSesion, id, { decision, observacion }) {
  const { valido, errores } = validarResolucion({ decision });
  if (!valido) throw new ValidationError(errores.join(' '));

  const solicitud = solicitudRepository.findById(id);
  if (!solicitud) throw new ValidationError('La solicitud no existe.');

  permisoService.verificarResolucionEliminacion(usuarioSesion, solicitud);

  if (solicitud.estado !== 'PENDIENTE') {
    throw new ValidationError(`Esta solicitud ya fue resuelta (${solicitud.estado}).`);
  }

  if (decision === 'APROBADA' && Number(solicitud.usuario_solicitante_id) === Number(usuarioSesion.id)) {
    throw new permisoService.PermisoError('Por seguridad, no puede aprobar su propia solicitud de eliminación.');
  }

  const db = getDb();

  // Resolución, efecto sobre el lote y auditoría en una sola transacción: no puede
  // quedar una solicitud APROBADA cuyo lote sigue vigente, ni al revés.
  const tx = db.transaction(() => {
    const actualizada = solicitudRepository.resolver(id, {
      estado: decision,
      usuario_resolutor_id: usuarioSesion.id,
      observacion_resolucion: observacion?.trim() || null
    });

    if (decision === 'APROBADA' && solicitud.tipo_registro === 'LOTE') {
      // Se marca como DADO_DE_BAJA preservando integridad referencial, dejando
      // constancia de por qué y de quién (columnas baja_*, migración 024).
      loteRepository.marcarLoteDeBaja(solicitud.registro_id, {
        motivo: solicitud.motivo,
        usuarioId: usuarioSesion.id
      });
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
  });

  return tx();
}

module.exports = { listar, crear, resolver, ValidationError };
