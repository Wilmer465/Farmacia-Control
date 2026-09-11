const sedeRepository = require('../repositories/sedeRepository');

// Lista pública de sedes: se usa para que el SUPERADMIN (visión global)
// elija la sede activa sobre la cual realizar sus gestiones.
function listar() {
  return sedeRepository.findAll();
}

module.exports = { listar };
