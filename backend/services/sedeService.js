const sedeRepository = require('../repositories/sedeRepository');
const auditoriaRepository = require('../repositories/auditoriaRepository');
const { AUDIT_ACTIONS, ROLES } = require('../../shared/constants');

class SedeError extends Error {}

// Solo el SUPERADMIN puede crear sedes: es la única operación que modifica la
// lista del selector global del SUPERADMIN y la fuente de sedes para todos los
// usuarios. Un ADMIN o INVENTARIO no debe poder dar de alta una sede ajena.
function verificarAccesoCreacionSede (usuarioSesion) {
  if (!usuarioSesion) {
    throw new SedeError('Sesión requerida.');
  }
  const rol = usuarioSesion.rol_nombre || usuarioSesion.rolNombre;
  if (rol !== ROLES.SUPERADMIN) {
    throw new SedeError('Acceso denegado: solo el Superadministrador puede crear sedes.');
  }
}

// Lista pública de sedes: se usa para que el SUPERADMIN (visión global)
// elija la sede activa sobre la cual realizar sus gestiones.
function listar () {
  return sedeRepository.findAll();
}

function crear (usuarioSesion, datos) {
  verificarAccesoCreacionSede (usuarioSesion);
  const { nombre, ciudad } = datos || {};

  if (!nombre || !nombre.trim()) {
    throw new SedeError('El nombre de la sede es obligatorio.');
  }

  const nombreLimpio = nombre.trim();
  if (nombreLimpio.length > 120) {
    throw new SedeError('El nombre de la sede no puede superar 120 caracteres.');
  }

  // Ciudad opcional, pero si se provee debe ser razonable.
  let ciudadLimpia = null;
  if (ciudad && String(ciudad).trim()) {
    ciudadLimpia = String(ciudad).trim();
    if (ciudadLimpia.length > 120) {
      throw new SedeError('La ciudad no puede superar 120 caracteres.');
    }
  }

  const existente = sedeRepository.findAll().find(
    (s) => String(s.nombre || '').toLowerCase() === nombreLimpio.toLowerCase()
  );
  if (existente) {
    throw new SedeError(`Ya existe una sede con el nombre '${nombreLimpio}'.`);
  }

  const creada = sedeRepository.crear({ nombre: nombreLimpio, ciudad: ciudadLimpia });

  auditoriaRepository.registrar({
    usuario_id: usuarioSesion.id ?? null,
    rol: usuarioSesion.rol_nombre || usuarioSesion.rolNombre || null,
    sede_id: usuarioSesion.sede_id ?? null,
    accion: AUDIT_ACTIONS.CREAR_SEDE,
    modulo: 'SEDES',
    registro_afectado: `sede:${creada.id}`,
    resultado: 'EXITO',
    valores_nuevos: { id: creada.id, nombre: creada.nombre, ciudad: creada.ciudad }
  });

  return creada;
}

function eliminar (usuarioSesion, id) {
  verificarAccesoCreacionSede (usuarioSesion);

  const sedeId = Number(id);
  if (!Number.isInteger(sedeId) || sedeId <= 0) {
    throw new SedeError('Sede no encontrada.');
  }

  const sede = sedeRepository.findById(sedeId);
  if (!sede) {
    throw new SedeError('Sede no encontrada.');
  }

  const refs = sedeRepository.contarReferencias(sedeId);
  if (refs.length) {
    const detalle = refs.map((r) => `${r.tabla} (${r.cantidad})`).join(', ');
    throw new SedeError(`No se puede eliminar la sede '${sede.nombre}' porque tiene registros asociados: ${detalle}. Reasigne o gestione esos registros primero.`);
  }

  const ok = sedeRepository.eliminar(sedeId);
  if (!ok) {
    throw new SedeError('No se pudo eliminar la sede.');
  }

  auditoriaRepository.registrar({
    usuario_id: usuarioSesion.id ?? null,
    rol: usuarioSesion.rol_nombre || usuarioSesion.rolNombre || null,
    sede_id: usuarioSesion.sede_id ?? null,
    accion: AUDIT_ACTIONS.ELIMINAR_SEDE,
    modulo: 'SEDES',
    registro_afectado: `sede:${sedeId}`,
    resultado: 'EXITO',
    valores_anteriores: { id: sede.id, nombre: sede.nombre, ciudad: sede.ciudad, estado: sede.estado }
  });

  return { id: sedeId, nombre: sede.nombre };
}

module.exports = { SedeError, listar, crear, eliminar };