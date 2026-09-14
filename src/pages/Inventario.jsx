import React, { useEffect, useState, useCallback, useMemo, useDeferredValue } from 'react';
import { inventarioApi } from '../services/inventarioApi.js';
import MedicamentoForm from '../components/MedicamentoForm.jsx';
import LoteForm from '../components/LoteForm.jsx';
import Pagination from '../components/Pagination.jsx';

const ROLES_ESCRITURA = ['SUPERADMIN', 'INVENTARIO'];

const ESTADO_CLASE = {
  DISPONIBLE: 'estado-verde',
  PROXIMO_VENCER: 'estado-amarillo',
  VENCIDO: 'estado-rojo',
  AGOTADO: 'estado-gris'
};

export default function Inventario({ usuario, sedeActiva, params, onClearParams }) {
  const [medicamentos, setMedicamentos] = useState([]);
  const [lotes, setLotes] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [errorMedicamento, setErrorMedicamento] = useState(null);
  const [errorLote, setErrorLote] = useState(null);
  const [errorSolicitud, setErrorSolicitud] = useState(null);
  const [exitoMensaje, setExitoMensaje] = useState(null);

  // Modal para solicitar baja de lote
  const [loteParaBaja, setLoteParaBaja] = useState(null);
  const [motivoBaja, setMotivoBaja] = useState('');
  const [enviandoBaja, setEnviandoBaja] = useState(false);

  // Estados de interacción
  const [mostrarFormMed, setMostrarFormMed] = useState(false);
  const [mostrarFormLote, setMostrarFormLote] = useState(false);
  const [filtroTexto, setFiltroTexto] = useState('');
  const [filtroEstado, setFiltroEstado] = useState(() => params?.filtroEstado || 'TODOS');
  const [pagina, setPagina] = useState(1);
  const [porPagina, setPorPagina] = useState(25);

  useEffect(() => {
    if (params?.filtroEstado) {
      setFiltroEstado(params.filtroEstado);
      setPagina(1);
      onClearParams?.();
    }
  }, [params, onClearParams]);

  const deferredTexto = useDeferredValue(filtroTexto);

  const puedeEscribir = ROLES_ESCRITURA.includes(usuario.rol_nombre);

  const cargar = useCallback(async () => {
    setCargando(true);
    const [medRes, loteRes] = await Promise.all([
      inventarioApi.medicamentos.listar(),
      inventarioApi.lotes.listar(usuario, { sedeId: sedeActiva, limit: porPagina, offset: (pagina - 1) * porPagina })
    ]);
    if (medRes.ok) setMedicamentos(medRes.data);
    if (loteRes.ok) setLotes(loteRes.data);
    setCargando(false);
  }, [usuario, sedeActiva, pagina, porPagina]);

  useEffect(() => { cargar(); }, [cargar]);

  async function handleCrearMedicamento(data) {
    setErrorMedicamento(null);
    const res = await inventarioApi.medicamentos.crear(usuario, data);
    if (!res.ok) { setErrorMedicamento(res.error); return false; }
    setMostrarFormMed(false);
    setExitoMensaje('Medicamento creado exitosamente.');
    setTimeout(() => setExitoMensaje(null), 4000);
    await cargar();
    return true;
  }

  async function handleCrearLote(data) {
    setErrorLote(null);
    const res = await inventarioApi.lotes.crear(usuario, { ...data, sede_id: sedeActiva });
    if (!res.ok) { setErrorLote(res.error); return false; }
    setMostrarFormLote(false);
    setExitoMensaje('Lote registrado exitosamente con movimiento de entrada.');
    setTimeout(() => setExitoMensaje(null), 4000);
    await cargar();
    return true;
  }

  function abrirModalBaja(lote) {
    setLoteParaBaja(lote);
    setMotivoBaja('');
    setErrorSolicitud(null);
  }

  async function handleConfirmarBaja(e) {
    e.preventDefault();
    if (!motivoBaja.trim()) {
      setErrorSolicitud('Debe indicar el motivo de la baja.');
      return;
    }
    setEnviandoBaja(true);
    setErrorSolicitud(null);
    const res = await inventarioApi.solicitudesEliminacion.crear(usuario, {
      registro_id: loteParaBaja.id,
      motivo: motivoBaja.trim()
    });
    setEnviandoBaja(false);
    if (!res.ok) {
      setErrorSolicitud(res.error);
      return;
    }
    setLoteParaBaja(null);
    setExitoMensaje('Solicitud de baja enviada correctamente al Superadmin.');
    setTimeout(() => setExitoMensaje(null), 5000);
    await cargar();
  }

  // Filtrado reactivo de lotes — solo recalcula cuando cambian lotes o filtros
  const { lotesFiltrados, totalUnidades, totalCajas } = useMemo(() => {
    const q = deferredTexto.toLowerCase().trim();
    const filtrados = lotes.filter((l) => {
      const coincideTexto = !q ||
        l.medicamento_nombre?.toLowerCase().includes(q) ||
        l.medicamento_codigo?.toLowerCase().includes(q) ||
        l.numero_lote?.toLowerCase().includes(q) ||
        l.sede_nombre?.toLowerCase().includes(q);
      const coincideEstado = filtroEstado === 'TODOS' || l.estado === filtroEstado;
      return coincideTexto && coincideEstado;
    });
    const unidades = filtrados.reduce((acc, l) => acc + (Number(l.cantidad_total_unidades) || 0), 0);
    const cajas = filtrados.reduce((acc, l) => acc + (Number(l.cantidad_cajas) || 0), 0);
    return { lotesFiltrados: filtrados, totalUnidades: unidades, totalCajas: cajas };
  }, [lotes, deferredTexto, filtroEstado]);

  // Paginación instantánea
  const lotesPaginados = useMemo(() => {
    if (porPagina === 'TODOS') return lotesFiltrados;
    const inicio = (pagina - 1) * porPagina;
    return lotesFiltrados.slice(inicio, inicio + porPagina);
  }, [lotesFiltrados, pagina, porPagina]);

  return (
    <div className="page-container inventario-view">
      <div className="page-header-row">
        <div>
          <h2>Control de Inventario y Lotes</h2>
          <p className="page-scope">
            {usuario.rol_nombre === 'SUPERADMIN' ? 'Vista global (Todas las sedes)' : `Sede actual: ${usuario.sede_nombre}`}
          </p>
        </div>
        {puedeEscribir && (
          <div className="header-actions">
            <button
              className={`btn-toggle-action ${mostrarFormMed ? 'btn-cancelar' : 'btn-primario'}`}
              onClick={() => {
                setMostrarFormMed(!mostrarFormMed);
                if (!mostrarFormMed) setMostrarFormLote(false);
              }}
            >
              {mostrarFormMed ? '✕ Cerrar formulario' : '+ Nuevo Medicamento'}
            </button>
            <button
              className={`btn-toggle-action ${mostrarFormLote ? 'btn-cancelar' : 'btn-verde'}`}
              onClick={() => {
                setMostrarFormLote(!mostrarFormLote);
                if (!mostrarFormLote) setMostrarFormMed(false);
              }}
            >
              {mostrarFormLote ? '✕ Cerrar formulario' : '+ Registrar Lote'}
            </button>
          </div>
        )}
      </div>

      {exitoMensaje && (
        <div className="aviso-ok" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>✅ {exitoMensaje}</span>
          <button className="btn-clear-search" onClick={() => setExitoMensaje(null)}>✕</button>
        </div>
      )}

      {/* Formularios desplegables interactivos */}
      {puedeEscribir && (
        <>
          {mostrarFormMed && (
            <div className="form-collapsible-wrapper">
              <MedicamentoForm onCrear={handleCrearMedicamento} error={errorMedicamento} />
            </div>
          )}
          {mostrarFormLote && (
            <div className="form-collapsible-wrapper">
              <LoteForm medicamentos={medicamentos} onCrear={handleCrearLote} error={errorLote} />
            </div>
          )}
        </>
      )}

      {/* MODAL PARA SOLICITAR BAJA DE LOTE */}
      {loteParaBaja && (
        <div className="modal-overlay" onClick={() => setLoteParaBaja(null)}>
          <div className="modal-card" style={{ maxWidth: '520px' }} onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="modal-close-x"
              onClick={() => setLoteParaBaja(null)}
              title="Cerrar panel"
              aria-label="Cerrar panel"
            >
              ✕
            </button>
            <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '1.15rem', color: '#991b1b', fontWeight: 800 }}>
              🗑️ Solicitar Baja de Lote
            </h3>

            <form onSubmit={handleConfirmarBaja}>
              <div style={{ background: '#f8fafc', padding: '0.75rem', borderRadius: '8px', marginBottom: '1rem', border: '1px solid #e2e8f0', fontSize: '0.84rem' }}>
                <div>Medicamento: <strong>{loteParaBaja.medicamento_codigo} - {loteParaBaja.medicamento_nombre}</strong></div>
                <div>Lote: <span className="mono-tag">{loteParaBaja.numero_lote}</span> | Sede: <strong>{loteParaBaja.sede_nombre}</strong></div>
                <div>Existencias: <strong>{loteParaBaja.cantidad_total_unidades} unidades</strong> ({loteParaBaja.cantidad_cajas} cajas)</div>
                <div>Fecha vencimiento: <strong>{loteParaBaja.fecha_vencimiento}</strong></div>
              </div>

              <p style={{ fontSize: '0.82rem', color: '#64748b', margin: '0 0 0.5rem 0' }}>
                De acuerdo a la normativa, ningún lote se borra directamente. Esta solicitud pasará al Superadmin para su aprobación y quedará en la bitácora inmutable.
              </p>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '0.35rem' }}>
                  Motivo de la baja / eliminación (obligatorio):
                </label>
                <textarea
                  rows="3"
                  style={{ width: '100%', padding: '0.65rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.88rem', outline: 'none', resize: 'vertical' }}
                  placeholder="Ej: Lote vencido / Frascos deteriorados en transporte / Retiro por alerta sanitaria..."
                  value={motivoBaja}
                  onChange={(e) => setMotivoBaja(e.target.value)}
                  autoFocus
                />
              </div>

              {errorSolicitud && <div className="login-error" style={{ marginBottom: '1rem' }}>{errorSolicitud}</div>}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', borderTop: '1px solid #e2e8f0', paddingTop: '1rem' }}>
                <button
                  type="button"
                  className="btn-secundario"
                  onClick={() => setLoteParaBaja(null)}
                  disabled={enviandoBaja}
                >
                  ✕ Cancelar
                </button>
                <button
                  type="submit"
                  className="btn-peligro"
                  disabled={enviandoBaja}
                >
                  {enviandoBaja ? 'Enviando solicitud...' : 'Confirmar Solicitud de Baja'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Barra de búsqueda y filtros rápidos */}
      <div className="filtros-card">
        <div className="search-bar-wrap">
          <span className="search-icon">🔍</span>
          <input
            type="text"
            className="search-input"
            placeholder="Buscar por nombre, código de medicamento o lote..."
            value={filtroTexto}
            onChange={(e) => setFiltroTexto(e.target.value)}
          />
          {filtroTexto && (
            <button className="btn-clear-search" onClick={() => setFiltroTexto('')}>×</button>
          )}
        </div>

        <div className="pills-filter-group">
          {['TODOS', 'DISPONIBLE', 'PROXIMO_VENCER', 'VENCIDO'].map((est) => (
            <button
              key={est}
              type="button"
              className={`filter-chip ${filtroEstado === est ? 'chip-activo' : ''}`}
              onClick={() => setFiltroEstado(est)}
            >
              {est === 'TODOS' ? 'Todos los lotes' : est === 'PROXIMO_VENCER' ? 'Próximos a Vencer' : est === 'DISPONIBLE' ? 'Disponibles' : 'Vencidos'}
            </button>
          ))}
        </div>
      </div>

      {/* Métricas rápidas de los resultados filtrados */}
      <div className="mini-stats-row">
        <span className="mini-stat">Lotes registrados: <strong>{lotesFiltrados.length}</strong></span>
        <span className="mini-stat">Total unidades en inventario: <strong>{totalUnidades}</strong></span>
      </div>

      {/* Tabla de existencias */}
      <div className="table-responsive">
        <table className="tabla">
          <thead>
            <tr>
              <th>Medicamento</th>
              <th>Sede</th>
              <th>Lote</th>
              <th>Vencimiento</th>
              <th>Cantidad (Unidades)</th>
              <th>Estado</th>
              {puedeEscribir && <th>Acciones</th>}
            </tr>
          </thead>
          <tbody>
            {lotesPaginados.map((l) => (
              <tr key={l.id}>
                <td>
                  <strong>{l.medicamento_codigo}</strong> — {l.medicamento_nombre}
                </td>
                <td>{l.sede_nombre}</td>
                <td><span className="mono-tag">{l.numero_lote}</span></td>
                <td>
                  <span className={l.estado === 'VENCIDO' ? 'text-red' : l.estado === 'PROXIMO_VENCER' ? 'text-amber' : ''}>
                    {l.fecha_vencimiento}
                  </span>
                </td>
                <td><strong className="total-highlight">{l.cantidad_total_unidades} unidades</strong></td>
                <td><span className={`pill ${ESTADO_CLASE[l.estado] || ''}`}>{l.estado}</span></td>
                {puedeEscribir && (
                  <td className="acciones">
                    <button
                      className="btn-peligro"
                      onClick={() => abrirModalBaja(l)}
                      title="Solicitar baja/eliminación de este lote"
                    >
                      Baja
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {lotesFiltrados.length === 0 && (
              <tr>
                <td colSpan={puedeEscribir ? 7 : 6} className="tabla-vacia">
                  {cargando ? 'Cargando inventario...' : 'No se encontraron lotes con los filtros aplicados.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Pagination
        totalItems={lotesFiltrados.length}
        paginaActual={pagina}
        itemsPorPagina={porPagina}
        onCambiarPagina={setPagina}
        onCambiarItemsPorPagina={setPorPagina}
      />
    </div>
  );
}
