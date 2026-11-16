'use strict';

// Se ejecuta en una ventana que carga un origen HTTP local (no permitido por la
// política de producción). Comprueba que el preload existe pero el envoltorio IPC
// rechaza el origen antes de ejecutar cualquier handler.
module.exports = function crearScriptExterno(token) {
  return `(async () => {
    const s = { session_token: ${JSON.stringify(token)} };
    const resumen = (r) => ({
      ok: r && r.ok,
      error: r && r.error ? String(r.error) : null
    });
    return {
      url: location.href,
      apiTipo: typeof window.api,
      harnessTipo: typeof window.__harness,
      frameInfo: window.__harness ? await window.__harness.frameInfo() : null,
      sedes: window.api ? resumen(await window.api.sedes.listar(s)) : null,
      protegido: window.__harness ? resumen(await window.__harness.protegido()) : null
    };
  })();`;
};
