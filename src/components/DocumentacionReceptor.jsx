import React, { useState, useEffect, useRef } from 'react';
import SignaturePad from './SignaturePad.jsx';
import { inventarioApi } from '../services/inventarioApi.js';

// Captura la documentación de quien recibe: identificación, nombre, teléfono,
// correo, documento adjunto, firma digital y huella. Si la persona ya está
// registrada en el catálogo de receptores, autocompleta todos los campos.
export default function DocumentacionReceptor({ exenta, onChange, valoresIniciales }) {
  const [nombre, setNombre] = useState(valoresIniciales?.nombre || '');
  const [documento, setDocumento] = useState(valoresIniciales?.documento || '');
  const [telefono, setTelefono] = useState(valoresIniciales?.telefono || '');
  const [correo, setCorreo] = useState(valoresIniciales?.correo || '');
  const [firma, setFirma] = useState(valoresIniciales?.firma || null);
  const [huella, setHuella] = useState(valoresIniciales?.huella || false);
  const [capturandoHuella, setCapturandoHuella] = useState(false);
  const [adjunto, setAdjunto] = useState(valoresIniciales?.adjunto || null); // { nombre, data, tipo }

  const [receptorGuardado, setReceptorGuardado] = useState(null);
  const [usarFirmaGuardada, setUsarFirmaGuardada] = useState(false);
  const [buscandoReceptor, setBuscandoReceptor] = useState(false);

  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

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
            setHuella(Boolean(res.data.huella_guardada));
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
    <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '10px', border: '1px solid #cbd5e1', marginTop: '1.25rem' }}>
      <label style={{ display: 'block', marginBottom: '0.45rem', fontWeight: 700, fontSize: '0.85rem', color: '#1e293b' }}>
        👤 Documentación de quien recibe (obligatoria)
      </label>
      {exenta ? (
        <div style={{ background: '#eff6ff', padding: '0.7rem 0.85rem', borderRadius: '8px', border: '1px solid #bfdbfe', fontSize: '0.82rem', color: '#1e40af', marginBottom: '0.85rem' }}>
          🚚 Envío a municipio/vereda: registre la identidad de quien recibe. La <strong>firma</strong> y la <strong>huella</strong> quedarán <strong>pendientes</strong>.
        </div>
      ) : (
        <p style={{ fontSize: '0.78rem', color: '#475569', margin: '0 0 0.85rem 0' }}>
          Si la persona ya está registrada, al escribir su identificación se llenarán automáticamente sus datos, firma y huella.
        </p>
      )}

      <div className="form-grid">
        <div>
          <label>Documento de identificación (C.C. / T.I.)</label>
          <div style={{ position: 'relative' }}>
            <input
              placeholder="Número de cédula..."
              value={documento}
              onChange={(e) => setDocumento(e.target.value)}
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
          <label>Nombre completo de quien recibe</label>
          <input
            placeholder="Nombre completo..."
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
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
      <div style={{ background: '#ffffff', padding: '0.85rem', borderRadius: '8px', border: '1px solid #e2e8f0', marginTop: '1rem' }}>
        <label style={{ display: 'block', marginBottom: '0.35rem', fontWeight: 700, fontSize: '0.82rem', color: '#1e293b' }}>
          📄 Documento de Identidad del Receptor (Foto Cédula / PDF):
        </label>

        {adjunto ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#ffffff', padding: '0.6rem 0.85rem', borderRadius: '6px', border: '1px solid #93c5fd' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <span style={{ fontSize: '1.4rem' }}>{adjunto.tipo === 'PDF' ? '📑' : '🖼️'}</span>
              <div>
                <strong style={{ fontSize: '0.85rem', color: '#1e40af' }}>{adjunto.nombre}</strong>
                <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block' }}>
                  {adjunto.tipo === 'PDF' ? 'Documento PDF adjunto' : 'Imagen de documento adjunta'}
                </span>
              </div>
            </div>
            <button
              type="button"
              className="btn-clear-search"
              style={{ color: '#dc2626', fontSize: '0.85rem', cursor: 'pointer' }}
              onClick={() => setAdjunto(null)}
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
              Puede subir una foto (JPG, PNG) o PDF del documento de identidad. Quedará guardado para futuras órdenes.
            </span>
          </div>
        )}
      </div>

      {!exenta && (
      <>
      {/* FIRMA DIGITAL */}
      <div style={{ marginTop: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <label style={{ fontWeight: 600, fontSize: '0.82rem', margin: 0 }}>
            Firma digital del receptor:
          </label>
          <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
            {firma && (
              <button
                type="button"
                className="filter-chip"
                style={{ padding: '0.2rem 0.5rem', fontSize: '0.74rem', color: '#dc2626', borderColor: '#fca5a5' }}
                onClick={() => {
                  setFirma(null);
                  setUsarFirmaGuardada(false);
                }}
                title="Quitar firma actual"
              >
                🗑️ Quitar firma
              </button>
            )}
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
                {usarFirmaGuardada ? '✏️ Dibujar firma libre' : '📋 Usar firma guardada'}
              </button>
            )}
          </div>
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
          <SignaturePad onChange={setFirma} valorInicial={valoresIniciales?.firma || null} />
        )}
      </div>

      {/* HUELLA DACTILAR */}
      <div style={{ marginTop: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
          <label style={{ fontWeight: 600, fontSize: '0.82rem', margin: 0 }}>
            Huella dactilar biométrica:
          </label>
          {huella && (
            <button
              type="button"
              className="filter-chip"
              style={{ padding: '0.2rem 0.5rem', fontSize: '0.74rem', color: '#dc2626', borderColor: '#fca5a5' }}
              onClick={() => setHuella(false)}
              title="Remover registro de huella"
            >
              ✕ Quitar huella
            </button>
          )}
        </div>
        <div className="huella-row">
          <button
            type="button"
            className={`btn-secundario ${huella ? 'btn-verde' : ''}`}
            disabled={capturandoHuella}
            onClick={handleCapturarHuella}
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
          >
            {huella ? '✅ Huella registrada (Clic para recapturar)' : capturandoHuella ? 'Capturando biométrico...' : '👆 Capturar Huella'}
          </button>
          {receptorGuardado?.huella_guardada ? (
            <span style={{ fontSize: '0.78rem', color: '#15803d', fontWeight: 600 }}>
              ✓ Huella biométrica verificada en sistema
            </span>
          ) : (
            <span className="page-scope">Sin lector físico conectado: captura simulada.</span>
          )}
        </div>
      </div>
      </>
      )}

      {exenta && (
        <div style={{ background: '#fffbeb', padding: '0.7rem 0.85rem', borderRadius: '8px', border: '1px solid #fde68a', fontSize: '0.82rem', color: '#92400e', marginTop: '1rem' }}>
          ⏳ Firma y huella quedan <strong>pendientes</strong> por ser salida a municipio/vereda. Se registrarán cuando se complete la entrega.
        </div>
      )}

      {faltantes.length > 0 && (
        <div className="aviso-incompleta" style={{ marginTop: '1rem' }}>
          ⚠️ La orden no podrá generarse sin: {faltantes.join(', ')}.
        </div>
      )}
    </div>
  );
}
