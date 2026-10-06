import React, { useState, useEffect, useRef, useCallback } from 'react';
import { inventarioApi } from '../services/inventarioApi.js';

const ROLES_ESCRITURA = ['SUPERADMIN', 'ADMIN', 'INVENTARIO'];

const ESTADO_CLASE = {
  DISPONIBLE: 'estado-verde',
  PROXIMO_VENCER: 'estado-amarillo',
  VENCIDO: 'estado-rojo',
  AGOTADO: 'estado-gris'
};

export default function Recepcion({ usuario, sedeActiva, onNavigate }) {
  const [medicamentos, setMedicamentos] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(null);
  const [exito, setExito] = useState(null);
  
  // Estado del escaneo
  const [codigoEscaneado, setCodigoEscaneado] = useState('');
  const [resultadoEscaneo, setResultadoEscaneo] = useState(null);
  const [procesandoEscaneo, setProcesandoEscaneo] = useState(false);
  
  // Formulario de recepción
  const [lote, setLote] = useState('');
  const [fechaVencimiento, setFechaVencimiento] = useState('');
  const [cantidad, setCantidad] = useState(1);
  const [sedeSeleccionada, setSedeSeleccionada] = useState(sedeActiva ?? '');
  const [sedes, setSedes] = useState([]);
  const [registrando, setRegistrando] = useState(false);
  
  // Historial
  const [historial, setHistorial] = useState([]);
  const [cargandoHistorial, setCargandoHistorial] = useState(false);
  const [paginaHistorial, setPaginaHistorial] = useState(1);
  const [porPaginaHistorial, setPorPaginaHistorial] = useState(20);
  const [filtroHistorial, setFiltroHistorial] = useState('');

  const inputRef = useRef(null);
  const puedeEscribir = ROLES_ESCRITURA.includes(usuario.rol_nombre);
  const esSuperadmin = usuario.rol_nombre === 'SUPERADMIN';

  // Cargar medicamentos para referencia
  useEffect(() => {
    if (!puedeEscribir) return;
    setCargando(true);
    inventarioApi.medicamentos.listar(usuario)
      .then(res => { if (res.ok) setMedicamentos(res.data); })
      .catch(() => {})
      .finally(() => setCargando(false));
  }, [usuario, puedeEscribir]);

  // Cargar sedes para SUPERADMIN
  useEffect(() => {
    if (!esSuperadmin) return;
    inventarioApi.sedes.listar(usuario)
      .then(res => { if (res.ok) setSedes(res.data); });
  }, [usuario, esSuperadmin]);

  // Cargar historial
  const cargarHistorial = useCallback(async () => {
    setCargandoHistorial(true);
    try {
      const res = await inventarioApi.recepcion.historial(usuario, {
        limite: 100,
        sede_id: esSuperadmin ? (sedeSeleccionada || null) : sedeActiva
      });
      if (res.ok) setHistorial(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setCargandoHistorial(false);
    }
  }, [usuario, esSuperadmin, sedeActiva, sedeSeleccionada]);

  useEffect(() => {
    cargarHistorial();
  }, [cargarHistorial]);

  // Focus automático en input de escaneo
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Manejar entrada del lector (simula teclado, termina en Enter)
  const handleKeyDown = useCallback(async (e) => {
    if (e.key === 'Enter' && codigoEscaneado.trim()) {
      e.preventDefault();
      await procesarEscaneo(codigoEscaneado.trim());
      setCodigoEscaneado('');
    }
  }, [codigoEscaneado]);

  const procesarEscaneo = async (codigo) => {
    setProcesandoEscaneo(true);
    setError(null);
    try {
      const res = await inventarioApi.recepcion.escanear(usuario, codigo);
      if (res.ok) {
        setResultadoEscaneo(res.data);
        // Pre-llenar lote y vencimiento si vienen en el código
        if (res.data.lote_detectado) setLote(res.data.lote_detectado);
        if (res.data.vencimiento_detectado) setFechaVencimiento(res.data.vencimiento_detectado);
        // Auto-focus en cantidad
        setTimeout(() => document.getElementById('input-cantidad')?.focus(), 100);
      } else {
        setError(res.error);
        setResultadoEscaneo(null);
      }
    } catch (err) {
      setError(err.message);
      setResultadoEscaneo(null);
    } finally {
      setProcesandoEscaneo(false);
    }
  };

  const handleRegistrar = async (e) => {
    e.preventDefault();
    if (!resultadoEscaneo) { setError('Primero escanee un código'); return; }
    if (!lote.trim()) { setError('Lote es obligatorio'); return; }
    if (!fechaVencimiento) { setError('Fecha de vencimiento es obligatoria'); return; }
    if (!cantidad || cantidad <= 0) { setError('Cantidad debe ser mayor a 0'); return; }
    if (!sedeSeleccionada) { setError('Seleccione la sede de recepción'); return; }

    setRegistrando(true);
    setError(null);
    setExito(null);

    try {
      const res = await inventarioApi.recepcion.registrar(usuario, {
        catalogo_cum_id: resultadoEscaneo.catalogo?.id,
        empaque_nivel: resultadoEscaneo.empaque?.nivel,
        empaque_gtin: resultadoEscaneo.empaque?.gtin,
        factor_conversion: resultadoEscaneo.empaque?.factor_conversion || 1,
        lote: lote.trim(),
        fecha_vencimiento: fechaVencimiento,
        cantidad: Number(cantidad),
        sede_id: sedeSeleccionada || null
      });
      
      if (res.ok) {
        setExito(` Recepción registrada: ${res.medicamento.nombre} - ${res.equivalencias.unidades_base_calculadas} unidades base (${res.equivalencias.recibido_nivel_escan} x factor ${res.equivalencias.factor_conversion})`);
        // Limpiar formulario
        setResultadoEscaneo(null);
        setLote('');
        setFechaVencimiento('');
        setCantidad(1);
        inputRef.current?.focus();
        await cargarHistorial();
      } else {
        setError(res.error);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setRegistrando(false);
    }
  };

  const formatearFecha = (fecha) => {
    if (!fecha) return '-';
    try { return new Date(fecha).toLocaleDateString('es-CO'); } catch { return fecha; }
  };

  const getEstadoClase = (fecha) => {
    if (!fecha) return '';
    const hoy = new Date();
    hoy.setHours(0,0,0,0);
    const venc = new Date(fecha);
    const diff = Math.floor((venc - hoy) / (1000*60*60*24));
    if (diff < 0) return 'estado-rojo';
    if (diff <= 90) return 'estado-amarillo';
    return 'estado-verde';
  };

  return (
    <div className="page-container recepcion-view">
      <div className="page-header-row">
        <div className="grupo-titulo">
          {onNavigate && (
            <button
              type="button"
              className="btn-secundario btn-secundario--regreso"
              onClick={() => onNavigate('inventario')}
            >
              ← Volver a Inventario
            </button>
          )}
          <div>
            <h2> Recepción de Medicamentos</h2>
            <p className="page-scope">Escanee código de barras (GTIN/EAN/GS1/DataMatrix) para identificar y recibir automáticamente</p>
          </div>
        </div>
      </div>

      {exito && (
        <div className="aviso-ok aviso-ok--cerrable">
          {exito}
          <div className="grupo-mini-acciones">
            <button className="btn-cerrar-alerta" onClick={() => setExito(null)}>×</button>
            {onNavigate && (
              <button className="btn-accion-ok" onClick={() => { setExito(null); onNavigate('inventario'); }}> Ver Inventario</button>
            )}
          </div>
        </div>
      )}
      {error && <div className="login-error login-error--cerrable">{error} <button className="btn-cerrar-alerta" onClick={() => setError(null)}>×</button></div>}

      <div className="recepcion-grid">
        {/* Panel Izquierdo: Escaneo y Resultado */}
        <div className="recepcion-panel">
          <div className="panel-card">
            <h3> Escanear Código de Barras</h3>
            <div className="scan-area">
              <input
                ref={inputRef}
                type="text"
                className="scan-input"
                placeholder="Posicione cursor aquí y escanee (Enter para procesar)..."
                value={codigoEscaneado}
                onChange={e => setCodigoEscaneado(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={procesandoEscaneo}
                autoComplete="off"
                spellCheck="false"
              />
              {procesandoEscaneo && <span className="scan-loading"> Procesando...</span>}
            </div>
          </div>

          {resultadoEscaneo && (
            <div className="panel-card resultado-escaneo">
              <h3> Producto Identificado</h3>
              <div className="resultado-grid">
                <div className="resultado-item"><label>Producto</label><strong>{resultadoEscaneo.catalogo?.producto || 'No encontrado en catálogo'}</strong></div>
                <div className="resultado-item"><label>CUM</label><span className="mono-tag">{resultadoEscaneo.catalogo?.cum || '-'}</span></div>
                <div className="resultado-item"><label>GTIN</label><span className="mono-tag">{resultadoEscaneo.gtin || '-'}</span></div>
                <div className="resultado-item"><label>Principio Activo</label>{resultadoEscaneo.catalogo?.principio_activo || '-'}</div>
                <div className="resultado-item"><label>Concentración</label>{resultadoEscaneo.catalogo?.concentracion || '-'}</div>
                <div className="resultado-item"><label>Forma Farm.</label>{resultadoEscaneo.catalogo?.forma_farmaceutica || '-'}</div>
                <div className="resultado-item"><label>Laboratorio</label>{resultadoEscaneo.catalogo?.laboratorio || '-'}</div>
                <div className="resultado-item"><label>Reg. Sanitario</label><span className="mono-tag">{resultadoEscaneo.catalogo?.registro_sanitario || '-'}</span></div>
                <div className="resultado-item"><label>Fuente</label><span className={`pill ${resultadoEscaneo.catalogo?.fuente === 'INVIMA' ? 'estado-verde' : 'estado-azul'}`}>{resultadoEscaneo.catalogo?.fuente || '-'}</span></div>
                {resultadoEscaneo.empaque && (
                  <>
                    <div className="resultado-item"><label>Nivel Empaque</label><span className="pill estado-azul">Nivel {resultadoEscaneo.empaque.nivel} - {resultadoEscaneo.empaque.descripcion || 'Empaque'}</span></div>
                    <div className="resultado-item"><label>Factor Conversión</label><strong>1 empaque = {resultadoEscaneo.empaque.factor_conversion} unidades base</strong></div>
                    <div className="resultado-item"><label>Contenido</label>{resultadoEscaneo.empaque.contenido_cantidad} {resultadoEscaneo.empaque.contenido_unidad}</div>
                  </>
                )}
                {resultadoEscaneo.lote_detectado && (
                  <div className="resultado-item"><label>Lote (desde código)</label><span className="mono-tag">{resultadoEscaneo.lote_detectado}</span></div>
                )}
                {resultadoEscaneo.vencimiento_detectado && (
                  <div className="resultado-item"><label>Vencimiento (desde código)</label><span className={getEstadoClase(resultadoEscaneo.vencimiento_detectado)}>{formatearFecha(resultadoEscaneo.vencimiento_detectado)}</span></div>
                )}
                {resultadoEscaneo.serial_detectado && (
                  <div className="resultado-item"><label>Serial</label><span className="mono-tag">{resultadoEscaneo.serial_detectado}</span></div>
                )}
              </div>
              
              {resultadoEscaneo.requiere_registro_manual && (
                <div className="aviso-advertencia">
                   Producto no encontrado en catálogo INVIMA. 
                  <a href="#catalogo" onClick={e => { e.preventDefault(); alert('Use el módulo Catálogo CUM → Registrar Manual'); }}>Registrar manualmente en Catálogo CUM</a>
                </div>
              )}
            </div>
          )}

          {resultadoEscaneo && !resultadoEscaneo.requiere_registro_manual && (
            <div className="panel-card formulario-recepcion">
              <h3> Registrar Recepción</h3>
              <form onSubmit={handleRegistrar}>
                <div className="form-grid">
                  <div>
                    <label>Lote *</label>
                    <input
                      id="input-lote"
                      type="text"
                      value={lote}
                      onChange={e => setLote(e.target.value.toUpperCase())}
                      required
                      placeholder="Ej: ABC123"
                    />
                  </div>
                  <div>
                    <label>Fecha Vencimiento *</label>
                    <input
                      id="input-vencimiento"
                      type="date"
                      value={fechaVencimiento}
                      onChange={e => setFechaVencimiento(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label>Cantidad Recibida *</label>
                    <input
                      id="input-cantidad"
                      type="number"
                      min="1"
                      step="1"
                      value={cantidad}
                      onChange={e => setCantidad(Number(e.target.value) || 1)}
                      required
                    />
                  </div>
                  {esSuperadmin && sedes.length > 0 && (
                    <div>
                      <label>Sede *</label>
                      <select value={sedeSeleccionada} onChange={e => setSedeSeleccionada(e.target.value === '' ? '' : Number(e.target.value))} required>
                        <option value="">Seleccione la sede...</option>
                        {sedes.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                      </select>
                    </div>
                  )}
                </div>
                {resultadoEscaneo.empaque && (
                  <div className="equivalencia-preview">
                    <strong>Equivalencia:</strong> {cantidad} × {resultadoEscaneo.empaque.factor_conversion} = <strong>{cantidad * resultadoEscaneo.empaque.factor_conversion} unidades base</strong>
                  </div>
                )}
                <div className="fila-formulario">
                  <button type="button" className="btn-secundario" onClick={() => { setResultadoEscaneo(null); setLote(''); setFechaVencimiento(''); setCantidad(1); inputRef.current?.focus(); }}>× Limpiar</button>
                  <button type="submit" className="btn-verde" disabled={registrando}>{registrando ? ' Registrando...' : ' Confirmar Recepción'}</button>
                </div>
              </form>
            </div>
          )}
        </div>

        {/* Panel Derecho: Historial */}
        <div className="recepcion-panel">
          <div className="panel-card">
            <div className="cabecera-historial">
              <h3> Historial de Recepciones</h3>
              {esSuperadmin && sedes.length > 0 && (
                <select className="form-select form-select--compacto" value={sedeSeleccionada} onChange={e => { setSedeSeleccionada(e.target.value === '' ? '' : Number(e.target.value)); cargarHistorial(); }}>
                  <option value="">Todas las sedes</option>
                  {sedes.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                </select>
              )}
            </div>
            
            <div className="search-bar-wrap buscador--separado">
              <span className="search-icon" aria-hidden="true" />
              <input type="text" className="search-input" placeholder="Filtrar historial..." value={filtroHistorial} onChange={e => setFiltroHistorial(e.target.value)} />
            </div>

            {cargandoHistorial ? (
              <div className="cargando-historial">Cargando historial...</div>
            ) : (
              <div className="table-responsive">
                <table className="tabla">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Medicamento</th>
                      <th>Lote</th>
                      <th>Vencimiento</th>
                      <th>Cant. Recibida</th>
                      <th>Nivel</th>
                      <th>Unid. Base</th>
                      <th>Sede</th>
                      <th>Usuario</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historial.filter(h => 
                      !filtroHistorial || 
                      h.med_nombre?.toLowerCase().includes(filtroHistorial.toLowerCase()) ||
                      h.numero_lote?.toLowerCase().includes(filtroHistorial.toLowerCase()) ||
                      h.sede_nombre?.toLowerCase().includes(filtroHistorial.toLowerCase())
                    ).map(item => (
                      <tr key={item.id}>
                        <td>{formatearFecha(item.fecha)}</td>
                        <td><strong>{item.med_codigo}</strong> {item.med_nombre}</td>
                        <td><span className="mono-tag">{item.numero_lote}</span></td>
                        <td><span className={`pill ${getEstadoClase(item.fecha_vencimiento)}`}>{formatearFecha(item.fecha_vencimiento)}</span></td>
                        <td><strong>{item.cantidad}</strong> (nivel {item.empaque_nivel})</td>
                        <td>{item.empaque_nivel}</td>
                        <td><strong className="total-highlight">{item.cantidad_unidades_base}</strong></td>
                        <td>{item.sede_nombre}</td>
                        <td>{item.usuario_nombre}</td>
                      </tr>
                    ))}
                    {historial.length === 0 && (
                      <tr><td colSpan={9} className="tabla-vacia">No hay recepciones registradas</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}