import React, { useEffect, useState, useCallback } from 'react';
import { inventarioApi } from '../services/inventarioApi.js';

function formatearTamano(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

const FRECUENCIAS = [
  { id: '1_HORA', label: '⏱️ Cada 1 Hora', desc: 'Respaldo automático cada 60 minutos' },
  { id: '6_HORAS', label: '⏱️ Cada 6 Horas', desc: 'Respaldo automático 4 veces al día' },
  { id: '12_HORAS', label: '⏱️ Cada 12 Horas', desc: 'Respaldo automático cada 12 horas' },
  { id: 'DIARIO', label: '📅 Diario', desc: 'Todos los días a una hora programada' },
  { id: 'SEMANAL', label: '🗓️ Semanal', desc: 'Una vez por semana en el día fijado' },
  { id: 'MENSUAL', label: '📆 Mensual', desc: 'Una vez al mes en el día fijado' }
];

const DIAS_SEMANA = [
  { id: 1, label: 'Lunes' },
  { id: 2, label: 'Martes' },
  { id: 3, label: 'Miércoles' },
  { id: 4, label: 'Jueves' },
  { id: 5, label: 'Viernes' },
  { id: 6, label: 'Sábado' },
  { id: 7, label: 'Domingo' }
];

export default function Respaldos({ usuario, sedeActiva }) {
  const esSuperadmin = usuario.rol_nombre === 'SUPERADMIN';
  const esAdmin = usuario.rol_nombre === 'ADMIN';

  const [respaldos, setRespaldos] = useState([]);
  const [sedes, setSedes] = useState([]);
  const [sedeRespaldo, setSedeRespaldo] = useState(() => sedeActiva ?? 'TODAS');
  const [error, setError] = useState(null);
  const [creando, setCreando] = useState(false);
  const [restaurando, setRestaurando] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [cargando, setCargando] = useState(true);

  // Configuración de respaldo automático
  const [configAuto, setConfigAuto] = useState({
    habilitado: true,
    frecuencia: '1_HORA',
    hora: '02:00',
    dia_semana: 1,
    dia_mes: 1,
    ultimo_backup_auto: null
  });
  const [guardandoConfig, setGuardandoConfig] = useState(false);
  const [mensajeConfig, setMensajeConfig] = useState(null);

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
    setSedeRespaldo(sedeActiva == null ? 'TODAS' : sedeActiva);
  }, [esSuperadmin, sedeActiva]);

  const sedeIdConsulta = esSuperadmin
    ? (sedeRespaldo === 'TODAS' || sedeRespaldo == null ? null : Number(sedeRespaldo))
    : (sedeActiva || usuario.sede_id);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    const [resList, resConfig] = await Promise.all([
      inventarioApi.backups.listar(usuario, { sedeId: sedeIdConsulta }),
      inventarioApi.backups.obtenerConfig(usuario)
    ]);
    if (resList.ok) setRespaldos(resList.data); else setError(resList.error);
    if (resConfig.ok) setConfigAuto(resConfig.data);
    setCargando(false);
  }, [usuario, sedeIdConsulta]);

  useEffect(() => { cargar(); }, [cargar]);

  async function handleGuardarConfig(e) {
    e.preventDefault();
    setGuardandoConfig(true);
    setMensajeConfig(null);
    const res = await inventarioApi.backups.guardarConfig(usuario, configAuto);
    setGuardandoConfig(false);
    if (res.ok) {
      setConfigAuto(res.data);
      setMensajeConfig('✅ Configuración de respaldos automáticos guardada exitosamente.');
      setTimeout(() => setMensajeConfig(null), 4000);
    } else {
      setError(res.error);
    }
  }

  async function handleCrear() {
    setCreando(true);
    setError(null);
    setAviso(null);
    const res = await inventarioApi.backups.crear(usuario, { sedeId: sedeIdConsulta });
    setCreando(false);
    if (!res.ok) { setError(res.error); return; }
    setAviso(`Copia de seguridad manual generada con éxito: ${res.data.nombre}`);
    await cargar();
  }

  async function handleRestaurar(nombre) {
    const primeraConfirmacion = window.confirm(
      `¿Restaurar el respaldo "${nombre}"?\n\nEsto REEMPLAZARÁ todos los datos actuales por los del respaldo. La acción no se puede deshacer.`
    );
    if (!primeraConfirmacion) return;

    const segundaConfirmacion = window.prompt(
      'Para confirmar la restauración de la base de datos, escriba RESTAURAR en mayúsculas:'
    );
    if (segundaConfirmacion !== 'RESTAURAR') {
      setError('Restauración cancelada: no se escribió la palabra de confirmación correctamente.');
      return;
    }

    setRestaurando(nombre);
    setError(null);
    const res = await inventarioApi.backups.restaurar(usuario, nombre);
    if (!res.ok) { setError(res.error); setRestaurando(null); return; }
    setAviso('Restauración completada con éxito. Los datos han sido actualizados.');
  }

  return (
    <div className="page-container respaldos-view">
      <div className="page-header-row">
        <div>
          <h2>Copias de Seguridad y Respaldos</h2>
          <p className="page-scope">
            {esSuperadmin
              ? (sedeIdConsulta ? `Gestión de respaldos para la sede seleccionada` : 'Programación global e historial de copias inmutables')
              : `Sede asignada: ${usuario.sede_nombre}`}
          </p>
        </div>
        <div className="header-actions" style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          {esSuperadmin && (
            <select
              className="user-sede-selector"
              value={sedeRespaldo == null ? 'TODAS' : sedeRespaldo}
              onChange={(e) => setSedeRespaldo(e.target.value)}
              style={{ padding: '0.45rem 0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1' }}
            >
              <option value="TODAS">Todas las sedes (Global)</option>
              {sedes.map((s) => (
                <option key={s.id} value={s.id}>{s.nombre}</option>
              ))}
            </select>
          )}
          <button className="btn-primario" onClick={handleCrear} disabled={creando}>
            {creando ? '⏳ Creando respaldo...' : '💾 Crear Respaldo Ahora'}
          </button>
        </div>
      </div>

      {aviso && <div className="aviso-ok">{aviso}</div>}
      {error && <div className="login-error">{error}</div>}

      {/* PANEL DE CONFIGURACIÓN DE RESPALDOS AUTOMÁTICOS */}
      <div style={{ background: '#ffffff', borderRadius: '12px', border: '1px solid #cbd5e1', padding: '1.25rem', marginBottom: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <div style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '0.75rem', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' }}>
              ⚙️ Programación de Respaldos Automáticos
            </h3>
            <span style={{ fontSize: '0.82rem', color: '#64748b' }}>
              El sistema ejecuta copias en segundo plano automáticamente según la frecuencia elegida
            </span>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.88rem', fontWeight: 700, color: configAuto.habilitado ? '#15803d' : '#64748b' }}>
            <input
              type="checkbox"
              checked={configAuto.habilitado}
              onChange={(e) => setConfigAuto((prev) => ({ ...prev, habilitado: e.target.checked }))}
              style={{ width: '1.1rem', height: '1.1rem', cursor: 'pointer' }}
            />
            {configAuto.habilitado ? '🟢 Auto-respaldos ACTIVADOS' : '⚪ Auto-respaldos DESACTIVADOS'}
          </label>
        </div>

        {configAuto.habilitado && (
          <form onSubmit={handleGuardarConfig}>
            <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '0.5rem' }}>
              Frecuencia de ejecución del respaldo:
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.6rem', marginBottom: '1rem' }}>
              {FRECUENCIAS.map((f) => {
                const activo = configAuto.frecuencia === f.id;
                return (
                  <button
                    key={f.id}
                    type="button"
                    className={`filter-chip ${activo ? 'chip-activo' : ''}`}
                    onClick={() => setConfigAuto((prev) => ({ ...prev, frecuencia: f.id }))}
                    style={{
                      padding: '0.6rem 0.8rem',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-start',
                      borderRadius: '8px',
                      textAlign: 'left',
                      height: '100%'
                    }}
                  >
                    <strong style={{ fontSize: '0.85rem' }}>{f.label}</strong>
                    <span style={{ fontSize: '0.73rem', opacity: 0.85, marginTop: '0.2rem' }}>{f.desc}</span>
                  </button>
                );
              })}
            </div>

            {/* Parámetros adicionales según frecuencia */}
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center', background: '#f8fafc', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '1rem' }}>
              {(configAuto.frecuencia === 'DIARIO' || configAuto.frecuencia === 'SEMANAL' || configAuto.frecuencia === 'MENSUAL') && (
                <div>
                  <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '0.2rem' }}>
                    Hora de ejecución:
                  </label>
                  <input
                    type="time"
                    value={configAuto.hora || '02:00'}
                    onChange={(e) => setConfigAuto((prev) => ({ ...prev, hora: e.target.value }))}
                    style={{ padding: '0.4rem 0.6rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                  />
                </div>
              )}

              {configAuto.frecuencia === 'SEMANAL' && (
                <div>
                  <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '0.2rem' }}>
                    Día de la semana:
                  </label>
                  <select
                    value={configAuto.dia_semana || 1}
                    onChange={(e) => setConfigAuto((prev) => ({ ...prev, dia_semana: Number(e.target.value) }))}
                    style={{ padding: '0.4rem 0.6rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                  >
                    {DIAS_SEMANA.map((d) => (
                      <option key={d.id} value={d.id}>{d.label}</option>
                    ))}
                  </select>
                </div>
              )}

              {configAuto.frecuencia === 'MENSUAL' && (
                <div>
                  <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '0.2rem' }}>
                    Día del mes:
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="31"
                    value={configAuto.dia_mes || 1}
                    onChange={(e) => setConfigAuto((prev) => ({ ...prev, dia_mes: Number(e.target.value) }))}
                    style={{ width: '80px', padding: '0.4rem 0.6rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                  />
                </div>
              )}

              {configAuto.ultimo_backup_auto && (
                <div style={{ marginLeft: 'auto', fontSize: '0.78rem', color: '#64748b' }}>
                  Última ejecución automática: <strong>{new Date(configAuto.ultimo_backup_auto).toLocaleString()}</strong>
                </div>
              )}
            </div>

            {mensajeConfig && <div className="aviso-ok" style={{ marginBottom: '0.75rem' }}>{mensajeConfig}</div>}

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="submit" className="btn-primario" disabled={guardandoConfig}>
                {guardandoConfig ? 'Guardando...' : '💾 Guardar Programación'}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* LISTA DE RESPALDOS GENERADOS */}
      <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#1e293b', marginBottom: '0.75rem' }}>
        📁 Historial de Archivos de Respaldo ({respaldos.length})
      </h3>

      <div className="table-responsive">
        <table className="tabla">
          <thead>
            <tr>
              <th>Tipo</th>
              <th>Sede / Alcance</th>
              <th>Archivo de respaldo</th>
              <th>Fecha de creación</th>
              <th>Tamaño</th>
              <th>Acciones de recuperación</th>
            </tr>
          </thead>
          <tbody>
            {respaldos.map((r) => (
              <tr key={r.nombre}>
                <td>
                  {r.esAutomatico ? (
                    <span className="pill estado-verde" style={{ fontSize: '0.74rem' }}>🤖 Automático</span>
                  ) : (
                    <span className="pill estado-gris" style={{ fontSize: '0.74rem' }}>👤 Manual</span>
                  )}
                </td>
                <td>
                  {r.sedeId ? (
                    <span className="pill estado-azul" style={{ fontSize: '0.74rem' }}>
                      📍 {sedes.find(s => s.id === r.sedeId)?.nombre || `Sede #${r.sedeId}`}
                    </span>
                  ) : (
                    <span className="pill estado-gris" style={{ fontSize: '0.74rem' }}>🌐 Global</span>
                  )}
                </td>
                <td><strong>{r.nombre}</strong></td>
                <td>{new Date(r.fecha).toLocaleString()}</td>
                <td><span className="mono-tag">{formatearTamano(r.tamanoBytes)}</span></td>
                <td>
                  <button
                    className="btn-peligro"
                    disabled={restaurando === r.nombre}
                    onClick={() => handleRestaurar(r.nombre)}
                    title="Restaurar base de datos a este punto"
                  >
                    {restaurando === r.nombre ? 'Restaurando...' : '⚠️ Restaurar'}
                  </button>
                </td>
              </tr>
            ))}
            {respaldos.length === 0 && (
              <tr>
                <td colSpan="5" className="tabla-vacia">
                  {cargando ? 'Cargando lista de respaldos...' : 'No hay respaldos generados todavía.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
