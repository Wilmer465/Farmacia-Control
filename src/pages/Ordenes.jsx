import React, { useEffect, useState, useCallback, useMemo, useDeferredValue } from 'react';
import { inventarioApi } from '../services/inventarioApi.js';
import OrdenForm from '../components/OrdenForm.jsx';
import DespachoForm from '../components/DespachoForm.jsx';
import DocumentacionReceptor from '../components/DocumentacionReceptor.jsx';
import Pagination from '../components/Pagination.jsx';

const ROLES_GESTION = ['SUPERADMIN', 'ADMIN', 'INVENTARIO'];
const ROLES_DESPACHO = ['SUPERADMIN', 'INVENTARIO'];
const ESTADOS_DESPACHABLES = ['PENDIENTE', 'PARCIAL'];

const ESTADO_CLASE = {
  PENDIENTE: 'estado-verde',
  PARCIAL: 'estado-amarillo',
  COMPLETADA: 'estado-verde',
  CANCELADA: 'estado-gris'
};

export default function Ordenes({ usuario, sedeActiva }) {
  const [ordenes, setOrdenes] = useState([]);
  const [medicamentos, setMedicamentos] = useState([]);
  const [lotes, setLotes] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [accionEnCurso, setAccionEnCurso] = useState(null);
  const [ordenDespachando, setOrdenDespachando] = useState(null);
  const [errorDespacho, setErrorDespacho] = useState(null);

  // Estados de modales interactivos
  const [ordenParaVer, setOrdenParaVer] = useState(null);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);
  const [ordenParaCancelar, setOrdenParaCancelar] = useState(null);
  const [motivoCancelacion, setMotivoCancelacion] = useState('');
  const [errorCancelacion, setErrorCancelacion] = useState(null);
  const [ordenParaDoc, setOrdenParaDoc] = useState(null);
  const [docActual, setDocActual] = useState(null);
  const [guardandoDoc, setGuardandoDoc] = useState(false);
  const [errorDoc, setErrorDoc] = useState(null);

  // Estados de interacción
  const [mostrarFormOrden, setMostrarFormOrden] = useState(false);
  const [filtroTexto, setFiltroTexto] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('TODAS');
  const [pagina, setPagina] = useState(1);
  const [porPagina, setPorPagina] = useState(25);

  const deferredTexto = useDeferredValue(filtroTexto);

  const puedeGestionar = ROLES_GESTION.includes(usuario.rol_nombre);
  const puedeDespachar = ROLES_DESPACHO.includes(usuario.rol_nombre);

  const cargar = useCallback(async () => {
    setCargando(true);
    const [ordRes, medRes, loteRes] = await Promise.all([
      inventarioApi.ordenes.listar(usuario, { sedeId: sedeActiva }),
      inventarioApi.medicamentos.listar(),
      inventarioApi.lotes.listar(usuario, { sedeId: sedeActiva })
    ]);
    if (ordRes.ok) setOrdenes(ordRes.data);
    if (medRes.ok) setMedicamentos(medRes.data);
    if (loteRes.ok) setLotes(loteRes.data);
    setCargando(false);
  }, [usuario, sedeActiva]);

  useEffect(() => { cargar(); }, [cargar]);

  async function handleCrear(items, opcionesDestino = {}) {
    setError(null);
    const res = await inventarioApi.ordenes.crear(usuario, { items, sede_id: sedeActiva, ...opcionesDestino });
    if (!res.ok) { setError(res.error); return false; }
    setMostrarFormOrden(false);
    await cargar();
    return true;
  }

  async function abrirVerOrden(ordenId) {
    setCargandoDetalle(true);
    const res = await inventarioApi.ordenes.obtener(usuario, ordenId);
    setCargandoDetalle(false);
    if (res.ok) {
      setOrdenParaVer(res.data);
    } else {
      setError(res.error);
    }
  }

  function abrirModalCancelar(orden) {
    setOrdenParaCancelar(orden);
    setMotivoCancelacion('');
    setErrorCancelacion(null);
  }

  async function handleEjecutarCancelacion(e) {
    e.preventDefault();
    if (!motivoCancelacion.trim()) {
      setErrorCancelacion('Debe ingresar el motivo de la cancelación.');
      return;
    }
    setAccionEnCurso(ordenParaCancelar.id);
    const res = await inventarioApi.ordenes.cancelar(usuario, ordenParaCancelar.id, { motivo: motivoCancelacion.trim() });
    setAccionEnCurso(null);
    if (!res.ok) {
      setErrorCancelacion(res.error);
      return;
    }
    setOrdenParaCancelar(null);
    await cargar();
  }

  async function abrirDespacho(ordenId) {
    setErrorDespacho(null);
    const res = await inventarioApi.ordenes.obtener(usuario, ordenId);
    if (!res.ok) { setError(res.error); return; }
    setOrdenDespachando(res.data);
  }

  async function handleDespachar(items) {
    setErrorDespacho(null);
    const res = await inventarioApi.despachos.crear(usuario, { orden_id: ordenDespachando.id, items });
    if (!res.ok) { setErrorDespacho(res.error); return; }
    setOrdenDespachando(null);
    await cargar();
  }

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

  // Medicamentos disponibles en la sede del usuario (extraídos de sus lotes con existencias)
  const medicamentosEnSede = useMemo(() => {
    const vistos = new Map();
    for (const lote of lotes) {
      const stock = Number(lote.cantidad_total_unidades ?? lote.cantidad_actual ?? 0);
      if (stock > 0 && !vistos.has(lote.medicamento_id)) {
        vistos.set(lote.medicamento_id, {
          id: lote.medicamento_id,
          nombre: lote.medicamento_nombre,
          codigo: lote.medicamento_codigo,
          unidades_por_caja: lote.unidades_por_caja || 1,
        });
      }
    }
    // Si el usuario es SUPERADMIN (visión global) y aún no hay lotes filtrados, muestra catálogo
    if (vistos.size === 0 && usuario?.rol_nombre === 'SUPERADMIN') {
      return medicamentos;
    }
    return Array.from(vistos.values()).sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [lotes, medicamentos, usuario?.rol_nombre]);

  const ordenesFiltradas = useMemo(() => {
    const q = deferredTexto.toLowerCase().trim();
    return ordenes.filter((o) => {
      const coincideTexto = !q ||
        o.numero?.toLowerCase().includes(q) ||
        o.sede_nombre?.toLowerCase().includes(q) ||
        o.receptor_nombre?.toLowerCase().includes(q) ||
        o.creador_nombre?.toLowerCase().includes(q) ||
        o.destino_detalle?.toLowerCase().includes(q);
      const coincideEstado = filtroEstado === 'TODAS' || o.estado === filtroEstado;
      return coincideTexto && coincideEstado;
    });
  }, [ordenes, deferredTexto, filtroEstado]);

  const ordenesPaginadas = useMemo(() => {
    if (porPagina === 'TODOS') return ordenesFiltradas;
    const inicio = (pagina - 1) * porPagina;
    return ordenesFiltradas.slice(inicio, inicio + porPagina);
  }, [ordenesFiltradas, pagina, porPagina]);

  return (
    <div className="page-container ordenes-view">
      <div className="page-header-row">
        <div>
          <h2>Gestión de Órdenes y Pedidos</h2>
          <p className="page-scope">
            {usuario.rol_nombre === 'SUPERADMIN' ? 'Control global de órdenes' : `Sede: ${usuario.sede_nombre}`}
          </p>
        </div>
        {puedeGestionar && (
          <div className="header-actions">
            <button
              className={`btn-toggle-action ${mostrarFormOrden ? 'btn-cancelar' : 'btn-primario'}`}
              onClick={() => setMostrarFormOrden(!mostrarFormOrden)}
            >
              {mostrarFormOrden ? '✕ Cerrar formulario' : '+ Nueva Orden'}
            </button>
          </div>
        )}
      </div>

      {/* Formulario desplegable */}
      {puedeGestionar && mostrarFormOrden && (
        <div className="form-collapsible-wrapper">
          <OrdenForm medicamentos={medicamentosEnSede} onCrear={handleCrear} error={error} />
        </div>
      )}

      {/* MODAL PARA VER DETALLES DE LA ORDEN ("👁️ VER") */}
      {ordenParaVer && (
        <div className="modal-overlay" onClick={() => setOrdenParaVer(null)}>
          <div className="modal-card" style={{ maxWidth: '750px' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.75rem', marginBottom: '1.25rem' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800 }}>
                  📋 Detalles de Orden {ordenParaVer.numero}
                </h3>
                <span style={{ fontSize: '0.82rem', color: '#64748b' }}>
                  Sede: <strong>{ordenParaVer.sede_nombre}</strong> | Creada por: <strong>{ordenParaVer.creador_nombre}</strong>
                </span>
              </div>
              <button
                type="button"
                className="btn-clear-search"
                onClick={() => setOrdenParaVer(null)}
                style={{ fontSize: '1.4rem', cursor: 'pointer', padding: '0.2rem 0.5rem', background: 'transparent', border: 'none', color: '#64748b' }}
                title="Cerrar modal"
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem', background: '#f8fafc', padding: '0.85rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <div>
                <span style={{ fontSize: '0.74rem', color: '#64748b', display: 'block' }}>Estado general:</span>
                <span className={`pill ${ESTADO_CLASE[ordenParaVer.estado] || ''}`} style={{ marginTop: '0.2rem' }}>
                  {ordenParaVer.estado}
                </span>
              </div>
              <div>
                <span style={{ fontSize: '0.74rem', color: '#64748b', display: 'block' }}>Tipo de Salida / Destino:</span>
                {ordenParaVer.tipo_destino === 'MUNICIPIO_VEREDA' ? (
                  <span className="pill estado-amarillo" style={{ marginTop: '0.2rem' }} title="Identidad registrada; firma y huella pendientes">
                    🚚 {ordenParaVer.destino_detalle || 'Municipio / Vereda'} (Firma/Huella pendientes)
                  </span>
                ) : (
                  <span className="pill estado-gris" style={{ marginTop: '0.2rem' }}>
                    🏢 Despacho Local (Firma/Huella)
                  </span>
                )}
              </div>
              <div>
                <span style={{ fontSize: '0.74rem', color: '#64748b', display: 'block' }}>Fecha de creación:</span>
                <strong style={{ fontSize: '0.85rem' }}>{ordenParaVer.fecha_creacion}</strong>
              </div>
              <div>
                <span style={{ fontSize: '0.74rem', color: '#64748b', display: 'block' }}>Última actualización:</span>
                <strong style={{ fontSize: '0.85rem' }}>{ordenParaVer.fecha_actualizacion || '—'}</strong>
              </div>
            </div>

            <h4 style={{ margin: '0 0 0.6rem 0', fontSize: '0.95rem', fontWeight: 700 }}>
              📦 Medicamentos Solicitados en este Pedido:
            </h4>

            <div className="table-responsive" style={{ marginBottom: '1.25rem' }}>
              <table className="tabla">
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Medicamento</th>
                    <th style={{ textAlign: 'center' }}>Cajas Sol.</th>
                    <th style={{ textAlign: 'center' }}>Sueltas Sol.</th>
                    <th style={{ textAlign: 'center' }}>Total Solicitado</th>
                    <th style={{ textAlign: 'center' }}>Despachado</th>
                    <th style={{ textAlign: 'center' }}>Pendiente</th>
                    <th>Estado Línea</th>
                  </tr>
                </thead>
                <tbody>
                  {(ordenParaVer.detalles || []).map((det) => {
                    const pendiente = det.cantidad_total_solicitada - det.cantidad_total_despachada;
                    const completada = pendiente <= 0;
                    const parcial = det.cantidad_total_despachada > 0 && pendiente > 0;
                    return (
                      <tr key={det.id}>
                        <td><span className="mono-tag">{det.medicamento_codigo}</span></td>
                        <td><strong>{det.medicamento_nombre}</strong></td>
                        <td style={{ textAlign: 'center' }}>{det.cantidad_cajas_solicitada}</td>
                        <td style={{ textAlign: 'center' }}>{det.cantidad_unidades_solicitada}</td>
                        <td style={{ textAlign: 'center' }}><strong>{det.cantidad_total_solicitada}</strong></td>
                        <td style={{ textAlign: 'center' }}>
                          <span style={{ color: det.cantidad_total_despachada > 0 ? '#16a34a' : '#64748b', fontWeight: 700 }}>
                            {det.cantidad_total_despachada}
                          </span>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span style={{ color: pendiente > 0 ? '#d97706' : '#64748b', fontWeight: 700 }}>
                            {Math.max(0, pendiente)}
                          </span>
                        </td>
                        <td>
                          {completada ? (
                            <span className="pill estado-verde">DESPACHADO</span>
                          ) : parcial ? (
                            <span className="pill estado-amarillo">PARCIAL</span>
                          ) : (
                            <span className="pill estado-gris">SIN DESPACHAR</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {(ordenParaVer.detalles || []).length === 0 && (
                    <tr>
                      <td colSpan="8" className="tabla-vacia">Sin líneas registradas en esta orden.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* DOCUMENTACIÓN DE QUIEN RECIBE */}
            <h4 style={{ margin: '0 0 0.6rem 0', fontSize: '0.95rem', fontWeight: 700 }}>
              👤 Documentación de quien recibe
            </h4>
            <div style={{ background: '#f8fafc', padding: '0.85rem', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '1.25rem' }}>
              {ordenParaVer.tipo_destino === 'MUNICIPIO_VEREDA' && (
                <div style={{ background: '#eff6ff', padding: '0.6rem 0.85rem', borderRadius: '8px', border: '1px solid #bfdbfe', fontSize: '0.82rem', color: '#1e40af', marginBottom: '0.85rem' }}>
                  🚚 Salida a municipio/vereda: identidad registrada; la firma y la huella quedan <strong>pendientes</strong>. Detalle: <strong>{ordenParaVer.destino_detalle || '—'}</strong>
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
                <div>
                  <span style={{ fontSize: '0.74rem', color: '#64748b', display: 'block' }}>Receptor</span>
                  <strong style={{ fontSize: '0.88rem' }}>{ordenParaVer.receptor_nombre || '—'}</strong>
                </div>
                <div>
                  <span style={{ fontSize: '0.74rem', color: '#64748b', display: 'block' }}>Documento</span>
                  <strong style={{ fontSize: '0.88rem' }}>{ordenParaVer.receptor_documento || '—'}</strong>
                </div>
                <div>
                  <span style={{ fontSize: '0.74rem', color: '#64748b', display: 'block' }}>Teléfono</span>
                  <strong style={{ fontSize: '0.88rem' }}>{ordenParaVer.receptor_telefono || '—'}</strong>
                </div>
                <div>
                  <span style={{ fontSize: '0.74rem', color: '#64748b', display: 'block' }}>Correo</span>
                  <strong style={{ fontSize: '0.88rem' }}>{ordenParaVer.receptor_correo || '—'}</strong>
                </div>
                <div>
                  <span style={{ fontSize: '0.74rem', color: '#64748b', display: 'block' }}>Firma digital</span>
                  {ordenParaVer.tipo_destino === 'MUNICIPIO_VEREDA' ? (
                    <span className="pill estado-amarillo">⏳ Pendiente</span>
                  ) : ordenParaVer.firma_data ? (
                    <span className="pill estado-verde">✓ Registrada</span>
                  ) : (
                    <span className="pill estado-rojo">❌ Sin firma</span>
                  )}
                </div>
                <div>
                  <span style={{ fontSize: '0.74rem', color: '#64748b', display: 'block' }}>Huella dactilar</span>
                  {ordenParaVer.tipo_destino === 'MUNICIPIO_VEREDA' ? (
                    <span className="pill estado-amarillo">⏳ Pendiente</span>
                  ) : ordenParaVer.huella_registrada ? (
                    <span className="pill estado-verde">✓ Capturada</span>
                  ) : (
                    <span className="pill estado-rojo">❌ Sin huella</span>
                  )}
                </div>
                <div>
                  <span style={{ fontSize: '0.74rem', color: '#64748b', display: 'block' }}>Doc. identidad adjunto</span>
                  {ordenParaVer.documento_adjunto_data ? (
                    <span className="pill estado-verde">📄 Adjunto</span>
                  ) : (
                    <span className="pill estado-gris">Sin adjunto</span>
                  )}
                </div>
                <div>
                  <span style={{ fontSize: '0.74rem', color: '#64748b', display: 'block' }}>Estado documental</span>
                  {ordenParaVer.documentacion_completa ? (
                    <span className="pill estado-verde">COMPLETA</span>
                  ) : ordenParaVer.tipo_destino === 'MUNICIPIO_VEREDA' ? (
                    <span className="pill estado-amarillo">PENDIENTE (Envío)</span>
                  ) : (
                    <span className="pill estado-rojo">INCOMPLETA</span>
                  )}
                </div>
              </div>
              {ordenParaVer.estado === 'CANCELADA' && (
                <div style={{ background: '#fee2e2', padding: '0.6rem 0.85rem', borderRadius: '8px', border: '1px solid #fecaca', marginTop: '0.85rem' }}>
                  <span style={{ fontSize: '0.75rem', color: '#991b1b', fontWeight: 700, display: 'block' }}>Motivo de cancelación:</span>
                  <span style={{ fontSize: '0.85rem', color: '#7f1d1d' }}>{ordenParaVer.motivo_cancelacion || '—'}</span>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', borderTop: '1px solid #e2e8f0', paddingTop: '1rem' }}>
              {usuario.rol_nombre === 'SUPERADMIN' && ['PENDIENTE', 'PARCIAL', 'COMPLETADA'].includes(ordenParaVer.estado) && (
                <button
                  type="button"
                  className="btn-secundario"
                  onClick={() => { setOrdenParaVer(null); abrirCompletarDoc(ordenParaVer); }}
                  title="Editar o corregir los datos, firma o huella de quien recibe"
                >
                  ✏️ Editar documentación
                </button>
              )}
              {puedeDespachar && ESTADOS_DESPACHABLES.includes(ordenParaVer.estado) && (
                <button
                  type="button"
                  className="btn-accion-azul"
                  onClick={() => {
                    setOrdenParaVer(null);
                    abrirDespacho(ordenParaVer.id);
                  }}
                >
                  📦 Proceder al Despacho
                </button>
              )}
              <button
                type="button"
                className="btn-secundario"
                onClick={() => setOrdenParaVer(null)}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL PARA CANCELAR ORDEN */}
      {ordenParaCancelar && (
        <div className="modal-overlay" onClick={() => setOrdenParaCancelar(null)}>
          <div className="modal-card" style={{ maxWidth: '500px' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.75rem', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#991b1b', fontWeight: 800 }}>
                🚫 Cancelar Orden {ordenParaCancelar.numero}
              </h3>
              <button
                type="button"
                className="btn-clear-search"
                onClick={() => setOrdenParaCancelar(null)}
                style={{ fontSize: '1.4rem', cursor: 'pointer', padding: '0.2rem 0.5rem', background: 'transparent', border: 'none', color: '#64748b' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleEjecutarCancelacion}>
              <p style={{ fontSize: '0.85rem', color: '#334155', margin: '0 0 0.85rem 0' }}>
                Por favor ingrese el motivo por el cual se cancela esta orden. Este evento quedará registrado en la auditoría inmutable:
              </p>

              <div style={{ marginBottom: '1rem' }}>
                <textarea
                  rows="3"
                  style={{ width: '100%', padding: '0.65rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.88rem', outline: 'none', resize: 'vertical' }}
                  placeholder="Ej: Pedido duplicado / Cancelado a solicitud de la sede..."
                  value={motivoCancelacion}
                  onChange={(e) => setMotivoCancelacion(e.target.value)}
                  autoFocus
                />
              </div>

              {errorCancelacion && <div className="login-error" style={{ marginBottom: '1rem' }}>{errorCancelacion}</div>}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', borderTop: '1px solid #e2e8f0', paddingTop: '1rem' }}>
                <button
                  type="button"
                  className="btn-secundario"
                  onClick={() => setOrdenParaCancelar(null)}
                  disabled={accionEnCurso === ordenParaCancelar.id}
                >
                  Volver / No cancelar
                </button>
                <button
                  type="submit"
                  className="btn-peligro"
                  disabled={accionEnCurso === ordenParaCancelar.id}
                >
                  {accionEnCurso === ordenParaCancelar.id ? 'Cancelando...' : 'Confirmar Cancelación'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal/panel de Despacho */}
      {ordenDespachando && (
        <div className="modal-overlay" onClick={() => setOrdenDespachando(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <DespachoForm
              orden={ordenDespachando}
              lotes={lotes}
              onDespachar={handleDespachar}
              onCancelar={() => setOrdenDespachando(null)}
              error={errorDespacho}
            />
          </div>
        </div>
      )}

      {/* MODAL PARA COMPLETAR DOCUMENTACIÓN DE QUIEN RECIBE */}
      {ordenParaDoc && (
        <div className="modal-overlay" onClick={() => setOrdenParaDoc(null)}>
          <div className="modal-card" style={{ maxWidth: '720px' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.75rem', marginBottom: '1.25rem' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800 }}>
                  ✏️ Editar documentación de {ordenParaDoc.numero}
                </h3>
                <span style={{ fontSize: '0.82rem', color: '#64748b' }}>
                  Complete o corrija los datos que quedaron pendientes de quien recibe. Podrá hacerlo nuevamente hasta que la orden se cierre.
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

      {/* Filtros */}
      <div className="filtros-card">
        <div className="search-bar-wrap">
          <span className="search-icon">🔍</span>
          <input
            type="text"
            className="search-input"
            placeholder="Buscar por número de orden, sede o creador..."
            value={filtroTexto}
            onChange={(e) => setFiltroTexto(e.target.value)}
          />
          {filtroTexto && (
            <button className="btn-clear-search" onClick={() => setFiltroTexto('')}>×</button>
          )}
        </div>

        <div className="pills-filter-group">
          {['TODAS', 'PENDIENTE', 'PARCIAL', 'COMPLETADA', 'CANCELADA'].map((est) => (
            <button
              key={est}
              type="button"
              className={`filter-chip ${filtroEstado === est ? 'chip-activo' : ''}`}
              onClick={() => setFiltroEstado(est)}
            >
              {est}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="login-error">{error}</div>}

      <div className="table-responsive">
        <table className="tabla">
          <thead>
            <tr>
              <th>Número</th>
              <th>Sede</th>
              <th>Destino / Salida</th>
              <th>Creada por</th>
              <th>Recibe</th>
              <th>Fecha de creación</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {ordenesPaginadas.map((o) => (
              <tr key={o.id}>
                <td><strong>{o.numero}</strong></td>
                <td>{o.sede_nombre}</td>
                <td>
                  {o.tipo_destino === 'MUNICIPIO_VEREDA' ? (
                    <span className="pill estado-amarillo" title={o.destino_detalle || 'Salida foránea'}>
                      🚚 {o.destino_detalle || 'Municipio / Vereda'}
                    </span>
                  ) : (
                    <span className="pill estado-gris" title="Despacho local en sede">
                      🏢 Local
                    </span>
                  )}
                </td>
                <td>{o.creador_nombre}</td>
                <td><strong>{o.receptor_nombre || '—'}</strong></td>
                <td>{o.fecha_creacion}</td>
                <td><span className={`pill ${ESTADO_CLASE[o.estado] || ''}`}>{o.estado}</span></td>
                <td className="acciones" style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', alignItems: 'center' }}>
                  {/* Botón VER siempre disponible para todas las órdenes */}
                  <button
                    className="btn-secundario"
                    style={{ padding: '0.3rem 0.6rem', fontSize: '0.78rem' }}
                    onClick={() => abrirVerOrden(o.id)}
                    title="Ver detalle completo de lo que se pide en esta orden"
                  >
                    👁️ Ver
                  </button>

                  {puedeGestionar && ['PENDIENTE', 'PARCIAL'].includes(o.estado) && (
                    <button
                      className="btn-peligro"
                      disabled={accionEnCurso === o.id}
                      onClick={() => abrirModalCancelar(o)}
                    >
                      Cancelar
                    </button>
                  )}

                  {puedeDespachar && ESTADOS_DESPACHABLES.includes(o.estado) && (
                    <button
                      className="btn-accion-azul"
                      onClick={() => abrirDespacho(o.id)}
                    >
                      📦 Despachar
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {ordenesFiltradas.length === 0 && (
              <tr>
                <td colSpan="8" className="tabla-vacia">
                  {cargando ? 'Cargando órdenes...' : 'No se encontraron órdenes registradas.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Pagination
        totalItems={ordenesFiltradas.length}
        paginaActual={pagina}
        itemsPorPagina={porPagina}
        onCambiarPagina={setPagina}
        onCambiarItemsPorPagina={setPorPagina}
      />
    </div>
  );
}
