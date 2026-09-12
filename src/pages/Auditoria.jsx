import React, { useEffect, useState, useCallback, useMemo, useDeferredValue } from 'react';
import { inventarioApi } from '../services/inventarioApi.js';
import Pagination from '../components/Pagination.jsx';

export default function Auditoria({ usuario, sedeActiva }) {
  const esSuperadmin = usuario.rol_nombre === 'SUPERADMIN';
  const esAdmin = usuario.rol_nombre === 'ADMIN';

  const [eventos, setEventos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [sedes, setSedes] = useState([]);
  const [sedeAuditoria, setSedeAuditoria] = useState(() => sedeActiva ?? 'TODAS');
  const [filtroTexto, setFiltroTexto] = useState('');
  const [pagina, setPagina] = useState(1);
  const [porPagina, setPorPagina] = useState(25);

  const deferredTexto = useDeferredValue(filtroTexto);

  useEffect(() => {
    if (!esSuperadmin) return;
    let cancelado = false;
    inventarioApi.sedes.listar().then((res) => {
      if (!cancelado && res.ok) setSedes(res.data || []);
    });
    return () => { cancelado = true; };
  }, [esSuperadmin]);

  useEffect(() => {
    if (!esSuperadmin) return;
    setSedeAuditoria(sedeActiva == null ? 'TODAS' : sedeActiva);
  }, [esSuperadmin, sedeActiva]);

  const sedeIdConsulta = esSuperadmin
    ? (sedeAuditoria === 'TODAS' || sedeAuditoria == null ? null : Number(sedeAuditoria))
    : (sedeActiva || usuario.sede_id);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    const res = await inventarioApi.auditoria.listar(usuario, { sedeId: sedeIdConsulta });
    if (res.ok) setEventos(res.data);
    else setError(res.error);
    setCargando(false);
  }, [usuario, sedeIdConsulta]);

  useEffect(() => { cargar(); }, [cargar]);

  if (!esSuperadmin && !esAdmin) {
    return (
      <div className="page-container">
        <p className="page-scope">No tiene permisos para consultar la auditoría.</p>
      </div>
    );
  }

  const eventosFiltrados = useMemo(() => {
    const q = deferredTexto.toLowerCase().trim();
    return eventos.filter((e) => {
      return !q ||
        e.usuario_nombre?.toLowerCase().includes(q) ||
        e.accion?.toLowerCase().includes(q) ||
        e.modulo?.toLowerCase().includes(q) ||
        e.registro_afectado?.toLowerCase().includes(q) ||
        e.sede_nombre?.toLowerCase().includes(q);
    });
  }, [eventos, deferredTexto]);

  const eventosPaginados = useMemo(() => {
    if (porPagina === 'TODOS') return eventosFiltrados;
    const inicio = (pagina - 1) * porPagina;
    return eventosFiltrados.slice(inicio, inicio + porPagina);
  }, [eventosFiltrados, pagina, porPagina]);

  return (
    <div className="page-container auditoria-view">
      <div className="page-header-row">
        <div>
          <h2>Auditoría Inmutable de Seguridad</h2>
          <p className="page-scope">
            {esSuperadmin
              ? (sedeIdConsulta ? `Eventos de la sede seleccionada (ID ${sedeIdConsulta})` : 'Registro cronológico global (Todas las sedes)')
              : `Sede: ${usuario.sede_nombre}`}
          </p>
        </div>
        <div className="header-actions" style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          {esSuperadmin && (
            <select
              className="user-sede-selector"
              value={sedeAuditoria == null ? 'TODAS' : sedeAuditoria}
              onChange={(e) => {
                setSedeAuditoria(e.target.value);
                setPagina(1);
              }}
              style={{ padding: '0.45rem 0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1' }}
            >
              <option value="TODAS">Todas las sedes</option>
              {sedes.map((s) => (
                <option key={s.id} value={s.id}>{s.nombre}</option>
              ))}
            </select>
          )}
          <button className="btn-refrescar" onClick={cargar} title="Recargar">🔄 Actualizar</button>
        </div>
      </div>

      <div className="filtros-card">
        <div className="search-bar-wrap">
          <span className="search-icon">🔍</span>
          <input
            type="text"
            className="search-input"
            placeholder="Buscar por usuario, acción, módulo o registro..."
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
        <div className="mini-stats-row">
          <span className="mini-stat">Total eventos registrados: <strong>{eventosFiltrados.length}</strong></span>
        </div>
      </div>

      {error && <div className="login-error">{error}</div>}

      <div className="table-responsive">
        <table className="tabla">
          <thead>
            <tr>
              <th>Fecha y Hora</th>
              <th>Usuario</th>
              <th>Rol</th>
              <th>Sede</th>
              <th>Acción</th>
              <th>Módulo</th>
              <th>Registro Afectado</th>
              <th>Resultado</th>
            </tr>
          </thead>
          <tbody>
            {eventosPaginados.map((e) => (
              <tr key={e.id}>
                <td>{e.fecha}</td>
                <td><strong>{e.usuario_nombre || '—'}</strong></td>
                <td><span className="user-badge">{e.rol || '—'}</span></td>
                <td>{e.sede_nombre || '—'}</td>
                <td><span className="mono-tag">{e.accion}</span></td>
                <td>{e.modulo}</td>
                <td>{e.registro_afectado || '—'}</td>
                <td>
                  <span className={`pill ${e.resultado === 'EXITO' ? 'estado-verde' : 'estado-rojo'}`}>
                    {e.resultado}
                  </span>
                </td>
              </tr>
            ))}
            {eventosFiltrados.length === 0 && (
              <tr>
                <td colSpan="8" className="tabla-vacia">
                  {cargando ? 'Cargando auditoría...' : 'Sin eventos registrados con los filtros actuales.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Pagination
        totalItems={eventosFiltrados.length}
        paginaActual={pagina}
        itemsPorPagina={porPagina}
        onCambiarPagina={setPagina}
        onCambiarItemsPorPagina={setPorPagina}
      />
    </div>
  );
}
