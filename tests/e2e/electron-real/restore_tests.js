'use strict';

// Guiones que se ejecutan dentro del renderer real del arnés.

function crearScriptRestoreValido(token) {
  return `(async () => {
    const api = window.api;
    const h = window.__harness;
    const s = { session_token: ${JSON.stringify(token)} };
    const resumen = (r) => ({ ok: r && r.ok, error: r && r.error ? String(r.error) : null });

    const creado = await api.backups.crear(s, {});
    const nombre = creado && creado.ok ? creado.data.nombre : null;
    const marcado = await h.marcarSede('Sede Marcador 42');
    const antes = await h.contarSede('Sede Marcador 42');
    const restaurado = await api.backups.restaurar(s, nombre);
    const despues = await h.contarSede('Sede Marcador 42');
    const db = await h.dbInfo();
    return {
      creado: resumen(creado),
      nombre,
      marcado,
      antes,
      restaurado: resumen(restaurado),
      despues,
      db
    };
  })();`;
}

function crearScriptRestoreAjeno(token, nombreAjeno) {
  return `(async () => {
    const api = window.api;
    const s = { session_token: ${JSON.stringify(token)} };
    const resultado = await api.backups.restaurar(s, ${JSON.stringify(nombreAjeno)});
    return {
      ok: resultado && resultado.ok,
      error: resultado && resultado.error ? String(resultado.error) : null,
      data: resultado && resultado.data ? resultado.data : null
    };
  })();`;
}

module.exports = { crearScriptRestoreValido, crearScriptRestoreAjeno };
