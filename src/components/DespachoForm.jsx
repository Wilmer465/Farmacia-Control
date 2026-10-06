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
        ×
      </button>

      <div className="modal-cabecera modal-cabecera--apartada">
        <div>
          <h3> Despachar Orden {orden.numero} (por Unidad)</h3>
          <p className="modal-subtitulo">
            Sede: <strong>{orden.sede_nombre}</strong> | Despacho total o parcial por lote en unidades
          </p>
        </div>
      </div>

      {lineasPendientes.length === 0 ? (
        <p className="tabla-vacia">Esta orden no tiene líneas pendientes por despachar.</p>
      ) : (
        <div className="despacho-lineas-container">
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
              >
                <div className="linea-despacho-cabecera">
                  <div>
                    <strong className="linea-despacho-titulo">{d.medicamento_codigo} — {d.medicamento_nombre}</strong>
                  </div>
                  <div className="linea-despacho-estado">
                    <span className="pill estado-amarillo linea-despacho-pildora">
                      Pendiente: <strong>{pendiente}</strong> unidades
                    </span>
                  </div>
                </div>

                {/* Selección de Lote */}
                <div>
                  <label className="form-label">
                    Seleccionar Lote Disponible:
                  </label>
                  <select
                    className="form-select"
                    value={c.lote_id}
                    onChange={(e) => set(d.id, 'lote_id', e.target.value)}
                  >
                    <option value="">-- Seleccionar lote a despachar --</option>
                    {opcionesLote.map((l) => (
                      <option key={l.id} value={l.id}>
                        Lote: {l.numero_lote} | Vence: {l.fecha_vencimiento} | Stock disponible: {l.cantidad_total_unidades} unidades {l.estado === 'PROXIMO_VENCER' ? ' (Próximo a vencer)' : ''}
                      </option>
                    ))}
                  </select>
                  {opcionesLote.length === 0 && (
                    <span className="form-error">
                       No hay lotes disponibles con stock en esta sede para este medicamento.
                    </span>
                  )}
                </div>

                {/* Input de cantidad en unidades */}
                <div className="campo-cantidad">
                  <label className="form-label">
                    Cantidad a despachar (unidades):
                  </label>
                  <input
                    type="number"
                    className="form-input"
                    min="1"
                    max={pendiente}
                    placeholder={`Máx. ${pendiente}`}
                    value={c.unidades}
                    onChange={(e) => set(d.id, 'unidades', e.target.value)}
                  />
                </div>

                {/* Resumen del despacho de esta línea */}
                {totalADespachar > 0 && (
                  <div className="resumen-despacho">
                    <span> Total a despachar: <strong>{totalADespachar} unidades</strong>.</span>
                    {sobrante > 0 ? (
                      <span className="resumen-despacho--parcial">
                         <strong>Despacho Parcial:</strong> Quedarán <strong>{sobrante} unidades pendientes</strong> por despachar.
                      </span>
                    ) : sobrante === 0 ? (
                      <span className="resumen-despacho--completo">
                         <strong>Despacho Completo:</strong> Cumple con el 100% de lo solicitado para esta línea.
                      </span>
                    ) : (
                      <span className="resumen-despacho--exceso">
                         <strong>Atención:</strong> La cantidad a despachar supera las {pendiente} unidades pendientes.
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {error && <div className="login-error alerta-formulario">{error}</div>}

      <div className="modal-acciones">
        <button type="button" className="btn-secundario" onClick={onCancelar}>
          × Cancelar
        </button>
        <button
          type="submit"
          className="btn-primario"
          disabled={enviando || lineasPendientes.length === 0}
        >
          {enviando ? 'Procesando despacho...' : ' Confirmar Despacho'}
        </button>
      </div>
    </form>
  );
}
