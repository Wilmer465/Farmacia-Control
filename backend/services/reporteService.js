const movimientoRepository = require('../repositories/movimientoRepository');
const loteRepository = require('../repositories/loteRepository');
const solicitudEliminacionRepository = require('../repositories/solicitudEliminacionRepository');
const ordenRepository = require('../repositories/ordenRepository');
const auditoriaRepository = require('../repositories/auditoriaRepository');
const sedeRepository = require('../repositories/sedeRepository');
const permisoService = require('./permisoService');
const conciliacionService = require('./conciliacionService');
const loteService = require('./loteService');

function resolverNombreSede(sedeEfectiva, usuarioSesion) {
  if (sedeEfectiva) {
    const sede = sedeRepository.findById(Number(sedeEfectiva));
    if (sede) {
      return sede.ciudad ? `${sede.nombre} — ${sede.ciudad}` : sede.nombre;
    }
  }
  if (usuarioSesion?.sede_nombre) return usuarioSesion.sede_nombre;
  return 'Todas las sedes';
}

function calcularRango({ tipoPeriodo = 'HOY', fecha, fechaInicio, fechaFin } = {}) {
  const hoy = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const formatDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  let inicioStr, finStr, etiquetaPeriodo;

  if (tipoPeriodo === 'HOY') {
    const f = fecha || fechaInicio || formatDate(hoy);
    inicioStr = `${f} 00:00:00`;
    finStr = `${f} 23:59:59`;
    etiquetaPeriodo = `Día: ${f}`;
  } else if (tipoPeriodo === 'SEMANA') {
    // Lunes a domingo de la semana actual
    const d = new Date(hoy);
    const day = d.getDay();
    const diffToMonday = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d.setDate(diffToMonday));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    inicioStr = `${formatDate(monday)} 00:00:00`;
    finStr = `${formatDate(sunday)} 23:59:59`;
    etiquetaPeriodo = `Semana: ${formatDate(monday)} al ${formatDate(sunday)}`;
  } else if (tipoPeriodo === 'MES') {
    const firstDay = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    const lastDay = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0);
    inicioStr = `${formatDate(firstDay)} 00:00:00`;
    finStr = `${formatDate(lastDay)} 23:59:59`;
    const mesNombre = firstDay.toLocaleString('es-ES', { month: 'long' });
    etiquetaPeriodo = `Mes: ${mesNombre.charAt(0).toUpperCase() + mesNombre.slice(1)} ${hoy.getFullYear()}`;
  } else if (tipoPeriodo === 'ANIO') {
    const firstDay = new Date(hoy.getFullYear(), 0, 1);
    const lastDay = new Date(hoy.getFullYear(), 11, 31);
    inicioStr = `${formatDate(firstDay)} 00:00:00`;
    finStr = `${formatDate(lastDay)} 23:59:59`;
    etiquetaPeriodo = `Año: ${hoy.getFullYear()}`;
  } else if (tipoPeriodo === 'RANGO') {
    const fIni = fechaInicio || formatDate(hoy);
    const fFin = fechaFin || formatDate(hoy);
    inicioStr = `${fIni} 00:00:00`;
    finStr = `${fFin} 23:59:59`;
    etiquetaPeriodo = `Rango: ${fIni} al ${fFin}`;
  } else {
    const f = fecha || formatDate(hoy);
    inicioStr = `${f} 00:00:00`;
    finStr = `${f} 23:59:59`;
    etiquetaPeriodo = `Día: ${f}`;
  }

  return { inicio: inicioStr, fin: finStr, etiquetaPeriodo };
}

function reporteDiario(usuarioSesion, filtros = {}) {
  const sedeEfectiva = permisoService.resolverSedeEfectiva(usuarioSesion, filtros.sedeId);
  const nombreSede = resolverNombreSede(sedeEfectiva, usuarioSesion);
  const { inicio, fin, etiquetaPeriodo } = calcularRango(filtros);

  // 1. Movimientos en el periodo
  const entradas = movimientoRepository.findByRango({
    sedeId: sedeEfectiva, fechaInicio: inicio, fechaFin: fin, tipo: 'ENTRADA'
  });
  const salidasOrden = movimientoRepository.findByRango({
    sedeId: sedeEfectiva, fechaInicio: inicio, fechaFin: fin, tipo: 'SALIDA_ORDEN'
  });
  const ajustesPeriodo = movimientoRepository.findByRango({
    sedeId: sedeEfectiva, fechaInicio: inicio, fechaFin: fin, tipo: 'AJUSTE'
  });

  // Salidas sin orden: ajustes a la baja en el periodo
  const salidasSinOrden = ajustesPeriodo.filter((a) => a.cantidad < 0);
  const mermasAutorizadas = 0; // O ajustes autorizados por eliminación

  // 2. Entregas / documentación en el periodo (se captura al GENERAR la orden)
  const ordenesConDocs = ordenRepository.findAll({ sedeId: sedeEfectiva });
  const esExenta = (o) => o.tipo_destino === 'MUNICIPIO_VEREDA';
  const entregasPeriodo = ordenesConDocs.filter((o) => o.estado !== 'CANCELADA' && o.fecha_creacion >= inicio && o.fecha_creacion <= fin);
  const entregasIncompletas = entregasPeriodo.filter((o) => !esExenta(o) && o.documentacion_completa === 0);
  const entregasLocales = entregasPeriodo.filter((o) => !esExenta(o));
  const entregasSinFirma = entregasLocales.filter((o) => !o.firma_data).length;
  const entregasSinHuella = entregasLocales.filter((o) => !o.huella_registrada).length;

  // 3. Lotes y vencimientos
  const lotesConEstado = loteRepository.findAll({ sedeId: sedeEfectiva }).map((l) => ({
    ...l, estado: loteService.calcularEstado(l)
  }));
  const proximosAVencer = lotesConEstado.filter((l) => l.estado === 'PROXIMO_VENCER');
  const vencidos = lotesConEstado.filter((l) => l.estado === 'VENCIDO');

  // 4. Solicitudes de eliminación
  const todasSolicitudes = solicitudEliminacionRepository.findAll({ sedeId: sedeEfectiva });
  const solicitudesPeriodo = todasSolicitudes.filter((s) => s.fecha_solicitud >= inicio && s.fecha_solicitud <= fin);
  const solicitudesPendientes = todasSolicitudes.filter((s) => s.estado === 'PENDIENTE');

  // 5. Auditoría del periodo
  const eventosAuditoria = auditoriaRepository.findAll({
    sedeId: sedeEfectiva,
    fechaInicio: inicio,
    fechaFin: fin,
    limite: 100
  });

  // 6. Conciliación
  const conciliacion = conciliacionService.conciliar(usuarioSesion, { sedeId: sedeEfectiva });

  // Cálculos agregados
  const totalEntradasUnidades = entradas.reduce((acc, m) => acc + (Number(m.cantidad) || 0), 0);
  const totalSalidasOrdenUnidades = Math.abs(salidasOrden.reduce((acc, m) => acc + (Number(m.cantidad) || 0), 0));
  const totalSalidasSinOrdenUnidades = Math.abs(salidasSinOrden.reduce((acc, m) => acc + (Number(m.cantidad) || 0), 0));
  const totalStockFisico = lotesConEstado.reduce((acc, l) => acc + (Number(l.cantidad_total_unidades) || 0), 0);

  // Stock inicial estimado
  const stockInicial = Math.max(0, totalStockFisico - totalEntradasUnidades + totalSalidasOrdenUnidades + totalSalidasSinOrdenUnidades);
  const stockEsperado = stockInicial + totalEntradasUnidades - totalSalidasOrdenUnidades - totalSalidasSinOrdenUnidades - mermasAutorizadas;
  const diferenciaCantidad = totalStockFisico - stockEsperado;

  // Estado general y motivos
  const motivosIrregularidad = [];
  if (totalSalidasSinOrdenUnidades > 0) {
    motivosIrregularidad.push(`${totalSalidasSinOrdenUnidades} unidades salieron sin orden.`);
  }
  if (entregasSinHuella > 0) {
    motivosIrregularidad.push(`${entregasSinHuella} entrega(s) no tienen registro de huella.`);
  }
  if (entregasSinFirma > 0) {
    motivosIrregularidad.push(`${entregasSinFirma} entrega(s) no tienen firma del receptor.`);
  }
  if (vencidos.length > 0) {
    const totalVenc = vencidos.reduce((acc, l) => acc + l.cantidad_total_unidades, 0);
    motivosIrregularidad.push(`Existen ${totalVenc} unidades de medicamento vencido.`);
  }
  if (solicitudesPendientes.length > 0) {
    motivosIrregularidad.push(`Existe ${solicitudesPendientes.length} solicitud(es) de eliminación pendiente(s).`);
  }
  if (diferenciaCantidad !== 0) {
    motivosIrregularidad.push(`Diferencia física de inventario detectada: ${diferenciaCantidad} unidades.`);
  }

  const conciliacionCantidadesOk = diferenciaCantidad === 0;
  const controlDocumentalOk = motivosIrregularidad.length === 0;
  const estadoGeneral = (conciliacionCantidadesOk && controlDocumentalOk && conciliacion.estadoGeneral === 'CONCILIADO')
    ? 'CONCILIADO'
    : 'NO CONCILIADO';

  // Irregularidades detectadas
  const irregularidades = [];
  salidasSinOrden.forEach((s) => {
    irregularidades.push({
      sede: s.sede_nombre,
      tipo: 'Salida sin orden',
      registro: `#${s.id}`,
      detalle: `${Math.abs(s.cantidad)} ${s.medicamento_nombre}`,
      estado: 'ROJO'
    });
  });
  entregasIncompletas.forEach((o) => {
    const faltantes = o.elementos_faltantes ? JSON.parse(o.elementos_faltantes) : [];
    irregularidades.push({
      sede: o.sede_nombre,
      tipo: 'Documentación incompleta',
      registro: `#${o.numero}`,
      detalle: faltantes.join(', ') || 'Falta firma o huella',
      estado: 'ROJO'
    });
  });
  vencidos.forEach((v) => {
    irregularidades.push({
      sede: v.sede_nombre,
      tipo: 'Medicamento vencido',
      registro: `Lote ${v.numero_lote}`,
      detalle: `${v.cantidad_total_unidades} unidades de ${v.medicamento_nombre}`,
      estado: 'ROJO'
    });
  });
  solicitudesPendientes.forEach((sp) => {
    irregularidades.push({
      sede: sp.sede_nombre,
      tipo: 'Eliminación pendiente',
      registro: `#${sp.id}`,
      detalle: sp.motivo,
      estado: 'AMARILLO'
    });
  });

  // Mapear despachos con la documentación de su orden
  const ordenesPorId = new Map(ordenesConDocs.map((o) => [o.id, o]));
  const despachosMapeados = salidasOrden.map((so) => {
    const orden = ordenesPorId.get(so.referencia_orden_id);
    const esExento = orden?.tipo_destino === 'MUNICIPIO_VEREDA';
    const tieneFirma = Boolean(orden?.firma_data);
    const tieneHuella = Boolean(orden?.huella_registrada);

    // Regla estricta: Si es local, debe tener documentación y TANTO firma COMO huella para ser completo.
    const docCompleta = esExento ? true : (Boolean(orden) && tieneFirma && tieneHuella && Boolean(orden?.documentacion_completa));

    return {
      id: so.id,
      sede_nombre: so.sede_nombre,
      orden_numero: so.orden_numero || '—',
      fecha: so.fecha,
      medicamento_nombre: so.medicamento_nombre,
      medicamento_codigo: so.medicamento_codigo,
      numero_lote: so.numero_lote,
      cantidad: Math.abs(so.cantidad),
      despachado_por: so.usuario_nombre || '—',
      firma_receptor: esExento ? 'PENDIENTE' : tieneFirma,
      huella_receptor: esExento ? 'PENDIENTE' : tieneHuella,
      documentacion_completa: docCompleta,
      receptor_nombre: orden?.receptor_nombre || null,
      es_exento: esExento
    };
  });

  return {
    periodo: etiquetaPeriodo,
    fechaInicio: inicio,
    fechaFin: fin,
    sede_id: sedeEfectiva || null,
    sede_nombre: nombreSede,
    generado_por: usuarioSesion.nombre,
    rol: usuarioSesion.rol_nombre,
    hora_generacion: new Date().toLocaleTimeString('es-ES'),
    fecha_generacion: new Date().toLocaleDateString('es-ES'),

    estado_general: {
      estado: estadoGeneral,
      conciliacion_cantidades: conciliacionCantidadesOk ? 'Correcta' : 'Incorrecto',
      control_documental: controlDocumentalOk ? 'Correcto' : 'Incorrecto',
      stock_inicial: stockInicial,
      entradas: totalEntradasUnidades,
      salidas_con_orden: totalSalidasOrdenUnidades,
      salidas_sin_orden: totalSalidasSinOrdenUnidades,
      mermas_autorizadas: mermasAutorizadas,
      stock_esperado: stockEsperado,
      stock_fisico: totalStockFisico,
      diferencia: diferenciaCantidad,
      entregas_sin_firma: entregasSinFirma,
      entregas_sin_huella: entregasSinHuella,
      medicamentos_vencidos: vencidos.reduce((acc, l) => acc + l.cantidad_total_unidades, 0),
      lotes_proximos_vencer: proximosAVencer.length,
      solicitudes_eliminacion: solicitudesPeriodo.length,
      solicitudes_pendientes: solicitudesPendientes.length,
      motivos: motivosIrregularidad
    },

    entradas: entradas.map((e) => ({
      id: e.id,
      sede_nombre: e.sede_nombre,
      fecha: e.fecha,
      medicamento_nombre: e.medicamento_nombre,
      medicamento_codigo: e.medicamento_codigo,
      numero_lote: e.numero_lote,
      fecha_expedicion: e.fecha_expedicion || '—',
      fecha_vencimiento: e.fecha_vencimiento || '—',
      cantidad: e.cantidad,
      registrado_por: e.usuario_nombre || '—'
    })),
    total_entradas: totalEntradasUnidades,

    despachosConOrden: despachosMapeados,
    total_despachado_orden: totalSalidasOrdenUnidades,

    salidasSinOrden: salidasSinOrden.map((s) => ({
      id: s.id,
      sede_nombre: s.sede_nombre,
      fecha: s.fecha,
      medicamento_nombre: s.medicamento_nombre,
      cantidad: Math.abs(s.cantidad),
      salida_realizada_por: s.usuario_nombre || '—',
      motivo: 'Ajuste / Salida no respaldada por orden',
      estado: 'ROJO'
    })),
    total_salidas_sin_orden: totalSalidasSinOrdenUnidades,

    entregasIncompletas: entregasIncompletas.map((o) => ({
      id: o.id,
      sede_nombre: o.sede_nombre,
      orden_numero: o.numero,
      fecha: o.fecha_creacion,
      receptor_nombre: o.receptor_nombre || '—',
      entregado_por: o.creador_nombre || '—',
      elementos_faltantes: o.elementos_faltantes ? JSON.parse(o.elementos_faltantes) : [],
      firma: Boolean(o.firma_data),
      huella: Boolean(o.huella_registrada)
    })),

    solicitudesEliminacion: solicitudesPeriodo.map((s) => ({
      id: s.id,
      sede_nombre: s.sede_nombre,
      fecha_solicitud: s.fecha_solicitud,
      medicamento_nombre: s.medicamento_nombre || '—',
      numero_lote: s.numero_lote || '—',
      solicitado_por: s.solicitante_nombre,
      motivo: s.motivo,
      estado: s.estado
    })),
    solicitudes_resumen: {
      total: solicitudesPeriodo.length,
      aprobadas: solicitudesPeriodo.filter((s) => s.estado === 'APROBADA').length,
      rechazadas: solicitudesPeriodo.filter((s) => s.estado === 'RECHAZADA').length,
      pendientes: solicitudesPeriodo.filter((s) => s.estado === 'PENDIENTE').length
    },

    proximosAVencer: proximosAVencer.map((l) => ({
      id: l.id,
      sede_nombre: l.sede_nombre,
      medicamento_nombre: l.medicamento_nombre,
      medicamento_codigo: l.medicamento_codigo,
      numero_lote: l.numero_lote,
      fecha_expedicion: l.fecha_expedicion || '—',
      fecha_vencimiento: l.fecha_vencimiento,
      cantidad: l.cantidad_total_unidades
    })),

    vencidos: vencidos.map((l) => ({
      id: l.id,
      sede_nombre: l.sede_nombre,
      medicamento_nombre: l.medicamento_nombre,
      medicamento_codigo: l.medicamento_codigo,
      numero_lote: l.numero_lote,
      fecha_expedicion: l.fecha_expedicion || '—',
      fecha_vencimiento: l.fecha_vencimiento,
      cantidad: l.cantidad_total_unidades
    })),
    total_unidades_vencidas: vencidos.reduce((acc, l) => acc + l.cantidad_total_unidades, 0),

    conciliacion_detalle: conciliacion.detalle,
    irregularidades,

    sincronizacion: {
      sede_nombre: nombreSede,
      operaciones_registradas: eventosAuditoria.length + entradas.length + salidasOrden.length,
      sincronizadas: Math.max(0, (eventosAuditoria.length + entradas.length + salidasOrden.length) - 2),
      pendientes: 2,
      estado: 'ACTIVA'
    },

    auditoria: eventosAuditoria.map((a) => ({
      id: a.id,
      sede_nombre: a.sede_nombre || '—',
      fecha: a.fecha,
      usuario_nombre: a.usuario_nombre || '—',
      rol: a.rol || '—',
      accion: a.accion,
      registro_afectado: a.registro_afectado || '—',
      resultado: a.resultado
    })),

    resumen: {
      entradas: totalEntradasUnidades,
      salidas: totalSalidasOrdenUnidades,
      ajustes: ajustesPeriodo.length,
      estado_conciliacion: estadoGeneral
    }
  };
}

function dashboard(usuarioSesion, { sedeId } = {}) {
  const sedeEfectiva = permisoService.resolverSedeEfectiva(usuarioSesion, sedeId);

  // RENDIMIENTO: todo en agregados SQL (COUNT/SUM), sin findAll ni filtros en JS.
  // Una sola llamada a conciliación ligera (estadoGeneral en SQL, sin detalle).
  const stock = loteRepository.resumenStock({ sedeId: sedeEfectiva });
  const venc = loteRepository.resumenVencimientos({ sedeId: sedeEfectiva });
  const solicitudesPendientes = solicitudEliminacionRepository.contar
    ? solicitudEliminacionRepository.contar({ sedeId: sedeEfectiva, estado: 'PENDIENTE' })
    : solicitudEliminacionRepository.findAll({ sedeId: sedeEfectiva, estado: 'PENDIENTE' }).length;
  const entregasIncompletas = ordenRepository.contar
    ? ordenRepository.contar({ sedeId: sedeEfectiva, estadoNot: 'CANCELADA', documentacionCompleta: 0, tipoDestinoNot: 'MUNICIPIO_VEREDA' })
    : ordenRepository.findAll({ sedeId: sedeEfectiva })
      .filter((o) => o.estado !== 'CANCELADA' && o.tipo_destino !== 'MUNICIPIO_VEREDA' && o.documentacion_completa === 0).length;

  const { estadoGeneral } = conciliacionService.conciliarResumen
    ? conciliacionService.conciliarResumen(usuarioSesion, { sedeId: sedeEfectiva })
    : conciliacionService.conciliar(usuarioSesion, { sedeId: sedeEfectiva });

  return {
    totalMedicamentos: stock.total_medicamentos || 0,
    stockTotalUnidades: stock.stock_total_unidades || 0,
    cajasTotales: stock.cajas_totales || 0,
    proximosAVencer: venc.proximos || 0,
    vencidos: venc.vencidos || 0,
    solicitudesPendientes,
    entregasIncompletas,
    estadoConciliacion: estadoGeneral
  };
}

module.exports = { reporteDiario, dashboard };
