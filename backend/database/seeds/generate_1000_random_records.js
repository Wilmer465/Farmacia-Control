const bcrypt = require('bcryptjs');
const { getDb } = require('../connection');
const { runMigrations } = require('../migrate');
const { ROLES, ESTADOS_REGISTRO } = require('../../../shared/constants');

function generarRegistrosAleatorios() {
  runMigrations();
  const db = getDb();

  console.log('Iniciando generación de 1000+ registros aleatorios...');

  db.pragma('foreign_keys = OFF');
  db.exec(`
    DELETE FROM entregas;
    DELETE FROM despacho_detalle;
    DELETE FROM despachos;
    DELETE FROM orden_detalles;
    DELETE FROM ordenes;
    DELETE FROM movimientos_inventario;
    DELETE FROM solicitudes_eliminacion;
    DELETE FROM auditoria;
    DELETE FROM lotes;
    DELETE FROM medicamentos;
  `);
  db.pragma('foreign_keys = ON');

  // 1. ROLES
  const insertRol = db.prepare('INSERT OR IGNORE INTO roles (nombre, descripcion) VALUES (?, ?)');
  const rolesSeed = [
    [ROLES.SUPERADMIN, 'Control total del sistema, todas las sedes'],
    [ROLES.ADMIN, 'Responsable de una sede'],
    [ROLES.INVENTARIO, 'Gestión de inventario y despachos de su sede'],
    [ROLES.USUARIO, 'Solo consulta']
  ];
  for (const r of rolesSeed) insertRol.run(...r);

  const roles = db.prepare('SELECT id, nombre FROM roles').all();
  const rolMap = {};
  roles.forEach(r => { rolMap[r.nombre] = r.id; });

  // 2. SEDES
  const insertSede = db.prepare('INSERT OR IGNORE INTO sedes (id, nombre, ciudad, estado) VALUES (?, ?, ?, ?)');
  insertSede.run(1, 'Quibdó', 'Quibdó', ESTADOS_REGISTRO.ACTIVO);
  insertSede.run(2, 'Bogotá Central', 'Bogotá', ESTADOS_REGISTRO.ACTIVO);
  insertSede.run(3, 'Medellín Norte', 'Medellín', ESTADOS_REGISTRO.ACTIVO);
  insertSede.run(4, 'Cali Sur', 'Cali', ESTADOS_REGISTRO.ACTIVO);

  const sedes = db.prepare('SELECT id, nombre FROM sedes').all();

  // 3. USUARIOS
  const passwordHash = bcrypt.hashSync('Farmacia123*', 8);
  const insertUser = db.prepare(`
    INSERT OR IGNORE INTO usuarios (id, nombre, username, password_hash, rol_id, sede_id, estado)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  insertUser.run(1, 'Administrador General', 'superadmin', passwordHash, rolMap[ROLES.SUPERADMIN], null, 'ACTIVO');
  insertUser.run(2, 'Carlos Rodríguez', 'admin_quibdo', passwordHash, rolMap[ROLES.ADMIN], 1, 'ACTIVO');
  insertUser.run(3, 'Ana López', 'ana_inventario', passwordHash, rolMap[ROLES.INVENTARIO], 1, 'ACTIVO');
  insertUser.run(4, 'Carlos Pérez', 'carlos_admin', passwordHash, rolMap[ROLES.ADMIN], 1, 'ACTIVO');
  insertUser.run(5, 'Pedro Martínez', 'pedro_inv', passwordHash, rolMap[ROLES.INVENTARIO], 1, 'ACTIVO');
  insertUser.run(6, 'Dra. María Gómez', 'maria_bogota', passwordHash, rolMap[ROLES.ADMIN], 2, 'ACTIVO');
  insertUser.run(7, 'Juan Valencia', 'juan_medellin', passwordHash, rolMap[ROLES.INVENTARIO], 3, 'ACTIVO');

  const usuarios = db.prepare('SELECT id, nombre, rol_id, sede_id FROM usuarios').all();

  // 4. MEDICAMENTOS
  const listaMedicamentos = [
    { codigo: 'MED-001', nombre: 'Paracetamol 500 mg', unidad_medida: 'TABLETA', unidades_por_caja: 20 },
    { codigo: 'MED-002', nombre: 'Ibuprofeno 400 mg', unidad_medida: 'TABLETA', unidades_por_caja: 30 },
    { codigo: 'MED-003', nombre: 'Omeprazol 20 mg', unidad_medida: 'CAPSULA', unidades_por_caja: 14 },
    { codigo: 'MED-004', nombre: 'Amoxicilina 500 mg', unidad_medida: 'CAPSULA', unidades_por_caja: 20 },
    { codigo: 'MED-005', nombre: 'Losartán Potásico 50 mg', unidad_medida: 'TABLETA', unidades_por_caja: 30 },
    { codigo: 'MED-006', nombre: 'Metformina 850 mg', unidad_medida: 'TABLETA', unidades_por_caja: 30 },
    { codigo: 'MED-007', nombre: 'Loratadina 10 mg', unidad_medida: 'TABLETA', unidades_por_caja: 10 },
    { codigo: 'MED-008', nombre: 'Azitromicina 500 mg', unidad_medida: 'TABLETA', unidades_por_caja: 3 },
    { codigo: 'MED-009', nombre: 'Diclofenaco 50 mg', unidad_medida: 'TABLETA', unidades_por_caja: 20 },
    { codigo: 'MED-010', nombre: 'Ciprofloxacino 500 mg', unidad_medida: 'TABLETA', unidades_por_caja: 10 },
    { codigo: 'MED-011', nombre: 'Salbutamol Inhalador 100 mcg', unidad_medida: 'FRASCO', unidades_por_caja: 1 },
    { codigo: 'MED-012', nombre: 'Atorvastatina 20 mg', unidad_medida: 'TABLETA', unidades_por_caja: 30 },
    { codigo: 'MED-013', nombre: 'Enalapril 20 mg', unidad_medida: 'TABLETA', unidades_por_caja: 30 },
    { codigo: 'MED-014', nombre: 'Cetirizina 10 mg', unidad_medida: 'TABLETA', unidades_por_caja: 10 },
    { codigo: 'MED-015', nombre: 'Acetaminofén Jarabe 120mg/5ml', unidad_medida: 'FRASCO', unidades_por_caja: 1 },
    { codigo: 'MED-016', nombre: 'Clonazepam 2 mg', unidad_medida: 'TABLETA', unidades_por_caja: 30 },
    { codigo: 'MED-017', nombre: 'Tramadol 50 mg', unidad_medida: 'CAPSULA', unidades_por_caja: 10 },
    { codigo: 'MED-018', nombre: 'Hidroclorotiazida 25 mg', unidad_medida: 'TABLETA', unidades_por_caja: 30 },
    { codigo: 'MED-019', nombre: 'Ranitidina 150 mg', unidad_medida: 'TABLETA', unidades_por_caja: 20 },
    { codigo: 'MED-020', nombre: 'Dexametasona 4 mg Ampolla', unidad_medida: 'AMPOLLA', unidades_por_caja: 5 }
  ];

  const insertMed = db.prepare(`
    INSERT OR IGNORE INTO medicamentos (codigo, nombre, unidad_medida, unidades_por_caja, estado)
    VALUES (?, ?, ?, ?, 'ACTIVO')
  `);

  for (const m of listaMedicamentos) {
    insertMed.run(m.codigo, m.nombre, m.unidad_medida, m.unidades_por_caja);
  }

  const medicamentosDB = db.prepare('SELECT id, codigo, nombre, unidades_por_caja FROM medicamentos').all();

  // Helper para fechas aleatorias entre enero 2025 y hoy
  function randomDate(startYear = 2025) {
    const start = new Date(startYear, 0, 1).getTime();
    const end = new Date().getTime();
    const d = new Date(start + Math.random() * (end - start));
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  function todayDateStr(hoursAgo = 0) {
    const d = new Date(Date.now() - hoursAgo * 3600000);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  function formatDateOnly(d) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  // 5. LOTES
  const insertLote = db.prepare(`
    INSERT OR IGNORE INTO lotes (
      medicamento_id, sede_id, numero_lote, fecha_expedicion, fecha_vencimiento,
      cantidad_cajas, cantidad_unidades_sueltas, cantidad_total_unidades, estado_manual, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const letras = ['A', 'B', 'C', 'D', 'E', 'F', 'L', 'P', 'O', 'I', 'M', 'T'];

  db.transaction(() => {
    for (let i = 1; i <= 80; i++) {
      const med = medicamentosDB[i % medicamentosDB.length];
      const sede = sedes[i % sedes.length];
      const numLote = `${letras[i % letras.length]}${Math.floor(1000 + Math.random() * 9000)}`;

      const fechaExp = new Date(2025, Math.floor(Math.random() * 12), Math.floor(1 + Math.random() * 28));
      let fechaVenc;
      if (i % 8 === 0) {
        // Vencido
        fechaVenc = new Date(2026, 6, Math.floor(1 + Math.random() * 28));
      } else if (i % 7 === 0) {
        // Próximo a vencer
        fechaVenc = new Date(2026, 7, Math.floor(20 + Math.random() * 10));
      } else {
        // Vigente
        fechaVenc = new Date(2027, Math.floor(Math.random() * 12), Math.floor(1 + Math.random() * 28));
      }

      const cajas = Math.floor(5 + Math.random() * 40);
      const sueltas = Math.floor(Math.random() * med.unidades_por_caja);
      const totalUnidades = (cajas * med.unidades_por_caja) + sueltas;
      const createdAt = randomDate(2025);
      const estadoManual = null;

      insertLote.run(
        med.id, sede.id, numLote, formatDateOnly(fechaExp), formatDateOnly(fechaVenc),
        cajas, sueltas, totalUnidades, estadoManual, createdAt, createdAt
      );
    }
  })();

  const lotesDB = db.prepare('SELECT id, medicamento_id, sede_id, numero_lote, cantidad_total_unidades FROM lotes').all();

  // 6. MOVIMIENTOS DE INVENTARIO
  const insertMov = db.prepare(`
    INSERT INTO movimientos_inventario (lote_id, medicamento_id, sede_id, tipo, cantidad, referencia_orden_id, usuario_id, fecha)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  db.transaction(() => {
    for (let i = 0; i < lotesDB.length; i++) {
      const lote = lotesDB[i];
      const fechaEntrada = (i >= lotesDB.length - 15) ? todayDateStr(i % 8) : randomDate(2025);
      insertMov.run(
        lote.id, lote.medicamento_id, lote.sede_id, 'ENTRADA',
        Math.floor(lote.cantidad_total_unidades + 50), null, usuarios[Math.floor(Math.random() * usuarios.length)].id,
        fechaEntrada
      );
    }
  })();

  // 7. ÓRDENES, DETALLES, DESPACHOS Y ENTREGAS (generamos 250 órdenes)
  const insertOrden = db.prepare(`
    INSERT INTO ordenes (numero, sede_id, usuario_creador_id, estado, fecha_creacion, fecha_actualizacion, tipo_destino, destino_detalle,
      receptor_nombre, receptor_documento, receptor_telefono, receptor_correo, firma_data, huella_registrada,
      documentacion_completa, elementos_faltantes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertOrdenDetalle = db.prepare(`
    INSERT INTO orden_detalles (orden_id, medicamento_id, cantidad_cajas_solicitada, cantidad_unidades_solicitada, cantidad_total_solicitada, cantidad_total_despachada)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const insertDespacho = db.prepare(`
    INSERT INTO despachos (orden_id, sede_id, despachado_por, fecha)
    VALUES (?, ?, ?, ?)
  `);

  const insertDespachoDetalle = db.prepare(`
    INSERT INTO despacho_detalle (despacho_id, orden_detalle_id, lote_id, medicamento_id, cantidad_cajas_despachada, cantidad_unidades_sueltas_despachada, cantidad_total_despachada)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const insertEntrega = db.prepare(`
    INSERT INTO entregas (despacho_id, orden_id, sede_id, receptor_nombre, receptor_documento, firma_data, huella_registrada, entregado_por, fecha, documentacion_completa, elementos_faltantes, tipo_destino, destino_detalle)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const receptoresNombres = [
    'Juan Rodríguez', 'Carlos Méndez', 'Dra. Laura Morales', 'Enfermera Patricia Soto',
    'Dr. Fernando Castro', 'Clínica San Rafael', 'Hospital Departamental', 'Dra. Sandra Perea'
  ];

  const veredasNombres = [
    'Vereda La Troja', 'Municipio Vigía del Fuerte', 'Vereda San Antonio', 'Puesto de Salud Bellavista',
    'Vereda El Carmen', 'Municipio Bojayá', 'Corregimiento Tagachí'
  ];

  const estadosOrden = ['COMPLETADA', 'COMPLETADA', 'COMPLETADA', 'PARCIAL', 'PENDIENTE', 'PENDIENTE', 'CANCELADA'];

  db.transaction(() => {
    for (let ordNum = 1001; ordNum <= 1250; ordNum++) {
      const sede = sedes[ordNum % sedes.length];
      const creador = usuarios[ordNum % usuarios.length];
      const estado = estadosOrden[ordNum % estadosOrden.length];
      // 25% de órdenes son salidas a otros municipios o veredas
      const esMunicipioVereda = (ordNum % 4 === 0);
      const tipoDestino = esMunicipioVereda ? 'MUNICIPIO_VEREDA' : 'LOCAL';
      const destinoDetalle = esMunicipioVereda ? veredasNombres[ordNum % veredasNombres.length] : null;

      // Primeras 25 órdenes fechadas hoy para pruebas inmediatas de HOY/SEMANA
      const fechaOrd = (ordNum >= 1225) ? todayDateStr((ordNum - 1225) % 10) : randomDate(2025);
      const numeroStr = `#${String(ordNum).padStart(6, '0')}`;

      // Documentación de quien recibe (se captura al generar la orden).
      // Municipio/vereda: identidad registrada, firma y huella quedan pendientes.
      let docNombre, docDocumento, docTelefono, docCorreo, docFirma, docHuella, docCompleta, docFaltantes;
      if (esMunicipioVereda) {
        docNombre = `Transporte/Remesa: ${destinoDetalle}`;
        docDocumento = 'EXENTO_ENVIO';
        docTelefono = null;
        docCorreo = null;
        docFirma = null;
        docHuella = 0;
        docCompleta = 0;
        docFaltantes = JSON.stringify(['FIRMA', 'HUELLA']);
      } else {
        const esIncompleta = (ordNum % 7 === 0);
        docNombre = receptoresNombres[ordNum % receptoresNombres.length];
        docDocumento = `CC-${Math.floor(10000000 + Math.random() * 90000000)}`;
        docTelefono = `${Math.floor(3000000000 + Math.random() * 100000000)}`;
        docCorreo = `receptor${ordNum}@correo.com`;
        docHuella = esIncompleta && ordNum % 2 === 0 ? 0 : 1;
        docFirma = esIncompleta && ordNum % 2 !== 0 ? null : 'data:image/png;base64,signature_mock_data';
        docFaltantes = esIncompleta ? JSON.stringify([docHuella === 0 ? 'HUELLA' : 'FIRMA']) : null;
        docCompleta = esIncompleta ? 0 : 1;
      }

      const resOrd = insertOrden.run(
        numeroStr, sede.id, creador.id, estado, fechaOrd, fechaOrd, tipoDestino, destinoDetalle,
        docNombre, docDocumento, docTelefono, docCorreo, docFirma, docHuella, docCompleta, docFaltantes
      );
      const ordenId = resOrd.lastInsertRowid;

      const numLineas = 1 + (ordNum % 3);
      for (let l = 0; l < numLineas; l++) {
        const med = medicamentosDB[(ordNum + l) % medicamentosDB.length];
        const cajasSol = Math.floor(1 + Math.random() * 5);
        const sueltasSol = Math.floor(Math.random() * med.unidades_por_caja);
        const totalSol = (cajasSol * med.unidades_por_caja) + sueltasSol;
        const despachado = (estado === 'COMPLETADA') ? totalSol : (estado === 'PARCIAL') ? Math.floor(totalSol / 2) : 0;

        const resDet = insertOrdenDetalle.run(ordenId, med.id, cajasSol, sueltasSol, totalSol, despachado);
        const ordenDetalleId = resDet.lastInsertRowid;

        if (despachado > 0) {
          const loteMatch = lotesDB.find(lt => lt.medicamento_id === med.id && lt.sede_id === sede.id) || lotesDB[0];
          const despachador = usuarios[(ordNum + 1) % usuarios.length];

          const resDesp = insertDespacho.run(ordenId, sede.id, despachador.id, fechaOrd);
          const despachoId = resDesp.lastInsertRowid;

          insertDespachoDetalle.run(despachoId, ordenDetalleId, loteMatch.id, med.id, cajasSol, 0, despachado);

          insertMov.run(
            loteMatch.id, med.id, sede.id, 'SALIDA_ORDEN',
            -despachado, ordenId, despachador.id, fechaOrd
          );

          if (esMunicipioVereda) {
            // Salidas a otros municipios/veredas: EXENTO de firma y huella -> COMPLETA
            insertEntrega.run(
              despachoId, ordenId, sede.id,
              `Transporte/Remesa: ${destinoDetalle}`,
              'EXENTO_ENVIO',
              null,
              0,
              despachador.id,
              fechaOrd,
              1, // Siempre COMPLETA
              null,
              'MUNICIPIO_VEREDA',
              destinoDetalle
            );
          } else {
            // Despacho local:
            // 85% completas con firma y huella
            const esIncompleta = (ordNum % 7 === 0);
            let firma = 'data:image/png;base64,signature_mock_data';
            let huella = 1;
            let faltantes = null;

            if (esIncompleta) {
              if (ordNum % 2 === 0) {
                huella = 0;
                faltantes = JSON.stringify(['HUELLA']);
              } else {
                firma = null;
                faltantes = JSON.stringify(['FIRMA']);
              }
            }

            const receptor = receptoresNombres[ordNum % receptoresNombres.length];

            insertEntrega.run(
              despachoId, ordenId, sede.id, receptor, `CC-${Math.floor(10000000 + Math.random() * 90000000)}`,
              firma,
              huella,
              despachador.id,
              fechaOrd,
              esIncompleta ? 0 : 1,
              faltantes,
              'LOCAL',
              null
            );
          }
        }
      }
    }
  })();

  // 8. SOLICITUDES DE ELIMINACIÓN (50 solicitudes)
  const insertSolElim = db.prepare(`
    INSERT INTO solicitudes_eliminacion (sede_id, usuario_solicitante_id, tipo_registro, registro_id, medicamento_id, motivo, estado, usuario_resolutor_id, fecha_resolucion, observacion_resolucion, fecha_solicitud)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const motivosBaja = [
    'Medicamento con fecha de vencimiento cumplida en estante',
    'Frasco con sello de seguridad roto durante transporte',
    'Error de registro duplicado en ingreso',
    'Lote retirado por alerta del INVIMA / laboratorio',
    'Deterioro en empaque por humedad'
  ];

  const estadosSol = ['APROBADA', 'APROBADA', 'RECHAZADA', 'PENDIENTE'];

  db.transaction(() => {
    for (let s = 1; s <= 50; s++) {
      const lote = lotesDB[s % lotesDB.length];
      const solicitante = usuarios[s % usuarios.length];
      const estado = estadosSol[s % estadosSol.length];
      const fechaSol = randomDate(2025, 2026);
      const resolutor = estado !== 'PENDIENTE' ? usuarios[0] : null;

      insertSolElim.run(
        lote.sede_id, solicitante.id, 'LOTE', lote.id, lote.medicamento_id,
        motivosBaja[s % motivosBaja.length],
        estado,
        resolutor ? resolutor.id : null,
        resolutor ? fechaSol : null,
        estado === 'RECHAZADA' ? 'No procede según manual de mermas' : null,
        fechaSol
      );
    }
  })();

  // 9. AUDITORÍA (600 eventos de seguridad y operaciones)
  const insertAudit = db.prepare(`
    INSERT INTO auditoria (usuario_id, rol, sede_id, accion, modulo, registro_afectado, resultado, valores_anteriores, valores_nuevos, fecha)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const accionesAudit = [
    { accion: 'LOGIN_EXITOSO', modulo: 'AUTH' },
    { accion: 'CREAR_MEDICAMENTO', modulo: 'INVENTARIO' },
    { accion: 'REGISTRAR_ENTRADA_LOTE', modulo: 'INVENTARIO' },
    { accion: 'CONFIRMAR_ORDEN', modulo: 'ORDENES' },
    { accion: 'DESPACHAR_ORDEN', modulo: 'DESPACHOS' },
    { accion: 'REGISTRAR_ENTREGA', modulo: 'ENTREGAS' },
    { accion: 'SOLICITAR_ELIMINACION', modulo: 'ELIMINACIONES' },
    { accion: 'APROBAR_ELIMINACION', modulo: 'ELIMINACIONES' },
    { accion: 'GENERAR_RESPALDO', modulo: 'BACKUPS' },
    { accion: 'CONSULTAR_REPORTES', modulo: 'REPORTES' }
  ];

  db.transaction(() => {
    for (let a = 1; a <= 600; a++) {
      const u = usuarios[a % usuarios.length];
      const rol = roles.find(r => r.id === u.rol_id)?.nombre || 'ADMIN';
      const act = accionesAudit[a % accionesAudit.length];
      const fechaAud = randomDate(2025, 2026);
      const resultado = (a % 35 === 0) ? 'FALLIDO' : 'EXITO';

      insertAudit.run(
        u.id, rol, u.sede_id || 1,
        act.accion, act.modulo,
        `registro:${Math.floor(100 + Math.random() * 900)}`,
        resultado,
        null,
        JSON.stringify({ status: 'ok', timestamp: fechaAud }),
        fechaAud
      );
    }
  })();

  // 10. Salidas sin orden / Ajustes negativos para pruebas de no conciliación
  db.transaction(() => {
    for (let aj = 1; aj <= 15; aj++) {
      const lote = lotesDB[aj % lotesDB.length];
      const u = usuarios[aj % usuarios.length];
      const fechaAj = (aj >= 10) ? todayDateStr(aj % 6) : randomDate(2025);
      insertMov.run(
        lote.id, lote.medicamento_id, lote.sede_id, 'AJUSTE',
        -(Math.floor(5 + Math.random() * 15)), null, u.id,
        fechaAj
      );
    }
  })();

  console.log('Generación masiva de datos completada con éxito.');
  console.log(`- Medicamentos: ${medicamentosDB.length}`);
  console.log(`- Lotes: 80`);
  console.log(`- Órdenes: 250`);
  console.log(`- Movimientos: 300+`);
  console.log(`- Entregas: 200+`);
  console.log(`- Solicitudes de baja: 50`);
  console.log(`- Auditoría: 600`);
  console.log(`Total registros generados: > 1,400 registros en fechas variadas (2025 - 2026).`);
}

if (require.main === module) {
  generarRegistrosAleatorios();
}

module.exports = { generarRegistrosAleatorios };
