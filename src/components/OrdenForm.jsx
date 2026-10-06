import React, { useState } from 'react';
import DocumentacionReceptor from './DocumentacionReceptor.jsx';

const lineaVacia = { medicamento_id: '', cantidad_unidades_solicitada: '' };

export default function OrdenForm({ medicamentos, onCrear, error }) {
  const [items, setItems] = useState([{ ...lineaVacia }]);
  const [tipoDestino, setTipoDestino] = useState('LOCAL'); // 'LOCAL' | 'MUNICIPIO_VEREDA'
  const [destinoDetalle, setDestinoDetalle] = useState('');
  const [doc, setDoc] = useState(null);
  const [resetDoc, setResetDoc] = useState(0);
  const [enviando, setEnviando] = useState(false);
  const [errorLocal, setErrorLocal] = useState(null);
  const [factura, setFactura] = useState(''); // Número de factura
  const [facturaElectronica, setFacturaElectronica] = useState(''); // ¿Factura electrónica?

  function setItem(idx, campo, valor) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, [campo]: valor } : it)));
  }

  function agregarLinea() {
    setItems((prev) => [...prev, { ...lineaVacia }]);
  }

  function quitarLinea(idx) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setErrorLocal(null);
    if (tipoDestino === 'MUNICIPIO_VEREDA' && !destinoDetalle.trim()) {
      alert('Por favor especifique el nombre del municipio o vereda de destino.');
      return;
    }

    {
      const faltantes = [];
      if (!doc?.nombre?.trim()) faltantes.push('nombre de quien recibe');
      if (!doc?.documento?.trim()) faltantes.push('documento de identidad');
      if (tipoDestino === 'LOCAL') {
        if (!doc?.firma) faltantes.push('firma digital');
        if (!doc?.huella) faltantes.push('huella dactilar');
      }
      if (faltantes.length > 0) {
        setErrorLocal(`La orden requiere la documentación de quien recibe (faltan: ${faltantes.join(', ')}).`);
        return;
      }
    }

    const itemsValidos = items.map((it) => ({
      medicamento_id: Number(it.medicamento_id),
      cantidad_cajas_solicitada: 0,
      cantidad_unidades_solicitada: Number(it.cantidad_unidades_solicitada || 0),
      cantidad_total_solicitada: Number(it.cantidad_unidades_solicitada || 0)
    }));

    if (itemsValidos.some((it) => !it.medicamento_id || it.cantidad_unidades_solicitada <= 0)) {
      alert('Todos los medicamentos seleccionados deben tener una cantidad mayor a 0 unidades.');
      return;
    }

    setEnviando(true);
    const ok = await onCrear(itemsValidos, {
      tipo_destino: tipoDestino,
      destino_detalle: destinoDetalle.trim() || null,
      receptor_nombre: doc?.nombre,
      receptor_documento: doc?.documento,
      receptor_telefono: doc?.telefono,
      receptor_correo: doc?.correo,
      firma_data: tipoDestino === 'MUNICIPIO_VEREDA' ? null : doc?.firma,
      huella_registrada: tipoDestino === 'MUNICIPIO_VEREDA' ? 0 : (doc?.huella ? 1 : 0),
      documento_adjunto_nombre: doc?.adjunto?.nombre || null,
      documento_adjunto_data: doc?.adjunto?.data || null,
      documento_adjunto_tipo: doc?.adjunto?.tipo || null
    });
    setEnviando(false);
    if (ok) {
      setItems([{ ...lineaVacia }]);
      setDestinoDetalle('');
      setTipoDestino('LOCAL');
      setDoc(null);
      setResetDoc((n) => n + 1);
    }
  }

  const esMunicipioVereda = tipoDestino === 'MUNICIPIO_VEREDA';

  return (
    <form className="panel-form" onSubmit={handleSubmit}>
      <div className="orden-formulario-cabecera">
        <h3 className="orden-formulario-titulo"> Nueva Orden de Pedido (por Unidad)</h3>
        <p className="orden-formulario-subtitulo">
          Configure el tipo de salida, los medicamentos a solicitar y la documentación de quien recibe
        </p>
      </div>

      {/* SELECCIÓN DE DESTINO / TIPO DE SALIDA */}
      <div className="orden-bloque">
        <label className="form-label form-label--titulo">
           Destino y Tipo de Salida:
        </label>
        <div className="grupo-botones-secundarios">
          <button
            type="button"
            className={`filter-chip filter-chip--grande ${tipoDestino === 'LOCAL' ? 'chip-activo' : ''}`}
            onClick={() => setTipoDestino('LOCAL')}
          >
             Despacho Local en Sede (Requiere Firma y Huella)
          </button>
          <button
            type="button"
            className={`filter-chip filter-chip--grande ${tipoDestino === 'MUNICIPIO_VEREDA' ? 'chip-activo' : ''}`}
            onClick={() => setTipoDestino('MUNICIPIO_VEREDA')}
          >
             Salida a Otro Municipio / Vereda (Identidad obligatoria; firma y huella pendientes)
          </button>
        </div>

        {tipoDestino === 'MUNICIPIO_VEREDA' && (
          <div className="orden-bloque orden-bloque--informativo">
            <label className="form-label form-label--informativa" htmlFor="destino-detalle">
              Municipio / Vereda de destino o detalle de la remesa:
            </label>
            <input
              id="destino-detalle"
              type="text"
              className="search-input archivo-orden"
              placeholder="Ej: Vereda La Troja / Municipio Vigía del Fuerte / Puesto de Salud Rural..."
              value={destinoDetalle}
              onChange={(e) => setDestinoDetalle(e.target.value)}
              required
            />
            <span className="texto-ayuda-informativo">
               La identidad de quien recibe es obligatoria; la firma y la huella quedarán pendientes. Esta salida foránea no generará alertas por firma o huella del paciente.
            </span>
          </div>
        )}
      </div>

      {/* LÍNEAS DE MEDICAMENTOS */}
      <label className="form-label form-label--titulo">
         Medicamentos y Cantidades Solicitadas:
      </label>

      {items.map((item, idx) => (
        <div className="orden-linea" key={idx}>
          <select
            className="campo-flexible--ancho"
            value={item.medicamento_id}
            onChange={(e) => setItem(idx, 'medicamento_id', e.target.value)}
            required
          >
            <option value="">-- Seleccionar medicamento... --</option>
            {medicamentos.map((m) => (
              <option key={m.id} value={m.id}>
                {m.codigo} — {m.nombre}
              </option>
            ))}
          </select>

          <div className="campo-flexible--medio campo-unidades">
            <input
              type="number"
              min="1"
              placeholder="Cantidad (unidades)"
              value={item.cantidad_unidades_solicitada}
              onChange={(e) => setItem(idx, 'cantidad_unidades_solicitada', e.target.value)}
              required
            />
            <span className="texto-unidades">unidades</span>
          </div>

          {items.length > 1 && (
            <button type="button" className="btn-quitar" onClick={() => quitarLinea(idx)} title="Quitar línea">×</button>
          )}
        </div>
      ))}

      <div className="grupo-agregar">
        <button type="button" className="btn-secundario" onClick={agregarLinea}>
          + Agregar otro medicamento a la orden
        </button>
      </div>

      {/* DOCUMENTACIÓN DE QUIEN RECIBE */}
      <DocumentacionReceptor
        key={resetDoc}
        exenta={esMunicipioVereda}
        onChange={setDoc}
      />

      {(errorLocal || error) && (
        <div className="login-error alerta-formulario alerta-formulario--doble">{errorLocal || error}</div>
      )}

      <div className="modal-acciones modal-acciones--separada">
        <button type="submit" className="btn-primario" disabled={enviando}>
          {enviando ? 'Creando orden...' : ' Crear Orden de Pedido'}
        </button>
      </div>
    </form>
  );
}