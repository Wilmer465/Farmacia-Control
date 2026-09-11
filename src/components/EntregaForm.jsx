import React, { useState, useEffect } from 'react';
import SignaturePad from './SignaturePad.jsx';
import { inventarioApi } from '../services/inventarioApi.js';

export default function EntregaForm({ despachoId, tipoDestinoInicial, onCompletar, onOmitir }) {
  const [tipoDestino, setTipoDestino] = useState(tipoDestinoInicial === 'MUNICIPIO_VEREDA' ? 'MUNICIPIO_VEREDA' : 'LOCAL'); // 'LOCAL' | 'MUNICIPIO_VEREDA'
  const [destinoDetalle, setDestinoDetalle] = useState('');
  const [receptorNombre, setReceptorNombre] = useState('');
  const [receptorDocumento, setReceptorDocumento] = useState('');
  const [receptorTelefono, setReceptorTelefono] = useState('');
  const [receptorCorreo, setReceptorCorreo] = useState('');
  const [firma, setFirma] = useState(null);
  const [huella, setHuella] = useState(false);
  const [capturandoHuella, setCapturandoHuella] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);

  // Datos guardados de la persona / receptor
  const [receptorGuardado, setReceptorGuardado] = useState(null);
  const [usarFirmaGuardada, setUsarFirmaGuardada] = useState(false);
  const [buscandoReceptor, setBuscandoReceptor] = useState(false);

  // Documento de identidad adjunto (foto/PDF)
  const [docAdjunto, setDocAdjunto] = useState(null); // { nombre, data, tipo }

  // Buscar si la persona ya existe cuando escribe la cedula
  useEffect(() => {
    const docLimpio = receptorDocumento.trim();
    if (!docLimpio || docLimpio.length < 4 || tipoDestino === 'MUNICIPIO_VEREDA') {
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
          if (!receptorNombre) {
            setReceptorNombre(res.data.nombre || '');
          }
          if (!receptorTelefono) {
            setReceptorTelefono(res.data.telefono || '');
          }
          if (!receptorCorreo) {
            setReceptorCorreo(res.data.correo_electronico || '');
          }
          if (res.data.firma_guardada) {
            setUsarFirmaGuardada(true);
            setFirma(res.data.firma_guardada);
          }
          if (res.data.huella_guardada) {
            setHuella(true);
          }
          if (res.data.documento_adjunto_data && !docAdjunto) {
            setDocAdjunto({
              nombre: res.data.documento_adjunto_nombre || 'Documento_identidad.pdf',
              data: res.data.documento_adjunto_data,
              tipo: res.data.documento_adjunto_tipo || 'IMAGEN'
            });
          }
        } else {
          setReceptorGuardado(null);
        }
      } catch (err) {
        console.error('Error buscando receptor:', err);
      } finally {
        setBuscandoReceptor(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [receptorDocumento, tipoDestino]);

  async function handleCapturarHuella() {
    setCapturandoHuella(true);
    const res = await inventarioApi.entregas.capturarHuella();
    setCapturandoHuella(false);
    if (res.ok && res.data.capturada) setHuella(true);
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
      setDocAdjunto({
        nombre: file.name,
        data: reader.result,
        tipo: esPdf ? 'PDF' : 'IMAGEN'
});
    };
    reader.readAsDataURL(file);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const esLocal = tipoDestino !== 'MUNICIPIO_VEREDA';
    if (esLocal) {
      const faltantesEnvio = [];
      if (!receptorNombre.trim()) faltantesEnvio.push('nombre del receptor');
      if (!firma) faltantesEnvio.push('firma digital');
      if (!huella) faltantesEnvio.push('huella dactilar');
      if (faltantesEnvio.length > 0) {
        setError(`La entrega local no puede guardarse sin: ${faltantesEnvio.join(', ')}.`);
        return;
      }
    }
    setEnviando(true);
    setError(null);
    const ok = await onCompletar({
      despacho_id: despachoId,
      tipo_destino: tipoDestino,
      destino_detalle: destinoDetalle.trim() || null,
      receptor_nombre: receptorNombre,
      receptor_documento: receptorDocumento,
      receptor_telefono: receptorTelefono,
      receptor_correo: receptorCorreo,
      firma_data: tipoDestino === 'MUNICIPIO_VEREDA' ? null : firma,
      huella_registrada: tipoDestino === 'MUNICIPIO_VEREDA' ? 0 : huella,
      documento_adjunto_nombre: docAdjunto?.nombre || null,
      documento_adjunto_data: docAdjunto?.data || null,
      documento_adjunto_tipo: docAdjunto?.tipo || null
    });
    setEnviando(false);
    if (!ok) setError('No se pudo registrar la entrega. Intente de nuevo.');
  }

  const esMunicipioVereda = tipoDestino === 'MUNICIPIO_VEREDA';
  const faltantes = [];
  if (!esMunicipioVereda) {
    if (!receptorNombre.trim()) faltantes.push('nombre del receptor');
    if (!firma) faltantes.push('firma digital');
    if (!huella) faltantes.push('huella dactilar');
  }

return (
    <form className="panel-form entrega-form" onSubmit={handleSubmit}>
      {esMunicipioVereda && (
        <button
          type="button"
          className="modal-close-x"
          onClick={onOmitir}
          title="Cerrar panel"
          aria-label="Cerrar panel"
        >
          ✕
        </button>
      )}

      <div style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '0.75rem', marginBottom: '1.25rem', paddingRight: '2.75rem' }}>
        <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800 }}>📋 Registro de Entrega y Documentación</h3>
        <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.82rem', color: '#64748b' }}>
          Despacho #{despachoId} — registre los datos de quien recibe, firma y huella digital.
        </p>
      </div>

      {/* Selector de tipo de entrega */}
      <div style={{ background: '#f8fafc', padding: '0.85rem', borderRadius: '8px', border: '1px solid #cbd5e1', marginBottom: '1.25rem' }}>
        <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#1e293b', display: 'block', marginBottom: '0.4rem' }}>
          Tipo de Salida / Entrega:
        </label>
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            className={`filter-chip ${tipoDestino === 'LOCAL' ? 'chip-activo' : ''}`}
            onClick={() => setTipoDestino('LOCAL')}
            style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
          >
            🏢 Entrega Local en Sede (Firma y Huella)
          </button>
          <button
            type="button"
            className={`filter-chip ${tipoDestino === 'MUNICIPIO_VEREDA' ? 'chip-activo' : ''}`}
            onClick={() => setTipoDestino('MUNICIPIO_VEREDA')}
            style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
          >
            🚚 Salida a Otro Municipio / Vereda (Exento)
          </button>
        </div>
      </div>

      {esMunicipioVereda ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.25rem' }}>
          <div style={{ background: '#eff6ff', padding: '0.85rem', borderRadius: '8px', border: '1px solid #bfdbfe', fontSize: '0.84rem', color: '#1e40af' }}>
            <strong>🚚 Envío Foráneo / Remesa Rural:</strong> Esta entrega se registrará como <strong>DOCUMENTACIÓN COMPLETA</strong> y quedará exenta de la toma de firma y huella física.
          </div>

          <div className="form-grid">
            <div>
              <label>Municipio o Vereda de Destino:</label>
              <input
                placeholder="Ej: Vereda La Troja / Municipio Vigía del Fuerte..."
                value={destinoDetalle}
                onChange={(e) => setDestinoDetalle(e.target.value)}
                required
              />
            </div>
            <div>
              <label>Transportador / Conductor / Encargado (Opcional):</label>
              <input
                placeholder="Ej: Juan Pérez / Conductor lancha / Guía #1234"
                value={receptorNombre}
                onChange={(e) => setReceptorNombre(e.target.value)}
              />
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="form-grid">
            <div>
              <label>Documento de identificación (C.C. / T.I.)</label>
              <div style={{ position: 'relative' }}>
                <input
                  placeholder="Número de cédula..."
                  value={receptorDocumento}
                  onChange={(e) => setReceptorDocumento(e.target.value)}
                  required
                />
                {buscandoReceptor && (
                  <span style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '0.75rem', color: '#64748b' }}>
                    🔍 Buscando...
                  </span>
                )}
              </div>
              {receptorGuardado && (
                <span style={{ fontSize: '0.75rem', color: '#15803d', fontWeight: 600, display: 'block', marginTop: '0.2rem' }}>
                  ✓ Persona registrada en el sistema — datos autocompletados
                </span>
              )}
            </div>

            <div>
              <label>Nombre de quien recibe (Receptor)</label>
              <input
                placeholder="Nombre completo..."
                value={receptorNombre}
                onChange={(e) => setReceptorNombre(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="form-grid" style={{ marginTop: '0.75rem' }}>
            <div>
              <label>Número de teléfono del receptor</label>
              <input
                type="tel"
                placeholder="Ej: 3001234567"
                value={receptorTelefono}
                onChange={(e) => setReceptorTelefono(e.target.value)}
              />
            </div>
            <div>
              <label>Correo electrónico del receptor</label>
              <input
                type="email"
                placeholder="ejemplo@correo.com"
                value={receptorCorreo}
                onChange={(e) => setReceptorCorreo(e.target.value)}
              />
            </div>
          </div>

          {/* DOCUMENTO DE IDENTIDAD ADJUNTO */}
          <div style={{ background: '#f8fafc', padding: '0.85rem', borderRadius: '8px', border: '1px solid #cbd5e1', marginTop: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.35rem', fontWeight: 700, fontSize: '0.82rem', color: '#1e293b' }}>
              📄 Documento de Identidad del Receptor (Foto Cédula / PDF):
            </label>

            {docAdjunto ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#ffffff', padding: '0.6rem 0.85rem', borderRadius: '6px', border: '1px solid #93c5fd' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <span style={{ fontSize: '1.4rem' }}>{docAdjunto.tipo === 'PDF' ? '📑' : '🖼️'}</span>
                  <div>
                    <strong style={{ fontSize: '0.85rem', color: '#1e40af' }}>{docAdjunto.nombre}</strong>
                    <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block' }}>
                      {docAdjunto.tipo === 'PDF' ? 'Documento PDF adjunto' : 'Imagen de documento adjunta'}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  className="btn-clear-search"
                  style={{ color: '#dc2626', fontSize: '0.85rem', cursor: 'pointer' }}
                  onClick={() => setDocAdjunto(null)}
                >
                  ✕ Quitar
                </button>
              </div>
            ) : (
              <div>
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={handleCargarArchivo}
                  style={{ fontSize: '0.82rem' }}
                />
                <span style={{ fontSize: '0.74rem', color: '#64748b', display: 'block', marginTop: '0.25rem' }}>
                  Puede subir una foto (JPG, PNG) o PDF del documento de identidad. Quedará guardado para futuras entregas.
                </span>
              </div>
            )}
          </div>

          {/* FIRMA DIGITAL */}
          <div style={{ marginTop: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
              <label style={{ fontWeight: 600, fontSize: '0.82rem', margin: 0 }}>
                Firma digital del receptor:
              </label>
              {receptorGuardado?.firma_guardada && (
                <button
                  type="button"
                  className="filter-chip chip-activo"
                  style={{ padding: '0.2rem 0.5rem', fontSize: '0.74rem' }}
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
                  {usarFirmaGuardada ? '✏️ Dibujar nueva firma' : '📋 Usar firma guardada'}
                </button>
              )}
            </div>

            {usarFirmaGuardada && receptorGuardado?.firma_guardada ? (
              <div style={{ background: '#ffffff', padding: '0.75rem', borderRadius: '8px', border: '1px solid #10b981', textAlign: 'center' }}>
                <img
                  src={receptorGuardado.firma_guardada}
                  alt="Firma guardada"
                  style={{ maxHeight: '100px', maxWidth: '100%', objectFit: 'contain' }}
                />
                <span style={{ display: 'block', fontSize: '0.76rem', color: '#047857', marginTop: '0.3rem' }}>
                  ✓ Usando firma guardada previamente de esta persona.
                </span>
              </div>
            ) : (
              <SignaturePad onChange={setFirma} />
            )}
          </div>

          {/* HUELLA DACTILAR */}
          <div style={{ marginTop: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.35rem', fontWeight: 600, fontSize: '0.82rem' }}>
              Huella dactilar biométrica:
            </label>
            <div className="huella-row">
              <button
                type="button"
                className={`btn-secundario ${huella ? 'btn-verde' : ''}`}
                disabled={capturandoHuella}
                onClick={handleCapturarHuella}
                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
              >
                {huella ? '✅ Huella registrada ✓' : capturandoHuella ? 'Capturando biométrico...' : '👆 Capturar Huella'}
              </button>
              {receptorGuardado?.huella_guardada ? (
                <span style={{ fontSize: '0.78rem', color: '#15803d', fontWeight: 600 }}>
                  ✓ Huella biométrica previamente verificada
                </span>
              ) : (
                <span className="page-scope">Sin lector físico conectado: captura simulada.</span>
              )}
            </div>
          </div>

          {faltantes.length > 0 && (
            <div className="aviso-incompleta" style={{ marginTop: '1rem' }}>
              ⚠️ Si guarda sin firma o huella, la entrega quedará marcada como <strong>documentación incompleta</strong> (falta: {faltantes.join(', ')}).
            </div>
          )}
        </>
      )}

{error && <div className="login-error" style={{ marginTop: '1rem' }}>{error}</div>}

      <div className="despacho-acciones" style={{ borderTop: '1px solid #e2e8f0', paddingTop: '1rem', marginTop: '1.25rem' }}>
        {esMunicipioVereda ? (
          <button type="button" className="btn-secundario" onClick={onOmitir}>
            ✕ Registrar más tarde
          </button>
        ) : (
          <span style={{ fontSize: '0.78rem', color: '#334155', marginRight: 'auto' }}>
            🔒 La entrega local es obligatoria: se registrarán los datos, firma y huella de quien recibe.
          </span>
        )}
        <button type="submit" className="btn-primario" disabled={enviando}>
          {enviando ? 'Guardando...' : '✅ Confirmar y Guardar Entrega'}
        </button>
      </div>
    </form>
  );
}
