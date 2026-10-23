# Plan de optimización — escritorio

## Cambios aplicados en esta fase

| Cambio | Motivo | Impacto esperado | Riesgo / reversión |
|---|---|---|---|
| `syncHabilitado` requiere URL y `SUPABASE_SERVICE_ROLE_KEY`; planificador se detiene si falta configuración. | Antes una publishable key podía activar tareas que fallaban por falta de service role. | Elimina intentos periódicos fallidos por configuración incompleta. | Bajo; revertir la condición y guardia si se restaura otra interfaz de autenticación compatible. |
| Cabecera `apikey` usa publishable key si existe y, si no, la service role requerida. | Evita enviar `apikey` vacío con la configuración de solo service role. | Alinea autenticación REST con la credencial configurada. | Bajo; prueba unitaria/estática, requiere smoke test cloud para confirmar credenciales reales. |
| Plantilla `.env.example` no contiene valor de proyecto ni clave y advierte que service role no debe distribuirse. | Evita confundir claves publicables con secretas y evita copiar una clave publicada como si fuera service role. | Reduce errores de configuración y exposición accidental. | Bajo; rellenar localmente las variables correctas según el entorno controlado. |
| Añadido diagnóstico SQLite de solo lectura. | Facilita inspeccionar integridad, conteos y metadatos sin mostrar contenido de filas. | Medición reproducible sin editar la BD. | Bajo; revertir eliminando el script. |

## Trabajo no ejecutado por falta de evidencia segura

| Prioridad | Trabajo pendiente | Evidencia / criterio antes de implementarlo | Reversión |
|---|---|---|---|
| Crítica | Mover llamadas con `service_role` fuera de cada escritorio a un servicio central autenticado con autorización por sede. | Endpoint central desplegable, identidad de usuario, claims de sede validados, sesiones/renovación, política de Storage y pruebas de aislamiento. | Mantener la ruta anterior apagada; volver a activar solo tras validar una release y rotación de credenciales. |
| Alta | Reemplazar el cursor compartido y upsert de filas por sync incremental segura con confirmación/idempotencia por operación y conflicto de inventario explícito. | Definir fuente de verdad por operación, IDs estables y reglas de conflicto; suite multi-dispositivo y datos de staging. | Mantener la tabla actual; migración aditiva y rollback por feature flag. |
| Alta | Medir base remota, Storage, transferencia y crecimiento. | Acceso dashboard de solo lectura y fecha de inicio de métricas. | No aplica; consultas y panel de lectura solamente. |
| Media | Instrumentar solicitudes, bytes, latencia, reintentos y páginas. | Definir retención de métricas sin PII/secretos y punto de exportación. | Desactivar logging/contadores sin cambiar datos de negocio. |
| Media | Revisar índices PostgreSQL y SQLite candidatos. | `EXPLAIN` de consultas reales, tamaños de índices y estadísticas; preservar unicidad/FK. | Crear primero índices nuevos; eliminación solo tras comparación y backup verificado. |
| Media | Definir backup conjunto de PostgreSQL y blobs. | Identificar plan real, herramientas/retención vigentes y prueba aislada de recuperación. | Mantener copias anteriores hasta validar restauración. |

## Umbrales operativos propuestos

Cuando haya métricas verificables, emitir aviso preventivo al 60 % de la cuota aplicable, revisión/acción al 70 % y estado crítico al 85 %. Son umbrales sugeridos, no alertas ya configuradas ni garantía de sostenibilidad del plan gratuito. Medir por separado base de datos, Storage, egress y espacio de backup.

## Decisiones de no cambio

- No se eliminaron datos, índices, tablas, firmas, auditorías ni movimientos.
- No se aplicaron migraciones SQLite ni SQL remoto: no existe justificación de compactación basada en la copia pequeña observada ni acceso al proyecto remoto.
- No se cambiaron `synchronous`, WAL o política de claves foráneas: se mantienen las garantías locales.
- No se añadió una segunda base, paquete ni mecanismo de sincronización.
- Se preservó la retirada local preexistente de retención automática de respaldos; el nuevo plan describe su riesgo de crecimiento sin reintroducir borrado automático.

## Reversión de cambios aplicados

Revertir por separado la función `crearConfiguracionSupabase`/condición de habilitación, la guardia del planificador, el cambio de plantilla y el script diagnóstico. No requiere restaurar base ni ejecutar migraciones. El resto de archivos locales preexistentes debe mantenerse intacto.
