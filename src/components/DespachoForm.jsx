import React, { useState, useMemo } from 'react';

export default function DespachoForm({ orden, lotes, onDespachar, onCancelar, error }) {
  // cantidades: { [orden_detalle_id]: { lote_id, unidades: '' } }
  const [cantidades, setCantidades] = useState({});
  const [enviando, setEnviando] = useState(false);

  const lineasPendientes = useMemo(
    () => (orden.detalles || []).filter((d) => (d.cantidad_total_solicitada - d.cantidad_total_despachada) > 0),
    [orden]
  );

function lotesDelMedicamento(medicamentoId) {
    // Solo lotes de la sede de la orden, sin importar si el usuario tiene visión global.
    return (lotes || []).filter(
      (l) =>
        l.sede_id === orden.sede_id &&
        l.medicamento_id === medicamentoId &&
        (l.estado === 'DISPONIBLE' || l.estado === 'PROXIMO_VENCER') &&
        Number(l.cantidad_total_unidades ?? 0) > 0
    );
  }

  function getVal(detalleId) {
    return cantidades[detalleId] || { lote_id: '', unidades: '' };
  }

  function set(detalleId, campo, valor) {
    setCantidades((prev) => {
      const actual = prev[detalleId] || { lote_id: '', unidades: '' };
      return {
        ...prev,
        [detalleId]: { ...actual, [campo]: valor }
      };
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const items = lineasPendientes
      .map((d) => {
        const c = getVal(d.id);
        if (!c.lote_id) return null;
        const total = Number(c.unidades || 0);
        if (total <= 0) return null;

        return {
          orden_detalle_id: d.id,
          lote_id: Number(c.lote_id),
          cantidad_cajas_despachada: 0,
          cantidad_unidades_sueltas_despachada: total,
          cantidad_total_despachada: total,
          cantidad_unidades_despachada: total
        };
      })
      .filter(Boolean);

    if (items.length === 0) {
      alert('Debe seleccionar al menos un lote e indicar la cantidad en unidades a despachar.');
      return;
    }

    setEnviando(true);
    await onDespachar(items);
    setEnviando(false);
  }

  return (
    <form className="panel-form despacho-form" onSubmit={handleSubmit}>
      <button
        type="button"
        className="modal-close-x"
        onClick={onCancelar}
        title="Cerrar panel"
        aria-label="Cerrar panel"
      >
        ✕
      </button>

      <div className="modal-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.75rem', paddingRight: '2.75rem' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800 }}>📦 Despachar Orden {orden.numero} (por Unidad)</h3>
          <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.82rem', color: '#64748b' }}>
            Sede: <strong>{orden.sede_nombre}</strong> | Despacho total o parcial por lote en unidades
          </p>
        </div>
      </div>

      {lineasPendientes.length === 0 ? (
        <p className="tabla-vacia">Esta orden no tiene líneas pendientes por despachar.</p>
      ) : (
        <div className="despacho-lineas-container" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginBottom: '1.5rem' }}>
          {lineasPendientes.map((d) => {
            const pendiente = d.cantidad_total_solicitada - d.cantidad_total_despachada;
            const opcionesLote = lotesDelMedicamento(d.medicamento_id);
            const c = getVal(d.id);
            const totalADespachar = Number(c.unidades || 0);
            const sobrante = pendiente - totalADespachar;

            return (
              <div
                key={d.id}
                className="despacho-card-linea"
                style={{
                  background: '#f8fafc',
                  border: '1px solid #cbd5e1',
                  borderRadius: '10px',
                  padding: '1rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div>
                    <strong style={{ fontSize: '0.95rem', color: '#0f172a' }}>{d.medicamento_codigo} — {d.medicamento_nombre}</strong>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span className="pill estado-amarillo" style={{ fontSize: '0.8rem' }}>
                      Pendiente: <strong>{pendiente}</strong> unidades
                    </span>
                  </div>
                </div>

                {/* Selección de Lote */}
                <div>
                  <label style={{ fontSize: '0.78rem', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '0.25rem' }}>
                    Seleccionar Lote Disponible:
                  </label>
                  <select
                    style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem', background: '#ffffff' }}
                    value={c.lote_id}
                    onChange={(e) => set(d.id, 'lote_id', e.target.value)}
                  >
                    <option value="">-- Seleccionar lote a despachar --</option>
                    {opcionesLote.map((l) => (
                      <option key={l.id} value={l.id}>
                        Lote: {l.numero_lote} | Vence: {l.fecha_vencimiento} | Stock disponible: {l.cantidad_total_unidades} unidades {l.estado === 'PROXIMO_VENCER' ? '⚠️ (Próximo a vencer)' : ''}
                      </option>
                    ))}
                  </select>
                  {opcionesLote.length === 0 && (
                    <span style={{ fontSize: '0.75rem', color: '#dc2626', display: 'block', marginTop: '0.2rem' }}>
                      ⚠️ No hay lotes disponibles con stock en esta sede para este medicamento.
                    </span>
                  )}
                </div>

                {/* Input de cantidad en unidades */}
                <div style={{ maxWidth: '280px' }}>
                  <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '0.2rem' }}>
                    Cantidad a despachar (unidades):
                  </label>
                  <input
                    type="number"
                    min="1"
                    max={pendiente}
                    placeholder={`Máx. ${pendiente}`}
                    value={c.unidades}
                    onChange={(e) => set(d.id, 'unidades', e.target.value)}
                    style={{ width: '100%', padding: '0.5rem 0.65rem', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.85rem' }}
                  />
                </div>

                {/* Resumen del despacho de esta línea */}
                {totalADespachar > 0 && (
                  <div style={{ background: '#eff6ff', padding: '0.5rem 0.75rem', borderRadius: '6px', fontSize: '0.8rem', color: '#1e40af', border: '1px solid #bfdbfe' }}>
                    <span>➡️ Total a despachar: <strong>{totalADespachar} unidades</strong>.</span>
                    {sobrante > 0 ? (
                      <span style={{ display: 'block', color: '#b45309', marginTop: '0.2rem' }}>
                        ⚠️ <strong>Despacho Parcial:</strong> Quedarán <strong>{sobrante} unidades pendientes</strong> por despachar.
                      </span>
                    ) : sobrante === 0 ? (
                      <span style={{ display: 'block', color: '#15803d', marginTop: '0.2rem' }}>
                        ✅ <strong>Despacho Completo:</strong> Cumple con el 100% de lo solicitado para esta línea.
                      </span>
                    ) : (
                      <span style={{ display: 'block', color: '#dc2626', marginTop: '0.2rem' }}>
                        ❌ <strong>Atención:</strong> La cantidad a despachar supera las {pendiente} unidades pendientes.
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {error && <div className="login-error" style={{ marginBottom: '1rem' }}>{error}</div>}

      <div className="despacho-acciones" style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', borderTop: '1px solid #e2e8f0', paddingTop: '1rem' }}>
        <button type="button" className="btn-secundario" onClick={onCancelar} style={{ cursor: 'pointer' }}>
          ✕ Cancelar
        </button>
        <button
          type="submit"
          className="btn-primario"
          disabled={enviando || lineasPendientes.length === 0}
          style={{ cursor: 'pointer' }}
        >
          {enviando ? 'Procesando despacho...' : '📦 Confirmar Despacho'}
        </button>
      </div>
    </form>
  );
}
