import React, { useState } from 'react';

const inicial = {
  medicamento_id: '',
  numero_lote: '',
  fecha_expedicion: '',
  fecha_vencimiento: '',
  cantidad_unidades: ''
};

export default function LoteForm({ medicamentos, onCrear, error }) {
  const [form, setForm] = useState(inicial);
  const [enviando, setEnviando] = useState(false);

  function set(campo, valor) {
    setForm((f) => ({ ...f, [campo]: valor }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.medicamento_id) {
      alert('Debe seleccionar un medicamento.');
      return;
    }
    const cant = Number(form.cantidad_unidades);
    if (isNaN(cant) || cant <= 0) {
      alert('La cantidad de unidades debe ser mayor a 0.');
      return;
    }

    setEnviando(true);
    const ok = await onCrear({
      ...form,
      cantidad_total_unidades: cant,
      cantidad_unidades_sueltas: cant,
      cantidad_cajas: 0
    });
    setEnviando(false);
    if (ok) setForm(inicial);
  }

  return (
    <form className="panel-form" onSubmit={handleSubmit}>
      <h3>📦 Registrar Entrada de Lote (por Unidad)</h3>
      <div className="form-grid">
        <div>
          <label>Medicamento</label>
          <select
            value={form.medicamento_id}
            onChange={(e) => set('medicamento_id', e.target.value)}
            required
          >
            <option value="">-- Seleccione medicamento... --</option>
            {medicamentos.map((m) => (
              <option key={m.id} value={m.id}>{m.codigo} - {m.nombre}</option>
            ))}
          </select>
        </div>
        <div>
          <label>Número de Lote</label>
          <input
            placeholder="Ej: LOTE-2026-A"
            value={form.numero_lote}
            onChange={(e) => set('numero_lote', e.target.value)}
            required
          />
        </div>
        <div>
          <label>Fecha de Expedición</label>
          <input
            type="date"
            value={form.fecha_expedicion}
            onChange={(e) => set('fecha_expedicion', e.target.value)}
            required
          />
        </div>
        <div>
          <label>Fecha de Vencimiento</label>
          <input
            type="date"
            value={form.fecha_vencimiento}
            onChange={(e) => set('fecha_vencimiento', e.target.value)}
            required
          />
        </div>
        <div>
          <label>Cantidad de Unidades</label>
          <input
            type="number"
            min="1"
            placeholder="Ej: 500"
            value={form.cantidad_unidades}
            onChange={(e) => set('cantidad_unidades', e.target.value)}
            required
          />
        </div>
      </div>
      {error && <div className="login-error">{error}</div>}
      <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end' }}>
        <button type="submit" className="btn-verde" disabled={enviando}>
          {enviando ? 'Guardando entrada...' : '✅ Registrar Entrada de Lote'}
        </button>
      </div>
    </form>
  );
}
