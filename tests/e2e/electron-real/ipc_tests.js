'use strict';

// Se ejecuta DENTRO del renderer real (mundo principal) mediante
// webContents.executeJavaScript. No usa Node: solo `window.api`, `window.__harness`
// y APIs web. El token se inyecta desde el proceso main del arnés.
module.exports = function crearScriptIpc(token) {
  return `(async () => {
    const api = window.api;
    const h = window.__harness;
    const s = { session_token: ${JSON.stringify(token)} };
    const resumen = (r) => ({
      ok: r && r.ok,
      error: r && r.error ? String(r.error) : null,
      claves: r && r.data && typeof r.data === 'object' ? Object.keys(r.data).sort() : null
    });

    const out = {
      api: {
        existe: typeof api === 'object' && api !== null,
        congelada: Object.isFrozen(api),
        claves: Object.keys(api || {}).sort(),
        require: typeof require,
        process: typeof process,
        module: typeof module
      },
      framePrincipal: await h.frameInfo(),
      protegidoMainFrame: await h.protegido(),
      sedesMainFrame: resumen(await api.sedes.listar(s)),
      prefs: await h.prefs(),
      errores: {
        lanzadoConRuta: resumen(await h.errorRuta()),
        controladoConRuta: resumen(await h.errorControlado()),
        sqlite: resumen(await h.errorSqlite())
      }
    };

    const PDF = 'JVBERi0xLjcKMSAwIG9iago8PD4+CmVuZG9iagolJUVPRgo=';
    // PNG 1x1 real (RGBA), no solo la firma: permite comprobar que un archivo
    // decodificable por un visor también pasa la política.
    const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const SVG = 'PHN2Zz48c2NyaXB0PmFsZXJ0KDEpPC9zY3JpcHQ+PC9zdmc+';
    const cum = 'HARNESS-42-' + Date.now();
    const creado = await api.catalogoCum.crearManual(s, {
      cum,
      producto: 'Medicamento arnés 4.2',
      registro_sanitario: 'INVIMA 2026M-0042'
    });
    const docValido = await api.catalogoCum.adjuntarDocumento(s, creado.data.id, {
      documento_adjunto_nombre: 'formula.pdf',
      documento_adjunto_data: PDF,
      documento_adjunto_tipo: 'PDF'
    });
    const llamadasAntes = await h.shellCalls();
    const abierto = await api.catalogoCum.mostrarDocumento(s, creado.data.id);
    const llamadasDespues = await h.shellCalls();
    const obtenido = await api.catalogoCum.obtenerDocumento(s, creado.data.id);

    const cumImagen = 'HARNESS-IMG-42-' + Date.now();
    const creadoImagen = await api.catalogoCum.crearManual(s, {
      cum: cumImagen,
      producto: 'Imagen arnés 4.2',
      registro_sanitario: 'INVIMA 2026M-0043'
    });
    const adjuntoImagen = await api.catalogoCum.adjuntarDocumento(s, creadoImagen.data.id, {
      documento_adjunto_nombre: 'formula.png',
      documento_adjunto_data: PNG,
      documento_adjunto_tipo: 'IMAGEN'
    });
    const abiertoImagen = await api.catalogoCum.mostrarDocumento(s, creadoImagen.data.id);
    const llamadasImagen = await h.shellCalls();

    await h.inyectarDocumento(creado.data.id, {
      documento_adjunto_nombre: '../evil.pdf',
      documento_adjunto_data: SVG,
      documento_adjunto_tipo: 'PDF'
    });
    const abiertoTrampa = await api.catalogoCum.mostrarDocumento(s, creado.data.id);
    const llamadasTrasTrampa = await h.shellCalls();

    const restauracionesInvalidas = {};
    for (const [caso, nombre] of Object.entries({
      absoluta: 'C:\\\\Users\\\\USER-D\\\\secreto\\\\farmacia.db',
      traversal: '..\\\\farmacia.db',
      patronAjeno: 'copia_manual.db',
      inexistente: 'farmacia_backup_global_20200101_000000.db',
      noString: 123,
      vacio: ''
    })) {
      restauracionesInvalidas[caso] = resumen(await api.backups.restaurar(s, nombre));
    }

    out.documentos = {
      creado: resumen(creado),
      adjuntoValido: resumen(docValido),
      mostrar: resumen(abierto),
      llamadasShellAntes: llamadasAntes,
      llamadasShellDespues: llamadasDespues,
      rutaTemporal: Array.isArray(llamadasDespues) ? llamadasDespues[llamadasDespues.length - 1] || null : null,
      obtenido: {
        ...resumen(obtenido),
        contieneRuta: obtenido && obtenido.ok
          ? /(?:[A-Za-z]:\\\\|\\\\\\\\|\\/Users\\/|\\/tmp\\/|farmacia-doc-)/.test(JSON.stringify(obtenido.data))
          : null
      },
      trampaMostrar: resumen(abiertoTrampa),
      llamadasShellTrasTrampa: llamadasTrasTrampa
    };
    out.documentos.imagen = {
      creado: resumen(creadoImagen),
      adjunto: resumen(adjuntoImagen),
      mostrar: resumen(abiertoImagen),
      rutaTemporal: Array.isArray(llamadasImagen) ? llamadasImagen[llamadasImagen.length - 1] || null : null
    };
    out.restauracionesInvalidas = restauracionesInvalidas;
    return out;
  })();`;
};
