import React, { useState, useEffect, lazy, Suspense, memo } from 'react';
import { inventarioApi } from '../services/inventarioApi.js';

// ─── Lazy load de todas las páginas pesadas ────────────────────────────────
// Esto hace que solo se descargue el código de cada módulo cuando el usuario
// navega a él por primera vez, reduciendo el tiempo de carga inicial.
const Dashboard     = lazy(() => import('./Dashboard.jsx'));
const Reportes      = lazy(() => import('./Reportes.jsx'));
const Inventario    = lazy(() => import('./Inventario.jsx'));
const Ordenes       = lazy(() => import('./Ordenes.jsx'));
const Entregas      = lazy(() => import('./Entregas.jsx'));
const Eliminaciones = lazy(() => import('./Eliminaciones.jsx'));
const Auditoria     = lazy(() => import('./Auditoria.jsx'));
const Respaldos     = lazy(() => import('./Respaldos.jsx'));

// ─── Spinner de carga mientras el módulo se descarga ──────────────────────
const CargandoModulo = memo(function CargandoModulo() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '60vh', flexDirection: 'column', gap: '1rem', color: '#64748b'
    }}>
      <div style={{
        width: '36px', height: '36px', border: '3px solid #e2e8f0',
        borderTop: '3px solid #2563eb', borderRadius: '50%',
        animation: 'spin 0.7s linear infinite'
      }} />
      <span style={{ fontSize: '0.85rem' }}>Cargando módulo...</span>
    </div>
  );
});

const ICONS = {
  dashboard: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="9" rx="1" />
      <rect x="14" y="3" width="7" height="5" rx="1" />
      <rect x="14" y="12" width="7" height="9" rx="1" />
      <rect x="3" y="16" width="7" height="5" rx="1" />
    </svg>
  ),
  reportes: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  ),
  inventario: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
      <path d="m3.3 7 8.7 5 8.7-5" />
      <path d="M12 22V12" />
    </svg>
  ),
  ordenes: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <rect x="8" y="2" width="8" height="4" rx="1" />
      <path d="M9 12h6" />
      <path d="M9 16h6" />
    </svg>
  ),
  entregas: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="3" width="15" height="13" rx="2" />
      <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
      <circle cx="5.5" cy="18.5" r="2.5" />
      <circle cx="18.5" cy="18.5" r="2.5" />
    </svg>
  ),
  eliminaciones: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18" />
      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  ),
  auditoria: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  ),
  respaldos: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
    </svg>
  ),
  logout: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  )
};

const TABS_BASE = [
  { id: 'dashboard',     label: 'Dashboard',     desc: 'Métricas y KPIs' },
  { id: 'inventario',    label: 'Inventario',     desc: 'Medicamentos y lotes' },
  { id: 'ordenes',       label: 'Órdenes',        desc: 'Gestión y despachos' },
  { id: 'entregas',      label: 'Entregas',       desc: 'Firmas y recepción' },
  { id: 'eliminaciones', label: 'Eliminaciones',  desc: 'Solicitudes de baja' },
  { id: 'reportes',      label: 'Reportes',       desc: 'Trazabilidad diaria' }
];

// ─── Item del menú lateral memoizado ──────────────────────────────────────
const NavItem = memo(function NavItem({ tab, tabActivo, onClick }) {
  return (
    <button
      className={`sidebar-nav-item ${tabActivo === tab.id ? 'activo' : ''}`}
      onClick={() => onClick(tab.id)}
    >
      <span className="nav-icon">{ICONS[tab.id]}</span>
      <div className="nav-text-group">
        <span className="nav-label">{tab.label}</span>
        <span className="nav-sub">{tab.desc}</span>
      </div>
    </button>
  );
});

// ─── Shell principal ───────────────────────────────────────────────────────
export default function AppShell({ usuario, onLogout }) {
  const [tab, setTab] = useState('dashboard');
  const [sidebarAbierto, setSidebarAbierto] = useState(true);
  const esSuperadmin = usuario.rol_nombre === 'SUPERADMIN';

  // El SUPERADMIN (visión global) debe elegir la sede activa sobre la cual
  // realizar sus gestiones. La elección persiste entre sesiones.
  const [sedes, setSedes] = useState([]);
  const [sedeActiva, setSedeActiva] = useState(() => {
    const raw = localStorage.getItem('farmacia_sede_activa');
    if (raw === 'TODAS') return null;
    const guardada = Number(raw);
    return Number.isFinite(guardada) && guardada > 0 ? guardada : null;
  });

  useEffect(() => {
    if (!esSuperadmin) return;
    let cancelado = false;
    (async () => {
      const res = await inventarioApi.sedes.listar();
      if (!res.ok || cancelado || res.data.length === 0) return;
      setSedes(res.data);
      setSedeActiva((actual) => {
        const raw = localStorage.getItem('farmacia_sede_activa');
        if (raw === 'TODAS') return null;
        if (actual && res.data.some((s) => s.id === actual)) return actual;
        const inicial = res.data[0].id;
        localStorage.setItem('farmacia_sede_activa', String(inicial));
        return inicial;
      });
    })();
    return () => { cancelado = true; };
  }, [esSuperadmin]);

  function handleCambiarSede(e) {
    const valor = e.target.value;
    if (valor === 'TODAS') {
      setSedeActiva(null);
      localStorage.setItem('farmacia_sede_activa', 'TODAS');
      return;
    }
    const id = Number(valor);
    setSedeActiva(id);
    localStorage.setItem('farmacia_sede_activa', String(id));
  }

  const sedeActivaObj = sedes.find((s) => s.id === sedeActiva);
  const nombreSedeContexto = esSuperadmin
    ? (sedeActiva == null ? 'Todas las sedes' : (sedeActivaObj ? sedeActivaObj.nombre : 'Seleccionando...'))
    : usuario.sede_nombre;

  const tabs = esSuperadmin
    ? [
        ...TABS_BASE,
        { id: 'auditoria', label: 'Auditoría',  desc: 'Seguridad inmutable' },
        { id: 'respaldos', label: 'Respaldos',   desc: 'Copias de seguridad' }
      ]
    : TABS_BASE;

  const tabActual = tabs.find((t) => t.id === tab);

  function handleNavigate(tabId) {
    setTab(tabId);
    if (window.innerWidth < 768) setSidebarAbierto(false);
  }

  return (
    <div className={`app-layout ${sidebarAbierto ? 'sidebar-expandido' : 'sidebar-colapsado'}`}>
      {/* Overlay para móviles */}
      <div
        className={`sidebar-backdrop ${sidebarAbierto ? 'backdrop-visible' : ''}`}
        onClick={() => setSidebarAbierto(false)}
      />

      {/* Menú lateral izquierdo */}
      <aside className={`sidebar ${sidebarAbierto ? 'abierto' : 'cerrado'}`}>
        <div className="sidebar-header">
          <div className="sidebar-brand">
            <span className="brand-logo">💊</span>
            <div className="brand-texts">
              <span className="brand-title">Farmacia Control</span>
              <span className="brand-subtitle">Gestión &amp; Trazabilidad</span>
            </div>
          </div>
          <button
            type="button"
            className={`hamburger-btn hamburger-sidebar ${sidebarAbierto ? 'is-active' : ''}`}
            onClick={() => setSidebarAbierto(!sidebarAbierto)}
            title={sidebarAbierto ? 'Cerrar menú' : 'Abrir menú'}
            aria-label="Alternar menú lateral"
          >
            <span className="hamburger-icon">
              <span></span>
              <span></span>
              <span></span>
            </span>
          </button>
        </div>

        {/* Tarjeta de usuario */}
        <div className="sidebar-user-card">
          <div className="user-avatar">
            {usuario.nombre ? usuario.nombre.charAt(0).toUpperCase() : 'U'}
          </div>
          <div className="user-info">
            <div className="user-name" title={usuario.nombre}>{usuario.nombre}</div>
            <div className="user-meta">
              <span className="user-badge">{usuario.rol_nombre}</span>
              {esSuperadmin ? (
                <select
                  className="user-sede-selector"
                  value={sedeActiva == null ? 'TODAS' : sedeActiva}
                  onChange={handleCambiarSede}
                  title="Sede activa para sus gestiones"
                  aria-label="Seleccionar sede activa"
                >
                  <option value="TODAS">Todas las sedes</option>
                  {sedes.map((s) => (
                    <option key={s.id} value={s.id}>{s.nombre}</option>
                  ))}
                </select>
              ) : (
                <span className="user-sede" title={usuario.sede_nombre}>
                  📍 {usuario.sede_nombre}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Lista de navegación */}
        <nav className="sidebar-nav">
          <div className="nav-seccion-titulo">Módulos del Sistema</div>
          {tabs.map((t) => (
            <NavItem key={t.id} tab={t} tabActivo={tab} onClick={handleNavigate} />
          ))}
        </nav>

        {/* Botón de cerrar sesión al fondo del sidebar */}
        <div className="sidebar-footer">
          <button
            type="button"
            className="sidebar-logout-btn"
            onClick={onLogout}
            title="Cerrar sesión"
          >
            <span className="nav-icon">{ICONS.logout}</span>
            <span className="nav-label">Cerrar sesión</span>
          </button>
        </div>
      </aside>

      {/* Contenedor principal */}
      <div className="main-wrapper">
        <header className="topbar">
          <div className="topbar-left">
            {!sidebarAbierto && (
              <button
                type="button"
                className="hamburger-btn"
                onClick={() => setSidebarAbierto(true)}
                title="Desplegar menú lateral"
                aria-label="Abrir menú hamburguesa"
              >
                <span className="hamburger-icon">
                  <span></span>
                  <span></span>
                  <span></span>
                </span>
              </button>
            )}
            <div className="topbar-heading">
              <h1 className="topbar-title">{tabActual?.label || 'Farmacia Control'}</h1>
              <span className="topbar-subtitle">{tabActual?.desc || ''}</span>
            </div>
          </div>
          <div className="topbar-right">
            <span className="topbar-sede-badge">
              📍 {nombreSedeContexto}
            </span>
          </div>
        </header>

        {/* Suspense envuelve TODAS las páginas lazy — muestra el spinner mientras carga */}
        <main className="dashboard-main">
          <Suspense fallback={<CargandoModulo />}>
            {tab === 'dashboard'     && <Dashboard     usuario={usuario} sedeActiva={sedeActiva} onNavigate={handleNavigate} />}
            {tab === 'reportes'      && <Reportes      usuario={usuario} sedeActiva={sedeActiva} />}
            {tab === 'inventario'    && <Inventario    usuario={usuario} sedeActiva={sedeActiva} />}
            {tab === 'ordenes'       && <Ordenes       usuario={usuario} sedeActiva={sedeActiva} />}
            {tab === 'entregas'      && <Entregas      usuario={usuario} sedeActiva={sedeActiva} />}
            {tab === 'eliminaciones' && <Eliminaciones usuario={usuario} sedeActiva={sedeActiva} />}
            {tab === 'auditoria'     && usuario.rol_nombre === 'SUPERADMIN' && <Auditoria  usuario={usuario} />}
            {tab === 'respaldos'     && usuario.rol_nombre === 'SUPERADMIN' && <Respaldos  usuario={usuario} />}
          </Suspense>
        </main>
      </div>
    </div>
  );
}
