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
    <div className="pagination-bar">
      <div className="pagination-info">
        <span>
          Mostrando <strong>{inicio}</strong> – <strong>{fin}</strong> de <strong>{totalItems}</strong> registros
        </span>
        {onCambiarItemsPorPagina && (
          <div className="pagination-controls">
            <span className="pagination-label">Por pág:</span>
            <select
              className="pagination-size"
              value={itemsPorPagina}
              onChange={(e) => {
                const val = e.target.value === 'TODOS' ? 'TODOS' : Number(e.target.value);
                onCambiarItemsPorPagina(val);
                onCambiarPagina(1);
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
        <div className="pagination-controls">
          <button
            type="button"
            className="btn-secundario"
            disabled={paginaActual <= 1}
            onClick={() => onCambiarPagina(1)}
            title="Primera página"
          >
            ««
          </button>
          <button
            type="button"
            className="btn-secundario"
            disabled={paginaActual <= 1}
            onClick={() => onCambiarPagina(paginaActual - 1)}
            title="Página anterior"
          >
            ‹ Ant
          </button>

          <span className="pagination-current">
            Pág {paginaActual} de {totalPaginas}
          </span>

          <button
            type="button"
            className="btn-secundario"
            disabled={paginaActual >= totalPaginas}
            onClick={() => onCambiarPagina(paginaActual + 1)}
            title="Página siguiente"
          >
            Sig ›
          </button>
          <button
            type="button"
            className="btn-secundario"
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
