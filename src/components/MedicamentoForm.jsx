import React, { useState } from 'react';

const inicial = {
  codigo: '', nombre: '', unidad_medida: 'UNIDAD', unidades_por_caja: 1
};

export default function MedicamentoForm({ onCrear, error }) {
  const [form, setForm] = useState(inicial);
  const [enviando, setEnviando] = useState(false);

  function set(campo, valor) {
    setForm((f) => ({ ...f, [campo]: valor }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setEnviando(true);
    const ok = await onCrear({ ...form, unidades_por_caja: 1 });
    setEnviando(false);
    if (ok) setForm(inicial);
  }

  return (
    <form className="panel-form" onSubmit={handleSubmit}>
      <h3>💊 Nuevo Medicamento (Control por Unidad)</h3>
      <div className="form-grid">
        <div>
          <label>Código institucional</label>
          <input
            placeholder="Ej: MED-105"
            value={form.codigo}
            onChange={(e) => set('codigo', e.target.value)}
            required
          />
        </div>
        <div>
          <label>Nombre del medicamento</label>
          <input
            placeholder="Ej: Ibuprofeno 400 mg"
            value={form.nombre}
            onChange={(e) => set('nombre', e.target.value)}
            required
          />
        </div>
        <div>
          <label>Presentación / Forma farmacéutica</label>
          <input
            placeholder="Ej: Tableta, Ampolla, Frasco, Jarabe..."
            value={form.unidad_medida}
            onChange={(e) => set('unidad_medida', e.target.value)}
            required
          />
        </div>
      </div>
      {error && <div className="login-error">{error}</div>}
      <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end' }}>
        <button type="submit" className="btn-primario" disabled={enviando}>
          {enviando ? 'Guardando...' : '✅ Crear Medicamento'}
        </button>
      </div>
    </form>
  );
}
