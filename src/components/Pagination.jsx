import React, { memo } from 'react';

function Pagination({
  totalItems,
  paginaActual,
  itemsPorPagina,
  onCambiarPagina,
  onCambiarItemsPorPagina,
  opcionesTamanio = [25, 50, 100]
}) {
  if (totalItems <= 0) return null;

  const totalPaginas = itemsPorPagina === 'TODOS' ? 1 : Math.ceil(totalItems / itemsPorPagina);
  const inicio = itemsPorPagina === 'TODOS' ? 1 : (paginaActual - 1) * itemsPorPagina + 1;
  const fin = itemsPorPagina === 'TODOS' ? totalItems : Math.min(paginaActual * itemsPorPagina, totalItems);

  return (
    <div className="pagination-bar" style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      flexWrap: 'wrap',
      gap: '0.75rem',
      padding: '0.75rem 1rem',
      background: '#ffffff',
      borderTop: '1px solid #e2e8f0',
      borderRadius: '0 0 12px 12px',
      fontSize: '0.82rem',
      color: '#475569'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <span>
          Mostrando <strong>{inicio}</strong> – <strong>{fin}</strong> de <strong>{totalItems}</strong> registros
        </span>
        {onCambiarItemsPorPagina && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>Por pág:</span>
            <select
              value={itemsPorPagina}
              onChange={(e) => {
                const val = e.target.value === 'TODOS' ? 'TODOS' : Number(e.target.value);
                onCambiarItemsPorPagina(val);
                onCambiarPagina(1);
              }}
              style={{
                padding: '0.2rem 0.45rem',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                fontSize: '0.78rem',
                background: '#f8fafc',
                cursor: 'pointer'
              }}
            >
              {opcionesTamanio.map((tam) => (
                <option key={tam} value={tam}>{tam}</option>
              ))}
              <option value="TODOS">Todos</option>
            </select>
          </div>
        )}
      </div>

      {totalPaginas > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          <button
            type="button"
            className="btn-secundario"
            style={{ padding: '0.25rem 0.55rem', fontSize: '0.78rem' }}
            disabled={paginaActual <= 1}
            onClick={() => onCambiarPagina(1)}
            title="Primera página"
          >
            ««
          </button>
          <button
            type="button"
            className="btn-secundario"
            style={{ padding: '0.25rem 0.55rem', fontSize: '0.78rem' }}
            disabled={paginaActual <= 1}
            onClick={() => onCambiarPagina(paginaActual - 1)}
            title="Página anterior"
          >
            ‹ Ant
          </button>

          <span style={{ padding: '0 0.4rem', fontWeight: 600, color: '#1e293b' }}>
            Pág {paginaActual} de {totalPaginas}
          </span>

          <button
            type="button"
            className="btn-secundario"
            style={{ padding: '0.25rem 0.55rem', fontSize: '0.78rem' }}
            disabled={paginaActual >= totalPaginas}
            onClick={() => onCambiarPagina(paginaActual + 1)}
            title="Página siguiente"
          >
            Sig ›
          </button>
          <button
            type="button"
            className="btn-secundario"
            style={{ padding: '0.25rem 0.55rem', fontSize: '0.78rem' }}
            disabled={paginaActual >= totalPaginas}
            onClick={() => onCambiarPagina(totalPaginas)}
            title="Última página"
          >
            »»
          </button>
        </div>
      )}
    </div>
  );
}

export default memo(Pagination);
