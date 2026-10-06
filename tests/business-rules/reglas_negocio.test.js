const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const { createTestDb, teardownTestDb } = require('../helpers/testDb');
const ordenService = require('../../backend/services/ordenService');
const despachoService = require('../../backend/services/despachoService');
const loteService = require('../../backend/services/loteService');
const medicamentoService = require('../../backend/services/medicamentoService');
const conciliacionService = require('../../backend/services/conciliacionService');
const reporteService = require('../../backend/services/reporteService');
const solicitudEliminacionService = require('../../backend/services/solicitudEliminacionService');
const usuarioService = require('../../backend/services/usuarioService');
const authService = require('../../backend/services/authService');
const auditoriaRepository = require('../../backend/repositories/auditoriaRepository');
const solicitudEliminacionRepository = require('../../backend/repositories/solicitudEliminacionRepository');
const usuarioRepository = require('../../backend/repositories/usuarioRepository');
const { getDb } = require('../../backend/database/connection');

// Firma mock realista: el backend exige data-URL PNG/JPEG con contenido real
// (backend/validators/firmaValidator.js); el antiguo 'FIRMA_MOCK' de 10 chars
// se rechaza como firma vacía.
const FIRMA_TEST = 'data:image/png;base64,' + 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='.repeat(4);

describe('FASE 6 — Reglas del Negocio de Farmacia-Control', () => {
  let db;
  let sesionSuperadmin;
  let sesionSuperadmin2;
  let sesionWilmer;
  let med;
  let lote;

  beforeEach(() => {
    db = createTestDb();
    sesionSuperadmin = {
      id: 1,
      nombre: 'Superadmin',
      username: 'superadmin',
      rol_nombre: 'SUPERADMIN',
      sede_id: null
    };

    // Segundo SUPERADMIN sembrado. Existe por una razón concreta: `resolver`
    // prohíbe aprobar la propia solicitud, así que sin una segunda identidad las
    // pruebas de resolución no podrían completarse.
    const adminMovil = usuarioRepository.findByUsername('admin');
    sesionSuperadmin2 = {
      id: adminMovil.id,
      nombre: adminMovil.nombre,
      username: adminMovil.username,
      rol_nombre: 'SUPERADMIN',
      sede_id: null
    };

    // Único autorizado para la gestión de usuarios (flag es_superadmin_principal).
    const wilmer = usuarioRepository.findByUsername('wilmer');
    sesionWilmer = {
      id: wilmer.id,
      nombre: wilmer.nombre,
      username: wilmer.username,
      rol_nombre: 'SUPERADMIN',
      es_superadmin_principal: 1,
      sede_id: null
    };

med = medicamentoService.crear(sesionSuperadmin, {
      codigo: 'MED-REG-01',
      nombre: 'Diclofenaco 50mg',
      // `unidad_medida` es obligatoria en validarMedicamento. El fixture se había
      // quedado atrás y hacía fallar TODO este archivo en beforeEach, antes de
      // llegar a una sola aserción.
      unidad_medida: 'TABLETA',
      unidades_por_caja: 10
    });

    lote = loteService.crear(sesionSuperadmin, {
      medicamento_id: med.id,
      sede_id: 1,
      numero_lote: 'L-REG-01',
      fecha_expedicion: '2026-01-01',
      fecha_vencimiento: '2028-12-31',
      cantidad_cajas: 10 // 100 unidades
    });
  });

  afterEach(() => {
    teardownTestDb();
  });

  test('No permitir despacho sin firma registrada', () => {
    // Crear orden exenta temporal de firma en creación (MUNICIPIO_VEREDA)
    const ordenSinFirma = ordenService.crear(sesionSuperadmin, {
      sede_id: 1,
      tipo_destino: 'MUNICIPIO_VEREDA',
      destino_detalle: 'Vereda Las Flores',
      receptor_nombre: 'Conductor Envio',
      receptor_documento: '98765432',
      items: [{ medicamento_id: med.id, cantidad_unidades_solicitada: 20 }]
    });

    // Intentar despachar sin firma
    assert.throws(
      () => despachoService.crear(sesionSuperadmin, {
        orden_id: ordenSinFirma.id,
        items: [{ orden_detalle_id: ordenSinFirma.detalles[0].id, lote_id: lote.id, cantidad_unidades_despachada: 20 }]
      }),
      /se requiere firma registrada/
    );
  });

  test('No permitir despacho sin huella registrada', () => {
    const ordenSinHuella = ordenService.crear(sesionSuperadmin, {
      sede_id: 1,
      tipo_destino: 'MUNICIPIO_VEREDA',
      destino_detalle: 'Vereda El Salto',
      receptor_nombre: 'Conductor Envio',
      receptor_documento: '98765432',
      firma_data: FIRMA_TEST,
      huella_registrada: 0,
      items: [{ medicamento_id: med.id, cantidad_unidades_solicitada: 20 }]
    });

    // La orden MUNICIPIO_VEREDA no persiste firma: se pasa explícita para
    // llegar al chequeo de huella (si no, falla firma antes).
    assert.throws(
      () => despachoService.crear(sesionSuperadmin, {
        orden_id: ordenSinHuella.id,
        firma_data: FIRMA_TEST,
        items: [{ orden_detalle_id: ordenSinHuella.detalles[0].id, lote_id: lote.id, cantidad_unidades_sueltas_despachada: 20 }]
      }),
      /se requiere huella registrada/
    );
  });

  test('Registrar correctamente pedidos parciales y diferenciar solicitado de despachado', () => {
    const orden = ordenService.crear(sesionSuperadmin, {
      sede_id: 1,
      tipo_destino: 'LOCAL',
      receptor_nombre: 'Receptor Paciente',
      receptor_documento: '11223344',
      firma_data: FIRMA_TEST,
      huella_registrada: 1,
      items: [{ medicamento_id: med.id, cantidad_unidades_solicitada: 50 }]
    });

    // Despacho parcial de 20 de 50
    const resParcial = despachoService.crear(sesionSuperadmin, {
      orden_id: orden.id,
      items: [{ orden_detalle_id: orden.detalles[0].id, lote_id: lote.id, cantidad_unidades_sueltas_despachada: 20 }]
    });

    assert.equal(resParcial.nuevoEstadoOrden, 'PARCIAL');

    const ordenActualizada = ordenService.obtener(sesionSuperadmin, orden.id);
    assert.equal(ordenActualizada.estado, 'PARCIAL');
    assert.equal(ordenActualizada.detalles[0].cantidad_total_solicitada, 50);
    assert.equal(ordenActualizada.detalles[0].cantidad_total_despachada, 20);

    // Segundo despacho: restante 30
    const resCompleto = despachoService.crear(sesionSuperadmin, {
      orden_id: orden.id,
      items: [{ orden_detalle_id: orden.detalles[0].id, lote_id: lote.id, cantidad_unidades_sueltas_despachada: 30 }]
    });

    assert.equal(resCompleto.nuevoEstadoOrden, 'COMPLETADA');
    const ordenFinal = ordenService.obtener(sesionSuperadmin, orden.id);
    assert.equal(ordenFinal.estado, 'COMPLETADA');
    assert.equal(ordenFinal.detalles[0].cantidad_total_despachada, 50);
  });

  test('Salida sin orden provoca que Conciliación y Reportes marquen NO_CONCILIADO', () => {
    // Estado inicial: todo conciliado
    const concInicial = conciliacionService.conciliar(sesionSuperadmin, { sedeId: 1 });
    assert.equal(concInicial.estadoGeneral, 'CONCILIADO');

    // Provocar salida sin orden: ajuste manual a la baja
    loteService.ajustarCantidades(sesionSuperadmin, lote.id, {
      cantidad_cajas: 8,
      cantidad_unidades_sueltas: 0,
      motivo: 'Ajuste manual sin orden por diferencia'
    });

    // Conciliación DEBE marcar NO_CONCILIADO
    const concDespues = conciliacionService.conciliar(sesionSuperadmin, { sedeId: 1 });
    assert.equal(concDespues.estadoGeneral, 'NO_CONCILIADO');
    assert.equal(concDespues.detalle[0].tiene_ajustes_irregulares, true);

    // El reporte diario también DEBE marcar NO CONCILIADO
    const rep = reporteService.reporteDiario(sesionSuperadmin, { sedeId: 1 });
    assert.equal(rep.estado_general.estado, 'NO CONCILIADO');
    assert.ok(rep.salidasSinOrden.length > 0);
  });

test('Registro auditable de solicitudes de eliminación y no auto-aprobación', () => {
    const solicitud = solicitudEliminacionService.crear(sesionSuperadmin, {
      tipo_registro: 'LOTE',
      registro_id: lote.id,
      motivo: 'Lote dañado por humedad'
    });

    assert.ok(solicitud.id);
    assert.equal(solicitud.estado, 'PENDIENTE');

    // Regla: no puede auto-aprobar su propia solicitud
    assert.throws(
      () => solicitudEliminacionService.resolver(sesionSuperadmin, solicitud.id, { decision: 'APROBADA' }),
      /no puede aprobar su propia solicitud/
    );
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Integridad de las solicitudes de baja
  // ─────────────────────────────────────────────────────────────────────────────

  test('Una segunda solicitud PENDIENTE del mismo registro se rechaza', () => {
    solicitudEliminacionService.crear(sesionSuperadmin, {
      registro_id: lote.id,
      motivo: 'Lote dañado por humedad'
    });

    assert.throws(
      () => solicitudEliminacionService.crear(sesionSuperadmin, {
        registro_id: lote.id,
        motivo: 'Reenvío del mismo formulario'
      }),
      /Ya existe una solicitud de baja PENDIENTE/
    );

    // La garantía no es solo de aplicación: el índice único parcial impide que un
    // segundo INSERT llegue a existir aunque la comprobación previa se saltara.
    assert.throws(
      () => db.prepare(`
        INSERT INTO solicitudes_eliminacion
          (sede_id, usuario_solicitante_id, tipo_registro, registro_id, medicamento_id, motivo)
        VALUES (1, 1, 'LOTE', ?, NULL, 'inserción directa saltándose el servicio')
      `).run(lote.id),
      /UNIQUE constraint failed/i
    );

    assert.equal(solicitudEliminacionRepository.contar({ estado: 'PENDIENTE' }), 1);
  });

  test('Resolver una solicitud libera el índice para una nueva baja del mismo lote', () => {
    const primera = solicitudEliminacionService.crear(sesionSuperadmin, {
      registro_id: lote.id,
      motivo: 'Primera solicitud'
    });

    solicitudEliminacionService.resolver(sesionSuperadmin2, primera.id, {
      decision: 'RECHAZADA',
      observacion: 'Motivo insuficiente'
    });

    // El índice es PARCIAL: solo cubre PENDIENTE. Una baja legítima posterior del
    // mismo lote no debe quedar bloqueada para siempre.
    const segunda = solicitudEliminacionService.crear(sesionSuperadmin, {
      registro_id: lote.id,
      motivo: 'Segunda solicitud, tras el rechazo'
    });
    assert.equal(segunda.estado, 'PENDIENTE');
    assert.notEqual(segunda.id, primera.id);
  });

  test('Un fallo de auditoría no deja la solicitud creada', () => {
    const original = auditoriaRepository.registrar;
    // Se rompe la auditoría a propósito. El INSERT y su auditoría deben compartir
    // transacción: si no, la solicitud quedaría creada y el usuario vería
    // "Error interno", de modo que al reintentar se duplicaría.
    auditoriaRepository.registrar = () => { throw new Error('FALLO DE AUDITORÍA SIMULADO'); };

    try {
      assert.throws(
        () => solicitudEliminacionService.crear(sesionSuperadmin, {
          registro_id: lote.id,
          motivo: 'Lote con etiqueta ilegible'
        }),
        /FALLO DE AUDITORÍA SIMULADO/
      );
    } finally {
      auditoriaRepository.registrar = original;
    }

    assert.equal(solicitudEliminacionRepository.contar({ estado: 'PENDIENTE' }), 0);

    // Y por lo tanto se puede reintentar sin duplicar.
    const reintento = solicitudEliminacionService.crear(sesionSuperadmin, {
      registro_id: lote.id,
      motivo: 'Lote con etiqueta ilegible'
    });
    assert.equal(solicitudEliminacionRepository.contar({ estado: 'PENDIENTE' }), 1);
    assert.equal(reintento.estado, 'PENDIENTE');
  });

  test('ADMIN resuelve la solicitud de su propia sede y es rechazado en otra', () => {
    const solicitud = solicitudEliminacionService.crear(sesionSuperadmin, {
      registro_id: lote.id,
      motivo: 'Frascos deteriorados en transporte'
    });

    const adminOtraSede = { id: sesionSuperadmin2.id, rol_nombre: 'ADMIN', sede_id: 2 };
    assert.throws(
      () => solicitudEliminacionService.resolver(adminOtraSede, solicitud.id, { decision: 'APROBADA' }),
      /su propia sede/
    );

    const adminSuSede = { id: sesionSuperadmin2.id, rol_nombre: 'ADMIN', sede_id: 1 };
    const resuelta = solicitudEliminacionService.resolver(adminSuSede, solicitud.id, {
      decision: 'APROBADA',
      observacion: 'Verificado en sitio'
    });
    assert.equal(resuelta.estado, 'APROBADA');
    assert.equal(Number(resuelta.usuario_resolutor_id), sesionSuperadmin2.id);
  });

  test('SUPERADMIN sigue resolviendo solicitudes de cualquier sede', () => {
    const solicitud = solicitudEliminacionService.crear(sesionSuperadmin, {
      registro_id: lote.id,
      motivo: 'Alerta sanitaria'
    });

    // sesionSuperadmin2 es SUPERADMIN sin sede: visión global.
    const resuelta = solicitudEliminacionService.resolver(sesionSuperadmin2, solicitud.id, {
      decision: 'APROBADA'
    });
    assert.equal(resuelta.estado, 'APROBADA');
  });

  test('Un rol sin autoridad no puede resolver solicitudes de baja', () => {
    const solicitud = solicitudEliminacionService.crear(sesionSuperadmin, {
      registro_id: lote.id,
      motivo: 'Prueba de permisos'
    });

    const inventario = { id: sesionSuperadmin2.id, rol_nombre: 'INVENTARIO', sede_id: 1 };
    assert.throws(
      () => solicitudEliminacionService.resolver(inventario, solicitud.id, { decision: 'APROBADA' }),
      /Solo el Superadmin o el Administrador de sede/
    );
  });

  test('El lote aprobado queda DADO_DE_BAJA, no AGOTADO, y sale de los listados operables', () => {
    const stockAntes = loteService.listar(sesionSuperadmin, { sedeId: 1 })
      .find((l) => l.id === lote.id);
    assert.equal(stockAntes.cantidad_total_unidades, 100, 'El lote arranca con existencias');

    const solicitud = solicitudEliminacionService.crear(sesionSuperadmin, {
      registro_id: lote.id,
      motivo: 'Lote retirado por alerta sanitaria'
    });
    solicitudEliminacionService.resolver(sesionSuperadmin2, solicitud.id, { decision: 'APROBADA' });

    // El estado NO debe colapsar a AGOTADO: eso lo hacía indistinguible de un lote
    // sin existencias y dejaba la baja sin rastro visible.
    const visibles = loteService.listar(sesionSuperadmin, { sedeId: 1, incluirDadosDeBaja: true });
    const dadoDeBaja = visibles.find((l) => l.id === lote.id);
    assert.ok(dadoDeBaja, 'El lote dado de baja debe seguir apareciendo en el histórico');
    assert.equal(dadoDeBaja.estado, 'DADO_DE_BAJA');
    assert.equal(dadoDeBaja.estado_manual, 'DADO_DE_BAJA');
    assert.equal(dadoDeBaja.baja_motivo, 'Lote retirado por alerta sanitaria');
    assert.equal(Number(dadoDeBaja.baja_usuario_id), sesionSuperadmin2.id);
    assert.ok(dadoDeBaja.baja_fecha, 'Debe quedar constancia de la fecha de la baja');

    // Y no debe offerederse donde el stock es operable: sigue teniendo 100 unidades.
    const operables = loteService.listar(sesionSuperadmin, { sedeId: 1 });
    assert.equal(
      operables.find((l) => l.id === lote.id),
      undefined,
      'Un lote dado de baja con existencias no puede salir en despacho, órdenes ni intercambios'
    );
  });

  test('El resumen de vencimientos sigue excluuyendo los lotes dados de baja', () => {
    const antes = db.prepare(`
      SELECT COUNT(*) AS total FROM lotes
      WHERE sede_id = 1 AND (estado_manual IS NULL OR estado_manual != 'DADO_DE_BAJA')
        AND cantidad_total_unidades > 0
    `).get().total;
    assert.ok(antes >= 1);

    const solicitud = solicitudEliminacionService.crear(sesionSuperadmin, {
      registro_id: lote.id,
      motivo: 'Retiro por vencimiento'
    });
    solicitudEliminacionService.resolver(sesionSuperadmin2, solicitud.id, { decision: 'APROBADA' });

    const despues = db.prepare(`
      SELECT COUNT(*) AS total FROM lotes
      WHERE sede_id = 1 AND (estado_manual IS NULL OR estado_manual != 'DADO_DE_BAJA')
        AND cantidad_total_unidades > 0
    `).get().total;
    assert.equal(despues, antes - 1);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Eliminación definitiva de trabajadores
  // ─────────────────────────────────────────────────────────────────────────────

  test('Eliminar definitivamente anonimiza la fila y conserva el histórico', () => {
    const roles = usuarioService.listarRoles(sesionWilmer);
    const rolUsuario = roles.find((r) => r.nombre === 'USUARIO');
    const creado = usuarioService.crear(sesionWilmer, {
      nombre: 'Trabajador Temporal',
      username: 'temp_bajas',
      password: 'Password123*',
      rol_id: rolUsuario.id,
      sede_id: 1
    });

    // Un movimiento que lo referencia: es lo que no se puede romper.
    loteService.ajustarCantidades(sesionSuperadmin, lote.id, {
      cantidad_cajas: 9,
      cantidad_unidades_sueltas: 0,
      motivo: 'Conteo físico'
    });
    const eventosAntes = auditoriaRepository.findAll({}).length;
    assert.ok(eventosAntes > 0);

    const eliminado = usuarioService.eliminarDefinitivo(sesionWilmer, creado.id);

    assert.equal(eliminado.estado, 'ELIMINADO');
    assert.equal(eliminado.nombre, 'Usuario eliminado');
    assert.match(eliminado.username, /^eliminado_\d+_\d+$/);
    assert.equal(eliminado.password_hash, undefined, 'El hash nunca sale del servicio');
    assert.ok(eliminado.eliminado_en);
    assert.equal(Number(eliminado.eliminado_por), sesionWilmer.id);

    // La fila NO se borra: es la que sostiene auditoría, órdenes y despachos.
    const fila = db.prepare('SELECT id FROM usuarios WHERE id = ?').get(creado.id);
    assert.ok(fila, 'La fila debe seguir existiendo');
    // El username original queda libre para poder reutilizarse.
    assert.ok(!usuarioRepository.findByUsername('temp_bajas'));

    // Y el historial de auditoría se conserva intacto.
    assert.ok(auditoriaRepository.findAll({}).length >= eventosAntes);
    const evento = auditoriaRepository.findAll({ modulo: 'USUARIOS' })
      .find((e) => e.accion === 'ELIMINAR_USUARIO');
    assert.ok(evento, 'La eliminación debe quedar auditada');
  });

  test('El usuario eliminado no puede autenticarse y desaparece del listado', () => {
    const roles = usuarioService.listarRoles(sesionWilmer);
    const rolUsuario = roles.find((r) => r.nombre === 'USUARIO');
    const creado = usuarioService.crear(sesionWilmer, {
      nombre: 'Worker Test',
      username: 'worker_test',
      password: 'Password123*',
      rol_id: rolUsuario.id,
      sede_id: 1
    });

    // Antes de eliminarlo entra.
    assert.ok(authService.login('worker_test', 'Password123*').session_token);

    usuarioService.eliminarDefinitivo(sesionWilmer, creado.id);

    // La credencial original deja de servir: el estado ya no es ACTIVO.
    assert.throws(() => authService.login('worker_test', 'Password123*'), /incorrectos/);
    // Tampoco el username nuevo sirve como atajo: el hash es aleatorio.
    const eliminado = usuarioRepository.findById(creado.id);
    assert.throws(() => authService.login(eliminado.username, 'Password123*'), /incorrectos/);

    const listado = usuarioService.listar(sesionWilmer);
    assert.equal(listado.find((u) => u.id === creado.id), undefined);
    assert.ok(usuarioService.listar(sesionWilmer, { incluirEliminados: true })
      .find((u) => u.id === creado.id));
  });

  test('La cuenta principal y el auto-borrado quedan protegidos', () => {
    // El auto-borrado se comprueba antes que nada: borrarse dejaría el sistema sin
    // su único administrador principal, así que el error no puede depender de
    // haber ya escrito algo en la base.
    assert.throws(
      () => usuarioService.eliminarDefinitivo(sesionWilmer, sesionWilmer.id),
      /No puedes eliminar tu propia cuenta/
    );

    // El guard de "cuenta principal" se comprueba sobre OTRA cuenta con el flag
    // puesto: la cuenta principal real ES la de la sesión, y para Wilmer las dos
    // comprobaciones coinciden. Con un segundo marcado, la segunda guarda es la
    // que actúa y quedaría sin cubrir de otro modo.
    const otro = usuarioRepository.findByUsername('admin');
    db.prepare('UPDATE usuarios SET es_superadmin_principal = 1 WHERE id = ?').run(otro.id);
    assert.throws(
      () => usuarioService.eliminarDefinitivo(sesionWilmer, otro.id),
      /No puedes eliminar la cuenta principal/
    );

    assert.equal(usuarioRepository.findByUsername('wilmer').estado, 'ACTIVO');
    assert.equal(usuarioRepository.findByUsername('admin').estado, 'ACTIVO');
  });

  test('Un fallo de auditoría no deja el usuario a medias', () => {
    const roles = usuarioService.listarRoles(sesionWilmer);
    const rolUsuario = roles.find((r) => r.nombre === 'USUARIO');
    const creado = usuarioService.crear(sesionWilmer, {
      nombre: 'Worker Auditado',
      username: 'worker_auditado',
      password: 'Password123*',
      rol_id: rolUsuario.id,
      sede_id: 1
    });

    const original = auditoriaRepository.registrar;
    // La anonimización y su auditoría comparten transacción. Si la auditoría
    // falla, el usuario debe seguir intacto y CON SU CREDENCIAL: el estado
    // intermedio "anonimizado sin rastro" es peor que no hacer nada, porque ni
    // existe la baja ni consta que alguien la intentó.
    auditoriaRepository.registrar = () => { throw new Error('FALLO DE AUDITORÍA SIMULADO'); };

    try {
      assert.throws(
        () => usuarioService.eliminarDefinitivo(sesionWilmer, creado.id),
        /FALLO DE AUDITORÍA SIMULADO/
      );
    } finally {
      auditoriaRepository.registrar = original;
    }

    const tras = usuarioRepository.findById(creado.id);
    assert.equal(tras.estado, 'ACTIVO', 'no puede quedar ELIMINADO sin auditoría');
    assert.equal(tras.username, 'worker_auditado');
    assert.equal(tras.eliminado_en, null);
    assert.equal(auditoriaRepository.findAll({ modulo: 'USUARIOS' })
      .filter((e) => e.accion === 'ELIMINAR_USUARIO').length, 0);

    // Y el reintento funciona, sin dejar a medias nada.
    assert.equal(usuarioService.eliminarDefinitivo(sesionWilmer, creado.id).estado, 'ELIMINADO');
  });

  test('La credencial del eliminado sigue siendo un hash bcrypt válido', () => {
    const roles = usuarioService.listarRoles(sesionWilmer);
    const rolUsuario = roles.find((r) => r.nombre === 'USUARIO');
    const creado = usuarioService.crear(sesionWilmer, {
      nombre: 'Worker Hash',
      username: 'worker_hash',
      password: 'Password123*',
      rol_id: rolUsuario.id,
      sede_id: 1
    });
    const hashOriginal = usuarioRepository.findById(creado.id).password_hash;

    usuarioService.eliminarDefinitivo(sesionWilmer, creado.id);

    const hash = db.prepare('SELECT password_hash FROM usuarios WHERE id = ?').get(creado.id).password_hash;
    assert.match(hash, /^\$2[aby]\$\d{2}\$/, 'debe seguir siendo un hash bcrypt, no bytes arbitrarios');
    assert.notEqual(hash, hashOriginal);

    // Y la comparación no debe LANZAR: un formato desconocido hace que bcrypt
    // lance "illegal arguments" en vez de devolver false, y eso rompería el login
    // con una excepción en lugar de credenciales incorrectas.
    assert.equal(bcrypt.compareSync('Password123*', hash), false);
    assert.equal(bcrypt.compareSync('cualquier cosa', hash), false);
  });

  test('Solo el superadmin principal puede eliminar usuarios', () => {
    const otroSuperadmin = usuarioRepository.findByUsername('admin');
    const sesionOtro = {
      id: otroSuperadmin.id,
      rol_nombre: 'SUPERADMIN',
      es_superadmin_principal: 0,
      sede_id: null
    };
    const roles = usuarioService.listarRoles(sesionWilmer);
    const rolUsuario = roles.find((r) => r.nombre === 'USUARIO');
    const creado = usuarioService.crear(sesionWilmer, {
      nombre: 'Target',
      username: 'target_x',
      password: 'Password123*',
      rol_id: rolUsuario.id,
      sede_id: 1
    });

    assert.throws(
      () => usuarioService.eliminarDefinitivo(sesionOtro, creado.id),
      /Acceso denegado: solo el superadministrador principal/
    );
  });
});
