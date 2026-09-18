import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { inventarioApi } from '../services/inventarioApi.js';
import Pagination from '../components/Pagination.jsx';

const ROLES_ADMIN = ['SUPERADMIN', 'ADMIN'];

const ESTADO_CLASE = {
  ACTIVO: 'estado-verde',
  INACTIVO: 'estado-rojo',
  HISTORICO: 'estado-gris',
  MANUAL: 'estado-azul'
};

export default function CatalogoCUM({ usuario, sedeActiva }) {
  const [catalogo, setCatalogo] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [exito, setExito] = useState(null);
  const [filtroTexto, setFiltroTexto] = useState('');
  const [filtroFuente, setFiltroFuente] = useState('TODAS');
  const [filtroEstado, setFiltroEstado] = useState('TODOS');
  const [pagina, setPagina] = useState(1);
  const [porPagina, setPorPagina] = useState(50);
  const [estadoCatalogo, setEstadoCatalogo] = useState(null);
  const [actualizando, setActualizando] = useState(false);

  // Modales
  const [mostrarModalManual, setMostrarModalManual] = useState(false);
  const [mostrarModalEmpaque, setMostrarModalEmpaque] = useState(false);
  const [catalogoParaEmpaque, setCatalogoParaEmpaque] = useState(null);
  const [formManual, setFormManual] = useState({
    producto: '', descripcioncomercial: '', principio_activo: '', concentracion: '',
    forma_farmaceutica: '', via_administracion: '', unidad_medida: '', cantidad_presentacion: '',
    registro_sanitario: '', titular: '', laboratorio: '', fabricante: '', pais_fabricante: '',
    condicion_venta: '', tipo_producto: 'MEDICAMENTO', atc_codigo: '', atc_descripcion: '',
    gtin: '', gtin_empaque_logistico: '', gtin_empaque_venta: ''
  });
  const [formEmpaque, setFormEmpaque] = useState({
    nivel: 2, gtin: '', descripcion: '', contenido_cantidad: 1, contenido_unidad: 'UNIDAD', factor_conversion: 1, es_principal: false
  });

  // Gestión de documentos adjuntos
  const [mostrarModalDocumento, setMostrarModalDocumento] = useState(false);
  const [cumParaDocumento, setCumParaDocumento] = useState(null);
  const [archivoDocumento, setArchivoDocumento] = useState(null);
  const [adjuntandoDocumento, setAdjuntandoDocumento] = useState(false);
  const [docExito, setDocExito] = useState(null);
  const [docError, setDocError] = useState(null);

  const puedeAdmin = ROLES_ADMIN.includes(usuario.rol_nombre);

  const cargarCatalogo = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      // Cargar catálogo desde BD local (no paginado en backend, filtramos en frontend)
      // Para evitar traer todo, hacemos búsqueda por texto si hay filtro
      let resultado;
      if (filtroTexto.trim()) {
        resultado = await inventarioApi.catalogoCum.buscarPorProducto(usuario, filtroTexto.trim(), 500);
      } else {
        // Traer últimos registros - necesitaríamos un endpoint paginado, por ahora usamos búsqueda vacía
        resultado = await inventarioApi.catalogoCum.buscarPorProducto(usuario, '', 500);
      }
      if (resultado.ok) {
        setCatalogo(resultado.data || []);
      } else {
        setError(resultado.error);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }, [usuario, filtroTexto]);

  const cargarEstado = useCallback(async () => {
    try {
      const res = await inventarioApi.catalogoCum.estado(usuario);
      if (res.ok) setEstadoCatalogo(res.data);
    } catch (_) {}
  }, [usuario]);

  useEffect(() => {
    cargarCatalogo();
    cargarEstado();
  }, [cargarCatalogo, cargarEstado]);

  // Filtrado en memoria
  const catalogoFiltrado = useMemo(() => {
    return catalogo.filter(item => {
      const coincideTexto = !filtroTexto ||
        item.producto?.toLowerCase().includes(filtroTexto.toLowerCase()) ||
        item.cum?.toLowerCase().includes(filtroTexto.toLowerCase()) ||
        item.principio_activo?.toLowerCase().includes(filtroTexto.toLowerCase()) ||
        item.registro_sanitario?.toLowerCase().includes(filtroTexto.toLowerCase());
      const coincideFuente = filtroFuente === 'TODAS' || item.fuente === filtroFuente;
      const coincideEstado = filtroEstado === 'TODOS' || item.estado_cum === filtroEstado;
      return coincideTexto && coincideFuente && coincideEstado;
    });
  }, [catalogo, filtroTexto, filtroFuente, filtroEstado]);

  // Paginación
  const catalogoPaginado = useMemo(() => {
    if (porPagina === 'TODOS') return catalogoFiltrado;
    const inicio = (pagina - 1) * porPagina;
    return catalogoFiltrado.slice(inicio, inicio + porPagina);
  }, [catalogoFiltrado, pagina, porPagina]);

  async function handleActualizarCatalogo() {
    if (!puedeAdmin) return;
    setActualizando(true);
    setError(null);
    setExito(null);
    try {
      const res = await inventarioApi.catalogoCum.actualizar(usuario);
      if (res.ok) {
        setExito(res.yaActualizado 
          ? `Catálogo ya actualizado (${res.version})` 
          : `Catálogo actualizado: ${res.nuevos} nuevos, ${res.actualizados} actualizados, ${res.sinCambios} sin cambios`);
        await cargarCatalogo();
        await cargarEstado();
      } else {
        setError(res.error);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setActualizando(false);
    }
  }

  async function handleCrearManual(e) {
    e.preventDefault();
    if (!puedeAdmin) return;
    try {
      const res = await inventarioApi.catalogoCum.crearManual(usuario, formManual);
      if (res.ok) {
        setExito('Registro manual creado exitosamente');
        setMostrarModalManual(false);
        setFormManual({ producto: '', descripcioncomercial: '', principio_activo: '', concentracion: '',
          forma_farmaceutica: '', via_administracion: '', unidad_medida: '', cantidad_presentacion: '',
          registro_sanitario: '', titular: '', laboratorio: '', fabricante: '', pais_fabricante: '',
          condicion_venta: '', tipo_producto: 'MEDICAMENTO', atc_codigo: '', atc_descripcion: '',
          gtin: '', gtin_empaque_logistico: '', gtin_empaque_venta: '' });
        await cargarCatalogo();
      } else {
        setError(res.error);
      }
    } catch (err) {
      setError(err.message);
    }
  }

  function abrirModalEmpaque(item) {
    setCatalogoParaEmpaque(item);
    setFormEmpaque({ nivel: 2, gtin: '', descripcion: '', contenido_cantidad: 1, contenido_unidad: 'UNIDAD', factor_conversion: 1, es_principal: false });
    setMostrarModalEmpaque(true);
  }

  async function handleCrearEmpaque(e) {
    e.preventDefault();
    if (!puedeAdmin || !catalogoParaEmpaque) return;
    try {
      const res = await inventarioApi.catalogoCum.crearEmpaque(usuario, {
        catalogo_cum_id: catalogoParaEmpaque.id,
        ...formEmpaque
      });
      if (res.ok) {
        setExito('Nivel de empaque creado exitosamente');
        setMostrarModalEmpaque(false);
        setCatalogoParaEmpaque(null);
      } else {
        setError(res.error);
      }
    } catch (err) {
      setError(err.message);
    }
  }

  function formatearFecha(fecha) {
    if (!fecha) return '-';
    try { return new Date(fecha).toLocaleDateString('es-CO'); } catch { return fecha; }
  }

  const fuentes = ['INVIMA', 'MANUAL'];
  const estados = ['ACTIVO', 'INACTIVO', 'HISTORICO'];

  // ─── Handlers de documentos adjuntos ──
  function handleSeleccionarArchivo(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setDocError('El archivo no debe superar 5MB.');
      return;
    }
    const esPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    setArchivoDocumento(file);
  }

  async function handleSubirDocumento(e) {
    e.preventDefault();
    if (!archivoDocumento || !cumParaDocumento) return;

    setAdjuntandoDocumento(true);
    setDocError(null);
    setDocExito(null);

    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result;
      const base64 = dataUrl.split(',')[1];
      const esPdf = archivoDocumento.type === 'application/pdf' || archivoDocumento.name.toLowerCase().endsWith('.pdf');

      const res = await inventarioApi.catalogoCum.adjuntarDocumento(usuario, cumParaDocumento.id, {
        documento_adjunto_nombre: archivoDocumento.name,
        documento_adjunto_data: base64,
        documento_adjunto_tipo: esPdf ? 'PDF' : 'IMAGEN'
      });

      setAdjuntandoDocumento(false);
      if (res.ok) {
        setDocExito('Documento adjuntado exitosamente.');
        setMostrarModalDocumento(false);
        setCumParaDocumento(null);
        setArchivoDocumento(null);
        await cargarCatalogo();
      } else {
        setDocError(res.error);
      }
    };
    reader.onerror = () => {
      setAdjuntandoDocumento(false);
      setDocError('Error al leer el archivo.');
    };
    reader.readAsDataURL(archivoDocumento);
  }

  async function handleVerDocumento(item) {
    setDocError(null);
    if (item.documento_adjunto_data) {
      const esPdf = item.documento_adjunto_tipo === 'PDF';
      const dataUrl = `data:${esPdf ? 'application/pdf' : 'image/*'};base64,${item.documento_adjunto_data}`;
      window.open(dataUrl, '_blank');
    } else {
      const res = await inventarioApi.catalogoCum.obtenerDocumento(usuario, item.id);
      if (res.ok && res.data?.documento_adjunto_data) {
        const esPdf = res.data.documento_adjunto_tipo === 'PDF';
        const dataUrl = `data:${esPdf ? 'application/pdf' : 'image/*'};base64,${res.data.documento_adjunto_data}`;
        window.open(dataUrl, '_blank');
      } else {
        setDocError(res.error || 'No se encontró el documento.');
      }
    }
  }

  async function handleQuitarDocumento(item) {
    if (!window.confirm('¿Eliminar el documento adjunto? Esta acción no se puede deshacer.')) return;
    setDocError(null);
    setDocExito(null);
    const res = await inventarioApi.catalogoCum.adjuntarDocumento(usuario, item.id, {
      documento_adjunto_nombre: null,
      documento_adjunto_data: null,
      documento_adjunto_tipo: null
    });
    if (res.ok) {
      setDocExito('Documento eliminado.');
      setTimeout(() => setDocExito(null), 3000);
      await cargarCatalogo();
    } else {
      setDocError(res.error);
    }
  }

  return (
    <div className="page-container catalogo-cum-view">
      <div className="page-header-row">
        <div>
          <h2>📋 Catálogo INVIMA (CUM)</h2>
          <p className="page-scope">Catálogo maestro de medicamentos - Fuente de referencia oficial</p>
        </div>
        {puedeAdmin && (
          <div className="header-actions">
            <button
              className={`btn-primario ${actualizando ? 'btn-cargando' : ''}`}
              onClick={handleActualizarCatalogo}
              disabled={actualizando}
            >
              {actualizando ? '⏳ Actualizando...' : '🔄 Comprobar/Actualizar Catálogo'}
            </button>
            <button
              className="btn-verde"
              onClick={() => setMostrarModalManual(true)}
            >
              ➕ Registrar Manual
            </button>
          </div>
        )}
      </div>

      {exito && <div className="aviso-ok">✅ {exito} <button className="btn-clear-search" onClick={() => setExito(null)}>✕</button></div>}
      {error && <div className="login-error">{error} <button className="btn-clear-search" onClick={() => setError(null)}>✕</button></div>}
      {docExito && <div className="aviso-ok">✅ {docExito} <button className="btn-clear-search" onClick={() => setDocExito(null)}>✕</button></div>}
      {docError && <div className="login-error">{docError} <button className="btn-clear-search" onClick={() => setDocError(null)}>✕</button></div>}

      {/* Estado del catálogo */}
      {estadoCatalogo && (
        <div className="estado-catalogo-card">
          <h3>Estado del Catálogo</h3>
          <div className="estado-grid">
            {estadoCatalogo.ultimaActualizacion && (
              <div className="estado-item">
                <span className="estado-label">Última actualización:</span>
                <span className="estado-valor">
                  {formatearFecha(estadoCatalogo.ultimaActualizacion.fecha_importacion)}
                  <span className={`pill ${ESTADO_CLASE[estadoCatalogo.ultimaActualizacion.resultado] || ''}`}>
                    {estadoCatalogo.ultimaActualizacion.resultado}
                  </span>
                </span>
              </div>
            )}
            <div className="estado-item">
              <span className="estado-label">Versión</span>
              <span className="estado-valor">{estadoCatalogo.ultimaActualizacion?.version || 'N/A'}</span>
            </div>
            <div className="estado-item">
              <span className="estado-label">Registros totales</span>
              <span className="estado-valor">{estadoCatalogo.estadisticas?.total || 0}</span>
            </div>
            <div className="estado-item">
              <span className="estado-label">De INVIMA</span>
              <span className="estado-valor">{estadoCatalogo.estadisticas?.de_invima || 0}</span>
            </div>
            <div className="estado-item">
              <span className="estado-label">Manuales</span>
              <span className="estado-valor">{estadoCatalogo.estadisticas?.manuales || 0}</span>
            </div>
            <div className="estado-item">
              <span className="estado-label">Activos</span>
              <span className="estado-valor">{estadoCatalogo.estadisticas?.activos || 0}</span>
            </div>
            <div className="estado-item">
              <span className="estado-label">Históricos</span>
              <span className="estado-valor">{estadoCatalogo.estadisticas?.historicos || 0}</span>
            </div>
            <div className="estado-item">
              <span className="estado-label">Empaques Nivel 1 (Logístico)</span>
              <span className="estado-valor">
                {estadoCatalogo.empaquesPorNivel?.find(e => e.nivel === 1)?.total || 0}
              </span>
            </div>
            <div className="estado-item">
              <span className="estado-label">Empaques Nivel 2 (Venta)</span>
              <span className="estado-valor">
                {estadoCatalogo.empaquesPorNivel?.find(e => e.nivel === 2)?.total || 0}
              </span>
            </div>
            <div className="estado-item">
              <span className="estado-label">Empaques Nivel 3 (Unidad)</span>
              <span className="estado-valor">
                {estadoCatalogo.empaquesPorNivel?.find(e => e.nivel === 3)?.total || 0}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="filtros-card">
        <div className="search-bar-wrap">
          <span className="search-icon">🔍</span>
          <input
            type="text"
            className="search-input"
            placeholder="Buscar por producto, CUM, principio activo, registro sanitario..."
            value={filtroTexto}
            onChange={(e) => { setFiltroTexto(e.target.value); setPagina(1); }}
          />
          {filtroTexto && <button className="btn-clear-search" onClick={() => { setFiltroTexto(''); setPagina(1); }}>×</button>}
        </div>
        <div className="pills-filter-group">
          {['TODAS', 'INVIMA', 'MANUAL'].map(f => (
            <button key={f} className={`filter-chip ${filtroFuente === f ? 'chip-activo' : ''}`} onClick={() => { setFiltroFuente(f); setPagina(1); }}>
              {f}
            </button>
          ))}
          {['TODOS', 'ACTIVO', 'INACTIVO', 'HISTORICO'].map(e => (
            <button key={e} className={`filter-chip ${filtroEstado === e ? 'chip-activo' : ''}`} onClick={() => { setFiltroEstado(e); setPagina(1); }}>
              {e}
            </button>
          ))}
        </div>
      </div>

      {/* Tabla */}
      <div className="table-responsive">
        <table className="tabla">
          <thead>
            <tr>
              <th>CUM</th>
              <th>Producto</th>
              <th>Principio Activo</th>
              <th>Concentración</th>
              <th>Forma Farm.</th>
              <th>Lab/Titular</th>
              <th>Reg. Sanitario</th>
              <th>GTIN</th>
              <th>Fuente</th>
              <th>Estado</th>
              {puedeAdmin && <th>📄 Documento</th>}
              {puedeAdmin && <th>Acciones</th>}
            </tr>
          </thead>
          <tbody>
            {catalogoPaginado.map(item => (
              <tr key={item.id}>
                <td><span className="mono-tag">{item.cum}</span></td>
                <td><strong>{item.producto}</strong>{item.descripcioncomercial && <> <br/><small>{item.descripcioncomercial}</small> </>}</td>
                <td>{item.principio_activo || '-'}</td>
                <td>{item.concentracion || '-'}</td>
                <td>{item.forma_farmaceutica || '-'}</td>
                <td>{item.laboratorio || item.titular || '-'}</td>
                <td><span className="mono-tag">{item.registro_sanitario || '-'}</span></td>
                <td><span className="mono-tag">{item.gtin || item.gtin_empaque_logistico || item.gtin_empaque_venta || '-'}</span></td>
                <td><span className={`pill ${item.fuente === 'INVIMA' ? 'estado-verde' : 'estado-azul'}`}>{item.fuente}</span></td>
                <td><span className={`pill ${ESTADO_CLASE[item.estado_cum] || ''}`}>{item.estado_cum}</span></td>
                {puedeAdmin && (
                  <td className="acciones">
                    {item.tiene_adjunto || item.documento_adjunto_nombre ? (
                      <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.78rem', color: '#15803d', fontWeight: 600 }}>✓ {item.documento_adjunto_nombre || 'Archivo adjunto'}</span>
                        <button className="btn-accion-ok" onClick={() => handleVerDocumento(item)} title="Ver documento adjunto">
                          👁️
                        </button>
                        <button className="btn-peligro" onClick={() => handleQuitarDocumento(item)} title="Quitar documento adjunto">
                          ✕
                        </button>
                      </div>
                    ) : (
                      <button
                        className="btn-accion-azul"
                        onClick={() => { setCumParaDocumento(item); setArchivoDocumento(null); setMostrarModalDocumento(true); }}
                        title="Adjuntar archivo (PDF/imagen)"
                      >
                        📎 Adjuntar
                      </button>
                    )}
                  </td>
                )}
                {puedeAdmin && (
                  <td className="acciones">
                    <button className="btn-secundario" onClick={() => abrirModalEmpaque(item)} title="Agregar nivel de empaque">
                      ➕ Empaque
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {catalogoFiltrado.length === 0 && (
              <tr>
                <td colSpan={puedeAdmin ? 12 : 10} className="tabla-vacia">
                  {cargando ? 'Cargando catálogo...' : 'No se encontraron registros con los filtros aplicados.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Pagination
        totalItems={catalogoFiltrado.length}
        paginaActual={pagina}
        itemsPorPagina={porPagina}
        onCambiarPagina={setPagina}
        onCambiarItemsPorPagina={setPorPagina}
      />

      {/* Modal Registro Manual */}
      {mostrarModalManual && (
        <div className="modal-overlay" onClick={() => setMostrarModalManual(false)}>
          <div className="modal-card" style={{ maxWidth: '700px', maxHeight: '90vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
            <button className="modal-close-x" onClick={() => setMostrarModalManual(false)}>✕</button>
            <h3>➕ Registrar Medicamento Manual</h3>
            <form onSubmit={handleCrearManual}>
              <div className="form-grid">
                <div><label>Producto *</label><input value={formManual.producto} onChange={e => setFormManual(f => ({...f, producto: e.target.value}))} required /></div>
                <div><label>Descripción Comercial</label><input value={formManual.descripcioncomercial} onChange={e => setFormManual(f => ({...f, descripcioncomercial: e.target.value}))} /></div>
                <div><label>Principio Activo</label><input value={formManual.principio_activo} onChange={e => setFormManual(f => ({...f, principio_activo: e.target.value}))} /></div>
                <div><label>Concentración</label><input value={formManual.concentracion} onChange={e => setFormManual(f => ({...f, concentracion: e.target.value}))} /></div>
                <div><label>Forma Farmacéutica</label><input value={formManual.forma_farmaceutica} onChange={e => setFormManual(f => ({...f, forma_farmaceutica: e.target.value}))} /></div>
                <div><label>Vía Administración</label><input value={formManual.via_administracion} onChange={e => setFormManual(f => ({...f, via_administracion: e.target.value}))} /></div>
                <div><label>Unidad Medida</label><input value={formManual.unidad_medida} onChange={e => setFormManual(f => ({...f, unidad_medida: e.target.value}))} /></div>
                <div><label>Cant. Presentación</label><input type="number" step="0.01" value={formManual.cantidad_presentacion || ''} onChange={e => setFormManual(f => ({...f, cantidad_presentacion: e.target.value}))} /></div>
                <div><label>Registro Sanitario</label><input value={formManual.registro_sanitario} onChange={e => setFormManual(f => ({...f, registro_sanitario: e.target.value}))} /></div>
                <div><label>Titular</label><input value={formManual.titular} onChange={e => setFormManual(f => ({...f, titular: e.target.value}))} /></div>
                <div><label>Laboratorio</label><input value={formManual.laboratorio} onChange={e => setFormManual(f => ({...f, laboratorio: e.target.value}))} /></div>
                <div><label>Fabricante</label><input value={formManual.fabricante} onChange={e => setFormManual(f => ({...f, fabricante: e.target.value}))} /></div>
                <div><label>País Fabricante</label><input value={formManual.pais_fabricante} onChange={e => setFormManual(f => ({...f, pais_fabricante: e.target.value}))} /></div>
                <div><label>Condición Venta</label><input value={formManual.condicion_venta} onChange={e => setFormManual(f => ({...f, condicion_venta: e.target.value}))} /></div>
                <div><label>Tipo Producto</label><select value={formManual.tipo_producto} onChange={e => setFormManual(f => ({...f, tipo_producto: e.target.value}))}><option>MEDICAMENTO</option><option>PRODUCTO_BIOLOGICO</option><option>OTRO</option></select></div>
                <div><label>ATC Código</label><input value={formManual.atc_codigo} onChange={e => setFormManual(f => ({...f, atc_codigo: e.target.value}))} /></div>
                <div><label>ATC Descripción</label><input value={formManual.atc_descripcion} onChange={e => setFormManual(f => ({...f, atc_descripcion: e.target.value}))} /></div>
                <div><label>GTIN Principal</label><input value={formManual.gtin} onChange={e => setFormManual(f => ({...f, gtin: e.target.value}))} /></div>
                <div><label>GTIN Empaque Logístico</label><input value={formManual.gtin_empaque_logistico} onChange={e => setFormManual(f => ({...f, gtin_empaque_logistico: e.target.value}))} /></div>
                <div><label>GTIN Empaque Venta</label><input value={formManual.gtin_empaque_venta} onChange={e => setFormManual(f => ({...f, gtin_empaque_venta: e.target.value}))} /></div>
              </div>
              <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <button type="button" className="btn-secundario" onClick={() => setMostrarModalManual(false)}>Cancelar</button>
                <button type="submit" className="btn-primario">✅ Crear Registro Manual</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Empaque */}
      {mostrarModalEmpaque && catalogoParaEmpaque && (
        <div className="modal-overlay" onClick={() => { setMostrarModalEmpaque(false); setCatalogoParaEmpaque(null); }}>
          <div className="modal-card" style={{ maxWidth: '500px' }} onClick={e => e.stopPropagation()}>
            <button className="modal-close-x" onClick={() => { setMostrarModalEmpaque(false); setCatalogoParaEmpaque(null); }}>✕</button>
            <h3>📦 Agregar Nivel de Empaque</h3>
            <p style={{fontSize: '0.85rem', color: '#64748b'}}>{catalogoParaEmpaque.producto} (CUM: {catalogoParaEmpaque.cum})</p>
            <form onSubmit={handleCrearEmpaque}>
              <div className="form-grid">
<div><label>Nivel *</label><select value={formEmpaque.nivel} onChange={e => setFormEmpaque(f => ({...f, nivel: Number(e.target.value)}))} required><option value={1}>1 - Caja Logística</option><option value={2}>2 - Caja de Venta</option><option value={3}>3 - Unidad Individual</option></select></div>
                  <div><label>GTIN *</label><input value={formEmpaque.gtin} onChange={e => setFormEmpaque(f => ({...f, gtin: e.target.value}))} required placeholder="Ej: 7701234567890" /></div>
                  <div><label>Descripción</label><input value={formEmpaque.descripcion} onChange={e => setFormEmpaque(f => ({...f, descripcion: e.target.value}))} placeholder="Ej: Caja x 40 unidades" /></div>
                  <div><label>Contenido Cantidad *</label><input type="number" min="1" value={formEmpaque.contenido_cantidad} onChange={e => setFormEmpaque(f => ({...f, contenido_cantidad: Number(e.target.value)}))} required /></div>
                  <div><label>Contenido Unidad *</label><input value={formEmpaque.contenido_unidad} onChange={e => setFormEmpaque(f => ({...f, contenido_unidad: e.target.value}))} required placeholder="CAJA, TABLETA, FRASCO..." /></div>
                  <div><label>Factor Conversión *</label><input type="number" min="1" value={formEmpaque.factor_conversion} onChange={e => setFormEmpaque(f => ({...f, factor_conversion: Number(e.target.value)}))} required /></div>
                <div style={{gridColumn: 'span 2'}}><label><input type="checkbox" checked={formEmpaque.es_principal} onChange={e => setFormEmpaque(f => ({...f, es_principal: e.target.checked}))} /> GTIN Principal para búsquedas</label></div>
              </div>
              <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <button type="button" className="btn-secundario" onClick={() => { setMostrarModalEmpaque(false); setCatalogoParaEmpaque(null); }}>Cancelar</button>
                <button type="submit" className="btn-primario">✅ Crear Empaque</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Adjuntar Documento */}
      {mostrarModalDocumento && cumParaDocumento && (
        <div className="modal-overlay" onClick={() => { setMostrarModalDocumento(false); setCumParaDocumento(null); setArchivoDocumento(null); }}>
          <div className="modal-card" style={{ maxWidth: '500px' }} onClick={e => e.stopPropagation()}>
            <button className="modal-close-x" onClick={() => { setMostrarModalDocumento(false); setCumParaDocumento(null); setArchivoDocumento(null); }}>✕</button>
            <h3>📎 Adjuntar Documento al CUM</h3>
            <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '0.75rem' }}>
              {cumParaDocumento.producto} (CUM: <strong>{cumParaDocumento.cum}</strong>)
            </p>

            {docError && <div className="login-error" style={{ marginBottom: '0.75rem' }}>{docError} <button className="btn-clear-search" onClick={() => setDocError(null)}>✕</button></div>}

            <form onSubmit={handleSubirDocumento}>
              <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.35rem', fontWeight: 700, fontSize: '0.82rem', color: '#1e293b' }}>
                  Seleccione archivo (PDF o imagen, máx. 5MB):
                </label>
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={handleSeleccionarArchivo}
                  required
                  style={{ fontSize: '0.82rem', marginBottom: '0.5rem', display: 'block', width: '100%' }}
                />
                <span style={{ fontSize: '0.74rem', color: '#64748b', display: 'block' }}>
                  Formatos soportados: JPG, PNG, PDF. El archivo se almacenará localmente.
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <button type="button" className="btn-secundario" onClick={() => { setMostrarModalDocumento(false); setCumParaDocumento(null); setArchivoDocumento(null); }} disabled={adjuntandoDocumento}>
                  Cancelar
                </button>
                <button type="submit" className="btn-verde" disabled={adjuntandoDocumento || !archivoDocumento}>
                  {adjuntandoDocumento ? '⏳ Subiendo...' : '✅ Adjuntar Documento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}