import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { inventarioApi } from '../services/inventarioApi.js';

const ESTADO_CLASE = {
  PENDIENTE: 'estado-amarillo',
  APROBADA: 'estado-verde',
  RECHAZADA: 'estado-rojo'
};

export default function Eliminaciones({ usuario, sedeActiva }) {
  const [solicitudesBaja, setSolicitudesBaja] = useState([]);
  const [solicitudesIntercambio, setSolicitudesIntercambio] = useState([]);
  const [ordenesCanceladas, setOrdenesCanceladas] = useState([]);
  const [sedes, setSedes] = useState([]);
  const [lotesDisponibles, setLotesDisponibles] = useState([]);

  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [accionEnCurso, setAccionEnCurso] = useState(null);

  // Filtros
  const [filtroCategoria, setFiltroCategoria] = useState('TODAS'); // 'TODAS' | 'INTERCAMBIOS' | 'BAJAS' | 'CANCELADAS'
  const [filtroEstado, setFiltroEstado] = useState('TODAS'); // 'TODAS' | 'PENDIENTE' | 'APROBADA' | 'RECHAZADA'
  const [filtroTexto, setFiltroTexto] = useState('');

  // Modal para rechazar (baja o intercambio)
  const [modalRechazo, setModalRechazo] = useState(null); // { id, tipo: 'BAJA' | 'INTERCAMBIO', datos }
  const [motivoRechazo, setMotivoRechazo] = useState('');
  const [errorRechazo, setErrorRechazo] = useState(null);

  // Modal para crear nueva solicitud de intercambio entre sedes
  const [modalNuevoIntercambio, setModalNuevoIntercambio] = useState(false);
  const [formIntercambio, setFormIntercambio] = useState({
    tipo: 'ENVIO',
    sede_origen_id: '',
    sede_destino_id: '',
    lote_id: '',
    cantidad_total_unidades: '',
    motivo: ''
  });
  const [guardandoIntercambio, setGuardandoIntercambio] = useState(false);
  const [errorIntercambio, setErrorIntercambio] = useState(null);

  const esSuperadmin = usuario.rol_nombre === 'SUPERADMIN';
  const esAdmin = usuario.rol_nombre === 'ADMIN';
  const puedeSolicitarIntercambio = esSuperadmin || esAdmin;

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);

    const [resBajas, resInter, resOrdenes, resSedes, resLotes] = await Promise.all([
      inventarioApi.solicitudesEliminacion.listar(usuario, { sedeId: sedeActiva }),
      inventarioApi.solicitudesIntercambio.listar(usuario, { sedeId: sedeActiva }),
      inventarioApi.ordenes.listar(usuario, { sedeId: sedeActiva }),
      inventarioApi.sedes.listar(),
      inventarioApi.lotes.listar(usuario, { sedeId: esSuperadmin ? null : usuario.sede_id })
    ]);

    if (resBajas.ok) setSolicitudesBaja(resBajas.data || []);
    else setError(resBajas.error);

    if (resInter.ok) setSolicitudesIntercambio(resInter.data || []);
    if (resOrdenes.ok) setOrdenesCanceladas((resOrdenes.data || []).filter((o) => o.estado === 'CANCELADA'));
    if (resSedes.ok) setSedes(resSedes.data || []);
    if (resLotes.ok) setLotesDisponibles((resLotes.data || []).filter((l) => (l.cantidad_total_unidades || l.cantidad_actual || 0) > 0));

    setCargando(false);
  }, [usuario, sedeActiva, esSuperadmin]);

  useEffect(() => { cargar(); }, [cargar]);

  // Aprobación de Baja
  async function handleAprobarBaja(id) {
    if (!window.confirm('¿Está seguro de APROBAR esta solicitud de baja? El lote será dado de baja definitivamente del inventario.')) {
      return;
    }
    setAccionEnCurso(`baja_${id}`);
    setError(null);
    const res = await inventarioApi.solicitudesEliminacion.resolver(usuario, id, {
      decision: 'APROBADA',
      observacion: 'Aprobada por Superadmin'
    });
    setAccionEnCurso(null);
    if (!res.ok) { setError(res.error); return; }
    setAviso('Solicitud de baja aprobada con éxito.');
    setTimeout(() => setAviso(null), 4000);
    await cargar();
  }

  // Aprobación de Intercambio / Envío
  async function handleAprobarIntercambio(id) {
    if (!window.confirm('¿Está seguro de APROBAR este envío / intercambio de medicamentos? Se descontará del origen y se transferirá el stock al destino.')) {
      return;
    }
    setAccionEnCurso(`inter_${id}`);
    setError(null);
    const res = await inventarioApi.solicitudesIntercambio.resolver(usuario, id, {
      decision: 'APROBADA',
      observacion: 'Aprobado y transferido exitosamente'
    });
    setAccionEnCurso(null);
    if (!res.ok) { setError(res.error); return; }
    setAviso('Envío / intercambio aprobado. El inventario ha sido transferido.');
    setTimeout(() => setAviso(null), 4000);
    await cargar();
  }

  // Rechazo de solicitudes (baja o intercambio)
  function abrirModalRechazar(tipo, item) {
    setModalRechazo({ tipo, item });
    setMotivoRechazo('');
    setErrorRechazo(null);
  }

  async function handleConfirmarRechazo(e) {
    e.preventDefault();
    if (!motivoRechazo.trim()) {
      setErrorRechazo('Debe indicar el motivo o justificación del rechazo.');
      return;
    }

    setAccionEnCurso('rechazando');
    setErrorRechazo(null);

    let res;
    if (modalRechazo.tipo === 'BAJA') {
      res = await inventarioApi.solicitudesEliminacion.resolver(usuario, modalRechazo.item.id, {
        decision: 'RECHAZADA',
        observacion: motivoRechazo.trim()
      });
    } else {
      res = await inventarioApi.solicitudesIntercambio.resolver(usuario, modalRechazo.item.id, {
        decision: 'RECHAZADA',
        observacion: motivoRechazo.trim()
      });
    }

    setAccionEnCurso(null);
    if (!res.ok) {
      setErrorRechazo(res.error);
      return;
    }

    setModalRechazo(null);
    setAviso(`La solicitud #${modalRechazo.item.id} ha sido rechazada. Quedará registrada en la bitácora.`);
    setTimeout(() => setAviso(null), 4000);
    await cargar();
  }

  // Abrir modal de nuevo intercambio
  function handleAbrirNuevoIntercambio() {
    const sedeOrigenInicial = esAdmin ? usuario.sede_id : (sedeActiva || (sedes[0]?.id ?? ''));
    setFormIntercambio({
      tipo: 'ENVIO',
      sede_origen_id: sedeOrigenInicial,
      sede_destino_id: '',
      lote_id: '',
      cantidad_total_unidades: '',
      motivo: ''
    });
    setErrorIntercambio(null);
    setModalNuevoIntercambio(true);
  }

  // Guardar nueva solicitud de intercambio
  async function handleGuardarIntercambio(e) {
    e.preventDefault();
    if (!formIntercambio.lote_id) {
      setErrorIntercambio('Seleccione el lote que desea transferir.');
      return;
    }
    if (!formIntercambio.sede_destino_id) {
      setErrorIntercambio('Seleccione la sede de destino.');
      return;
    }
    if (Number(formIntercambio.sede_origen_id) === Number(formIntercambio.sede_destino_id)) {
      setErrorIntercambio('La sede de destino no puede ser igual a la sede de origen.');
      return;
    }
    const cant = Number(formIntercambio.cantidad_total_unidades);
    if (!cant || cant <= 0) {
      setErrorIntercambio('Ingrese una cantidad válida mayor a cero.');
      return;
    }
    if (!formIntercambio.motivo.trim()) {
      setErrorIntercambio('Ingrese el motivo de la transferencia o intercambio.');
      return;
    }

    setGuardandoIntercambio(true);
    setErrorIntercambio(null);

    const res = await inventarioApi.solicitudesIntercambio.crear(usuario, {
      tipo: formIntercambio.tipo,
      sede_origen_id: Number(formIntercambio.sede_origen_id),
      sede_destino_id: Number(formIntercambio.sede_destino_id),
      lote_id: Number(formIntercambio.lote_id),
      cantidad_total_unidades: cant,
      motivo: formIntercambio.motivo.trim()
    });

    setGuardandoIntercambio(false);
    if (!res.ok) {
      setErrorIntercambio(res.error);
      return;
    }

    setModalNuevoIntercambio(false);
    setAviso(`Solicitud de ${formIntercambio.tipo.toLowerCase()} creada exitosamente.`);
    setTimeout(() => setAviso(null), 4000);
    await cargar();
  }

  // Lotes filtrados para el formulario de nuevo intercambio
  const lotesParaForm = useMemo(() => {
    const sedeOrig = Number(formIntercambio.sede_origen_id);
    if (!sedeOrig) return [];
    return lotesDisponibles.filter((l) => Number(l.sede_id) === sedeOrig);
  }, [lotesDisponibles, formIntercambio.sede_origen_id]);

  const loteSeleccionadoObj = useMemo(() => {
    return lotesParaForm.find((l) => Number(l.id) === Number(formIntercambio.lote_id));
  }, [lotesParaForm, formIntercambio.lote_id]);

  // Lista combinada de solicitudes para vista unificada
  const listaUnificada = useMemo(() => {
    const bajasEstandarizadas = solicitudesBaja.map((s) => ({
      ...s,
      tipo_solicitud: 'BAJA',
      etiqueta_tipo: 'Baja de Lote',
      sede_origen_nombre: s.sede_nombre,
      sede_destino_nombre: '—',
      cantidad_texto: `${s.lote_cantidad ?? '—'} unidades`,
      icono: '🗑️'
    }));

    const intercambiosEstandarizados = solicitudesIntercambio.map((i) => ({
      ...i,
      tipo_solicitud: i.tipo, // 'ENVIO' | 'INTERCAMBIO'
      etiqueta_tipo: i.tipo === 'INTERCAMBIO' ? 'Intercambio' : 'Envío Sede',
      cantidad_texto: `${i.cantidad_total_unidades} unidades (${i.cantidad_cajas} cajas)`,
      icono: i.tipo === 'INTERCAMBIO' ? '🔄' : '🚚'
    }));

    let combinadas = [];
    if (filtroCategoria === 'TODAS') {
      combinadas = [...bajasEstandarizadas, ...intercambiosEstandarizados];
    } else if (filtroCategoria === 'BAJAS') {
      combinadas = bajasEstandarizadas;
    } else if (filtroCategoria === 'INTERCAMBIOS') {
      combinadas = intercambiosEstandarizados;
    }

    // Ordenar por fecha_solicitud DESC
    combinadas.sort((a, b) => new Date(b.fecha_solicitud) - new Date(a.fecha_solicitud));

    const q = filtroTexto.toLowerCase().trim();
    return combinadas.filter((item) => {
      const coincideEstado = filtroEstado === 'TODAS' || item.estado === filtroEstado;
      const coincideTexto = !q ||
        item.medicamento_nombre?.toLowerCase().includes(q) ||
        item.medicamento_codigo?.toLowerCase().includes(q) ||
        item.numero_lote?.toLowerCase().includes(q) ||
        item.motivo?.toLowerCase().includes(q) ||
        item.solicitante_nombre?.toLowerCase().includes(q) ||
        item.sede_origen_nombre?.toLowerCase().includes(q) ||
        item.sede_destino_nombre?.toLowerCase().includes(q);

      return coincideEstado && coincideTexto;
    });
  }, [solicitudesBaja, solicitudesIntercambio, filtroCategoria, filtroEstado, filtroTexto]);

  return (
    <div className="page-container eliminaciones-view">
      {/* CABECERA */}
      <div className="page-header-row">
        <div>
          <h2>Módulo Unificado de Solicitudes</h2>
          <p className="page-scope">
            {esSuperadmin
              ? 'Gestión centralizada de bajas, envíos e intercambios entre sedes (Superadmin)'
              : `Sede asignada: ${usuario.sede_nombre}`}
          </p>
        </div>
        <div className="header-actions" style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
          {puedeSolicitarIntercambio && (
            <button className="btn-primario" onClick={handleAbrirNuevoIntercambio}>
              🚚 + Solicitar Envío / Intercambio
            </button>
          )}
          <button className="btn-refrescar" onClick={cargar} title="Recargar">
            🔄 Actualizar
          </button>
        </div>
      </div>

      {aviso && <div className="aviso-ok">{aviso}</div>}
      {error && <div className="login-error">{error}</div>}

      {/* FILTROS Y CATEGORÍAS */}
      <div className="filtros-card">
        {/* Pestañas de categoría */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.6rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            className={`filter-chip ${filtroCategoria === 'TODAS' ? 'chip-activo' : ''}`}
            onClick={() => setFiltroCategoria('TODAS')}
          >
            📋 Todas las Solicitudes ({solicitudesBaja.length + solicitudesIntercambio.length})
          </button>
          <button
            type="button"
            className={`filter-chip ${filtroCategoria === 'INTERCAMBIOS' ? 'chip-activo' : ''}`}
            onClick={() => setFiltroCategoria('INTERCAMBIOS')}
          >
            🚚 Envíos e Intercambios ({solicitudesIntercambio.length})
          </button>
          <button
            type="button"
            className={`filter-chip ${filtroCategoria === 'BAJAS' ? 'chip-activo' : ''}`}
            onClick={() => setFiltroCategoria('BAJAS')}
          >
            🗑️ Bajas de Lotes ({solicitudesBaja.length})
          </button>
          <button
            type="button"
            className={`filter-chip ${filtroCategoria === 'CANCELADAS' ? 'chip-activo' : ''}`}
            onClick={() => setFiltroCategoria('CANCELADAS')}
          >
            🚫 Órdenes Canceladas ({ordenesCanceladas.length})
          </button>
        </div>

        {/* Buscador y filtro por Estado */}
        {filtroCategoria !== 'CANCELADAS' && (
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <div className="search-bar-wrap" style={{ flex: 1, minWidth: '240px' }}>
              <span className="search-icon">🔍</span>
              <input
                type="text"
                className="search-input"
                placeholder="Buscar por motivo, solicitante, medicamento, lote o sede..."
                value={filtroTexto}
                onChange={(e) => setFiltroTexto(e.target.value)}
              />
              {filtroTexto && (
                <button className="btn-clear-search" onClick={() => setFiltroTexto('')}>×</button>
              )}
            </div>

            {/* Selector de estados: TODAS, PENDIENTE, APROBADA, RECHAZADA juntos en el mismo módulo */}
            <div className="pills-filter-group">
              {['TODAS', 'PENDIENTE', 'APROBADA', 'RECHAZADA'].map((est) => (
                <button
                  key={est}
                  type="button"
                  className={`filter-chip ${filtroEstado === est ? 'chip-activo' : ''}`}
                  onClick={() => setFiltroEstado(est)}
                >
                  {est === 'TODAS' ? 'Todos los Estados' : est}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* TABLA PRINCIPAL DE SOLICITUDES */}
      {filtroCategoria !== 'CANCELADAS' && (
        <div className="table-responsive">
          <table className="tabla">
            <thead>
              <tr>
                <th>ID</th>
                <th>Tipo</th>
                <th>Sede Origen</th>
                <th>Sede Destino</th>
                <th>Medicamento & Lote</th>
                <th>Cantidad</th>
                <th>Solicitado por</th>
                <th>Fecha</th>
                <th>Estado</th>
                <th>Resolución / Motivo</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {listaUnificada.map((s) => {
                const esBaja = s.tipo_solicitud === 'BAJA';
                const puedeResolver = esSuperadmin || (esAdmin && (
                  esBaja
                    ? Number(usuario.sede_id) === Number(s.sede_id)
                    : (Number(usuario.sede_id) === Number(s.sede_origen_id) || Number(usuario.sede_id) === Number(s.sede_destino_id))
                ));

                return (
                  <tr key={`${s.tipo_solicitud}_${s.id}`}>
                    <td><strong>#{s.id}</strong></td>
                    <td>
                      <span className="mono-tag" style={{ background: esBaja ? '#fee2e2' : '#dbeafe', color: esBaja ? '#991b1b' : '#1e40af' }}>
                        {s.icono} {s.etiqueta_tipo}
                      </span>
                    </td>
                    <td><strong>{s.sede_origen_nombre}</strong></td>
                    <td>{s.sede_destino_nombre || '—'}</td>
                    <td>
                      <div><strong>{s.medicamento_codigo}</strong> - {s.medicamento_nombre}</div>
                      <span className="mono-tag" style={{ fontSize: '0.72rem' }}>Lote: {s.numero_lote}</span>
                    </td>
                    <td><strong>{s.cantidad_texto}</strong></td>
                    <td>
                      <div>{s.solicitante_nombre}</div>
                      <div style={{ fontSize: '0.72rem', color: '#64748b' }}>{s.motivo}</div>
                    </td>
                    <td style={{ fontSize: '0.78rem' }}>{s.fecha_solicitud}</td>
                    <td>
                      <span className={`pill ${ESTADO_CLASE[s.estado] || ''}`}>
                        {s.estado}
                      </span>
                    </td>
                    <td>
                      {s.resolutor_nombre ? (
                        <div>
                          <strong>{s.resolutor_nombre}</strong>
                          {s.observacion_resolucion && (
                            <div style={{ fontSize: '0.74rem', color: s.estado === 'RECHAZADA' ? '#dc2626' : '#64748b', fontWeight: s.estado === 'RECHAZADA' ? 600 : 400 }}>
                              "{s.observacion_resolucion}"
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted" style={{ fontSize: '0.78rem' }}>Pendiente de revisión</span>
                      )}
                    </td>
                    <td className="acciones" style={{ whiteSpace: 'nowrap' }}>
                      {s.estado === 'PENDIENTE' && puedeResolver ? (
                        <>
                          <button
                            className="btn-accion-ok"
                            disabled={accionEnCurso === `${esBaja ? 'baja' : 'inter'}_${s.id}`}
                            onClick={() => esBaja ? handleAprobarBaja(s.id) : handleAprobarIntercambio(s.id)}
                            title="Aprobar solicitud"
                          >
                            {accionEnCurso === `${esBaja ? 'baja' : 'inter'}_${s.id}` ? '...' : '✓ Aprobar'}
                          </button>
                          <button
                            className="btn-peligro"
                            disabled={accionEnCurso === `${esBaja ? 'baja' : 'inter'}_${s.id}`}
                            onClick={() => abrirModalRechazar(esBaja ? 'BAJA' : 'INTERCAMBIO', s)}
                            title="Rechazar con motivo"
                          >
                            ✕ Rechazar
                          </button>
                        </>
                      ) : (
                        <span style={{ fontSize: '0.76rem', color: '#94a3b8' }}>
                          {s.estado === 'PENDIENTE' ? 'En espera' : 'Resuelta'}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {listaUnificada.length === 0 && (
                <tr>
                  <td colSpan="11" className="tabla-vacia">
                    {cargando ? 'Cargando solicitudes...' : 'No se encontraron solicitudes con los filtros seleccionados.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* SECCIÓN DE ÓRDENES CANCELADAS */}
      {filtroCategoria === 'CANCELADAS' && (
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
                  <td style={{ color: '#dc2626', fontWeight: 600 }}>{o.motivo_cancelacion || '—'}</td>
                  <td><span className="pill estado-gris">CANCELADA</span></td>
                </tr>
              ))}
              {ordenesCanceladas.length === 0 && (
                <tr>
                  <td colSpan="8" className="tabla-vacia">
                    {cargando ? 'Cargando órdenes...' : 'No hay órdenes canceladas registradas.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* MODAL: RECHAZAR SOLICITUD CON MOTIVO */}
      {modalRechazo && (
        <div className="modal-overlay" onClick={() => setModalRechazo(null)}>
          <div className="modal-card" style={{ maxWidth: '520px' }} onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="modal-close-x"
              onClick={() => setModalRechazo(null)}
              title="Cerrar panel"
            >
              ✕
            </button>

            <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '1.15rem', color: '#991b1b', fontWeight: 800 }}>
              🚫 Rechazar Solicitud #{modalRechazo.item.id} ({modalRechazo.tipo === 'BAJA' ? 'Baja' : 'Intercambio'})
            </h3>

            <form onSubmit={handleConfirmarRechazo}>
              <div style={{ background: '#f8fafc', padding: '0.75rem', borderRadius: '8px', marginBottom: '1rem', border: '1px solid #e2e8f0', fontSize: '0.84rem' }}>
                <div>Medicamento: <strong>{modalRechazo.item.medicamento_nombre}</strong> (Lote: {modalRechazo.item.numero_lote})</div>
                <div>Motivo original solicitado: <em>"{modalRechazo.item.motivo}"</em></div>
                <div>Solicitado por: <strong>{modalRechazo.item.solicitante_nombre}</strong></div>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '0.35rem' }}>
                  Motivo o justificación del rechazo (obligatorio):
                </label>
                <textarea
                  rows="3"
                  style={{ width: '100%', padding: '0.65rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.88rem', outline: 'none', resize: 'vertical' }}
                  placeholder="Explique claramente por qué se rechaza esta solicitud..."
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
                  onClick={() => setModalRechazo(null)}
                  disabled={accionEnCurso === 'rechazando'}
                >
                  ✕ Cancelar
                </button>
                <button
                  type="submit"
                  className="btn-peligro"
                  disabled={accionEnCurso === 'rechazando'}
                >
                  {accionEnCurso === 'rechazando' ? 'Rechazando...' : 'Confirmar Rechazo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: SOLICITAR ENVÍO / INTERCAMBIO DE MEDICAMENTOS */}
      {modalNuevoIntercambio && (
        <div className="modal-overlay" onClick={() => setModalNuevoIntercambio(false)}>
          <div className="modal-card" style={{ maxWidth: '640px' }} onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="modal-close-x"
              onClick={() => setModalNuevoIntercambio(false)}
              title="Cerrar modal"
            >
              ✕
            </button>

            <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.2rem', fontWeight: 800, color: '#1e293b' }}>
              🚚 Solicitud de Envío / Intercambio de Medicamentos
            </h3>
            <p style={{ fontSize: '0.82rem', color: '#64748b', margin: '0 0 1.25rem 0' }}>
              Autorizado exclusivamente para Superadmin y Administradores de Sede. El stock será descontado y traspasado tras la aprobación.
            </p>

            <form onSubmit={handleGuardarIntercambio}>
              <div className="form-grid">
                <div>
                  <label>Tipo de operación:</label>
                  <select
                    value={formIntercambio.tipo}
                    onChange={(e) => setFormIntercambio((prev) => ({ ...prev, tipo: e.target.value }))}
                  >
                    <option value="ENVIO">🚚 Envío de medicamentos (Traspaso regular)</option>
                    <option value="INTERCAMBIO">🔄 Intercambio de medicamentos</option>
                  </select>
                </div>

                <div>
                  <label>Sede de Origen (Emisora):</label>
                  {esSuperadmin ? (
                    <select
                      value={formIntercambio.sede_origen_id}
                      onChange={(e) => setFormIntercambio((prev) => ({ ...prev, sede_origen_id: e.target.value, lote_id: '' }))}
                      required
                    >
                      <option value="">Seleccione sede origen...</option>
                      {sedes.map((s) => (
                        <option key={s.id} value={s.id}>{s.nombre}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={`📍 ${usuario.sede_nombre}`}
                      disabled
                      style={{ background: '#f1f5f9', cursor: 'not-allowed' }}
                    />
                  )}
                </div>
              </div>

              <div className="form-grid" style={{ marginTop: '0.75rem' }}>
                <div>
                  <label>Sede de Destino (Receptora):</label>
                  <select
                    value={formIntercambio.sede_destino_id}
                    onChange={(e) => setFormIntercambio((prev) => ({ ...prev, sede_destino_id: e.target.value }))}
                    required
                  >
                    <option value="">Seleccione sede de destino...</option>
                    {sedes
                      .filter((s) => Number(s.id) !== Number(formIntercambio.sede_origen_id))
                      .map((s) => (
                        <option key={s.id} value={s.id}>{s.nombre}</option>
                      ))}
                  </select>
                </div>

                <div>
                  <label>Lote disponible a transferir:</label>
                  <select
                    value={formIntercambio.lote_id}
                    onChange={(e) => setFormIntercambio((prev) => ({ ...prev, lote_id: e.target.value }))}
                    required
                  >
                    <option value="">Seleccione medicamento y lote...</option>
                    {lotesParaForm.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.medicamento_nombre} (Lote: {l.numero_lote}) — {l.cantidad_total_unidades} disp.
                      </option>
                    ))}
                  </select>
                  {lotesParaForm.length === 0 && formIntercambio.sede_origen_id && (
                    <span style={{ fontSize: '0.73rem', color: '#dc2626', display: 'block', marginTop: '0.2rem' }}>
                      No hay lotes con stock disponibles en la sede de origen.
                    </span>
                  )}
                </div>
              </div>

              {loteSeleccionadoObj && (
                <div style={{ background: '#f8fafc', padding: '0.75rem', borderRadius: '8px', border: '1px solid #e2e8f0', marginTop: '0.75rem', fontSize: '0.82rem' }}>
                  <div>Medicamento: <strong>{loteSeleccionadoObj.medicamento_codigo} - {loteSeleccionadoObj.medicamento_nombre}</strong></div>
                  <div>Stock actual en sede: <strong>{loteSeleccionadoObj.cantidad_total_unidades} unidades</strong> ({loteSeleccionadoObj.cantidad_cajas} cajas)</div>
                  <div>Vence: <strong>{loteSeleccionadoObj.fecha_vencimiento}</strong></div>
                </div>
              )}

              <div className="form-grid" style={{ marginTop: '0.75rem' }}>
                <div>
                  <label>Cantidad de unidades a transferir:</label>
                  <input
                    type="number"
                    min="1"
                    max={loteSeleccionadoObj?.cantidad_total_unidades || 99999}
                    placeholder="Cantidad en unidades..."
                    value={formIntercambio.cantidad_total_unidades}
                    onChange={(e) => setFormIntercambio((prev) => ({ ...prev, cantidad_total_unidades: e.target.value }))}
                    required
                  />
                  {loteSeleccionadoObj?.unidades_por_caja && formIntercambio.cantidad_total_unidades && (
                    <span style={{ fontSize: '0.73rem', color: '#64748b', display: 'block', marginTop: '0.2rem' }}>
                      Equivalente aproximado: {Math.floor(Number(formIntercambio.cantidad_total_unidades) / loteSeleccionadoObj.unidades_por_caja)} cajas y {Number(formIntercambio.cantidad_total_unidades) % loteSeleccionadoObj.unidades_por_caja} unidades sueltas.
                    </span>
                  )}
                </div>

                <div>
                  <label>Motivo o justificación de la solicitud:</label>
                  <textarea
                    rows="2"
                    placeholder="Ej: Desabastecimiento crítico en sede receptora / Rebalanceo de inventario..."
                    value={formIntercambio.motivo}
                    onChange={(e) => setFormIntercambio((prev) => ({ ...prev, motivo: e.target.value }))}
                    required
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                  />
                </div>
              </div>

              {errorIntercambio && <div className="login-error" style={{ marginTop: '1rem' }}>{errorIntercambio}</div>}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', borderTop: '1px solid #e2e8f0', paddingTop: '1rem', marginTop: '1.25rem' }}>
                <button
                  type="button"
                  className="btn-secundario"
                  onClick={() => setModalNuevoIntercambio(false)}
                  disabled={guardandoIntercambio}
                >
                  ✕ Cancelar
                </button>
                <button
                  type="submit"
                  className="btn-primario"
                  disabled={guardandoIntercambio}
                >
                  {guardandoIntercambio ? 'Enviando solicitud...' : '🚀 Enviar Solicitud'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
