import React, { useEffect, useState, useCallback, useMemo, useDeferredValue } from 'react';
import { inventarioApi } from '../services/inventarioApi.js';
import Pagination from '../components/Pagination.jsx';
import DocumentacionReceptor from '../components/DocumentacionReceptor.jsx';

export default function Entregas({ usuario, sedeActiva }) {
  const [ordenes, setOrdenes] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [filtroTexto, setFiltroTexto] = useState('');
  const [filtroDoc, setFiltroDoc] = useState('TODAS');
  const [pagina, setPagina] = useState(1);
  const [porPagina, setPorPagina] = useState(25);

  // Modal para ver documentos / firmas
  const [modalVisualizar, setModalVisualizar] = useState(null); // { titulo, tipo: 'IMAGEN'|'PDF', data, nombre }

  // Modal para completar/corregir la documentación (solo Superadmin)
  const [ordenParaDoc, setOrdenParaDoc] = useState(null);
  const [docActual, setDocActual] = useState(null);
  const [guardandoDoc, setGuardandoDoc] = useState(false);
  const [errorDoc, setErrorDoc] = useState(null);

  const deferredTexto = useDeferredValue(filtroTexto);

  const cargar = useCallback(async () => {
    setCargando(true);
    const res = await inventarioApi.ordenes.listar(usuario, { sedeId: sedeActiva });
    if (res.ok) setOrdenes(res.data);
    setCargando(false);
  }, [usuario, sedeActiva]);

  useEffect(() => { cargar(); }, [cargar]);

  function abrirCompletarDoc(orden) {
    setDocActual(null);
    setErrorDoc(null);
    setOrdenParaDoc(orden);
  }

  async function handleGuardarDoc() {
    if (!ordenParaDoc || !docActual) return;
    setGuardandoDoc(true);
    setErrorDoc(null);
    const res = await inventarioApi.ordenes.actualizarDocumentacion(usuario, ordenParaDoc.id, {
      receptor_nombre: docActual.nombre,
      receptor_documento: docActual.documento,
      receptor_telefono: docActual.telefono,
      receptor_correo: docActual.correo,
      firma_data: docActual.firma || null,
      huella_registrada: docActual.huella ? 1 : 0,
      documento_adjunto_nombre: docActual.adjunto?.nombre || null,
      documento_adjunto_data: docActual.adjunto?.data || null,
      documento_adjunto_tipo: docActual.adjunto?.tipo || null
    });
    setGuardandoDoc(false);
    if (!res.ok) { setErrorDoc(res.error); return; }
    setOrdenParaDoc(null);
    await cargar();
  }

  const entregasFiltradas = useMemo(() => {
    const q = deferredTexto.toLowerCase().trim();
    return ordenes
      .filter((o) => o.estado !== 'CANCELADA')
      .filter((o) => {
        const coincideTexto = !q ||
          o.numero?.toLowerCase().includes(q) ||
          o.sede_nombre?.toLowerCase().includes(q) ||
          o.receptor_nombre?.toLowerCase().includes(q) ||
          o.creador_nombre?.toLowerCase().includes(q) ||
          o.destino_detalle?.toLowerCase().includes(q);

        const esExenta = o.tipo_destino === 'MUNICIPIO_VEREDA';
        const esCompleta = Boolean(o.documentacion_completa);

        const coincideDoc = filtroDoc === 'TODAS' ||
          (filtroDoc === 'COMPLETA' && esCompleta) ||
          (filtroDoc === 'INCOMPLETA' && !esCompleta);

        return coincideTexto && coincideDoc;
      });
  }, [ordenes, deferredTexto, filtroDoc]);

  const entregasPaginadas = useMemo(() => {
    if (porPagina === 'TODOS') return entregasFiltradas;
    const inicio = (pagina - 1) * porPagina;
    return entregasFiltradas.slice(inicio, inicio + porPagina);
  }, [entregasFiltradas, pagina, porPagina]);

  return (
    <div className="page-container entregas-view">
      <div className="page-header-row">
        <div>
          <h2>Control de Entregas y Documentación</h2>
          <p className="page-scope">
            {usuario.rol_nombre === 'SUPERADMIN' ? 'Registro global de órdenes, firmas y documentos de identidad de quien recibe' : `Sede: ${usuario.sede_nombre}`}
          </p>
        </div>
        <div className="header-actions">
          <button className="btn-refrescar" onClick={cargar} title="Recargar">🔄 Actualizar</button>
        </div>
      </div>

      <div className="filtros-card">
        <div className="search-bar-wrap">
          <span className="search-icon">🔍</span>
          <input
            type="text"
            className="search-input"
            placeholder="Buscar por orden, receptor, destino o quien registró..."
            value={filtroTexto}
            onChange={(e) => {
              setFiltroTexto(e.target.value);
              setPagina(1);
            }}
          />
          {filtroTexto && (
            <button className="btn-clear-search" onClick={() => { setFiltroTexto(''); setPagina(1); }}>×</button>
          )}
        </div>

        <div className="pills-filter-group">
          {['TODAS', 'COMPLETA', 'INCOMPLETA'].map((doc) => (
            <button
              key={doc}
              type="button"
              className={`filter-chip ${filtroDoc === doc ? 'chip-activo' : ''}`}
              onClick={() => { setFiltroDoc(doc); setPagina(1); }}
            >
              {doc === 'COMPLETA' ? 'Documentación Completa' : doc === 'INCOMPLETA' ? 'Doc. Incompleta' : 'Todas'}
            </button>
          ))}
        </div>
      </div>

      <div className="table-responsive">
        <table className="tabla">
          <thead>
            <tr>
              <th>Orden</th>
              <th>Sede</th>
              <th>Destino / Salida</th>
              <th>Creada por</th>
              <th>Recibe</th>
              <th>Fecha</th>
              <th>Doc. Identidad</th>
              <th>Firma Digital</th>
              <th>Huella</th>
              <th>Estado Documental</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {entregasPaginadas.map((o) => {
              const esExenta = o.tipo_destino === 'MUNICIPIO_VEREDA';
              const tieneFirma = Boolean(o.firma_data);
              const tieneHuella = Boolean(o.huella_registrada);
              const tieneDoc = Boolean(o.documento_adjunto_data);
              const esCompleta = Boolean(o.documentacion_completa);

              const faltantes = [];
              if (!esExenta && !esCompleta) {
                if (!tieneFirma) faltantes.push('Firma');
                if (!tieneHuella) faltantes.push('Huella');
              }

              const destinoTexto = o.destino_detalle || (esExenta ? 'Municipio / Vereda' : 'Despacho Local');

              return (
                <tr key={o.id}>
                  <td><strong>{o.numero}</strong></td>
                  <td>{o.sede_nombre}</td>
                  <td>
                    {esExenta ? (
                      <span className="pill estado-amarillo" title={destinoTexto}>
                        🚚 {destinoTexto}
                      </span>
                    ) : (
                      <span className="pill estado-gris" title="Despacho local en sede">
                        🏢 Local
                      </span>
                    )}
                  </td>
                  <td>{o.creador_nombre}</td>
                  <td>
                    <strong>{o.receptor_nombre || 'Sin registrar'}</strong>
                  </td>
                  <td style={{ fontSize: '0.8rem' }}>{o.fecha_creacion}</td>
                  <td>
                    {tieneDoc ? (
                      <button
                        type="button"
                        className="filter-chip chip-activo"
                        style={{ fontSize: '0.74rem', padding: '0.2rem 0.5rem', cursor: 'pointer' }}
                        onClick={() => setModalVisualizar({
                          titulo: `Documento de ${o.receptor_nombre}`,
                          tipo: o.documento_adjunto_tipo || (o.documento_adjunto_data?.startsWith('data:application/pdf') ? 'PDF' : 'IMAGEN'),
                          data: o.documento_adjunto_data,
                          nombre: o.documento_adjunto_nombre || 'Documento_identidad'
                        })}
                      >
                        📄 Ver Documento
                      </button>
                    ) : (
                      <span className="text-muted" style={{ fontSize: '0.75rem' }}>—</span>
                    )}
                  </td>
                  <td>
                    {esExenta ? (
                      <span className="pill estado-amarillo" style={{ fontSize: '0.72rem' }}>⏳ Pendiente</span>
                    ) : tieneFirma ? (
                      <button
                        type="button"
                        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                        onClick={() => setModalVisualizar({
                          titulo: `Firma digital de ${o.receptor_nombre}`,
                          tipo: 'IMAGEN',
                          data: o.firma_data,
                          nombre: 'Firma_Digital.png'
                        })}
                        title="Clic para ver firma"
                      >
                        <span className="pill estado-verde">✓ Ver Firma</span>
                      </button>
                    ) : (
                      <span className="pill estado-rojo">❌ Falta firma</span>
                    )}
                  </td>
                  <td>
                    {esExenta ? (
                      <span className="pill estado-amarillo" style={{ fontSize: '0.72rem' }}>⏳ Pendiente</span>
                    ) : tieneHuella ? (
                      <span className="pill estado-verde" title="Huella biométrica capturada">✓ Capturada</span>
                    ) : (
                      <span className="pill estado-rojo">❌ Falta huella</span>
                    )}
                  </td>
                  <td>
                    {esCompleta ? (
                      <span className="pill estado-verde">COMPLETA</span>
                    ) : esExenta ? (
                      <span className="pill estado-amarillo" title="Identidad registrada; firma y huella pendientes">
                        PENDIENTE (Envío)
                      </span>
                    ) : (
                      <span className="pill estado-rojo" title={`Faltan: ${faltantes.join(', ')}`}>
                        INCOMPLETA ({faltantes.join(', ')})
                      </span>
                    )}
                  </td>
                  <td className="acciones">
                    {usuario.rol_nombre === 'SUPERADMIN' && ['PENDIENTE', 'PARCIAL', 'COMPLETADA'].includes(o.estado) && (
                      <button
                        type="button"
                        className="btn-secundario"
                        style={{ padding: '0.3rem 0.6rem', fontSize: '0.78rem' }}
                        onClick={() => abrirCompletarDoc(o)}
                        title="Completar o corregir la documentación de quien recibe"
                      >
                        ✏️ Completar
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {entregasFiltradas.length === 0 && (
              <tr>
                <td colSpan="11" className="tabla-vacia">
                  {cargando ? 'Cargando órdenes...' : 'No se encontraron entregas registradas.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Pagination
        totalItems={entregasFiltradas.length}
        paginaActual={pagina}
        itemsPorPagina={porPagina}
        onCambiarPagina={setPagina}
        onCambiarItemsPorPagina={setPorPagina}
      />

      {/* MODAL VISUALIZADOR DE DOCUMENTO / FIRMA */}
      {modalVisualizar && (
        <div className="modal-overlay" onClick={() => setModalVisualizar(null)}>
          <div
            className="modal-card"
            style={{ maxWidth: '700px', width: '90%' }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="modal-close-x"
              onClick={() => setModalVisualizar(null)}
              title="Cerrar panel"
              aria-label="Cerrar panel"
            >
              ✕
            </button>
            <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '1.15rem', fontWeight: 800 }}>
              {modalVisualizar.titulo}
            </h3>

            <div style={{ textAlign: 'center', padding: '1rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', minHeight: '200px' }}>
              {modalVisualizar.tipo === 'PDF' || modalVisualizar.data?.startsWith('data:application/pdf') ? (
                <div>
                  <iframe
                    src={modalVisualizar.data}
                    title="Documento PDF"
                    style={{ width: '100%', height: '450px', border: 'none', borderRadius: '6px' }}
                  />
                </div>
              ) : (
                <img
                  src={modalVisualizar.data}
                  alt={modalVisualizar.titulo}
                  style={{ maxWidth: '100%', maxHeight: '450px', objectFit: 'contain', borderRadius: '6px' }}
                />
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem', borderTop: '1px solid #e2e8f0', paddingTop: '0.75rem' }}>
              <a
                href={modalVisualizar.data}
                download={modalVisualizar.nombre || 'documento_entrega'}
                className="btn-secundario"
                style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
              >
                ⬇️ Descargar archivo
              </a>
              <button
                type="button"
                className="btn-primario"
                onClick={() => setModalVisualizar(null)}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL PARA COMPLETAR/CORREGIR DOCUMENTACIÓN (solo Superadmin) */}
      {ordenParaDoc && (
        <div className="modal-overlay" onClick={() => setOrdenParaDoc(null)}>
          <div className="modal-card" style={{ maxWidth: '720px' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.75rem', marginBottom: '1.25rem' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800 }}>
                  ✏️ Completar documentación de {ordenParaDoc.numero}
                </h3>
                <span style={{ fontSize: '0.82rem', color: '#64748b' }}>
                  Complete o corrija los datos, firma o huella pendientes de quien recibe.
                </span>
              </div>
              <button
                type="button"
                className="btn-clear-search"
                onClick={() => setOrdenParaDoc(null)}
                style={{ fontSize: '1.4rem', cursor: 'pointer', padding: '0.2rem 0.5rem', background: 'transparent', border: 'none', color: '#64748b' }}
                title="Cerrar"
              >
                ✕
              </button>
            </div>

            <DocumentacionReceptor
              key={ordenParaDoc.id}
              exenta={ordenParaDoc.tipo_destino === 'MUNICIPIO_VEREDA'}
              valoresIniciales={{
                nombre: ordenParaDoc.receptor_nombre || '',
                documento: ordenParaDoc.receptor_documento || '',
                telefono: ordenParaDoc.receptor_telefono || '',
                correo: ordenParaDoc.receptor_correo || '',
                firma: ordenParaDoc.firma_data || null,
                huella: Boolean(ordenParaDoc.huella_registrada),
                adjunto: ordenParaDoc.documento_adjunto_data ? {
                  nombre: ordenParaDoc.documento_adjunto_nombre || 'Documento_identidad.pdf',
                  data: ordenParaDoc.documento_adjunto_data,
                  tipo: ordenParaDoc.documento_adjunto_tipo || (ordenParaDoc.documento_adjunto_data.startsWith('data:application/pdf') ? 'PDF' : 'IMAGEN')
                } : null
              }}
              onChange={setDocActual}
            />

            {errorDoc && <div className="login-error" style={{ marginTop: '1rem' }}>{errorDoc}</div>}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', borderTop: '1px solid #e2e8f0', paddingTop: '1rem' }}>
              <button
                type="button"
                className="btn-secundario"
                onClick={() => setOrdenParaDoc(null)}
                disabled={guardandoDoc}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn-primario"
                onClick={handleGuardarDoc}
                disabled={guardandoDoc}
              >
                {guardandoDoc ? 'Guardando...' : '💾 Guardar documentación'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}