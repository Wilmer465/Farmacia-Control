const loteRepository = require('../repositories/loteRepository');
const medicamentoRepository = require('../repositories/medicamentoRepository');
const auditoriaRepository = require('../repositories/auditoriaRepository');
const permisoService = require('./permisoService');
const { validarLote } = require('../validators/loteValidator');
const { AUDIT_ACTIONS } = require('../../shared/constants');

const DIAS_ALERTA_VENCIMIENTO = 90;

class ValidationError extends Error {}

function calcularTotalUnidades(cajas, sueltas, unidadesPorCaja) {
  return cajas * unidadesPorCaja + sueltas;
}

// Estado derivado — nunca se confía en un valor guardado que pueda desactualizarse.
// Orden de prioridad: AGOTADO > VENCIDO > PROXIMO_VENCER > DISPONIBLE.
function calcularEstado(lote) {
  if (lote.estado_manual === 'DADO_DE_BAJA' || lote.cantidad_total_unidades <= 0) return 'AGOTADO';

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const vencimiento = new Date(lote.fecha_vencimiento);
  const diffDias = Math.floor((vencimiento - hoy) / (1000 * 60 * 60 * 24));

  if (diffDias < 0) return 'VENCIDO';
  if (diffDias <= DIAS_ALERTA_VENCIMIENTO) return 'PROXIMO_VENCER';
  return 'DISPONIBLE';
}

function conEstadoCalculado(lote) {
  return { ...lote, estado: calcularEstado(lote) };
}

function listar(usuarioSesion, { sedeId, medicamentoId, limit, offset } = {}) {
  const sedeEfectiva = permisoService.resolverSedeEfectiva(usuarioSesion, sedeId);
  const lotes = loteRepository.findAll({ sedeId: sedeEfectiva, medicamentoId, limit, offset });
  return lotes.map(conEstadoCalculado);
}

function crear(usuarioSesion, data) {
  permisoService.verificarEscrituraInventario(usuarioSesion);

  // La sede del lote SIEMPRE es la del usuario si no tiene visión global,
  // sin importar qué sede_id venga del formulario — evita que INVENTARIO cargue stock a otra sede.
  const sedeId = permisoService.resolverSedeEfectiva(usuarioSesion, data.sede_id) ?? data.sede_id;

  const medicamento = medicamentoRepository.findById(data.medicamento_id);
  if (!medicamento) throw new ValidationError('El medicamento no existe.');

  // Entrada por unidades netas
  const total = Number(data.cantidad_unidades ?? data.cantidad_total_unidades ?? (Number(data.cantidad_cajas || 0) * (medicamento.unidades_por_caja || 1) + Number(data.cantidad_unidades_sueltas || 0)));
  const cajas = Number(data.cantidad_cajas ?? 0);
  const sueltas = total;

  const payload = {
    medicamento_id: data.medicamento_id,
    sede_id: sedeId,
    numero_lote: data.numero_lote?.trim(),
    fecha_expedicion: data.fecha_expedicion,
    fecha_vencimiento: data.fecha_vencimiento,
    cantidad_cajas: cajas,
    cantidad_unidades_sueltas: sueltas,
    cantidad_total_unidades: total
  };

  const { valido, errores } = validarLote(payload);
  if (!valido) throw new ValidationError(errores.join(' '));

  let creado;
  try {
    creado = loteRepository.crearConMovimiento(payload, usuarioSesion.id);
  } catch (err) {
    if (err.message === 'DUPLICATE_LOTE') {
      throw new ValidationError('Ya existe un lote con ese número para este medicamento y sede.');
    }
    throw err;
  }

  auditoriaRepository.registrar({
    usuario_id: usuarioSesion.id,
    rol: usuarioSesion.rol_nombre,
    sede_id: sedeId,
    accion: AUDIT_ACTIONS.CREAR_LOTE,
    modulo: 'INVENTARIO',
    registro_afectado: `lote:${creado.id}`,
    resultado: 'EXITO',
    valores_nuevos: creado
  });

  return conEstadoCalculado(creado);
}

// Ajuste manual de cantidades de un lote existente (ej. conteo físico). No confundir con
// salidas por orden, que se implementan en Fase 3 con su propia transacción atómica.
function ajustarCantidades(usuarioSesion, loteId, { cantidad_cajas, cantidad_unidades_sueltas, motivo }) {
  permisoService.verificarEscrituraInventario(usuarioSesion);

  const lote = loteRepository.findById(loteId);
  if (!lote) throw new ValidationError('El lote no existe.');
  permisoService.verificarPerteneceASede(usuarioSesion, lote.sede_id);

  const cajas = Number(cantidad_cajas);
  const sueltas = Number(cantidad_unidades_sueltas);
  if (!Number.isInteger(cajas) || cajas < 0 || !Number.isInteger(sueltas) || sueltas < 0) {
    throw new ValidationError('Las cantidades deben ser enteros mayores o iguales a 0.');
  }
  if (!motivo || !motivo.trim()) {
    throw new ValidationError('Debe indicar el motivo del ajuste.');
  }

  const total = calcularTotalUnidades(cajas, sueltas, lote.unidades_por_caja);
  const actualizado = loteRepository.ajustarConMovimiento(loteId, {
    cantidad_cajas: cajas,
    cantidad_unidades_sueltas: sueltas,
    cantidad_total_unidades: total
  }, usuarioSesion.id);

  auditoriaRepository.registrar({
    usuario_id: usuarioSesion.id,
    rol: usuarioSesion.rol_nombre,
    sede_id: lote.sede_id,
    accion: AUDIT_ACTIONS.AJUSTAR_LOTE,
    modulo: 'INVENTARIO',
    registro_afectado: `lote:${loteId}`,
    resultado: 'EXITO',
    valores_anteriores: {
      cantidad_cajas: lote.cantidad_cajas,
      cantidad_unidades_sueltas: lote.cantidad_unidades_sueltas,
      cantidad_total_unidades: lote.cantidad_total_unidades
    },
    valores_nuevos: {
      cantidad_cajas: cajas,
      cantidad_unidades_sueltas: sueltas,
      cantidad_total_unidades: total,
      motivo: motivo.trim()
    }
  });

  return conEstadoCalculado(actualizado);
}

module.exports = { listar, crear, ajustarCantidades, calcularEstado, ValidationError };
