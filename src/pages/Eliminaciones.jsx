import React, { useEffect, useState, useCallback } from 'react';
import { inventarioApi } from '../services/inventarioApi.js';

const ESTADO_CLASE = {
  PENDIENTE: 'estado-amarillo',
  APROBADA: 'estado-verde',
  RECHAZADA: 'estado-rojo'
};

export default function Eliminaciones({ usuario, sedeActiva }) {
  const [solicitudes, setSolicitudes] = useState([]);
  const [ordenesCanceladas, setOrdenesCanceladas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [accionEnCurso, setAccionEnCurso] = useState(null);
  const [filtroTexto, setFiltroTexto] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('TODAS');

  // Modal para rechazar con motivo
  const [solicitudParaRechazar, setSolicitudParaRechazar] = useState(null);
  const [motivoRechazo, setMotivoRechazo] = useState('');
  const [errorRechazo, setErrorRechazo] = useState(null);

  const esSuperadmin = usuario.rol_nombre === 'SUPERADMIN';

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    const res = await inventarioApi.solicitudesEliminacion.listar(usuario, { sedeId: sedeActiva });
    if (res.ok) setSolicitudes(res.data);
    else setError(res.error);

    const resOrdenes = await inventarioApi.ordenes.listar(usuario, { sedeId: sedeActiva });
    if (resOrdenes.ok) {
      setOrdenesCanceladas(resOrdenes.data.filter((o) => o.estado === 'CANCELADA'));
    }
    setCargando(false);
  }, [usuario, sedeActiva]);

  useEffect(() => { cargar(); }, [cargar]);

  async function handleAprobar(id) {
    if (!window.confirm('¿Está seguro de APROBAR esta solicitud de baja? El lote será dado de baja definitivamente del inventario.')) {
      return;
    }
    setAccionEnCurso(id);
    setError(null);
    const res = await inventarioApi.solicitudesEliminacion.resolver(usuario, id, { decision: 'APROBADA', observacion: 'Aprobada por Superadmin' });
    setAccionEnCurso(null);
    if (!res.ok) { setError(res.error); return; }
    await cargar();
  }

  function abrirModalRechazar(solicitud) {
    setSolicitudParaRechazar(solicitud);
    setMotivoRechazo('');
    setErrorRechazo(null);
  }

  async function handleConfirmarRechazo(e) {
    e.preventDefault();
    if (!motivoRechazo.trim()) {
      setErrorRechazo('Debe indicar el motivo del rechazo.');
      return;
    }
    setAccionEnCurso(solicitudParaRechazar.id);
    setErrorRechazo(null);
    const res = await inventarioApi.solicitudesEliminacion.resolver(usuario, solicitudParaRechazar.id, {
      decision: 'RECHAZADA',
      observacion: motivoRechazo.trim()
    });
    setAccionEnCurso(null);
    if (!res.ok) {
      setErrorRechazo(res.error);
      return;
    }
    setSolicitudParaRechazar(null);
    await cargar();
  }

  const q = filtroTexto.toLowerCase().trim();
  const solicitudesFiltradas = solicitudes.filter((s) => {
    const coincideTexto = !q ||
      s.medicamento_nombre?.toLowerCase().includes(q) ||
      s.medicamento_codigo?.toLowerCase().includes(q) ||
      s.numero_lote?.toLowerCase().includes(q) ||
      s.motivo?.toLowerCase().includes(q) ||
      s.solicitante_nombre?.toLowerCase().includes(q);

    const coincideEstado = filtroEstado === 'TODAS' || s.estado === filtroEstado;
    return coincideTexto && coincideEstado;
  });

  return (
    <div className="page-container eliminaciones-view">
      <div className="page-header-row">
        <div>
          <h2>Solicitudes de Baja y Eliminación</h2>
          <p className="page-scope">
            {esSuperadmin ? 'Panel de aprobación y auditoría de bajas (Superadmin)' : `Sede: ${usuario.sede_nombre}`}
          </p>
        </div>
        <div className="header-actions">
          <button className="btn-refrescar" onClick={cargar} title="Recargar">🔄 Actualizar</button>
        </div>
      </div>

      {/* MODAL PARA RECHAZAR SOLICITUD */}
      {solicitudParaRechazar && (
        <div className="modal-overlay" onClick={() => setSolicitudParaRechazar(null)}>
          <div className="modal-card" style={{ maxWidth: '520px' }} onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="modal-close-x"
              onClick={() => setSolicitudParaRechazar(null)}
              title="Cerrar panel"
              aria-label="Cerrar panel"
            >
              ✕
            </button>
            <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '1.15rem', color: '#991b1b', fontWeight: 800 }}>
              🚫 Rechazar Solicitud #{solicitudParaRechazar.id}
            </h3>

            <form onSubmit={handleConfirmarRechazo}>
              <div style={{ background: '#f8fafc', padding: '0.75rem', borderRadius: '8px', marginBottom: '1rem', border: '1px solid #e2e8f0', fontSize: '0.84rem' }}>
                <div>Medicamento: <strong>{solicitudParaRechazar.medicamento_nombre}</strong> (Lote: {solicitudParaRechazar.numero_lote})</div>
                <div>Motivo original solicitado: <em>"{solicitudParaRechazar.motivo}"</em></div>
                <div>Solicitado por: <strong>{solicitudParaRechazar.solicitante_nombre}</strong></div>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '0.35rem' }}>
                  Motivo o justificación del rechazo (obligatorio):
                </label>
                <textarea
                  rows="3"
                  style={{ width: '100%', padding: '0.65rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.88rem', outline: 'none', resize: 'vertical' }}
                  placeholder="Ej: El lote aún cuenta con vida útil / No cumple con la política de mermas..."
                  value={motivoRechazo}
                  onChange={(e) => setMotivoRechazo(e.target.value)}
                  autoFocus
                />
              </div>

              {errorRechazo && <div className="login-error" style={{ marginBottom: '1rem' }}>{errorRechazo}</div>}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', borderTop: '1px solid #e2e8f0', paddingTop: '1rem' }}>
                <button
                  type="button"
                  className="btn-secundario"
                  onClick={() => setSolicitudParaRechazar(null)}
                  disabled={accionEnCurso === solicitudParaRechazar.id}
                >
                  ✕ Cancelar
                </button>
                <button
                  type="submit"
                  className="btn-peligro"
                  disabled={accionEnCurso === solicitudParaRechazar.id}
                >
                  {accionEnCurso === solicitudParaRechazar.id ? 'Rechazando...' : 'Confirmar Rechazo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="filtros-card">
        <div className="search-bar-wrap">
          <span className="search-icon">🔍</span>
          <input
            type="text"
            className="search-input"
            placeholder="Buscar por motivo, solicitante, medicamento o lote..."
            value={filtroTexto}
            onChange={(e) => setFiltroTexto(e.target.value)}
          />
          {filtroTexto && (
            <button className="btn-clear-search" onClick={() => setFiltroTexto('')}>×</button>
          )}
        </div>

        <div className="pills-filter-group">
          {['TODAS', 'PENDIENTE', 'APROBADA', 'RECHAZADA'].map((est) => (
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
              <th>ID</th>
              <th>Sede</th>
              <th>Medicamento</th>
              <th>Lote</th>
              <th>Solicitante</th>
              <th>Motivo de baja</th>
              <th>Fecha de solicitud</th>
              <th>Estado</th>
              <th>Resolutor / Obs.</th>
              {esSuperadmin && <th>Acciones</th>}
            </tr>
          </thead>
          <tbody>
            {solicitudesFiltradas.map((s) => (
              <tr key={s.id}>
                <td><strong>#{s.id}</strong></td>
                <td>{s.sede_nombre}</td>
                <td><strong>{s.medicamento_codigo}</strong> - {s.medicamento_nombre}</td>
                <td><span className="mono-tag">{s.numero_lote}</span></td>
                <td>{s.solicitante_nombre}</td>
                <td>{s.motivo}</td>
                <td>{s.fecha_solicitud}</td>
                <td><span className={`pill ${ESTADO_CLASE[s.estado] || ''}`}>{s.estado}</span></td>
                <td>
                  {s.resolutor_nombre ? (
                    <div>
                      <strong>{s.resolutor_nombre}</strong>
                      {s.observacion_resolucion && (
                        <div style={{ fontSize: '0.74rem', color: '#64748b' }}>
                          "{s.observacion_resolucion}"
                        </div>
                      )}
                    </div>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </td>
                {esSuperadmin && (
                  <td className="acciones" style={{ whiteSpace: 'nowrap' }}>
                    {s.estado === 'PENDIENTE' ? (
                      <>
                        <button
                          className="btn-accion-ok"
                          disabled={accionEnCurso === s.id}
                          onClick={() => handleAprobar(s.id)}
                          title="Aprobar baja del lote"
                        >
                          {accionEnCurso === s.id ? '...' : 'Aprobar'}
                        </button>
                        <button
                          className="btn-peligro"
                          disabled={accionEnCurso === s.id}
                          onClick={() => abrirModalRechazar(s)}
                          title="Rechazar solicitud con motivo"
                        >
                          Rechazar
                        </button>
                      </>
                    ) : (
                      <span style={{ fontSize: '0.76rem', color: '#94a3b8' }}>Resuelto</span>
                    )}
                  </td>
                )}
              </tr>
            ))}
            {solicitudesFiltradas.length === 0 && (
              <tr>
                <td colSpan={esSuperadmin ? 10 : 9} className="tabla-vacia">
                  {cargando ? 'Cargando solicitudes...' : 'No se encontraron solicitudes de eliminación.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ÓRDENES CANCELADAS */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', margin: '1.75rem 0 0.75rem 0' }}>
        <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800 }}>🚫 Órdenes Canceladas</h3>
        <span className="counter-badge bg-red-badge">{ordenesCanceladas.length}</span>
      </div>

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
              <th>Motivo de cancelación</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {ordenesCanceladas.map((o) => (
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
                <td>{o.motivo_cancelacion || '—'}</td>
                <td><span className="pill estado-gris">CANCELADA</span></td>
              </tr>
            ))}
            {ordenesCanceladas.length === 0 && (
              <tr>
                <td colSpan="8" className="tabla-vacia">
                  {cargando ? 'Cargando órdenes...' : 'No hay órdenes canceladas.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
