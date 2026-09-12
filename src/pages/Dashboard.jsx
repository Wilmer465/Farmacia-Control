import React, { useEffect, useState, useCallback } from 'react';
import { inventarioApi } from '../services/inventarioApi.js';

export default function Dashboard({ usuario, sedeActiva, onNavigate }) {
  const [data, setData] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    const res = await inventarioApi.reportes.dashboard(usuario, { sedeId: sedeActiva });
    if (res.ok) {
      setData(res.data);
    } else {
      setError(res.error);
    }
    setCargando(false);
  }, [usuario, sedeActiva]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  if (cargando) {
    return (
      <div className="page-container">
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Cargando métricas del sistema...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="page-container">
        <div className="login-error">{error || 'No se pudieron cargar los datos del dashboard.'}</div>
        <button className="btn-primario" onClick={cargar}>Reintentar</button>
      </div>
    );
  }

  const esConciliado = data.estadoConciliacion === 'CONCILIADO';

  return (
    <div className="page-container dashboard-view">
      <div className="page-header-row">
        <div>
          <h2>Panel de Control (Dashboard)</h2>
          <p className="page-scope">
            {usuario.rol_nombre === 'SUPERADMIN' ? 'Métricas consolidadas de todas las sedes' : `Sede asignada: ${usuario.sede_nombre}`}
          </p>
        </div>
        <div className="header-actions">
          <button className="btn-refrescar" onClick={cargar} title="Actualizar datos">
            🔄 Actualizar
          </button>
        </div>
      </div>

      {/* Banner de estado de conciliación */}
      <div className={`conciliacion-card ${esConciliado ? 'conciliado-ok' : 'conciliado-alerta'}`}>
        <div className="conciliacion-icon">
          {esConciliado ? '🛡️' : '⚠️'}
        </div>
        <div className="conciliacion-content">
          <div className="conciliacion-title">
            {esConciliado ? 'Inventario Conciliado Correctamente' : 'Alerta de Irregularidades / No Conciliado'}
          </div>
          <p className="conciliacion-desc">
            {esConciliado
              ? 'Todos los movimientos de inventario cuadran con las existencias registradas.'
              : 'Se detectaron diferencias o movimientos no justificados. Revise el módulo de Auditoría y Reportes.'}
          </p>
        </div>
        <span className={`pill ${esConciliado ? 'estado-verde' : 'estado-rojo'}`}>
          {data.estadoConciliacion}
        </span>
      </div>

      {/* Grid de KPIs principales */}
      <div className="kpi-grid">
        <div className="kpi-card" onClick={() => onNavigate && onNavigate('inventario')}>
          <div className="kpi-icon-box bg-blue">📦</div>
          <div className="kpi-info">
            <span className="kpi-label">Medicamentos Registrados</span>
            <span className="kpi-value">{data.totalMedicamentos}</span>
            <span className="kpi-hint">Ver catálogo →</span>
          </div>
        </div>

        <div className="kpi-card" onClick={() => onNavigate && onNavigate('inventario')}>
          <div className="kpi-icon-box bg-indigo">💊</div>
          <div className="kpi-info">
            <span className="kpi-label">Stock Total de Unidades</span>
            <span className="kpi-value">{data.stockTotalUnidades}</span>
            <span className="kpi-hint">{data.cajasTotales} cajas disponibles</span>
          </div>
        </div>

        <div className="kpi-card card-warning" onClick={() => onNavigate && onNavigate('inventario', { filtroEstado: 'PROXIMO_VENCER' })}>
          <div className="kpi-icon-box bg-amber">⏳</div>
          <div className="kpi-info">
            <span className="kpi-label">Próximos a Vencer (90d)</span>
            <span className="kpi-value">{data.proximosAVencer}</span>
            <span className="kpi-hint text-amber">Ver en inventario →</span>
          </div>
        </div>

        <div className="kpi-card card-danger" onClick={() => onNavigate && onNavigate('inventario', { filtroEstado: 'VENCIDO' })}>
          <div className="kpi-icon-box bg-red">🚫</div>
          <div className="kpi-info">
            <span className="kpi-label">Lotes Vencidos</span>
            <span className="kpi-value">{data.vencidos}</span>
            <span className="kpi-hint text-red">Ver en inventario →</span>
          </div>
        </div>

        <div className="kpi-card" onClick={() => onNavigate && onNavigate('solicitudes')}>
          <div className="kpi-icon-box bg-purple">📝</div>
          <div className="kpi-info">
            <span className="kpi-label">Solicitudes Pendientes</span>
            <span className="kpi-value">{data.solicitudesPendientes}</span>
            <span className="kpi-hint">Bajas e intercambios →</span>
          </div>
        </div>

        <div className="kpi-card card-danger" onClick={() => onNavigate && onNavigate('entregas', { filtroDoc: 'INCOMPLETA' })}>
          <div className="kpi-icon-box bg-rose">📋</div>
          <div className="kpi-info">
            <span className="kpi-label">Entregas Incompletas</span>
            <span className="kpi-value">{data.entregasIncompletas}</span>
            <span className="kpi-hint text-red">Faltan firmas/huella →</span>
          </div>
        </div>

        <div className="kpi-card card-action" onClick={() => onNavigate && onNavigate('ordenes', { filtroEstado: 'PENDIENTE' })}>
          <div className="kpi-icon-box bg-emerald">📑</div>
          <div className="kpi-info">
            <span className="kpi-label">Pedidos y Órdenes</span>
            <span className="kpi-value">{data.ordenesActivas ?? 'Ver'}</span>
            <span className="kpi-hint text-emerald">Pedidos pendientes →</span>
          </div>
        </div>
      </div>
    </div>
  );
}
