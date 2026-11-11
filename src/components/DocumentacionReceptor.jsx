import React, { useState, useEffect, useRef } from 'react';
import SignaturePad from './SignaturePad.jsx';
import { inventarioApi } from '../services/inventarioApi.js';

const ETIQUETAS_DIAGNOSTICO = Object.freeze({
  prerrequisitos_verificados: 'Prerrequisitos de archivo verificados',
  incompatibilidad_confirmada: 'Incompatibilidad confirmada',
  archivo_faltante: 'Faltan archivos',
  error_inspeccion: 'Error al inspeccionar archivos',
  diagnostico_incompleto: 'Diagnóstico incompleto',
  prerrequisito_verificado: 'Verificado',
  incompatible: 'Incompatible'
});

function BloqueEstadoPuente({ titulo, datos }) {
  if (!datos) return null;
  const checks = datos.prerrequisitos?.checks || [];
  const estados = [...new Set(checks.map((item) => item.estado))];
  const estado = datos.prerrequisitos?.estado || datos.estado || 'diagnostico_incompleto';
  return (
    <section className="bloque-biometrico" aria-label={`Diagnóstico ${titulo}`}>
      <strong>{titulo}: {ETIQUETAS_DIAGNOSTICO[estado] || estado}</strong>
      <ul>
        {checks.map((item, index) => (
          <li key={`${item.codigo || item.estado}-${index}`}>
            {item.mensaje}
            {item.ruta ? ` Ruta comprobada: ${item.ruta}.` : ''}
            {item.faltantes?.length ? ` Símbolos ausentes: ${item.faltantes.join(', ')}.` : ''}
          </li>
        ))}
      </ul>
      {datos.binding && (
        <p role="alert"><strong>Bloqueo independiente del puente:</strong> {datos.binding.mensaje}</p>
      )}
      {datos.exports?.mensaje && <p>{datos.exports.mensaje}{datos.exports.ruta ? ` Ruta comprobada: ${datos.exports.ruta}.` : ''}</p>}
      {datos.exports?.faltantes?.length > 0 && (
        <p>Exports requeridos ausentes: {datos.exports.faltantes.join(', ')}.</p>
      )}
      {datos.exports?.invalidos?.length > 0 && (
        <p>Exports inválidos: {datos.exports.invalidos.map((item) => `${item.nombre} (${item.motivo})`).join(', ')}.</p>
      )}
      {datos.exports?.reenviados?.length > 0 && (
        <p>Exports reenviados cuyo destino no fue validado: {datos.exports.reenviados.map((item) => `${item.nombre} → ${item.destino}`).join(', ')}.</p>
      )}
      {datos.version?.fileVersion && <p>FileVersion observada: {datos.version.fileVersion}</p>}
      {datos.version?.motivo && <p>{datos.version.motivo}</p>}
      {datos.imports?.limitaciones?.map((limitacion) => (
        <p key={limitacion.codigo}>{limitacion.mensaje}</p>
      ))}
      {datos.instrucciones?.map((instruccion) => (
        <p key={instruccion.url}>
          <a href={instruccion.url} target="_blank" rel="noreferrer">{instruccion.texto}</a>
        </p>
      ))}
      <p className="page-scope">Estado del dispositivo: no probado.</p>
      <span className="sr-only">Estados revisados: {estados.join(', ') || 'ninguno'}.</span>
    </section>
  );
}

// Captura la documentación de quien recibe: identificación, nombre, teléfono,
// correo, documento adjunto, firma digital y huella. Si la persona ya está
// registrada en el catálogo de receptores, autocompleta todos los campos.
export default function DocumentacionReceptor({ exenta, onChange, valoresIniciales, usuarioSesion = null }) {
  const [nombre, setNombre] = useState(valoresIniciales?.nombre || '');
  const [documento, setDocumento] = useState(valoresIniciales?.documento || '');
  const [telefono, setTelefono] = useState(valoresIniciales?.telefono || '');
  const [correo, setCorreo] = useState(valoresIniciales?.correo || '');
  const [firma, setFirma] = useState(valoresIniciales?.firma || null);
  const [huella, setHuella] = useState(false);
  const [capturandoHuella, setCapturandoHuella] = useState(false);
  const [errorHuella, setErrorHuella] = useState(null);
  const [diagnosticoPuentes, setDiagnosticoPuentes] = useState(null);
  const [errorDiagnosticoPuentes, setErrorDiagnosticoPuentes] = useState(null);
  const [consultandoDiagnosticoPuentes, setConsultandoDiagnosticoPuentes] = useState(false);
  const [adjunto, setAdjunto] = useState(valoresIniciales?.adjunto || null); // { nombre, data, tipo }

  const [receptorGuardado, setReceptorGuardado] = useState(null);
  const [usarFirmaGuardada, setUsarFirmaGuardada] = useState(false);
  const [buscandoReceptor, setBuscandoReceptor] = useState(false);

  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  useEffect(() => {
    let vigente = true;
    if (exenta) {
      setDiagnosticoPuentes(null);
      setErrorDiagnosticoPuentes(null);
      return undefined;
    }
    setConsultandoDiagnosticoPuentes(true);
    setDiagnosticoPuentes(null);
    setErrorDiagnosticoPuentes(null);
    inventarioApi.puentes.verificarPrerrequisitos()
      .then((res) => {
        if (!vigente) return;
        if (res?.ok && res.data) {
          setDiagnosticoPuentes(res.data);
          setErrorDiagnosticoPuentes(null);
        } else {
          setDiagnosticoPuentes(null);
          setErrorDiagnosticoPuentes(res?.error || 'No se pudo consultar el diagnóstico estático.');
        }
      })
      .catch(() => {
        if (vigente) {
          setDiagnosticoPuentes(null);
          setErrorDiagnosticoPuentes('No se pudo consultar el diagnóstico estático.');
        }
      })
      .finally(() => {
        if (vigente) setConsultandoDiagnosticoPuentes(false);
      });
    return () => { vigente = false; };
  }, [exenta]);

  async function handleRevisarPrerrequisitosPuentes() {
    setConsultandoDiagnosticoPuentes(true);
    setErrorDiagnosticoPuentes(null);
    setDiagnosticoPuentes(null);
    try {
      const res = await inventarioApi.puentes.verificarPrerrequisitos();
      if (res?.ok && res.data) setDiagnosticoPuentes(res.data);
      else {
        setDiagnosticoPuentes(null);
        setErrorDiagnosticoPuentes(res?.error || 'No se pudo consultar el diagnóstico estático.');
      }
    } catch {
      setDiagnosticoPuentes(null);
      setErrorDiagnosticoPuentes('No se pudo consultar el diagnóstico estático.');
    } finally {
      setConsultandoDiagnosticoPuentes(false);
    }
  }

  // Notificar cambios al formulario padre
  useEffect(() => {
    onChangeRef.current({
      nombre,
      documento,
      telefono,
      correo,
      firma,
      huella,
      adjunto,
      completada: Boolean(nombre.trim() && documento.trim() && (exenta || (firma && huella)))
    });
  }, [nombre, documento, telefono, correo, firma, huella, adjunto, exenta]);

  // Para envíos a municipio/vereda la firma y la huella quedan pendientes.
  useEffect(() => {
    if (exenta) {
      setFirma(null);
      setHuella(false);
      setErrorHuella(null);
      setUsarFirmaGuardada(false);
    }
  }, [exenta]);

  // Buscar si la persona ya existe cuando escribe la cédula
  useEffect(() => {
    const docLimpio = documento.trim();
    if (!docLimpio || docLimpio.length < 4) {
      setReceptorGuardado(null);
      setUsarFirmaGuardada(false);
      return;
    }

    const timer = setTimeout(async () => {
      setBuscandoReceptor(true);
      try {
        const res = await inventarioApi.receptores.buscar(docLimpio);
        if (res.ok && res.data) {
          setReceptorGuardado(res.data);
          setNombre((prev) => prev || res.data.nombre || '');
          setTelefono((prev) => prev || res.data.telefono || '');
          setCorreo((prev) => prev || res.data.correo_electronico || '');
          if (!exenta) {
            if (res.data.firma_guardada) {
              setUsarFirmaGuardada(true);
              setFirma(res.data.firma_guardada);
            } else {
              setUsarFirmaGuardada(false);
              setFirma(null);
            }
            // El dato legado del receptor no es una coincidencia biométrica.
            setHuella(false);
          }
          if (res.data.documento_adjunto_data) {
            setAdjunto((prev) => prev || {
              nombre: res.data.documento_adjunto_nombre || 'Documento_identidad.pdf',
              data: res.data.documento_adjunto_data,
              tipo: res.data.documento_adjunto_tipo || 'IMAGEN'
            });
          }
        } else {
          setReceptorGuardado(null);
          setUsarFirmaGuardada(false);
          if (!exenta) {
            setFirma(null);
            setHuella(false);
          }
        }
      } catch (err) {
        console.error('Error buscando receptor:', err);
      } finally {
        setBuscandoReceptor(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [documento, exenta]);

  async function handleCapturarHuella() {
    if (capturandoHuella) return;
    setCapturandoHuella(true);
    setErrorHuella(null);
    // [TMP-DIAG] logging temporal de diagnóstico (Renderer, nivel info).
    console.log('[Renderer] capturarHuella: sesion ' + (usuarioSesion ? 'presente' : 'AUSENTE'));
    try {
      const res = await inventarioApi.entregas.capturarHuella(usuarioSesion);
      console.log('[Renderer] capturarHuella respuesta IPC: ok=' + Boolean(res && res.ok) +
        ' capturada=' + Boolean(res && res.data && res.data.capturada));
      if (res && res.ok && res.data && res.data.capturada && res.data.verificada === true) {
        setHuella(true);
      } else {
        setHuella(false);
        setErrorHuella((res && res.data && res.data.mensaje) || (res && res.error) || 'Captura recibida, pero la identidad no fue verificada.');
      }
    } catch (err) {
      console.log('[Renderer] capturarHuella excepción IPC:', err && err.message);
      setErrorHuella('No se pudo capturar la huella.');
    } finally {
      setCapturandoHuella(false);
    }
  }

  function handleCargarArchivo(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      alert('El archivo no debe superar 5MB.');
      return;
    }

    const esPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    const reader = new FileReader();
    reader.onload = () => {
      setAdjunto({
        nombre: file.name,
        data: reader.result,
        tipo: esPdf ? 'PDF' : 'IMAGEN'
      });
    };
    reader.readAsDataURL(file);
  }

  const faltantes = [];
  if (!nombre.trim()) faltantes.push('nombre del receptor');
  if (!documento.trim()) faltantes.push('documento de identidad');
  if (!exenta) {
    if (!firma) faltantes.push('firma digital');
    if (!huella) faltantes.push('huella dactilar');
  }

  return (
    <div className="documento-receptor">
      <label className="form-label form-label--titulo">
         Documentación de quien recibe (obligatoria)
      </label>
      {exenta ? (
        <div className="aviso-receptor aviso-receptor--informativo">
           Envío a municipio/vereda: registre la identidad de quien recibe. La <strong>firma</strong> y la <strong>huella</strong> quedarán <strong>pendientes</strong>.
        </div>
      ) : (
        <p className="aviso-receptor">
          Si la persona ya está registrada, al escribir su identificación se llenarán automáticamente sus datos, firma y huella.
        </p>
      )}

      {!exenta && (
        <section className="aviso-receptor aviso-receptor--informativo" aria-label="Prerrequisitos de dispositivos">
          <strong>Diagnóstico estático de prerrequisitos</strong>
          <p>Revisa archivos, versiones, arquitectura y exports. No carga DLL, no ejecuta puentes y no prueba los dispositivos.</p>
          <button type="button" className="filter-chip filter-chip--compacto" onClick={handleRevisarPrerrequisitosPuentes} disabled={consultandoDiagnosticoPuentes}>
            {consultandoDiagnosticoPuentes ? 'Revisando archivos...' : 'Volver a revisar'}
          </button>
          {errorDiagnosticoPuentes && <p role="alert">{errorDiagnosticoPuentes}</p>}
          {diagnosticoPuentes && (
            <>
              <BloqueEstadoPuente titulo="Wacom STU-540" datos={diagnosticoPuentes.wacom} />
              <BloqueEstadoPuente titulo="ZKTeco ZK-9500" datos={diagnosticoPuentes.zkteco} />
              <p><strong>Dispositivo: no probado.</strong> La presencia de prerrequisitos no demuestra detección ni captura funcional.</p>
            </>
          )}
        </section>
      )}

      <div className="form-grid">
        <div>
          <label>Documento de identificación (C.C. / T.I.)</label>
          <div className="campo-con-estado">
            <input
              placeholder="Número de cédula..."
              value={documento}
              onChange={(e) => setDocumento(e.target.value)}
              required
            />
            {buscandoReceptor && (
              <span className="estado-busqueda">
                 Buscando...
              </span>
            )}
          </div>
          {receptorGuardado && (
            <span className="receptor-autocompletado">
               Persona registrada en el sistema — datos autocompletados
            </span>
          )}
        </div>

        <div>
          <label>Nombre completo de quien recibe</label>
          <input
            placeholder="Nombre completo..."
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            required
          />
        </div>
      </div>

      <div className="form-grid form-grid--separada">
        <div>
          <label>Número de teléfono del receptor</label>
          <input
            type="tel"
            placeholder="Ej: 3001234567"
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
          />
        </div>
        <div>
          <label>Correo electrónico del receptor</label>
          <input
            type="email"
            placeholder="ejemplo@correo.com"
            value={correo}
            onChange={(e) => setCorreo(e.target.value)}
          />
        </div>
      </div>

      {/* DOCUMENTO DE IDENTIDAD ADJUNTO */}
      <div className="documento-adjunto">
        <label className="form-label form-label--titulo">
           Documento de Identidad del Receptor (Foto Cédula / PDF):
        </label>

        {adjunto ? (
          <div className="archivo-adjunto">
            <div className="archivo-adjunto-datos">
              <span className="archivo-adjunto-icono" aria-hidden="true">{adjunto.tipo === 'PDF' ? 'PDF' : 'Imagen'}</span>
              <div>
                <strong className="archivo-adjunto-nombre">{adjunto.nombre}</strong>
                <span className="archivo-adjunto-tipo">
                  {adjunto.tipo === 'PDF' ? 'Documento PDF adjunto' : 'Imagen de documento adjunta'}
                </span>
              </div>
            </div>
            <button
              type="button"
              className="btn-quitar-adjunto"
              onClick={() => setAdjunto(null)}
            >
              × Quitar
            </button>
          </div>
        ) : (
          <div>
            <input
              type="file"
              className="entrada-archivo"
              accept="image/*,application/pdf"
              onChange={handleCargarArchivo}
            />
            <span className="entrada-archivo-ayuda">
              Puede subir una foto (JPG, PNG) o PDF del documento de identidad. Quedará guardado para futuras órdenes.
            </span>
          </div>
        )}
      </div>

      {!exenta && (
      <>
      {/* FIRMA DIGITAL */}
      <div className="bloque-biometrico">
        <div className="cabecera-bloque">
          <label>
            Firma digital del receptor:
          </label>
          <div className="grupo-mini-acciones">
            {firma && (
              <button
                type="button"
                className="filter-chip filter-chip--compacto filter-chip--peligro"
                onClick={() => {
                  setFirma(null);
                  setUsarFirmaGuardada(false);
                }}
                title="Quitar firma actual"
              >
                 Quitar firma
              </button>
            )}
            {receptorGuardado?.firma_guardada && (
              <button
                type="button"
                className="filter-chip chip-activo filter-chip--compacto"
                onClick={() => {
                  if (usarFirmaGuardada) {
                    setUsarFirmaGuardada(false);
                    setFirma(null);
                  } else {
                    setUsarFirmaGuardada(true);
                    setFirma(receptorGuardado.firma_guardada);
                  }
                }}
              >
                {usarFirmaGuardada ? ' Dibujar firma libre' : ' Usar firma guardada'}
              </button>
            )}
          </div>
        </div>

        {usarFirmaGuardada && receptorGuardado?.firma_guardada ? (
          <figure className="firma-guardada">
            <img
              src={receptorGuardado.firma_guardada}
              alt="Firma guardada"
            />
            <figcaption>
               Usando firma guardada previamente de esta persona.
            </figcaption>
          </figure>
        ) : (
          <SignaturePad
            onChange={setFirma}
            valorInicial={valoresIniciales?.firma || null}
            usuarioSesion={usuarioSesion}
            nombreFirmante={nombre}
            documentoFirmante={documento}
            motivoFirma="Recepción de medicamentos"
          />
        )}
      </div>

      {/* HUELLA DACTILAR */}
      <div className="bloque-biometrico">
        <div className="cabecera-bloque">
          <label>
            Huella dactilar biométrica:
          </label>
          {huella && (
            <button
              type="button"
              className="filter-chip filter-chip--compacto filter-chip--peligro"
              onClick={() => setHuella(false)}
              title="Remover registro de huella"
            >
              × Quitar huella
            </button>
          )}
        </div>
        <div className="huella-row">
          <button
            type="button"
            className={`btn-secundario btn-captura ${huella ? 'btn-verde' : ''}`}
            disabled={capturandoHuella}
            onClick={handleCapturarHuella}
          >
            {huella ? ' Huella registrada (Clic para recapturar)' : capturandoHuella ? 'Capturando biométrico...' : 'Capturar huella'}
          </button>
          {receptorGuardado?.huella_guardada ? (
          <span className="page-scope">
               Existe un registro histórico de huella; no acredita verificación biométrica actual
            </span>
          ) : (
            <span className="page-scope">Lector ZK9500: ponga el dedo al pulsar «Capturar huella».</span>
          )}
        </div>
        {errorHuella && (
          <div className="form-error" role="alert">{errorHuella}</div>
        )}
      </div>
      </>
      )}

      {exenta && (
        <div className="aviso-receptor aviso-receptor--pendiente">
          ⏳ Firma y huella quedan <strong>pendientes</strong> por ser salida a municipio/vereda. Se registrarán cuando se complete la entrega.
        </div>
      )}

      {faltantes.length > 0 && (
        <div className="aviso-incompleta aviso-incompleta--separada">
           La orden no podrá generarse sin: {faltantes.join(', ')}.
        </div>
      )}
    </div>
  );
}
