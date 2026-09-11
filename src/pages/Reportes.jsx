import React, { useEffect, useState, useCallback, useMemo, useDeferredValue, lazy, Suspense } from 'react';
import { inventarioApi } from '../services/inventarioApi.js';

const ReportePDFView = lazy(() => import('../components/ReportePDFView.jsx'));

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

function coincide(texto, ...campos) {
  if (!texto) return true;
  const t = texto.toLowerCase();
  return campos.some((c) => String(c ?? '').toLowerCase().includes(t));
}

function slugArchivo(texto) {
  return String(texto || 'sede')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60) || 'sede';
}

function TablaVacia({ colSpan, mensaje }) {
  return (
    <tr>
      <td colSpan={colSpan} className="tabla-vacia">{mensaje}</td>
    </tr>
  );
}

const SECCIONES = [
  { id: 'todas', label: 'Todas' },
  { id: 'entradas', label: 'Entradas' },
  { id: 'despachos', label: 'Despachos' },
  { id: 'salidas', label: 'Salidas sin orden' },
  { id: 'entregas', label: 'Entregas incompletas' },
  { id: 'solicitudes', label: 'Eliminaciones' },
  { id: 'vencimientos', label: 'Vencimientos' },
  { id: 'irregularidades', label: 'Irregularidades' },
  { id: 'auditoria', label: 'Auditoría' }
];

export default function Reportes({ usuario, sedeActiva }) {
  const esSuperadmin = usuario.rol_nombre === 'SUPERADMIN';
  const [reporte, setReporte] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [sedes, setSedes] = useState([]);
  const [sedeReporte, setSedeReporte] = useState(() => sedeActiva ?? 'TODAS');

  const [tipoPeriodo, setTipoPeriodo] = useState('HOY');
  const [fechaInicio, setFechaInicio] = useState(hoyISO());
  const [fechaFin, setFechaFin] = useState(hoyISO());

  const [modoVisualizacion, setModoVisualizacion] = useState('INTERACTIVO');
  const [seccionActiva, setSeccionActiva] = useState('todas');
  const [filtroTexto, setFiltroTexto] = useState('');
  const [descargandoPdf, setDescargandoPdf] = useState(false);
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
    setSedeReporte(sedeActiva == null ? 'TODAS' : sedeActiva);
  }, [esSuperadmin, sedeActiva]);

  const sedeIdConsulta = esSuperadmin
    ? (sedeReporte === 'TODAS' || sedeReporte == null ? null : Number(sedeReporte))
    : (sedeActiva || usuario.sede_id);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    const filtros = {
      tipoPeriodo,
      sedeId: sedeIdConsulta,
      fechaInicio: tipoPeriodo === 'RANGO' || tipoPeriodo === 'HOY' ? fechaInicio : undefined,
      fechaFin: tipoPeriodo === 'RANGO' ? fechaFin : undefined
    };
    const res = await inventarioApi.reportes.diario(usuario, filtros);
    if (res.ok) {
      setReporte(res.data);
    } else {
      setError(res.error);
      setReporte(null);
    }
    setCargando(false);
  }, [usuario, sedeIdConsulta, tipoPeriodo, fechaInicio, fechaFin]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  function handleSeleccionarPeriodo(tipo) {
    setTipoPeriodo(tipo);
    const hoy = new Date();
    if (tipo === 'HOY') {
      setFechaInicio(hoyISO());
      setFechaFin(hoyISO());
    } else if (tipo === 'SEMANA') {
      const diaSemana = hoy.getDay();
      const offsetALunes = diaSemana === 0 ? -6 : diaSemana - 1;
      const lunes = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + offsetALunes);
      setFechaInicio(lunes.toISOString().slice(0, 10));
      setFechaFin(hoyISO());
    } else if (tipo === 'MES') {
      const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
      setFechaInicio(inicioMes.toISOString().slice(0, 10));
      setFechaFin(hoyISO());
    } else if (tipo === 'ANIO') {
      setFechaInicio(`${hoy.getFullYear()}-01-01`);
      setFechaFin(`${hoy.getFullYear()}-12-31`);
    }
  }

  async function handleDescargarPDF() {
    if (!reporte || descargandoPdf) return;
    setModoVisualizacion('VISTA_PDF');
    setDescargandoPdf(true);
    setError(null);

    const listo = await new Promise((resolve) => {
      let intentos = 0;
      const timer = window.setInterval(() => {
        intentos += 1;
        if (document.getElementById('reporte-pdf-content') || intentos >= 40) {
          window.clearInterval(timer);
          resolve(Boolean(document.getElementById('reporte-pdf-content')));
        }
      }, 50);
    });

    if (!listo) {
      setDescargandoPdf(false);
      setError('No se pudo preparar el reporte para descargar.');
      return;
    }

    const nombre = `Reporte_${slugArchivo(reporte.sede_nombre || 'sede')}_${hoyISO()}.pdf`;
    const res = await inventarioApi.reportes.guardarPdf(nombre);
    setDescargandoPdf(false);
    if (!res.ok && !res.cancelado) {
      setError(res.error || 'No se pudo descargar el PDF.');
    }
  }

  const eg = reporte?.estado_general || {};
  const esConciliado = eg.estado === 'CONCILIADO';
  const ver = (id) => seccionActiva === 'todas' || seccionActiva === id;

  const datos = useMemo(() => {
    if (!reporte) {
      return {
        entradas: [],
        despachos: [],
        salidas: [],
        entregas: [],
        solicitudes: [],
        proximos: [],
        vencidos: [],
        irregularidades: [],
        auditoria: []
      };
    }
    return {
      entradas: (reporte.entradas || []).filter((e) =>
        coincide(deferredTexto, e.medicamento_nombre, e.medicamento_codigo, e.numero_lote, e.registrado_por, e.sede_nombre)
      ),
      despachos: (reporte.despachosConOrden || []).filter((d) =>
        coincide(deferredTexto, d.medicamento_nombre, d.medicamento_codigo, d.numero_lote, d.orden_numero, d.despachado_por, d.sede_nombre)
      ),
      salidas: (reporte.salidasSinOrden || []).filter((s) =>
        coincide(deferredTexto, s.medicamento_nombre, s.salida_realizada_por, s.motivo, s.sede_nombre)
      ),
      entregas: (reporte.entregasIncompletas || []).filter((e) =>
        coincide(deferredTexto, e.orden_numero, e.receptor_nombre, e.entregado_por, e.sede_nombre)
      ),
      solicitudes: (reporte.solicitudesEliminacion || []).filter((s) =>
        coincide(deferredTexto, s.medicamento_nombre, s.numero_lote, s.solicitado_por, s.motivo, s.sede_nombre)
      ),
      proximos: (reporte.proximosAVencer || []).filter((p) =>
        coincide(deferredTexto, p.medicamento_nombre, p.medicamento_codigo, p.numero_lote, p.sede_nombre)
      ),
      vencidos: (reporte.vencidos || []).filter((v) =>
        coincide(deferredTexto, v.medicamento_nombre, v.medicamento_codigo, v.numero_lote, v.sede_nombre)
      ),
      irregularidades: (reporte.irregularidades || []).filter((i) =>
        coincide(deferredTexto, i.tipo, i.registro, i.detalle, i.sede)
      ),
      auditoria: (reporte.auditoria || []).filter((a) =>
        coincide(deferredTexto, a.usuario_nombre, a.accion, a.registro_afectado, a.sede_nombre)
      )
    };
  }, [reporte, deferredTexto]);

  return (
    <div className="page-container reportes-view">
      <div className="page-header-row no-print">
        <div>
          <h2>Reporte de Inventario y Despachos</h2>
          <p className="page-scope">
            {esSuperadmin
              ? `Auditoría por sede${reporte?.sede_nombre ? ` — ${reporte.sede_nombre}` : ''}`
              : `Sede: ${usuario.sede_nombre}`}
          </p>
        </div>
        <div className="header-actions">
          <button
            type="button"
            className="btn-refrescar"
            onClick={cargar}
            title="Actualizar reporte"
          >
            🔄 Actualizar
          </button>
          <button
            type="button"
            className={`btn-toggle-action ${modoVisualizacion === 'VISTA_PDF' ? 'btn-primario' : 'btn-secundario'}`}
            onClick={() => setModoVisualizacion(modoVisualizacion === 'VISTA_PDF' ? 'INTERACTIVO' : 'VISTA_PDF')}
          >
            {modoVisualizacion === 'VISTA_PDF' ? '📊 Vista Interactiva' : '📄 Vista Formato PDF'}
          </button>
          <button
            type="button"
            className="btn-verde"
            onClick={handleDescargarPDF}
            disabled={!reporte || descargandoPdf}
            title="Descargar reporte en PDF"
          >
            {descargandoPdf ? 'Descargando PDF...' : '📄 Descargar PDF'}
          </button>
        </div>
      </div>

      <div className="filtros-card no-print">
        <div className="periodo-selector-row">
          <label className="periodo-label" htmlFor="sede-reporte">Sede del reporte:</label>
          {esSuperadmin ? (
            <select
              id="sede-reporte"
              className="sede-reporte-select"
              value={sedeReporte ?? 'TODAS'}
              onChange={(e) => {
                const valor = e.target.value;
                setSedeReporte(valor === 'TODAS' ? 'TODAS' : Number(valor));
              }}
              aria-label="Seleccionar sede del reporte"
            >
              <option value="TODAS">Todas las sedes</option>
              {sedes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}{s.ciudad ? ` — ${s.ciudad}` : ''}
                </option>
              ))}
            </select>
          ) : (
            <span className="sede-reporte-fija">📍 {usuario.sede_nombre}</span>
          )}
        </div>

        <div className="periodo-selector-row">
          <label className="periodo-label">Periodo del reporte:</label>
          <div className="periodo-btn-group">
            {[
              { id: 'HOY', label: 'Hoy' },
              { id: 'SEMANA', label: 'Semana' },
              { id: 'MES', label: 'Mes' },
              { id: 'ANIO', label: 'Año' },
              { id: 'RANGO', label: 'Rango' }
            ].map((p) => (
              <button
                key={p.id}
                type="button"
                className={`periodo-pill ${tipoPeriodo === p.id ? 'periodo-activo' : ''}`}
                onClick={() => handleSeleccionarPeriodo(p.id)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {tipoPeriodo === 'RANGO' && (
          <div className="rango-fechas-row">
            <div className="date-input-block">
              <label htmlFor="fecha-inicio">Desde</label>
              <input
                id="fecha-inicio"
                type="date"
                value={fechaInicio}
                onChange={(e) => setFechaInicio(e.target.value)}
              />
            </div>
            <div className="date-input-block">
              <label htmlFor="fecha-fin">Hasta</label>
              <input
                id="fecha-fin"
                type="date"
                value={fechaFin}
                onChange={(e) => setFechaFin(e.target.value)}
              />
            </div>
          </div>
        )}

        <div className="search-bar-wrap">
          <span className="search-icon">🔍</span>
          <input
            type="text"
            className="search-input"
            placeholder="Buscar por medicamento, lote, orden, usuario..."
            value={filtroTexto}
            onChange={(e) => setFiltroTexto(e.target.value)}
          />
          {filtroTexto && (
            <button type="button" className="btn-clear-search" onClick={() => setFiltroTexto('')}>×</button>
          )}
        </div>
      </div>

      {error && <div className="login-error no-print">{error}</div>}

      {cargando && !reporte && (
        <div className="loading-state no-print">
          <div className="spinner"></div>
          <p>Cargando reporte...</p>
        </div>
      )}

      {reporte && modoVisualizacion === 'INTERACTIVO' && (
        <div className="modo-interactivo-container">
          <div className={`conciliacion-card ${esConciliado ? 'conciliado-ok' : 'conciliado-alerta'}`}>
            <div className="conciliacion-icon">{esConciliado ? '🛡️' : '⚠️'}</div>
            <div className="conciliacion-content">
              <div className="conciliacion-title">
                {esConciliado ? 'Periodo conciliado' : 'Periodo no conciliado'}
              </div>
              <p className="conciliacion-desc">
                {reporte.periodo}
                {(eg.motivos || []).length > 0 ? ` — ${(eg.motivos || []).join(' ')}` : ' — Sin irregularidades detectadas.'}
              </p>
            </div>
            <span className={`pill ${esConciliado ? 'estado-verde' : 'estado-rojo'}`}>{eg.estado}</span>
          </div>

          <div className="reporte-summary-grid">
            <div className="summary-stat-box">
              <span className="stat-icon">📥</span>
              <div className="stat-content">
                <span className="stat-label">Entradas</span>
                <span className="stat-num">{eg.entradas ?? 0}</span>
              </div>
            </div>
            <div className="summary-stat-box">
              <span className="stat-icon">📤</span>
              <div className="stat-content">
                <span className="stat-label">Salidas con orden</span>
                <span className="stat-num">{eg.salidas_con_orden ?? 0}</span>
              </div>
            </div>
            <div className="summary-stat-box">
              <span className="stat-icon">⚠️</span>
              <div className="stat-content">
                <span className="stat-label">Salidas sin orden</span>
                <span className="stat-num">{eg.salidas_sin_orden ?? 0}</span>
              </div>
            </div>
            <div className="summary-stat-box">
              <span className="stat-icon">📦</span>
              <div className="stat-content">
                <span className="stat-label">Stock físico</span>
                <span className="stat-num">{eg.stock_fisico ?? 0}</span>
              </div>
            </div>
            <div className="summary-stat-box">
              <span className="stat-icon">⏳</span>
              <div className="stat-content">
                <span className="stat-label">Próximos a vencer</span>
                <span className="stat-num">{eg.lotes_proximos_vencer ?? 0}</span>
              </div>
            </div>
            <div className="summary-stat-box">
              <span className="stat-icon">🚫</span>
              <div className="stat-content">
                <span className="stat-label">Unidades vencidas</span>
                <span className="stat-num">{eg.medicamentos_vencidos ?? 0}</span>
              </div>
            </div>
          </div>

          <div className="subtabs-bar no-print">
            {SECCIONES.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`subtab-btn ${seccionActiva === s.id ? 'subtab-activo' : ''}`}
                onClick={() => setSeccionActiva(s.id)}
              >
                {s.label}
              </button>
            ))}
          </div>

          {ver('entradas') && (
            <section className="seccion-bloque">
              <div className="seccion-titulo-row">
                <h3>Entradas del periodo</h3>
                <span className="counter-badge">{datos.entradas.length}</span>
              </div>
              <div className="table-responsive">
                <table className="tabla">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Sede</th>
                      <th>Medicamento</th>
                      <th>Lote</th>
                      <th>Cantidad</th>
                      <th>Registrado por</th>
                    </tr>
                  </thead>
                  <tbody>
                    {datos.entradas.map((e) => (
                      <tr key={e.id}>
                        <td>{e.fecha}</td>
                        <td>{e.sede_nombre}</td>
                        <td><strong>{e.medicamento_codigo}</strong> — {e.medicamento_nombre}</td>
                        <td><span className="mono-tag">{e.numero_lote}</span></td>
                        <td>{e.cantidad}</td>
                        <td>{e.registrado_por}</td>
                      </tr>
                    ))}
                    {datos.entradas.length === 0 && (
                      <TablaVacia colSpan={6} mensaje={cargando ? 'Cargando...' : 'Sin entradas en este periodo.'} />
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {ver('despachos') && (
            <section className="seccion-bloque">
              <div className="seccion-titulo-row">
                <h3>Despachos con orden</h3>
                <span className="counter-badge">{datos.despachos.length}</span>
              </div>
              <div className="table-responsive">
                <table className="tabla">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Orden</th>
                      <th>Medicamento</th>
                      <th>Lote</th>
                      <th>Cantidad</th>
                      <th>Documentación</th>
                    </tr>
                  </thead>
                  <tbody>
                    {datos.despachos.map((d) => (
                      <tr key={d.id}>
                        <td>{d.fecha}</td>
                        <td>{d.orden_numero}</td>
                        <td><strong>{d.medicamento_codigo}</strong> — {d.medicamento_nombre}</td>
                        <td><span className="mono-tag">{d.numero_lote}</span></td>
                        <td>{d.cantidad}</td>
                        <td>
                          <span className={`pill ${d.documentacion_completa ? 'estado-verde' : 'estado-rojo'}`}>
                            {d.documentacion_completa ? 'Completa' : 'Incompleta'}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {datos.despachos.length === 0 && (
                      <TablaVacia colSpan={6} mensaje={cargando ? 'Cargando...' : 'Sin despachos con orden en este periodo.'} />
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {ver('salidas') && (
            <section className="seccion-bloque">
              <div className="seccion-titulo-row">
                <h3>Salidas sin orden</h3>
                <span className="counter-badge bg-red-badge">{datos.salidas.length}</span>
              </div>
              <div className="table-responsive">
                <table className="tabla">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Sede</th>
                      <th>Medicamento</th>
                      <th>Cantidad</th>
                      <th>Realizado por</th>
                      <th>Motivo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {datos.salidas.map((s) => (
                      <tr key={s.id}>
                        <td>{s.fecha}</td>
                        <td>{s.sede_nombre}</td>
                        <td>{s.medicamento_nombre}</td>
                        <td>{s.cantidad}</td>
                        <td>{s.salida_realizada_por}</td>
                        <td>{s.motivo}</td>
                      </tr>
                    ))}
                    {datos.salidas.length === 0 && (
                      <TablaVacia colSpan={6} mensaje={cargando ? 'Cargando...' : 'No hay salidas sin orden en este periodo.'} />
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {ver('entregas') && (
            <section className="seccion-bloque">
              <div className="seccion-titulo-row">
                <h3>Entregas con documentación incompleta</h3>
                <span className="counter-badge bg-rose-badge">{datos.entregas.length}</span>
              </div>
              <div className="table-responsive">
                <table className="tabla">
                  <thead>
                    <tr>
                      <th>Orden</th>
                      <th>Fecha</th>
                      <th>Receptor</th>
                      <th>Entregado por</th>
                      <th>Firma</th>
                      <th>Huella</th>
                    </tr>
                  </thead>
                  <tbody>
                    {datos.entregas.map((e) => (
                      <tr key={e.id}>
                        <td>{e.orden_numero}</td>
                        <td>{e.fecha}</td>
                        <td>{e.receptor_nombre}</td>
                        <td>{e.entregado_por}</td>
                        <td>{e.firma ? 'Sí' : 'No'}</td>
                        <td>{e.huella ? 'Sí' : 'No'}</td>
                      </tr>
                    ))}
                    {datos.entregas.length === 0 && (
                      <TablaVacia colSpan={6} mensaje={cargando ? 'Cargando...' : 'No hay entregas incompletas en este periodo.'} />
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {ver('solicitudes') && (
            <section className="seccion-bloque">
              <div className="seccion-titulo-row">
                <h3>Solicitudes de eliminación</h3>
                <span className="counter-badge">{datos.solicitudes.length}</span>
              </div>
              <div className="table-responsive">
                <table className="tabla">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Fecha</th>
                      <th>Medicamento</th>
                      <th>Lote</th>
                      <th>Solicitante</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {datos.solicitudes.map((s) => (
                      <tr key={s.id}>
                        <td>#{s.id}</td>
                        <td>{s.fecha_solicitud}</td>
                        <td>{s.medicamento_nombre}</td>
                        <td><span className="mono-tag">{s.numero_lote}</span></td>
                        <td>{s.solicitado_por}</td>
                        <td>
                          <span className={`pill ${s.estado === 'APROBADA' ? 'estado-verde' : s.estado === 'RECHAZADA' ? 'estado-rojo' : 'estado-amarillo'}`}>
                            {s.estado}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {datos.solicitudes.length === 0 && (
                      <TablaVacia colSpan={6} mensaje={cargando ? 'Cargando...' : 'Sin solicitudes de eliminación en este periodo.'} />
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {ver('vencimientos') && (
            <>
              <section className="seccion-bloque">
                <div className="seccion-titulo-row">
                  <h3>Próximos a vencer</h3>
                  <span className="counter-badge bg-amber-badge">{datos.proximos.length}</span>
                </div>
                <div className="table-responsive">
                  <table className="tabla">
                    <thead>
                      <tr>
                        <th>Medicamento</th>
                        <th>Lote</th>
                        <th>Vencimiento</th>
                        <th>Cantidad</th>
                        <th>Sede</th>
                      </tr>
                    </thead>
                    <tbody>
                      {datos.proximos.map((p) => (
                        <tr key={p.id}>
                          <td><strong>{p.medicamento_codigo}</strong> — {p.medicamento_nombre}</td>
                          <td><span className="mono-tag">{p.numero_lote}</span></td>
                          <td>{p.fecha_vencimiento}</td>
                          <td>{p.cantidad}</td>
                          <td>{p.sede_nombre}</td>
                        </tr>
                      ))}
                      {datos.proximos.length === 0 && (
                        <TablaVacia colSpan={5} mensaje={cargando ? 'Cargando...' : 'No hay lotes próximos a vencer.'} />
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="seccion-bloque">
                <div className="seccion-titulo-row">
                  <h3>Medicamentos vencidos</h3>
                  <span className="counter-badge bg-red-badge">{datos.vencidos.length}</span>
                </div>
                <div className="table-responsive">
                  <table className="tabla">
                    <thead>
                      <tr>
                        <th>Medicamento</th>
                        <th>Lote</th>
                        <th>Vencimiento</th>
                        <th>Cantidad</th>
                        <th>Sede</th>
                      </tr>
                    </thead>
                    <tbody>
                      {datos.vencidos.map((v) => (
                        <tr key={v.id}>
                          <td><strong>{v.medicamento_codigo}</strong> — {v.medicamento_nombre}</td>
                          <td><span className="mono-tag">{v.numero_lote}</span></td>
                          <td>{v.fecha_vencimiento}</td>
                          <td>{v.cantidad}</td>
                          <td>{v.sede_nombre}</td>
                        </tr>
                      ))}
                      {datos.vencidos.length === 0 && (
                        <TablaVacia colSpan={5} mensaje={cargando ? 'Cargando...' : 'No hay medicamentos vencidos.'} />
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}

          {ver('irregularidades') && (
            <section className="seccion-bloque">
              <div className="seccion-titulo-row">
                <h3>Irregularidades detectadas</h3>
                <span className="counter-badge bg-red-badge">{datos.irregularidades.length}</span>
              </div>
              <div className="table-responsive">
                <table className="tabla">
                  <thead>
                    <tr>
                      <th>Sede</th>
                      <th>Tipo</th>
                      <th>Registro</th>
                      <th>Detalle</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {datos.irregularidades.map((irr, idx) => (
                      <tr key={`${irr.registro}-${idx}`}>
                        <td>{irr.sede}</td>
                        <td><strong>{irr.tipo}</strong></td>
                        <td>{irr.registro}</td>
                        <td>{irr.detalle}</td>
                        <td>
                          <span className={`pill ${irr.estado === 'ROJO' ? 'estado-rojo' : 'estado-amarillo'}`}>
                            {irr.estado}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {datos.irregularidades.length === 0 && (
                      <TablaVacia colSpan={5} mensaje={cargando ? 'Cargando...' : 'No se detectaron irregularidades.'} />
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {ver('auditoria') && (
            <section className="seccion-bloque">
              <div className="seccion-titulo-row">
                <h3>Auditoría del periodo</h3>
                <span className="counter-badge">{datos.auditoria.length}</span>
              </div>
              <div className="table-responsive">
                <table className="tabla">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Usuario</th>
                      <th>Acción</th>
                      <th>Registro</th>
                      <th>Resultado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {datos.auditoria.map((a) => (
                      <tr key={a.id}>
                        <td>{a.fecha}</td>
                        <td>{a.usuario_nombre}</td>
                        <td><strong>{a.accion}</strong></td>
                        <td>{a.registro_afectado}</td>
                        <td>
                          <span className={`pill ${a.resultado === 'EXITO' ? 'estado-verde' : 'estado-rojo'}`}>
                            {a.resultado}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {datos.auditoria.length === 0 && (
                      <TablaVacia colSpan={5} mensaje={cargando ? 'Cargando...' : 'Sin eventos de auditoría en este periodo.'} />
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      )}

      {reporte && (
        <div className={modoVisualizacion === 'VISTA_PDF' ? 'pdf-view-container' : 'pdf-view-container only-print'}>
          <Suspense fallback={<div className="loading-state">Preparando formato PDF...</div>}>
            <ReportePDFView reporte={reporte} usuario={usuario} />
          </Suspense>
        </div>
      )}
    </div>
  );
}
