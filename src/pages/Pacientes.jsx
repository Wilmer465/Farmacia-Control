import React, { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { inventarioApi } from '../services/inventarioApi.js';
import SignaturePad from '../components/SignaturePad.jsx';

const PRIORIDADES = [
  { id: 'ALTA', label: 'Alta', className: 'estado-rojo' },
  { id: 'MEDIA', label: 'Media', className: 'estado-amarillo' },
  { id: 'BAJA', label: 'Baja', className: 'estado-verde' }
];

const LINEA_VACIA = { lote_id: '', cantidad_unidades: '' };

const FORM_INICIAL = {
  id: null,
  documento: '',
  nombre: '',
  telefono: '',
  correo_electronico: '',
  prioridad: 'MEDIA',
  medicamentos_uso: [{ ...LINEA_VACIA }],
  notas: '',
  firma_guardada: null,
  huella_guardada: 0
};

function medicamentosDesdeDb(valor) {
  if (!valor) return [];
  try {
    const parsed = JSON.parse(valor);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => (typeof item === 'string' ? { nombre: item } : item)).filter(Boolean);
    }
  } catch (_) {
    return String(valor)
      .split(/\r?\n|,/)
      .map((nombre) => ({ nombre: nombre.trim() }))
      .filter((m) => m.nombre);
  }
  return [];
}

function lineasDesdePaciente(paciente) {
  const meds = medicamentosDesdeDb(paciente?.medicamentos_uso);
  if (!meds.length) return [{ ...LINEA_VACIA }];
  return meds.map((m) => ({
    lote_id: m.lote_id ? String(m.lote_id) : '',
    cantidad_unidades: m.cantidad_unidades ? String(m.cantidad_unidades) : '',
    heredado: !m.lote_id ? m.nombre : null
  }));
}

function prioridadInfo(valor) {
  return PRIORIDADES.find((p) => p.id === valor) || PRIORIDADES[1];
}

function textoMedicamento(med) {
  if (med.medicamento_nombre) return `${med.medicamento_codigo || ''} ${med.medicamento_nombre}`.trim();
  return med.nombre || 'Medicamento sin nombre';
}

export default function Pacientes({ usuario, sedeActiva }) {
  const [pacientes, setPacientes] = useState([]);
  const [lotes, setLotes] = useState([]);
  const [seleccionado, setSeleccionado] = useState(null);
  const [form, setForm] = useState(FORM_INICIAL);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [filtroPrioridad, setFiltroPrioridad] = useState('TODAS');
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState(null);
  const deferredBusqueda = useDeferredValue(busqueda);

  const cargar = useCallback(async () => {
    setCargando(true);
    const [resPacientes, resLotes] = await Promise.all([
      inventarioApi.receptores.listar(),
      inventarioApi.lotes.listar(usuario, { sedeId: sedeActiva })
    ]);
    if (resPacientes.ok) setPacientes(resPacientes.data);
    if (resLotes.ok) setLotes(resLotes.data);
    setCargando(false);
  }, [usuario, sedeActiva]);

  useEffect(() => { cargar(); }, [cargar]);

  const lotesDisponibles = useMemo(() => (
    lotes.filter((l) => (
      l.estado !== 'AGOTADO' &&
      l.estado_manual !== 'DADO_DE_BAJA' &&
      Number(l.cantidad_total_unidades || 0) > 0
    ))
  ), [lotes]);

  const pacientesFiltrados = useMemo(() => {
    const q = deferredBusqueda.toLowerCase().trim();
    return pacientes.filter((p) => {
      const meds = medicamentosDesdeDb(p.medicamentos_uso).map(textoMedicamento).join(' ').toLowerCase();
      const coincideTexto = !q ||
        p.nombre?.toLowerCase().includes(q) ||
        p.documento?.toLowerCase().includes(q) ||
        p.telefono?.toLowerCase().includes(q) ||
        p.correo_electronico?.toLowerCase().includes(q) ||
        meds.includes(q);
      const coincidePrioridad = filtroPrioridad === 'TODAS' || p.prioridad === filtroPrioridad;
      return coincideTexto && coincidePrioridad;
    });
  }, [pacientes, deferredBusqueda, filtroPrioridad]);

  function abrirModal(paciente = null) {
    setMensaje(null);
    if (paciente) {
      setSeleccionado(paciente);
      setForm({
        id: paciente.id,
        documento: paciente.documento || '',
        nombre: paciente.nombre || '',
        telefono: paciente.telefono || '',
        correo_electronico: paciente.correo_electronico || '',
        prioridad: paciente.prioridad || 'MEDIA',
        medicamentos_uso: lineasDesdePaciente(paciente),
        notas: paciente.notas || '',
        firma_guardada: paciente.firma_guardada || null,
        huella_guardada: paciente.huella_guardada ? 1 : 0
      });
    } else {
      setForm({ ...FORM_INICIAL, medicamentos_uso: [{ ...LINEA_VACIA }] });
    }
    setModalAbierto(true);
  }

  function actualizarCampo(campo, valor) {
    setForm((prev) => ({ ...prev, [campo]: valor }));
  }

  function setLinea(idx, campo, valor) {
    setForm((prev) => ({
      ...prev,
      medicamentos_uso: prev.medicamentos_uso.map((linea, i) => (
        i === idx ? { ...linea, [campo]: valor, heredado: null } : linea
      ))
    }));
  }

  function agregarLinea() {
    setForm((prev) => ({ ...prev, medicamentos_uso: [...prev.medicamentos_uso, { ...LINEA_VACIA }] }));
  }

  function quitarLinea(idx) {
    setForm((prev) => ({ ...prev, medicamentos_uso: prev.medicamentos_uso.filter((_, i) => i !== idx) }));
  }

  function prepararMedicamentos() {
    return form.medicamentos_uso
      .filter((linea) => linea.lote_id)
      .map((linea) => {
        const lote = lotes.find((l) => String(l.id) === String(linea.lote_id));
        return {
          medicamento_id: lote?.medicamento_id || null,
          medicamento_codigo: lote?.medicamento_codigo || null,
          medicamento_nombre: lote?.medicamento_nombre || null,
          lote_id: lote?.id || Number(linea.lote_id),
          numero_lote: lote?.numero_lote || null,
          sede_id: lote?.sede_id || null,
          sede_nombre: lote?.sede_nombre || null,
          fecha_vencimiento: lote?.fecha_vencimiento || null,
          cantidad_unidades: Number(linea.cantidad_unidades || 0)
        };
      });
  }

  async function guardarPaciente(e) {
    e.preventDefault();
    setGuardando(true);
    setMensaje(null);

    const lineasIncompletas = form.medicamentos_uso.some((linea) => (
      linea.lote_id && Number(linea.cantidad_unidades || 0) <= 0
    ));
    const pendientesDeAsociar = form.medicamentos_uso.some((linea) => linea.heredado && !linea.lote_id);
    if (lineasIncompletas) {
      setGuardando(false);
      setMensaje({ tipo: 'error', texto: 'Cada medicamento seleccionado debe tener una cantidad mayor a 0 unidades.' });
      return;
    }
    if (pendientesDeAsociar) {
      setGuardando(false);
      setMensaje({ tipo: 'error', texto: 'Hay medicamentos antiguos pendientes de asociar. Seleccione su medicamento y lote del inventario antes de guardar.' });
      return;
    }

    const payload = {
      documento: form.documento.trim(),
      nombre: form.nombre.trim(),
      telefono: form.telefono.trim() || null,
      correo_electronico: form.correo_electronico.trim() || null,
      prioridad: form.prioridad,
      medicamentos_uso: prepararMedicamentos(),
      notas: form.notas.trim() || null,
      firma_guardada: form.firma_guardada || null,
      huella_guardada: form.huella_guardada ? 1 : 0
    };

    const res = form.id
      ? await inventarioApi.receptores.actualizar(form.id, payload)
      : await inventarioApi.receptores.guardar(payload);

    setGuardando(false);
    if (!res.ok) {
      setMensaje({ tipo: 'error', texto: res.error || 'No se pudo guardar la informacion del paciente.' });
      return;
    }

    await cargar();
    setSeleccionado(res.data);
    setModalAbierto(false);
  }

  const totalAlta = pacientes.filter((p) => p.prioridad === 'ALTA').length;
  const detalle = seleccionado || pacientesFiltrados[0] || null;
  const medsDetalle = medicamentosDesdeDb(detalle?.medicamentos_uso);

  return (
    <div className="page-container pacientes-view">
      <div className="page-header-row">
        <div>
          <h2>Documento de Pacientes</h2>
          <p className="page-scope">Registro de personas, prioridad, medicamentos por lote, firma y huella.</p>
        </div>
        <div className="header-actions">
          <button type="button" className="btn-secundario" onClick={() => abrirModal()}>+ Nuevo paciente</button>
          <button type="button" className="btn-refrescar" onClick={cargar} title="Recargar">Actualizar</button>
        </div>
      </div>

      <div className="stats-grid pacientes-stats">
        <div className="stat-card"><span className="stat-label">Pacientes registrados</span><strong className="stat-value">{pacientes.length}</strong></div>
        <div className="stat-card"><span className="stat-label">Prioridad alta</span><strong className="stat-value">{totalAlta}</strong></div>
        <div className="stat-card"><span className="stat-label">En la vista actual</span><strong className="stat-value">{pacientesFiltrados.length}</strong></div>
      </div>

      <div className="filtros-card">
        <div className="search-bar-wrap">
          <span className="search-icon">Buscar</span>
          <input
            type="text"
            className="search-input"
            placeholder="Buscar por nombre, documento, telefono, correo o medicamento..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
          {busqueda && <button type="button" className="btn-clear-search" onClick={() => setBusqueda('')}>x</button>}
        </div>
        <div className="pills-filter-group">
          {['TODAS', 'ALTA', 'MEDIA', 'BAJA'].map((prioridad) => (
            <button
              key={prioridad}
              type="button"
              className={`filter-chip ${filtroPrioridad === prioridad ? 'chip-activo' : ''}`}
              onClick={() => setFiltroPrioridad(prioridad)}
            >
              {prioridad === 'TODAS' ? 'Todas' : prioridad.charAt(0) + prioridad.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      </div>

      <div className="pacientes-layout">
        <div className="table-responsive pacientes-lista">
          <table className="tabla">
            <thead>
              <tr>
                <th>Prioridad</th>
                <th>Paciente</th>
                <th>Documento</th>
                <th>Medicamentos y lotes</th>
              </tr>
            </thead>
            <tbody>
              {pacientesFiltrados.map((p) => {
                const prioridad = prioridadInfo(p.prioridad);
                const meds = medicamentosDesdeDb(p.medicamentos_uso);
                return (
                  <tr key={p.id} className={detalle?.id === p.id ? 'fila-seleccionada' : ''} onClick={() => setSeleccionado(p)}>
                    <td><span className={`pill ${prioridad.className}`}>{prioridad.label}</span></td>
                    <td>
                      <strong>{p.nombre}</strong>
                      <span className="text-muted paciente-contacto">
                        {p.telefono || 'Sin telefono'} {p.correo_electronico ? `- ${p.correo_electronico}` : ''}
                      </span>
                    </td>
                    <td>{p.documento}</td>
                    <td>
                      {meds.length ? (
                        <div className="meds-inline">
                          {meds.slice(0, 3).map((med, idx) => <span key={`${textoMedicamento(med)}-${idx}`}>{textoMedicamento(med)}</span>)}
                          {meds.length > 3 && <span>+{meds.length - 3}</span>}
                        </div>
                      ) : (
                        <span className="text-muted">Sin medicamentos registrados</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {pacientesFiltrados.length === 0 && (
                <tr><td colSpan="4" className="tabla-vacia">{cargando ? 'Cargando pacientes...' : 'No se encontraron pacientes.'}</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <aside className="paciente-panel paciente-detalle">
          {detalle ? (
            <>
              <div className="panel-heading paciente-detalle-header">
                <div>
                  <h3>{detalle.nombre}</h3>
                  <span>{detalle.documento}</span>
                </div>
                <span className={`pill ${prioridadInfo(detalle.prioridad).className}`}>{prioridadInfo(detalle.prioridad).label}</span>
              </div>

              <div className="paciente-datos">
                <div><span>Telefono</span><strong>{detalle.telefono || 'Sin registrar'}</strong></div>
                <div><span>Correo</span><strong>{detalle.correo_electronico || 'Sin registrar'}</strong></div>
                <div><span>Huella</span><strong>{detalle.huella_guardada ? 'Registrada' : 'Sin registrar'}</strong></div>
                <div><span>Firma</span><strong>{detalle.firma_guardada ? 'Registrada' : 'Sin registrar'}</strong></div>
              </div>

              {detalle.firma_guardada && (
                <div className="firma-preview">
                  <span>Firma guardada</span>
                  <img src={detalle.firma_guardada} alt="Firma guardada del paciente" />
                </div>
              )}

              <div>
                <label>Medicamentos con lote</label>
                {medsDetalle.length ? (
                  <div className="medicamentos-detalle-lista">
                    {medsDetalle.map((med, idx) => (
                      <div key={`${textoMedicamento(med)}-${idx}`} className="medicamento-detalle-item">
                        <strong>{textoMedicamento(med)}</strong>
                        <span>Lote: {med.numero_lote || 'Sin lote'} | Cantidad: {med.cantidad_unidades || 0} unidades</span>
                        {med.fecha_vencimiento && <span>Vence: {med.fecha_vencimiento}</span>}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="page-scope">No tiene medicamentos asociados.</p>
                )}
              </div>

              <div>
                <label>Notas</label>
                <p className="paciente-notas">{detalle.notas || 'Sin notas registradas.'}</p>
              </div>

              <div className="form-actions">
                <button type="button" className="btn-primario" onClick={() => abrirModal(detalle)}>Editar informacion</button>
              </div>
            </>
          ) : (
            <div className="panel-heading">
              <h3>Seleccione un paciente</h3>
              <span>La informacion completa aparecera aqui.</span>
            </div>
          )}
        </aside>
      </div>

      {modalAbierto && (
        <div className="modal-overlay" onClick={() => setModalAbierto(false)}>
          <form className="modal-card paciente-modal" onSubmit={guardarPaciente} onClick={(e) => e.stopPropagation()}>
            <button type="button" className="modal-close-x" onClick={() => setModalAbierto(false)} aria-label="Cerrar">x</button>
            <div className="panel-heading">
              <h3>{form.id ? 'Editar paciente' : 'Nuevo paciente'}</h3>
              <span>Seleccione medicamentos reales del inventario junto con su lote.</span>
            </div>

            <div className="form-grid">
              <div>
                <label>Documento de identificacion</label>
                <input value={form.documento} onChange={(e) => actualizarCampo('documento', e.target.value)} required />
              </div>
              <div>
                <label>Nombre completo</label>
                <input value={form.nombre} onChange={(e) => actualizarCampo('nombre', e.target.value)} required />
              </div>
            </div>

            <div className="form-grid">
              <div>
                <label>Telefono</label>
                <input type="tel" value={form.telefono} onChange={(e) => actualizarCampo('telefono', e.target.value)} />
              </div>
              <div>
                <label>Correo electronico</label>
                <input type="email" value={form.correo_electronico} onChange={(e) => actualizarCampo('correo_electronico', e.target.value)} />
              </div>
              <div>
                <label>Prioridad de la persona</label>
                <select value={form.prioridad} onChange={(e) => actualizarCampo('prioridad', e.target.value)}>
                  <option value="ALTA">Alta</option>
                  <option value="MEDIA">Media</option>
                  <option value="BAJA">Baja</option>
                </select>
              </div>
            </div>

            <div className="paciente-subseccion">
              <label>Medicamentos que usa</label>
              {form.medicamentos_uso.map((linea, idx) => (
                <div key={idx} className="orden-linea paciente-medicamento-linea">
                  <select value={linea.lote_id} onChange={(e) => setLinea(idx, 'lote_id', e.target.value)}>
                    <option value="">{linea.heredado ? `Pendiente de asociar: ${linea.heredado}` : '-- Seleccionar medicamento y lote --'}</option>
                    {lotesDisponibles.map((lote) => (
                      <option key={lote.id} value={lote.id}>
                        {lote.medicamento_codigo} - {lote.medicamento_nombre} | Lote {lote.numero_lote} | Stock {lote.cantidad_total_unidades} | {lote.sede_nombre}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min="1"
                    placeholder="Cantidad"
                    value={linea.cantidad_unidades}
                    onChange={(e) => setLinea(idx, 'cantidad_unidades', e.target.value)}
                  />
                  {form.medicamentos_uso.length > 1 && (
                    <button type="button" className="btn-quitar" onClick={() => quitarLinea(idx)}>x</button>
                  )}
                </div>
              ))}
              <button type="button" className="btn-secundario" onClick={agregarLinea}>+ Agregar otro medicamento</button>
            </div>

            <div className="paciente-subseccion">
              <label>Firma del paciente</label>
              <SignaturePad onChange={(firma) => actualizarCampo('firma_guardada', firma)} valorInicial={form.firma_guardada} />
              <div className="huella-row">
                <button
                  type="button"
                  className={`btn-secundario ${form.huella_guardada ? 'btn-verde' : ''}`}
                  onClick={() => actualizarCampo('huella_guardada', form.huella_guardada ? 0 : 1)}
                >
                  {form.huella_guardada ? 'Huella registrada' : 'Registrar huella'}
                </button>
                <span className="page-scope">Registro manual de huella para el documento del paciente.</span>
              </div>
            </div>

            <div>
              <label>Notas del paciente</label>
              <textarea
                value={form.notas}
                onChange={(e) => actualizarCampo('notas', e.target.value)}
                placeholder="Observaciones, indicaciones o informacion adicional"
                rows={4}
              />
            </div>

            {mensaje && <div className={mensaje.tipo === 'ok' ? 'paciente-ok' : 'login-error'}>{mensaje.texto}</div>}

            <div className="form-actions">
              <button type="button" className="btn-secundario" onClick={() => setModalAbierto(false)} disabled={guardando}>Cancelar</button>
              <button type="submit" className="btn-primario" disabled={guardando}>{guardando ? 'Guardando...' : 'Guardar paciente'}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
