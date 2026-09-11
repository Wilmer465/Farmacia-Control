import React from 'react';

export default function ReportePDFView({ reporte, usuario }) {
  if (!reporte) return null;

  const eg = reporte.estado_general || {};
  const esConciliado = eg.estado === 'CONCILIADO';

  return (
    <div className="pdf-document" id="reporte-pdf-content">
      {/* =========================================================================
          ENCABEZADO OFICIAL
          ========================================================================= */}
      <header className="pdf-header">
        <h1 className="pdf-main-title">REPORTE DE INVENTARIO Y DESPACHOS</h1>
        <div className="pdf-meta-grid">
          <div><strong>Sede:</strong> {reporte.sede_nombre}</div>
          <div><strong>Periodo:</strong> {reporte.periodo || reporte.fecha_generacion}</div>
          <div><strong>Generado por:</strong> {reporte.generado_por}</div>
          <div><strong>Rol:</strong> {reporte.rol}</div>
          <div><strong>Hora de generación:</strong> {reporte.hora_generacion}</div>
          <div><strong>Fecha de emisión:</strong> {reporte.fecha_generacion}</div>
        </div>
      </header>

      <hr className="pdf-divider" />

      {/* =========================================================================
          1. ESTADO GENERAL DEL DÍA / PERIODO
          ========================================================================= */}
      <section className="pdf-section">
        <h2 className="pdf-section-title">1. ESTADO GENERAL DEL PERIODO</h2>

        <div className={`pdf-status-banner ${esConciliado ? 'banner-ok' : 'banner-error'}`}>
          <span className="dot-indicator">{esConciliado ? '🟢' : '🔴'}</span>
          <strong>{esConciliado ? 'CONCILIADO — TODO EN ORDEN' : 'NO CONCILIADO — SE DETECTARON IRREGULARIDADES'}</strong>
        </div>

        <table className="pdf-table">
          <thead>
            <tr>
              <th>Indicador</th>
              <th className="text-right">Resultado</th>
              <th className="text-center">Estado</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Stock inicial</td>
              <td className="text-right">{eg.stock_inicial?.toLocaleString()} unidades</td>
              <td className="text-center">—</td>
            </tr>
            <tr>
              <td>Entradas del periodo</td>
              <td className="text-right">+{eg.entradas?.toLocaleString()}</td>
              <td className="text-center">🟢</td>
            </tr>
            <tr>
              <td>Salidas con orden</td>
              <td className="text-right">-{eg.salidas_con_orden?.toLocaleString()}</td>
              <td className="text-center">🟢</td>
            </tr>
            <tr>
              <td>Salidas sin orden</td>
              <td className="text-right">-{eg.salidas_sin_orden || 0}</td>
              <td className="text-center">{eg.salidas_sin_orden > 0 ? '🔴' : '🟢'}</td>
            </tr>
            <tr>
              <td>Mermas/ajustes autorizados</td>
              <td className="text-right">-{eg.mermas_autorizadas || 0}</td>
              <td className="text-center">🟢</td>
            </tr>
            <tr className="row-bold">
              <td>Stock esperado</td>
              <td className="text-right">{eg.stock_esperado?.toLocaleString()}</td>
              <td className="text-center">—</td>
            </tr>
            <tr className="row-bold">
              <td>Stock físico</td>
              <td className="text-right">{eg.stock_fisico?.toLocaleString()}</td>
              <td className="text-center">🟢</td>
            </tr>
            <tr className="row-bold">
              <td>Diferencia de cantidad</td>
              <td className="text-right">{eg.diferencia || 0}</td>
              <td className="text-center">{eg.diferencia === 0 ? '🟢' : '🔴'}</td>
            </tr>
            <tr>
              <td>Salidas sin orden</td>
              <td className="text-right">{eg.salidas_sin_orden || 0}</td>
              <td className="text-center">{eg.salidas_sin_orden > 0 ? '🔴' : '🟢'}</td>
            </tr>
            <tr>
              <td>Entregas sin firma</td>
              <td className="text-right">{eg.entregas_sin_firma || 0}</td>
              <td className="text-center">{eg.entregas_sin_firma > 0 ? '🔴' : '🟢'}</td>
            </tr>
            <tr>
              <td>Entregas sin huella</td>
              <td className="text-right">{eg.entregas_sin_huella || 0}</td>
              <td className="text-center">{eg.entregas_sin_huella > 0 ? '🔴' : '🟢'}</td>
            </tr>
            <tr>
              <td>Medicamentos vencidos</td>
              <td className="text-right">{eg.medicamentos_vencidos || 0}</td>
              <td className="text-center">{eg.medicamentos_vencidos > 0 ? '🔴' : '🟢'}</td>
            </tr>
            <tr>
              <td>Lotes próximos a vencer</td>
              <td className="text-right">{eg.lotes_proximos_vencer || 0}</td>
              <td className="text-center">{eg.lotes_proximos_vencer > 0 ? '🟡' : '🟢'}</td>
            </tr>
            <tr>
              <td>Solicitudes de eliminación</td>
              <td className="text-right">{eg.solicitudes_eliminacion || 0}</td>
              <td className="text-center">🟡</td>
            </tr>
            <tr>
              <td>Solicitudes pendientes</td>
              <td className="text-right">{eg.solicitudes_pendientes || 0}</td>
              <td className="text-center">{eg.solicitudes_pendientes > 0 ? '🟡' : '🟢'}</td>
            </tr>
          </tbody>
        </table>

        <div className="pdf-summary-lines">
          <div><strong>Conciliación de cantidades:</strong> {eg.conciliacion_cantidades === 'Correcta' ? '🟢 Correcta' : '🔴 Con diferencias'}</div>
          <div><strong>Control documental:</strong> {eg.control_documental === 'Correcto' ? '🟢 Correcto' : '🔴 Incorrecto'}</div>
          <div><strong>Estado general:</strong> {esConciliado ? '🟢 CONCILIADO' : '🔴 NO CONCILIADO'}</div>
        </div>

        <p className="pdf-disclaimer">
          {esConciliado
            ? 'El stock físico coincide con el stock esperado y no se detectaron irregularidades documentales ni operativas.'
            : 'Aunque el stock físico puede coincidir con el esperado, existen observaciones documentales, salidas sin orden o lotes irregulares. Por esta razón, la sede no puede considerarse conciliada.'}
        </p>
      </section>

      {/* =========================================================================
          2. ENTRADAS DEL PERIODO
          ========================================================================= */}
      <section className="pdf-section">
        <h2 className="pdf-section-title">2. ENTRADAS DEL PERIODO</h2>
        <table className="pdf-table">
          <thead>
            <tr>
              <th>Sede</th>
              <th>Hora/Fecha</th>
              <th>Medicamento</th>
              <th>Lote</th>
              <th>Fecha expedición</th>
              <th>Fecha vencimiento</th>
              <th className="text-right">Cantidad</th>
              <th>Registrado por</th>
            </tr>
          </thead>
          <tbody>
            {(reporte.entradas || []).map((e) => (
              <tr key={e.id}>
                <td>{e.sede_nombre}</td>
                <td>{e.fecha}</td>
                <td><strong>{e.medicamento_nombre}</strong></td>
                <td>{e.numero_lote}</td>
                <td>{e.fecha_expedicion}</td>
                <td>{e.fecha_vencimiento}</td>
                <td className="text-right">{e.cantidad}</td>
                <td>{e.registrado_por}</td>
              </tr>
            ))}
            {(reporte.entradas || []).length === 0 && (
              <tr><td colSpan="8" className="text-center">Sin entradas registradas en este periodo.</td></tr>
            )}
          </tbody>
        </table>
        <div className="pdf-table-total">
          <strong>Total de entradas:</strong> {reporte.total_entradas || 0} unidades
        </div>
      </section>

      {/* =========================================================================
          3. MEDICAMENTOS DESPACHADOS CON ORDEN
          ========================================================================= */}
      <section className="pdf-section">
        <h2 className="pdf-section-title">3. MEDICAMENTOS DESPACHADOS CON ORDEN</h2>
        <table className="pdf-table">
          <thead>
            <tr>
              <th>Sede</th>
              <th>Orden</th>
              <th>Hora/Fecha</th>
              <th>Medicamento</th>
              <th className="text-right">Cantidad</th>
              <th>Despachado por</th>
              <th className="text-center">Firma receptor</th>
              <th className="text-center">Huella receptor</th>
              <th className="text-center">Estado</th>
            </tr>
          </thead>
          <tbody>
            {(reporte.despachosConOrden || []).map((d) => (
              <tr key={d.id}>
                <td>{d.sede_nombre}</td>
                <td><strong>#{d.orden_numero}</strong></td>
                <td>{d.fecha}</td>
                <td>{d.medicamento_nombre}</td>
                <td className="text-right">{d.cantidad}</td>
                <td>{d.despachado_por}</td>
                <td className="text-center">{d.es_exento ? 'Pendiente' : d.firma_receptor ? '✅' : '❌'}</td>
                <td className="text-center">{d.es_exento ? 'Pendiente' : d.huella_receptor ? '✅' : '❌'}</td>
                <td className="text-center">{d.documentacion_completa ? '🟢' : '🔴'}</td>
              </tr>
            ))}
            {(reporte.despachosConOrden || []).length === 0 && (
              <tr><td colSpan="9" className="text-center">Sin despachos registrados en este periodo.</td></tr>
            )}
          </tbody>
        </table>
        <div className="pdf-table-total">
          <strong>Total despachado con orden:</strong> {reporte.total_despachado_orden || 0} unidades
        </div>

        {/* Incidencias de despachos */}
        {(reporte.despachosConOrden || []).filter((d) => !d.documentacion_completa).map((d) => (
          <div className="pdf-incidencia-box" key={`inc-${d.id}`}>
            <h4 className="incidencia-title">Incidencia en Orden #{d.orden_numero}</h4>
            <ul>
              <li><strong>Sede:</strong> {d.sede_nombre}</li>
              <li><strong>Medicamento:</strong> {d.medicamento_nombre}</li>
              <li><strong>Cantidad:</strong> {d.cantidad}</li>
              <li><strong>Despachado por:</strong> {d.despachado_por}</li>
              <li><strong>Firma del receptor:</strong> {d.firma_receptor ? '✅ Registrada' : '❌ Faltante'}</li>
              <li><strong>Huella del receptor:</strong> {d.huella_receptor ? '✅ Capturada' : '❌ Faltante'}</li>
              <li><strong>Estado:</strong> 🔴 DOCUMENTACIÓN INCOMPLETA</li>
            </ul>
          </div>
        ))}
      </section>

      {/* =========================================================================
          4. SALIDAS SIN ORDEN
          ========================================================================= */}
      <section className="pdf-section">
        <h2 className="pdf-section-title">4. SALIDAS SIN ORDEN</h2>
        <p className="pdf-subtext">Toda salida de medicamento debe estar asociada a una orden.</p>
        <table className="pdf-table">
          <thead>
            <tr>
              <th>Sede</th>
              <th>Hora/Fecha</th>
              <th>Medicamento</th>
              <th className="text-right">Cantidad</th>
              <th>Salida realizada por</th>
              <th>Motivo</th>
              <th className="text-center">Estado</th>
            </tr>
          </thead>
          <tbody>
            {(reporte.salidasSinOrden || []).map((s) => (
              <tr key={s.id}>
                <td>{s.sede_nombre}</td>
                <td>{s.fecha}</td>
                <td>{s.medicamento_nombre}</td>
                <td className="text-right">{s.cantidad}</td>
                <td>{s.salida_realizada_por}</td>
                <td>{s.motivo}</td>
                <td className="text-center">🔴</td>
              </tr>
            ))}
            {(reporte.salidasSinOrden || []).length === 0 && (
              <tr><td colSpan="7" className="text-center">No se registraron salidas sin orden (0 unidades).</td></tr>
            )}
          </tbody>
        </table>
        <div className="pdf-table-total">
          <strong>Total de salidas sin orden:</strong> {reporte.total_salidas_sin_orden || 0} unidades
        </div>
        <p className="pdf-disclaimer">Estas salidas afectan el stock y quedan registradas como irregularidades de auditoría.</p>
      </section>

      {/* =========================================================================
          5. ENTREGAS CON DOCUMENTACIÓN INCOMPLETA
          ========================================================================= */}
      <section className="pdf-section">
        <h2 className="pdf-section-title">5. ENTREGAS CON DOCUMENTACIÓN INCOMPLETA</h2>
        <table className="pdf-table">
          <thead>
            <tr>
              <th>Sede</th>
              <th>Orden</th>
              <th>Hora/Fecha</th>
              <th>Receptor</th>
              <th>Entregado por</th>
              <th className="text-center">Firma</th>
              <th className="text-center">Huella</th>
              <th className="text-center">Estado</th>
            </tr>
          </thead>
          <tbody>
            {(reporte.entregasIncompletas || []).map((e) => (
              <tr key={e.id}>
                <td>{e.sede_nombre}</td>
                <td>#{e.orden_numero}</td>
                <td>{e.fecha}</td>
                <td>{e.receptor_nombre}</td>
                <td>{e.entregado_por}</td>
                <td className="text-center">{e.firma ? '✅' : '❌'}</td>
                <td className="text-center">{e.huella ? '✅' : '❌'}</td>
                <td className="text-center">🔴</td>
              </tr>
            ))}
            {(reporte.entregasIncompletas || []).length === 0 && (
              <tr><td colSpan="8" className="text-center">No hay entregas con documentación incompleta.</td></tr>
            )}
          </tbody>
        </table>
        <div className="pdf-table-total">
          <strong>Total de entregas con documentación incompleta:</strong> {(reporte.entregasIncompletas || []).length}
        </div>
      </section>

      {/* =========================================================================
          6. SOLICITUDES DE ELIMINACIÓN
          ========================================================================= */}
      <section className="pdf-section">
        <h2 className="pdf-section-title">6. SOLICITUDES DE ELIMINACIÓN</h2>
        <p className="pdf-subtext">Todas las solicitudes permanecen registradas, independientemente de si son aprobadas o rechazadas.</p>
        <table className="pdf-table">
          <thead>
            <tr>
              <th>Sede</th>
              <th>ID</th>
              <th>Hora/Fecha</th>
              <th>Medicamento</th>
              <th>Solicitado por</th>
              <th>Motivo</th>
              <th className="text-center">Decisión</th>
            </tr>
          </thead>
          <tbody>
            {(reporte.solicitudesEliminacion || []).map((s) => (
              <tr key={s.id}>
                <td>{s.sede_nombre}</td>
                <td>#{s.id}</td>
                <td>{s.fecha_solicitud}</td>
                <td>{s.medicamento_nombre}</td>
                <td>{s.solicitado_por}</td>
                <td>{s.motivo}</td>
                <td className="text-center">
                  {s.estado === 'APROBADA' && '🟢 Aprobada'}
                  {s.estado === 'RECHAZADA' && '🔴 Rechazada'}
                  {s.estado === 'PENDIENTE' && '🟡 Pendiente'}
                </td>
              </tr>
            ))}
            {(reporte.solicitudesEliminacion || []).length === 0 && (
              <tr><td colSpan="7" className="text-center">Sin solicitudes de eliminación en el periodo.</td></tr>
            )}
          </tbody>
        </table>
        <div className="pdf-summary-lines">
          <div><strong>Resumen de solicitudes:</strong> Total: {reporte.solicitudes_resumen?.total || 0} | Aprobadas: {reporte.solicitudes_resumen?.aprobadas || 0} | Rechazadas: {reporte.solicitudes_resumen?.rechazadas || 0} | Pendientes: {reporte.solicitudes_resumen?.pendientes || 0}</div>
        </div>
      </section>

      {/* =========================================================================
          7. MEDICAMENTOS PRÓXIMOS A VENCER
          ========================================================================= */}
      <section className="pdf-section">
        <h2 className="pdf-section-title">7. MEDICAMENTOS PRÓXIMOS A VENCER</h2>
        <p className="pdf-subtext">El sistema genera alerta amarilla cuando faltan 90 días o menos para el vencimiento.</p>
        <table className="pdf-table">
          <thead>
            <tr>
              <th>Sede</th>
              <th>Medicamento</th>
              <th>Lote</th>
              <th>Fecha expedición</th>
              <th>Fecha vencimiento</th>
              <th className="text-right">Cantidad</th>
              <th className="text-center">Estado</th>
            </tr>
          </thead>
          <tbody>
            {(reporte.proximosAVencer || []).map((p) => (
              <tr key={p.id}>
                <td>{p.sede_nombre}</td>
                <td>{p.medicamento_nombre}</td>
                <td>{p.numero_lote}</td>
                <td>{p.fecha_expedicion}</td>
                <td>{p.fecha_vencimiento}</td>
                <td className="text-right">{p.cantidad}</td>
                <td className="text-center">🟡</td>
              </tr>
            ))}
            {(reporte.proximosAVencer || []).length === 0 && (
              <tr><td colSpan="7" className="text-center">No hay medicamentos próximos a vencer.</td></tr>
            )}
          </tbody>
        </table>
        <div className="pdf-table-total">
          <strong>Lotes próximos a vencer:</strong> {(reporte.proximosAVencer || []).length}
        </div>
      </section>

      {/* =========================================================================
          8. MEDICAMENTOS VENCIDOS
          ========================================================================= */}
      <section className="pdf-section">
        <h2 className="pdf-section-title">8. MEDICAMENTOS VENCIDOS</h2>
        <table className="pdf-table">
          <thead>
            <tr>
              <th>Sede</th>
              <th>Medicamento</th>
              <th>Lote</th>
              <th>Fecha expedición</th>
              <th>Fecha vencimiento</th>
              <th className="text-right">Cantidad</th>
              <th className="text-center">Estado</th>
            </tr>
          </thead>
          <tbody>
            {(reporte.vencidos || []).map((v) => (
              <tr key={v.id}>
                <td>{v.sede_nombre}</td>
                <td>{v.medicamento_nombre}</td>
                <td>{v.numero_lote}</td>
                <td>{v.fecha_expedicion}</td>
                <td>{v.fecha_vencimiento}</td>
                <td className="text-right">{v.cantidad}</td>
                <td className="text-center">🔴</td>
              </tr>
            ))}
            {(reporte.vencidos || []).length === 0 && (
              <tr><td colSpan="7" className="text-center">No hay medicamentos vencidos en el inventario.</td></tr>
            )}
          </tbody>
        </table>
        <div className="pdf-table-total">
          <strong>Cantidad vencida:</strong> {reporte.total_unidades_vencidas || 0} unidades
        </div>
        <p className="pdf-disclaimer">El lote vencido debe seguir el procedimiento correspondiente de solicitud de baja y retiro.</p>
      </section>

      {/* =========================================================================
          9. CONCILIACIÓN DEL INVENTARIO
          ========================================================================= */}
      <section className="pdf-section">
        <h2 className="pdf-section-title">9. CONCILIACIÓN DEL INVENTARIO</h2>
        <div className="pdf-conciliacion-medicamentos">
          {(reporte.conciliacion_detalle || []).slice(0, 6).map((cd) => (
            <div className="conciliacion-med-card" key={cd.lote_id}>
              <h4 className="conciliacion-med-title">{cd.medicamento_nombre} — {cd.sede_nombre} (Lote: {cd.numero_lote})</h4>
              <table className="pdf-table table-mini">
                <thead>
                  <tr><th>Concepto</th><th className="text-right">Cantidad</th></tr>
                </thead>
                <tbody>
                  <tr><td>Stock inicial</td><td className="text-right">{cd.total_entradas - cd.total_salidas}</td></tr>
                  <tr><td>Entradas</td><td className="text-right">+{cd.total_entradas}</td></tr>
                  <tr><td>Disponible</td><td className="text-right">{cd.stock_esperado}</td></tr>
                  <tr><td>Salidas con orden</td><td className="text-right">-{cd.total_salidas}</td></tr>
                  <tr><td>Salidas sin orden / Ajustes</td><td className="text-right">{cd.total_ajustes}</td></tr>
                  <tr className="row-bold"><td>Stock esperado</td><td className="text-right">{cd.stock_esperado}</td></tr>
                  <tr className="row-bold"><td>Stock físico</td><td className="text-right">{cd.stock_real}</td></tr>
                  <tr className="row-bold"><td>Diferencia</td><td className="text-right">{cd.diferencia}</td></tr>
                </tbody>
              </table>
              <div className="med-conc-status">
                <div><strong>Cantidad:</strong> {cd.diferencia === 0 ? '🟢 Correcta' : '🔴 Con diferencia'}</div>
                <div><strong>Control documental:</strong> {cd.tiene_ajustes_irregulares ? '🔴 Irregular' : '🟢 Correcto'}</div>
                <div><strong>Estado:</strong> {cd.estado === 'CONCILIADO' ? '🟢 CONCILIADO' : '🔴 NO CONCILIADO'}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* =========================================================================
          10. IRREGULARIDADES DETECTADAS
          ========================================================================= */}
      <section className="pdf-section">
        <h2 className="pdf-section-title">10. IRREGULARIDADES DETECTADAS</h2>
        <table className="pdf-table">
          <thead>
            <tr>
              <th>Sede</th>
              <th>Tipo</th>
              <th>Registro</th>
              <th>Detalle</th>
              <th className="text-center">Estado</th>
            </tr>
          </thead>
          <tbody>
            {(reporte.irregularidades || []).map((irr, idx) => (
              <tr key={idx}>
                <td>{irr.sede}</td>
                <td><strong>{irr.tipo}</strong></td>
                <td>{irr.registro}</td>
                <td>{irr.detalle}</td>
                <td className="text-center">{irr.estado === 'ROJO' ? '🔴' : '🟡'}</td>
              </tr>
            ))}
            {(reporte.irregularidades || []).length === 0 && (
              <tr><td colSpan="5" className="text-center">No se detectaron irregularidades en el periodo.</td></tr>
            )}
          </tbody>
        </table>
      </section>

      {/* =========================================================================
          11. ESTADO DE SINCRONIZACIÓN
          ========================================================================= */}
      <section className="pdf-section">
        <h2 className="pdf-section-title">11. ESTADO DE SINCRONIZACIÓN</h2>
        <table className="pdf-table">
          <thead>
            <tr>
              <th>Sede</th>
              <th className="text-center">Operaciones registradas</th>
              <th className="text-center">Sincronizadas</th>
              <th className="text-center">Pendientes</th>
              <th className="text-center">Estado</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{reporte.sincronizacion?.sede_nombre || reporte.sede_nombre}</td>
              <td className="text-center">{reporte.sincronizacion?.operaciones_registradas || 0}</td>
              <td className="text-center">{reporte.sincronizacion?.sincronizadas || 0}</td>
              <td className="text-center">{reporte.sincronizacion?.pendientes || 0}</td>
              <td className="text-center">🟢 Activa</td>
            </tr>
          </tbody>
        </table>
        <p className="pdf-subtext">La información local permanece disponible y no se pierde aunque exista una falla de conexión.</p>
      </section>

      {/* =========================================================================
          12. AUDITORÍA DEL PERIODO
          ========================================================================= */}
      <section className="pdf-section">
        <h2 className="pdf-section-title">12. AUDITORÍA DEL PERIODO</h2>
        <table className="pdf-table">
          <thead>
            <tr>
              <th>Sede</th>
              <th>Hora/Fecha</th>
              <th>Usuario</th>
              <th>Rol</th>
              <th>Acción</th>
              <th>Registro</th>
              <th className="text-center">Resultado</th>
            </tr>
          </thead>
          <tbody>
            {(reporte.auditoria || []).slice(0, 15).map((a) => (
              <tr key={a.id}>
                <td>{a.sede_nombre}</td>
                <td>{a.fecha}</td>
                <td>{a.usuario_nombre}</td>
                <td>{a.rol}</td>
                <td><strong>{a.accion}</strong></td>
                <td>{a.registro_afectado}</td>
                <td className="text-center">{a.resultado === 'EXITO' ? '🟢 Exitoso' : '🔴 Fallido'}</td>
              </tr>
            ))}
            {(reporte.auditoria || []).length === 0 && (
              <tr><td colSpan="7" className="text-center">Sin eventos de auditoría registrados en este periodo.</td></tr>
            )}
          </tbody>
        </table>
      </section>

      {/* =========================================================================
          13. RESUMEN FINAL & ESTADO FINAL DE LA SEDE
          ========================================================================= */}
      <section className="pdf-section pdf-final-section">
        <h2 className="pdf-section-title">13. RESUMEN FINAL</h2>
        <table className="pdf-table">
          <thead>
            <tr><th>Indicador</th><th className="text-right">Resultado</th></tr>
          </thead>
          <tbody>
            <tr><td>Sede</td><td className="text-right"><strong>{reporte.sede_nombre}</strong></td></tr>
            <tr><td>Stock inicial</td><td className="text-right">{eg.stock_inicial?.toLocaleString()}</td></tr>
            <tr><td>Entradas</td><td className="text-right">+{eg.entradas?.toLocaleString()}</td></tr>
            <tr><td>Salidas con orden</td><td className="text-right">-{eg.salidas_con_orden?.toLocaleString()}</td></tr>
            <tr><td>Salidas sin orden</td><td className="text-right">{eg.salidas_sin_orden || 0}</td></tr>
            <tr><td>Mermas autorizadas</td><td className="text-right">{eg.mermas_autorizadas || 0}</td></tr>
            <tr className="row-bold"><td>Stock esperado</td><td className="text-right">{eg.stock_esperado?.toLocaleString()}</td></tr>
            <tr className="row-bold"><td>Stock físico</td><td className="text-right">{eg.stock_fisico?.toLocaleString()}</td></tr>
            <tr className="row-bold"><td>Diferencia de cantidades</td><td className="text-right">{eg.diferencia || 0}</td></tr>
            <tr><td>Entregas sin firma</td><td className="text-right">{eg.entregas_sin_firma || 0}</td></tr>
            <tr><td>Entregas sin huella</td><td className="text-right">{eg.entregas_sin_huella || 0}</td></tr>
            <tr><td>Medicamentos próximos a vencer</td><td className="text-right">{eg.lotes_proximos_vencer || 0}</td></tr>
            <tr><td>Medicamentos vencidos</td><td className="text-right">{eg.medicamentos_vencidos || 0}</td></tr>
            <tr><td>Solicitudes de eliminación</td><td className="text-right">{eg.solicitudes_eliminacion || 0}</td></tr>
            <tr><td>Solicitudes pendientes</td><td className="text-right">{eg.solicitudes_pendientes || 0}</td></tr>
          </tbody>
        </table>

        <div className="pdf-final-verdict">
          <h3 className="final-verdict-title">ESTADO FINAL DE LA SEDE</h3>
          <div className={`final-verdict-badge ${esConciliado ? 'verdict-ok' : 'verdict-error'}`}>
            <span className="dot-indicator">{esConciliado ? '🟢' : '🔴'}</span>
            <strong>{esConciliado ? 'CONCILIADO — REGISTROS CONFORMES' : 'NO CONCILIADO — IRREGULARIDADES DETECTADAS'}</strong>
          </div>

          {(eg.motivos || []).length > 0 && (
            <div className="final-motivos">
              <strong>Motivos principales:</strong>
              <ol>
                {eg.motivos.map((m, idx) => (
                  <li key={idx}>{m}</li>
                ))}
              </ol>
            </div>
          )}

          <p className="final-important-note">
            <strong>Importante:</strong> {esConciliado
              ? 'Todos los movimientos, documentos y existencias físicas han sido verificados satisfactoriamente según los protocolos de auditoría.'
              : 'Aunque la cantidad física coincide con la cantidad esperada, la sede no se considera conciliada debido a las irregularidades documentales y operativas detectadas.'}
          </p>
        </div>
      </section>
    </div>
  );
}
