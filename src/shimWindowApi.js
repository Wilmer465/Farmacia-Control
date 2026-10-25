// Shim de desarrollo: expone `window.api` solo cuando la app corre en el
// navegador (Vite dev) y no en el renderer de Electron. En Electron el
// preload ya inyecta el objeto real, así que este shim no se instala.
// No afecta al build de producción porque import.meta.env.DEV es false.
// Incluye datos mock (solo desarrollo) para que las pantallas no queden vacías.
(function () {
  if (typeof window === 'undefined') return;
  if (window.api) return;
  if (!import.meta.env.DEV) return;

  const ok = (data) => Promise.resolve({ ok: true, data });
  const fail = (error) => Promise.resolve({ ok: false, error });

  const ahora = () => new Date().toISOString();
  const hace = (dias) => {
    const f = new Date();
    f.setDate(f.getDate() - dias);
    return f.toISOString();
  };

  const medicamentosMock = [
    { id: 1, codigo: 'PAR-500', nombre: 'Paracetamol 500 mg', laboratorio: 'Genfar', principio_activo: 'Paracetamol', concentracion: '500 mg', forma_farmaceutica: 'Tableta', categoria: 'Analgésico', requiere_receta: false, unidades_por_caja: 20, precio_compra: 800, precio_venta: 1200, estado: 'ACTIVO', creado_en: ahora() },
    { id: 2, codigo: 'IBU-400', nombre: 'Ibuprofeno 400 mg', laboratorio: 'Rocker', principio_activo: 'Ibuprofeno', concentracion: '400 mg', forma_farmaceutica: 'Tableta', categoria: 'Antiinflamatorio', requiere_receta: false, unidades_por_caja: 30, precio_compra: 1200, precio_venta: 1800, estado: 'ACTIVO', creado_en: ahora() },
    { id: 3, codigo: 'AML-10', nombre: 'Amlodipino 10 mg', laboratorio: 'Bagó', principio_activo: 'Amlodipino', concentracion: '10 mg', forma_farmaceutica: 'Tableta', categoria: 'Antihipertensivo', requiere_receta: true, unidades_por_caja: 28, precio_compra: 2500, precio_venta: 3800, estado: 'ACTIVO', creado_en: ahora() },
    { id: 4, codigo: 'OME-20', nombre: 'Omeprazol 20 mg', laboratorio: 'Genfar', principio_activo: 'Omeprazol', concentracion: '20 mg', forma_farmaceutica: 'Cápsula', categoria: 'Protectora gástrica', requiere_receta: false, unidades_por_caja: 14, precio_compra: 1500, precio_venta: 2400, estado: 'ACTIVO', creado_en: ahora() },
    { id: 5, codigo: 'LOS-50', nombre: 'Losartan 50 mg', laboratorio: 'Rocker', principio_activo: 'Losartan', concentracion: '50 mg', forma_farmaceutica: 'Tableta', categoria: 'Antihipertensivo', requiere_receta: true, unidades_por_caja: 28, precio_compra: 2200, precio_venta: 3500, estado: 'ACTIVO', creado_en: ahora() },
  ];

  const sedesMock = [
    { id: 1, nombre: 'Sede Principal', ciudad: 'Bogotá', direccion: 'Cra 7 # 72-12', telefono: '6012345678', estado: 'ACTIVO', creado_en: ahora() },
    { id: 2, nombre: 'Sede Norte', ciudad: 'Bogotá', direccion: 'Av Calle 127 # 45-20', telefono: '6018765432', estado: 'ACTIVO', creado_en: ahora() },
    { id: 3, nombre: 'Sede Medellín', ciudad: 'Medellín', direccion: 'Cra 43 # 5-100', telefono: '6042345678', estado: 'ACTIVO', creado_en: ahora() },
  ];

  const usuariosMock = [
    { id: 1, nombre: 'Wilmer', username: 'wilmer', rol_nombre: 'SUPERADMIN', sede_nombre: null, estado: 'ACTIVO', creado_en: ahora() },
    { id: 2, nombre: 'Inventario Quibdo', username: 'inv_quibdo', rol_nombre: 'INVENTARIO', sede_nombre: 'Sede Quibdo', estado: 'ACTIVO', creado_en: ahora() },
    { id: 3, nombre: 'Inventario Medellin', username: 'inv_medellin', rol_nombre: 'INVENTARIO', sede_nombre: 'Sede Medellín', estado: 'ACTIVO', creado_en: ahora() },
    { id: 4, nombre: 'Consulta General', username: 'consulta', rol_nombre: 'USUARIO', sede_nombre: 'Sede Principal', estado: 'ACTIVO', creado_en: ahora() },
  ];

  const rolesMock = [
    { id: 1, nombre: 'SUPERADMIN', descripcion: 'Control total del sistema, todas las sedes' },
    { id: 2, nombre: 'ADMIN', descripcion: 'Responsable de una sede' },
    { id: 3, nombre: 'INVENTARIO', descripcion: 'Gestión de inventario y despachos de su sede' },
    { id: 4, nombre: 'USUARIO', descripcion: 'Solo consulta' },
  ];

  const lotesMock = [
    { id: 1, numero_lote: 'P500-2026A', medicamento_id: 1, medicamento_nombre: 'Paracetamol 500 mg', sede_id: 1, sede_nombre: 'Sede Principal', fecha_expedicion: hace(30), fecha_vencimiento: '2027-12-31', cantidad_cajas: 15, cantidad_unidades_sueltas: 5, cantidad_total_unidades: 305, estado: 'ACTIVO' },
    { id: 2, numero_lote: 'I400-2026B', medicamento_id: 2, medicamento_nombre: 'Ibuprofeno 400 mg', sede_id: 1, sede_nombre: 'Sede Principal', fecha_expedicion: hace(15), fecha_vencimiento: '2028-06-30', cantidad_cajas: 20, cantidad_unidades_sueltas: 10, cantidad_total_unidades: 610, estado: 'ACTIVO' },
    { id: 3, numero_lote: 'A10-2026C', medicamento_id: 3, medicamento_nombre: 'Amlodipino 10 mg', sede_id: 2, sede_nombre: 'Sede Norte', fecha_expedicion: hace(10), fecha_vencimiento: '2028-03-31', cantidad_cajas: 10, cantidad_unidades_sueltas: 3, cantidad_total_unidades: 283, estado: 'ACTIVO' },
  ];

  const ordenesMock = [
    { id: 101, numero_orden: 'ORD-2026-001', sede_id: 1, sede_nombre: 'Sede Principal', usuario_id: 1, usuario_nombre: 'Wilmer', estado: 'PENDIENTE', total: 45000, creado_en: hace(2) },
    { id: 102, numero_orden: 'ORD-2026-002', sede_id: 2, sede_nombre: 'Sede Norte', usuario_id: 3, usuario_nombre: 'Inventario Medellin', estado: 'DESPACHADA', total: 72000, creado_en: hace(5) },
    { id: 103, numero_orden: 'ORD-2026-003', sede_id: 1, sede_nombre: 'Sede Principal', usuario_id: 1, usuario_nombre: 'Wilmer', estado: 'CANCELADA', total: 0, creado_en: hace(8) },
  ];

  const entregasMock = [
    { id: 1, orden_id: 101, numero_orden: 'ORD-2026-001', usuario_recibe: 'Juan Pérez', documento: '1012345678', firma_capturada: true, total: 45000, estado: 'ENTREGADO', creado_en: hace(2) },
    { id: 2, orden_id: 102, numero_orden: 'ORD-2026-002', usuario_recibe: 'María Gómez', documento: '1023456789', firma_capturada: true, total: 72000, estado: 'ENTREGADO', creado_en: hace(5) },
  ];

  const auditoriaMock = [
    { id: 1, accion: 'LOGIN', usuario_id: 1, usuario_nombre: 'Wilmer', entidad: 'usuarios', entidad_id: 1, detalle: 'Inicio de sesión', creado_en: hace(1) },
    { id: 2, accion: 'CREAR_MEDICAMENTO', usuario_id: 1, usuario_nombre: 'Wilmer', entidad: 'medicamentos', entidad_id: 1, detalle: 'Se creó Paracetamol 500 mg', creado_en: hace(3) },
    { id: 3, accion: 'DESPACHAR', usuario_id: 3, usuario_nombre: 'Inventario Medellin', entidad: 'ordenes', entidad_id: 102, detalle: 'Orden despachada y entregada', creado_en: hace(5) },
  ];

  const receptoresMock = [
    { id: 1, nombre: 'Farmacia San José', documento: '900123456', ciudad: 'Bogotá', telefono: '3001112233', estado: 'ACTIVO' },
    { id: 2, nombre: 'Droguería La Salud', documento: '900234567', ciudad: 'Medellín', telefono: '3012223344', estado: 'ACTIVO' },
  ];

  const backupsMock = [
    { id: 1, nombre: 'farmacia_backup_20261020.db', tamano_mb: 4.2, creado_en: hace(1) },
    { id: 2, nombre: 'farmacia_backup_20261019.db', tamano_mb: 4.1, creado_en: hace(24) },
  ];

  const catalogoCumMock = {
    total: 12,
    actualizado_en: hace(7),
    fuentes: ['INVIMA', 'CUM'],
  };

  const shim = {
    auth: {
      login: (credenciales) => {
        if (!credenciales || !credenciales.username || !credenciales.password) {
          return fail('Usuario y contraseña son obligatorios');
        }
        return ok({
          id: 1,
          username: credenciales.username,
          rol_nombre: 'SUPERADMIN',
          session_token: 'dev-token-' + Math.random().toString(36).slice(2),
        });
      },
      logout: () => Promise.resolve(),
    },
    medicamentos: {
      listar: () => ok(medicamentosMock),
      crear: () => fail('Servicio no disponible fuera de Electron'),
      actualizar: () => fail('Servicio no disponible fuera de Electron'),
    },
    sedes: {
      listar: () => ok(sedesMock),
    },
    lotes: {
      listar: () => ok(lotesMock),
      crear: () => fail('Servicio no disponible fuera de Electron'),
      ajustar: () => fail('Servicio no disponible fuera de Electron'),
    },
    ordenes: {
      listar: () => ok(ordenesMock),
      obtener: () => ok(ordenesMock[0]),
      crear: () => fail('Servicio no disponible fuera de Electron'),
      cancelar: () => fail('Servicio no disponible fuera de Electron'),
      actualizarDocumentacion: () => fail('Servicio no disponible fuera de Electron'),
    },
    despachos: {
      listarPorOrden: () => ok(entregasMock),
      crear: () => fail('Servicio no disponible fuera de Electron'),
    },
    entregas: {
      listar: () => ok(entregasMock),
      crear: () => fail('Servicio no disponible fuera de Electron'),
      capturarHuella: () => fail('Servicio no disponible fuera de Electron'),
    },
    receptores: {
      buscar: () => ok(receptoresMock[0]),
      listar: () => ok(receptoresMock),
      guardar: () => fail('Servicio no disponible fuera de Electron'),
      actualizar: () => fail('Servicio no disponible fuera de Electron'),
    },
    solicitudesEliminacion: {
      listar: () => ok([]),
      crear: () => fail('Servicio no disponible fuera de Electron'),
      resolver: () => fail('Servicio no disponible fuera de Electron'),
    },
    solicitudesIntercambio: {
      listar: () => ok([]),
      crear: () => fail('Servicio no disponible fuera de Electron'),
      resolver: () => fail('Servicio no disponible fuera de Electron'),
    },
    auditoria: {
      listar: () => ok(auditoriaMock),
    },
    reportes: {
      diario: () => ok([{ fecha: hace(1), ingresos: 125000, egresos: 45000, transacciones: 12 }]),
      dashboard: () => ok({
        estadoConciliacion: 'CONCILIADO',
        totalMedicamentos: medicamentosMock.length,
        stockTotalUnidades: lotesMock.reduce((s, l) => s + l.cantidad_total_unidades, 0),
        cajasTotales: lotesMock.reduce((s, l) => s + l.cantidad_cajas, 0),
        proximosAVencer: 0,
        vencidos: 0,
        solicitudesPendientes: 0,
        entregasIncompletas: 0,
        ordenesActivas: ordenesMock.filter((o) => o.estado === 'PENDIENTE').length,
      }),
      conciliacion: () => ok({ coincidencias: 10, discrepancias: 0, fecha: ahora() }),
      guardarPdf: () => fail('Servicio no disponible fuera de Electron'),
    },
    backups: {
      listar: () => ok(backupsMock),
      crear: () => fail('Servicio no disponible fuera de Electron'),
      ultimo: () => ok(backupsMock[0]),
      obtenerConfig: () => ok({ automatico: true, dias_retencion: 30 }),
      guardarConfig: () => ok({}),
      consumo: () => ok({ total_mb: 8.3, archivos: backupsMock.length }),
      restaurar: () => fail('Servicio no disponible fuera de Electron'),
    },
    cloudSync: {
      sincronizar: () => fail('Servicio no disponible fuera de Electron'),
    },
    usuarios: {
      listar: () => ok(usuariosMock),
      listarRoles: () => ok(rolesMock),
      crear: () => fail('Servicio no disponible fuera de Electron'),
      actualizar: () => fail('Servicio no disponible fuera de Electron'),
      cambiarEstado: () => fail('Servicio no disponible fuera de Electron'),
      eliminarDefinitivo: () => fail('Servicio no disponible fuera de Electron'),
    },
    catalogoCum: {
      actualizar: () => fail('Servicio no disponible fuera de Electron'),
      estado: () => ok(catalogoCumMock),
      buscarPorGTIN: () => ok([]),
      buscarPorCUM: () => ok([]),
      buscarPorProducto: () => ok(medicamentosMock.slice(0, 2)),
      crearManual: () => fail('Servicio no disponible fuera de Electron'),
      crearEmpaque: () => fail('Servicio no disponible fuera de Electron'),
      adjuntarDocumento: () => fail('Servicio no disponible fuera de Electron'),
      obtenerDocumento: () => fail('Servicio no disponible fuera de Electron'),
      progresoActualizacion: () => ok({ completado: 100 }),
      cancelarActualizacion: () => fail('Servicio no disponible fuera de Electron'),
    },
    recepcion: {
      escanear: () => fail('Servicio no disponible fuera de Electron'),
      registrar: () => fail('Servicio no disponible fuera de Electron'),
      historial: () => ok([
        { id: 1, medicamento: 'Paracetamol 500 mg', lote: 'P500-2026A', cantidad: 100, tipo: 'ENTRADA', fecha: hace(10) },
        { id: 2, medicamento: 'Ibuprofeno 400 mg', lote: 'I400-2026B', cantidad: 200, tipo: 'ENTRADA', fecha: hace(8) },
      ]),
    },
    firmaPad: {
      detectar: () => ok(false),
      capturar: () => fail('Servicio no disponible fuera de Electron'),
    },
    puentes: {
      verificarPrerrequisitos: () => ok({
        alcance: 'Inspección estática disponible únicamente en la aplicación de escritorio.',
        dispositivo: 'no probado',
        wacom: { nombre: 'Wacom STU-540', estado: 'diagnostico_incompleto', dispositivo: 'no probado' },
        zkteco: { nombre: 'ZKTeco ZK-9500', estado: 'diagnostico_incompleto', dispositivo: 'no probado' }
      }),
    },
  };

  Object.defineProperty(window, 'api', {
    value: shim,
    writable: false,
    configurable: false,
    enumerable: true,
  });
})();
