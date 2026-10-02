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
  const [sincronizando, setSincronizando] = useState(false);

  // Configuración de respaldo automático
  const [configAuto, setConfigAuto] = useState({
    habilitado: true,
    frecuencia: '1_HORA',
    hora: '02:00',
    dia_semana: 1,
    dia_mes: 1,
    maximo_respaldos_por_sede: 20,
    ultimo_backup_auto: null
  });
  const [guardandoConfig, setGuardandoConfig] = useState(false);
  const [mensajeConfig, setMensajeConfig] = useState(null);
  // Consumo real en disco. `respaldos` solo trae los del alcance de sede que está
  // seleccionado, así que sumarlos daría una cifra parcial y engañosa.
  const [consumo, setConsumo] = useState({ bytes: 0, cantidad: 0 });

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
    try {
      const [resList, resConfig, resConsumo] = await Promise.all([
        inventarioApi.backups.listar(usuario, { sedeId: sedeIdConsulta }),
        inventarioApi.backups.obtenerConfig(usuario),
        inventarioApi.backups.consumo(usuario)
      ]);
      // `listar` cruza el canal IPC, que serializa con structured clone. Si el
      // backend devolviera algo que no sea un array (por ejemplo el `{}` que
      // producia una Promise sin await), el estado debe quedar como lista vacía
      // en vez de propagar un objeto que revienta .map() más abajo.
      if (resList.ok) {
        setRespaldos(Array.isArray(resList.data) ? resList.data : []);
      } else {
        setRespaldos([]);
        setError(resList.error);
      }
      if (resConfig.ok) setConfigAuto(resConfig.data);
      if (resConsumo.ok) setConsumo(resConsumo.data);
    } catch (err) {
      console.error('[Respaldos] Error al cargar:', err);
      setError('No se pudo cargar la información de respaldos.');
    } finally {
      setCargando(false);
    }
  }, [usuario, sedeIdConsulta]);

  useEffect(() => { cargar(); }, [cargar]);

  async function handleGuardarConfig(e) {
    e.preventDefault();
    setGuardandoConfig(true);
    setMensajeConfig(null);
    try {
      const res = await inventarioApi.backups.guardarConfig(usuario, configAuto);
      if (res.ok) {
        setConfigAuto(res.data);
        setMensajeConfig('✅ Configuración de respaldos automáticos guardada exitosamente.');
        setTimeout(() => setMensajeConfig(null), 4000);
      } else {
        setError(res.error);
      }
    } catch (err) {
      console.error('[Respaldos] Error al guardar la configuración:', err);
      setError('No se pudo guardar la configuración de respaldos.');
    } finally {
      setGuardandoConfig(false);
    }
  }

  async function handleCrear() {
    setCreando(true);
    setError(null);
    setAviso(null);
    try {
      const res = await inventarioApi.backups.crear(usuario, { sedeId: sedeIdConsulta });
      if (!res?.ok) { setError(res?.error || 'No se pudo crear el respaldo.'); return; }
      const purgados = res.data?.purga?.eliminados?.length || 0;
      setAviso(
        `Copia de seguridad manual generada con éxito: ${res.data.nombre}`
        + (purgados > 0 ? ` (se purgaron ${purgados} respaldos automáticos antiguos)` : '')
      );
      await cargar();
    } catch (err) {
      console.error('[Respaldos] Error al crear el respaldo:', err);
      setError('No se pudo crear el respaldo. Intente nuevamente.');
    } finally {
      setCreando(false);
    }
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

  async function handleSincronizarNube(direccion = 'AMBAS') {
    setSincronizando(true);
    setError(null);
    setAviso(null);
    const res = await inventarioApi.cloudSync.sincronizar(usuario, { direccion });
    setSincronizando(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setAviso(`Sincronización Supabase lista: ${res.data.subidos} registros subidos, ${res.data.bajados} registros bajados.`);
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
              className="sede-selector"
              value={sedeRespaldo == null ? 'TODAS' : sedeRespaldo}
              onChange={(e) => setSedeRespaldo(e.target.value)}
              aria-label="Seleccionar alcance del respaldo"
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
          <button className="btn-secundario" onClick={() => handleSincronizarNube('AMBAS')} disabled={sincronizando}>
            {sincronizando ? 'Sincronizando...' : '☁️ Sincronizar Supabase'}
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
              className="checkbox-solo-label"
              checked={configAuto.habilitado}
              onChange={(e) => setConfigAuto((prev) => ({ ...prev, habilitado: e.target.checked }))}
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

            {/* RETENCIÓN */}
            <div style={{ background: '#fffbeb', border: '1px solid #fde68a', padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1rem' }}>
              <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#92400e', display: 'block', marginBottom: '0.35rem' }}>
                Retención: respaldos automáticos a conservar
              </label>
              <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <input
                  type="number"
                  min="1"
                  max="500"
                  value={configAuto.maximo_respaldos_por_sede ?? 20}
                  onChange={(e) => setConfigAuto((prev) => ({ ...prev, maximo_respaldos_por_sede: Number(e.target.value) }))}
                  style={{ width: '90px', padding: '0.4rem 0.6rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                />
                <span style={{ fontSize: '0.78rem', color: '#78350f' }}>
                  archivos por alcance de sede. Solo se purgan los <strong>automáticos</strong>; los manuales nunca se borran.
                  Con frecuencia horaria, 20 equivalen a unas 20 horas de historial.
                </span>
              </div>
              <div style={{ marginTop: '0.6rem', fontSize: '0.78rem', color: '#78350f' }}>
                Consumo actual en disco: <strong>{formatearTamano(consumo.bytes)}</strong> en <strong>{consumo.cantidad}</strong> archivo{consumo.cantidad === 1 ? '' : 's'} de respaldo (todos los alcances).
              </div>
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
            {cargando && (
              <tr>
                <td colSpan={6} className="tabla-vacia">Cargando lista de respaldos...</td>
              </tr>
            )}
            {!cargando && respaldos.map((r) => (
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
            {!cargando && respaldos.length === 0 && (
              <tr>
                <td colSpan={6} className="tabla-vacia">
                  No hay respaldos generados todavía.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
