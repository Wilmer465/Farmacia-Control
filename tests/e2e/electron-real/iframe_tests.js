'use strict';

// Igual que ipc_tests.js, pero se ejecuta en una ventana con
// nodeIntegrationInSubFrames=true (el peor caso: el iframe SÍ recibe preload).
// Así se demuestra que el rechazo no depende de que el iframe no tenga preload.
module.exports = function crearScriptIframe(token) {
  return `(async () => {
    const s = { session_token: ${JSON.stringify(token)} };
    const iframe = document.createElement('iframe');
    iframe.id = 'iframe-arnes-42';
    iframe.srcdoc = '<!doctype html><html><body>iframe arnés</body></html>';
    document.body.appendChild(iframe);
    await new Promise((resolve) => {
      iframe.addEventListener('load', resolve, { once: true });
      setTimeout(resolve, 3000);
    });

    const w = iframe.contentWindow;
    const resumen = (r) => ({
      ok: r && r.ok,
      error: r && r.error ? String(r.error) : null
    });
    let frameInfo = null;
    let protegido = null;
    let sedes = null;
    let errorRuta = null;
    let apiTipo = typeof w.api;
    let harnessTipo = typeof w.__harness;
    if (w.__harness) {
      frameInfo = await w.__harness.frameInfo();
      protegido = resumen(await w.__harness.protegido());
      errorRuta = resumen(await w.__harness.errorRuta());
    }
    if (w.api) {
      try {
        sedes = resumen(await w.api.sedes.listar(s));
      } catch (e) {
        sedes = { ok: false, error: 'excepcion:' + e.message };
      }
    }
    return {
      apiTipo,
      harnessTipo,
      frameInfo,
      protegido,
      sedes,
      errorRuta,
      urlIframe: (() => { try { return w.location.href; } catch (e) { return 'inaccesible:' + e.message; } })()
    };
  })();`;
};
