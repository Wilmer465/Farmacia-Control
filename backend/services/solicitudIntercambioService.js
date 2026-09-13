const { getDb } = require('../database/connection');
const solicitudRepository = require('../repositories/solicitudIntercambioRepository');
const loteRepository = require('../repositories/loteRepository');
const movimientoRepository = require('../repositories/movimientoRepository');
const medicamentoRepository = require('../repositories/medicamentoRepository');
const auditoriaRepository = require('../repositories/auditoriaRepository');
const permisoService = require('./permisoService');
const { validarSolicitudIntercambio, validarResolucionIntercambio } = require('../validators/solicitudIntercambioValidator');
const { AUDIT_ACTIONS, ROLES } = require('../../shared/constants');

class ValidationError extends Error {}

function listar(usuarioSesion, filtros = {}) {
  const sedeEfectiva = permisoService.resolverSedeEfectiva(usuarioSesion, filtros.sedeId);
  return solicitudRepository.findAll({ sedeId: sedeEfectiva, estado: filtros.estado });
}

function crear(usuarioSesion, data) {
  // Requisito: solo el superadmin y el administrador de la sede puede hacer la solicitud
  if (![ROLES.SUPERADMIN, ROLES.ADMIN].includes(usuarioSesion.rol_nombre)) {
    throw new permisoService.PermisoError('Solo el Superadmin y el Administrador de la sede pueden solicitar envíos o intercambios.');
  }

  const { valido, errores } = validarSolicitudIntercambio(data);
  if (!valido) throw new ValidationError(errores.join(' '));

  const lote = loteRepository.findById(data.lote_id);
  if (!lote) throw new ValidationError('El lote seleccionado no existe.');

  // Si es ADMIN, debe pertenecer a la sede de origen del lote
  if (usuarioSesion.rol_nombre === ROLES.ADMIN) {
    if (Number(usuarioSesion.sede_id) !== Number(lote.sede_id)) {
      throw new permisoService.PermisoError('El lote seleccionado no pertenece a su sede asignada.');
    }
  }

  const cantidadTotal = Number(data.cantidad_total_unidades);
  if (cantidadTotal > lote.cantidad_total_unidades) {
    throw new ValidationError(`Stock insuficiente en el lote (${lote.cantidad_total_unidades} unidades disponibles, solicitadas: ${cantidadTotal}).`);
  }

  const medicamento = medicamentoRepository.findById(lote.medicamento_id);
  const unidadesPorCaja = medicamento?.unidades_por_caja || 1;
  const cajas = Number(data.cantidad_cajas ?? Math.floor(cantidadTotal / unidadesPorCaja));
  const unidadesSueltas = Number(data.cantidad_unidades ?? (cantidadTotal % unidadesPorCaja));
  const esIntercambio = data.tipo === 'INTERCAMBIO';
  const loteRecibe = esIntercambio ? loteRepository.findById(data.lote_recibe_id) : null;
  const cantidadRecibeTotal = esIntercambio
    ? Number(data.cantidad_recibe_total_unidades ?? cantidadTotal)
    : null;

  if (esIntercambio) {
    if (!loteRecibe) throw new ValidationError('El lote del medicamento a recibir no existe.');
    if (Number(loteRecibe.sede_id) !== Number(data.sede_recibe_id)) {
      throw new ValidationError('El lote a recibir no pertenece a la sede seleccionada.');
    }
    if (Number(loteRecibe.sede_id) === Number(lote.sede_id)) {
      throw new ValidationError('La sede que entrega el medicamento recibido debe ser diferente a la sede de origen.');
    }
    if (cantidadRecibeTotal > loteRecibe.cantidad_total_unidades) {
      throw new ValidationError(`Stock insuficiente en el lote a recibir (${loteRecibe.cantidad_total_unidades} unidades disponibles, solicitadas: ${cantidadRecibeTotal}).`);
    }
  }

  const nuevaSolicitud = solicitudRepository.create({
    tipo: esIntercambio ? 'INTERCAMBIO' : 'ENVIO',
    sede_origen_id: lote.sede_id,
    sede_destino_id: Number(data.sede_destino_id),
    lote_id: lote.id,
    medicamento_id: lote.medicamento_id,
    cantidad_cajas: cajas,
    cantidad_unidades: unidadesSueltas,
    cantidad_total_unidades: cantidadTotal,
    sede_recibe_id: esIntercambio ? Number(data.sede_recibe_id) : null,
    lote_recibe_id: esIntercambio ? loteRecibe.id : null,
    medicamento_recibe_id: esIntercambio ? loteRecibe.medicamento_id : null,
    cantidad_recibe_total_unidades: esIntercambio ? cantidadRecibeTotal : null,
    motivo: data.motivo.trim(),
    usuario_solicitante_id: usuarioSesion.id
  });

  auditoriaRepository.registrar({
    usuario_id: usuarioSesion.id,
    rol: usuarioSesion.rol_nombre,
    sede_id: lote.sede_id,
    accion: AUDIT_ACTIONS.SOLICITAR_INTERCAMBIO,
    modulo: 'INTERCAMBIOS',
    registro_afectado: `solicitud:${nuevaSolicitud.id}`,
    resultado: 'EXITO',
    valores_nuevos: nuevaSolicitud
  });

  return nuevaSolicitud;
}

function resolver(usuarioSesion, id, { decision, observacion }) {
  if (![ROLES.SUPERADMIN, ROLES.ADMIN].includes(usuarioSesion.rol_nombre)) {
    throw new permisoService.PermisoError('Solo el Superadmin o el Administrador pueden resolver solicitudes de intercambio.');
  }

  const { valido, errores } = validarResolucionIntercambio({ decision, observacion });
  if (!valido) throw new ValidationError(errores.join(' '));

  const solicitud = solicitudRepository.findById(id);
  if (!solicitud) throw new ValidationError('La solicitud no existe.');

  if (solicitud.estado !== 'PENDIENTE') {
    throw new ValidationError(`Esta solicitud ya fue resuelta anteriormente (${solicitud.estado}).`);
  }

  // Regla de seguridad multi-sede: Si es ADMIN, debe pertenecer a la sede involucrada.
  // Además, para aprobar, el usuario que solicita no puede auto-aprobarse salvo que sea Superadmin.
  if (usuarioSesion.rol_nombre === ROLES.ADMIN) {
    if (Number(usuarioSesion.sede_id) !== Number(solicitud.sede_origen_id) &&
        Number(usuarioSesion.sede_id) !== Number(solicitud.sede_destino_id) &&
        Number(usuarioSesion.sede_id) !== Number(solicitud.sede_recibe_id)) {
      throw new permisoService.PermisoError('No tiene permisos para resolver solicitudes de sedes ajenas.');
    }

    if (decision === 'APROBADA' && usuarioSesion.id === solicitud.usuario_solicitante_id) {
      throw new permisoService.PermisoError('Por seguridad, una solicitud de traslado no puede ser auto-aprobada por el mismo usuario que la solicitó.');
    }
  }

  const db = getDb();

  if (decision === 'RECHAZADA') {
    const actualizada = solicitudRepository.resolver(id, {
      estado: 'RECHAZADA',
      usuario_resolutor_id: usuarioSesion.id,
      observacion_resolucion: observacion?.trim() || 'Rechazada'
    });

    auditoriaRepository.registrar({
      usuario_id: usuarioSesion.id,
      rol: usuarioSesion.rol_nombre,
      sede_id: solicitud.sede_origen_id,
      accion: AUDIT_ACTIONS.RECHAZAR_INTERCAMBIO,
      modulo: 'INTERCAMBIOS',
      registro_afectado: `solicitud:${id}`,
      resultado: 'EXITO',
      valores_anteriores: { estado: 'PENDIENTE' },
      valores_nuevos: { estado: 'RECHAZADA', observacion: observacion?.trim() }
    });

    return actualizada;
  }

  // Si decision === 'APROBADA': ejecutar traspaso físico de inventario en una transacción
  const tx = db.transaction(() => {
    const loteOrigen = loteRepository.findById(solicitud.lote_id);
    if (!loteOrigen) throw new ValidationError('El lote de origen ya no existe.');

    if (loteOrigen.cantidad_total_unidades < solicitud.cantidad_total_unidades) {
      throw new ValidationError(
        `No hay existencias suficientes en el lote de origen para completar el traslado (${loteOrigen.cantidad_total_unidades} disponibles, requeridas: ${solicitud.cantidad_total_unidades}).`
      );
    }

    const medicamento = medicamentoRepository.findById(solicitud.medicamento_id);
    const unidadesPorCaja = medicamento?.unidades_por_caja || 1;

    // 1. Descontar en lote de origen
    const nuevasUnidadesOrigen = loteOrigen.cantidad_total_unidades - solicitud.cantidad_total_unidades;
    const nuevasCajasOrigen = Math.floor(nuevasUnidadesOrigen / unidadesPorCaja);
    const nuevasSueltasOrigen = nuevasUnidadesOrigen % unidadesPorCaja;

    loteRepository.updateCantidades(loteOrigen.id, {
      cantidad_cajas: nuevasCajasOrigen,
      cantidad_unidades_sueltas: nuevasSueltasOrigen,
      cantidad_total_unidades: nuevasUnidadesOrigen
    });

    movimientoRepository.registrar({
      lote_id: loteOrigen.id,
      medicamento_id: loteOrigen.medicamento_id,
      sede_id: solicitud.sede_origen_id,
      tipo: 'TRASLADO_SALIDA',
      cantidad: -solicitud.cantidad_total_unidades,
      usuario_id: usuarioSesion.id
    });

    // 2. Aumentar o crear lote en sede de destino
    const loteDestinoExistente = loteRepository.findByClaveUnica(
      solicitud.medicamento_id,
      solicitud.sede_destino_id,
      loteOrigen.numero_lote
    );

    let loteDestinoId;

    if (loteDestinoExistente) {
      const nuevasUnidadesDest = loteDestinoExistente.cantidad_total_unidades + solicitud.cantidad_total_unidades;
      const nuevasCajasDest = Math.floor(nuevasUnidadesDest / unidadesPorCaja);
      const nuevasSueltasDest = nuevasUnidadesDest % unidadesPorCaja;

      loteRepository.updateCantidades(loteDestinoExistente.id, {
        cantidad_cajas: nuevasCajasDest,
        cantidad_unidades_sueltas: nuevasSueltasDest,
        cantidad_total_unidades: nuevasUnidadesDest
      });

      loteDestinoId = loteDestinoExistente.id;
    } else {
      const nuevoLoteDest = loteRepository.create({
        medicamento_id: solicitud.medicamento_id,
        sede_id: solicitud.sede_destino_id,
        numero_lote: loteOrigen.numero_lote,
        fecha_expedicion: loteOrigen.fecha_expedicion,
        fecha_vencimiento: loteOrigen.fecha_vencimiento,
        cantidad_cajas: solicitud.cantidad_cajas,
        cantidad_unidades_sueltas: solicitud.cantidad_unidades,
        cantidad_total_unidades: solicitud.cantidad_total_unidades
      });

      loteDestinoId = nuevoLoteDest.id;
    }

    movimientoRepository.registrar({
      lote_id: loteDestinoId,
      medicamento_id: solicitud.medicamento_id,
      sede_id: solicitud.sede_destino_id,
      tipo: 'TRASLADO_ENTRADA',
      cantidad: solicitud.cantidad_total_unidades,
      usuario_id: usuarioSesion.id
    });

    let loteRecibeDestinoId = null;
    if (solicitud.tipo === 'INTERCAMBIO') {
      const loteRecibe = loteRepository.findById(solicitud.lote_recibe_id);
      if (!loteRecibe) throw new ValidationError('El lote del medicamento a recibir ya no existe.');
      if (loteRecibe.cantidad_total_unidades < solicitud.cantidad_recibe_total_unidades) {
        throw new ValidationError(
          `No hay existencias suficientes del medicamento a recibir (${loteRecibe.cantidad_total_unidades} disponibles, requeridas: ${solicitud.cantidad_recibe_total_unidades}).`
        );
      }

      const medicamentoRecibe = medicamentoRepository.findById(solicitud.medicamento_recibe_id);
      const unidadesPorCajaRecibe = medicamentoRecibe?.unidades_por_caja || 1;
      const nuevasUnidadesRecibeOrigen = loteRecibe.cantidad_total_unidades - solicitud.cantidad_recibe_total_unidades;
      loteRepository.updateCantidades(loteRecibe.id, {
        cantidad_cajas: Math.floor(nuevasUnidadesRecibeOrigen / unidadesPorCajaRecibe),
        cantidad_unidades_sueltas: nuevasUnidadesRecibeOrigen % unidadesPorCajaRecibe,
        cantidad_total_unidades: nuevasUnidadesRecibeOrigen
      });

      movimientoRepository.registrar({
        lote_id: loteRecibe.id,
        medicamento_id: loteRecibe.medicamento_id,
        sede_id: loteRecibe.sede_id,
        tipo: 'TRASLADO_SALIDA',
        cantidad: -solicitud.cantidad_recibe_total_unidades,
        usuario_id: usuarioSesion.id
      });

      const loteRecibeDestino = loteRepository.findByClaveUnica(
        loteRecibe.medicamento_id,
        solicitud.sede_origen_id,
        loteRecibe.numero_lote
      );

      if (loteRecibeDestino) {
        const nuevasUnidades = loteRecibeDestino.cantidad_total_unidades + solicitud.cantidad_recibe_total_unidades;
        loteRepository.updateCantidades(loteRecibeDestino.id, {
          cantidad_cajas: Math.floor(nuevasUnidades / unidadesPorCajaRecibe),
          cantidad_unidades_sueltas: nuevasUnidades % unidadesPorCajaRecibe,
          cantidad_total_unidades: nuevasUnidades
        });
        loteRecibeDestinoId = loteRecibeDestino.id;
      } else {
        const nuevoLote = loteRepository.create({
          medicamento_id: loteRecibe.medicamento_id,
          sede_id: solicitud.sede_origen_id,
          numero_lote: loteRecibe.numero_lote,
          fecha_expedicion: loteRecibe.fecha_expedicion,
          fecha_vencimiento: loteRecibe.fecha_vencimiento,
          cantidad_cajas: Math.floor(solicitud.cantidad_recibe_total_unidades / unidadesPorCajaRecibe),
          cantidad_unidades_sueltas: solicitud.cantidad_recibe_total_unidades % unidadesPorCajaRecibe,
          cantidad_total_unidades: solicitud.cantidad_recibe_total_unidades
        });
        loteRecibeDestinoId = nuevoLote.id;
      }

      movimientoRepository.registrar({
        lote_id: loteRecibeDestinoId,
        medicamento_id: loteRecibe.medicamento_id,
        sede_id: solicitud.sede_origen_id,
        tipo: 'TRASLADO_ENTRADA',
        cantidad: solicitud.cantidad_recibe_total_unidades,
        usuario_id: usuarioSesion.id
      });
    }

    // 3. Marcar solicitud resuelta
    const resuelta = solicitudRepository.resolver(id, {
      estado: 'APROBADA',
      usuario_resolutor_id: usuarioSesion.id,
      observacion_resolucion: observacion?.trim() || 'Aprobada y transferida con éxito.'
    });

    auditoriaRepository.registrar({
      usuario_id: usuarioSesion.id,
      rol: usuarioSesion.rol_nombre,
      sede_id: solicitud.sede_origen_id,
      accion: AUDIT_ACTIONS.APROBAR_INTERCAMBIO,
      modulo: 'INTERCAMBIOS',
      registro_afectado: `solicitud:${id}`,
      resultado: 'EXITO',
      valores_anteriores: { estado: 'PENDIENTE' },
      valores_nuevos: {
        estado: 'APROBADA',
        lote_origen_id: loteOrigen.id,
        lote_destino_id: loteDestinoId,
        cantidad_transferida: solicitud.cantidad_total_unidades,
        lote_recibe_destino_id: loteRecibeDestinoId,
        cantidad_recibida: solicitud.cantidad_recibe_total_unidades
      }
    });

    return resuelta;
  });

  return tx();
}

module.exports = { listar, crear, resolver, ValidationError };
