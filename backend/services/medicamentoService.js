const medicamentoRepository = require('../repositories/medicamentoRepository');
const auditoriaRepository = require('../repositories/auditoriaRepository');
const permisoService = require('./permisoService');
const { validarMedicamento } = require('../validators/medicamentoValidator');
const { ESTADOS_REGISTRO, AUDIT_ACTIONS } = require('../../shared/constants');

function listar() {
  // El catálogo de medicamentos es global (no tiene sede) — cualquier rol autenticado puede leerlo.
  return medicamentoRepository.findAll();
}

function crear(usuarioSesion, data) {
  permisoService.verificarEscrituraInventario(usuarioSesion);

  const { valido, errores } = validarMedicamento(data);
  if (!valido) throw new ValidationError(errores.join(' '));

  const existente = medicamentoRepository.findByCodigo(data.codigo.trim());
  if (existente) throw new ValidationError('Ya existe un medicamento con ese código.');

  const payload = {
    codigo: data.codigo.trim(),
    nombre: data.nombre.trim(),
    principio_activo: data.principio_activo?.trim() || null,
    presentacion: data.presentacion?.trim() || null,
    concentracion: data.concentracion?.trim() || null,
    laboratorio: data.laboratorio?.trim() || null,
    unidad_medida: data.unidad_medida.trim(),
    unidades_por_caja: Number(data.unidades_por_caja),
    estado: ESTADOS_REGISTRO.ACTIVO
  };

  const creado = medicamentoRepository.create(payload);

  auditoriaRepository.registrar({
    usuario_id: usuarioSesion.id,
    rol: usuarioSesion.rol_nombre,
    sede_id: usuarioSesion.sede_id,
    accion: AUDIT_ACTIONS.CREAR_MEDICAMENTO ?? 'CREAR_MEDICAMENTO',
    modulo: 'INVENTARIO',
    registro_afectado: `medicamento:${creado.id}`,
    resultado: 'EXITO',
    valores_nuevos: creado
  });

  return creado;
}

function actualizar(usuarioSesion, id, data) {
  permisoService.verificarEscrituraInventario(usuarioSesion);

  const actual = medicamentoRepository.findById(id);
  if (!actual) throw new ValidationError('El medicamento no existe.');

  const { valido, errores } = validarMedicamento({ ...actual, ...data });
  if (!valido) throw new ValidationError(errores.join(' '));

  const payload = {
    nombre: data.nombre?.trim() ?? actual.nombre,
    principio_activo: data.principio_activo?.trim() ?? actual.principio_activo,
    presentacion: data.presentacion?.trim() ?? actual.presentacion,
    concentracion: data.concentracion?.trim() ?? actual.concentracion,
    laboratorio: data.laboratorio?.trim() ?? actual.laboratorio,
    unidad_medida: data.unidad_medida?.trim() ?? actual.unidad_medida,
    unidades_por_caja: data.unidades_por_caja ? Number(data.unidades_por_caja) : actual.unidades_por_caja,
    estado: data.estado ?? actual.estado
  };

  const actualizado = medicamentoRepository.update(id, payload);

  auditoriaRepository.registrar({
    usuario_id: usuarioSesion.id,
    rol: usuarioSesion.rol_nombre,
    sede_id: usuarioSesion.sede_id,
    accion: AUDIT_ACTIONS.MODIFICAR_MEDICAMENTO ?? 'MODIFICAR_MEDICAMENTO',
    modulo: 'INVENTARIO',
    registro_afectado: `medicamento:${id}`,
    resultado: 'EXITO',
    valores_anteriores: actual,
    valores_nuevos: actualizado
  });

  return actualizado;
}

class ValidationError extends Error {}

module.exports = { listar, crear, actualizar, ValidationError };
