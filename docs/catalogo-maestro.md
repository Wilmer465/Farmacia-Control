# Catálogo maestro local de medicamentos

## Fuente incorporada

La actualización usa el recurso oficial de INVIMA **Código Único de Medicamentos Vigentes** (`i7cb-raxc`) publicado en Datos Abiertos Colombia. El recurso se consulta desde cada instalación y se conserva en la SQLite local. El portal indicaba última actualización el 16 de octubre de 2026 y frecuencia mensual. El archivo de actualización registra URL, fecha, conteos, hash, resultado y errores.

Se consolidan las filas repetidas por expediente/CUM para conservar todos los principios activos y roles de fabricante e importador. Los valores que entrega la fuente quedan con procedencia por campo (`fuente`, URL, fecha y estado `VERIFICADO`). El IUM se guarda cuando INVIMA lo publica; no se genera si está vacío.

### Validación nacional en SQLite temporal

El 28 de octubre de 2026 se descargó e importó el conjunto completo usando el servicio de producción y las migraciones actuales sobre `:memory:`. Resultado: 156.913 filas fuente, 65.774 CUM consolidados, 91.139 filas agrupadas como duplicadas, cero filas inválidas; 50.486 CUM activos, 15.288 inactivos, 13.649 con IUM y 24.801 con importador. Esta validación no sembró el catálogo en la base de datos de desarrollo ni en un equipo de usuario.

### Validación funcional, almacenamiento y rendimiento

El 28 de octubre de 2026 se importó el recurso completo en una SQLite temporal en disco (ningún dato del usuario). Una segunda actualización completa descargó 156.913 filas, consolidó 65.774 CUM y agrupó 91.139 filas repetidas; los 65.774 registros quedaron `sinCambios`, lo que comprueba la idempotencia. La segunda actualización tardó 77,5 s en este equipo.

La SQLite temporal llegó a 546,69 MiB (573.243.392 bytes). El análisis de páginas encontró 139.952 páginas de 4 KiB, de las cuales 67.618 (264,17 MiB; 48,3 %) estaban libres. El importador anterior creaba `catalogo_cum_temp` como tabla persistente, la llenaba con todas las columnas sanitarias y la eliminaba al terminar: SQLite conservaba esas páginas libres en el archivo. El catálogo activo era de 65.774 CUM y no había una tabla de staging persistente al medir. No se obtuvo el reparto por tabla/índice mediante `dbstat`: la extensión está compilada en Electron, pero su consulta sobre estos archivos terminaba el proceso; Python 3.14 no incluye esa virtual table. Por tanto, no se atribuye un costo exacto a cada campo.

La corrección cambia staging a `TEMP TABLE`, sin quitar columnas, identificadores ni procedencia. La migración 038 compacta una vez las SQLite existentes mediante `VACUUM` y `ANALYZE`; startupRecovery incluye el scratch de VACUUM en la reserva de espacio y conserva su respaldo previo. Esta migración se probó sobre copias sintéticas, no se ejecutó en la base de desarrollo ni en una base de usuario.

Una copia sintética del catálogo completo compactada después de crear FTS5 quedó en 356,30 MiB (373.604.352 bytes), 190,39 MiB menos que el archivo anterior. Conservó 65.774 filas, `quick_check = ok`, 91.212 páginas ocupadas y cero libres. Las páginas activas antes de FTS ocupaban 282,55 MiB; el índice FTS5 y sus estructuras agregaron aproximadamente 73,74 MiB en esta copia. La diferencia frente al archivo anterior refleja esa estructura y la compactación de páginas libres; no es una medición aislada del costo de cada columna. La actualización completa posterior descargó 156.913 filas, dejó 65.774 CUM sin cambios, registró `EXITO`, terminó aproximadamente en 75 s (inicio/última escritura del archivo temporal) y no dejó `catalogo_cum_temp` en `main` ni páginas libres. El archivo de medición era una copia temporal; no se escribió Supabase.

Electron 32.3.3 usa SQLite 3.49.2 con `ENABLE_FTS5` y tokenizador `trigram` compatible. FTS5 indiza producto, descripción comercial, principio activo, fabricante, laboratorio, concentración, forma farmacéutica y registro sanitario; los disparadores conservan el índice al insertar/actualizar/eliminar. Una consulta de servicio `acetaminofen` sobre las 65.774 filas devolvió 20 resultados en 95,08 ms, frente a 1.093 ms medidos antes sin FTS (comparación de una medición representativa). La suite sintética valida fragmentos por ingrediente, fabricante, marca, concentración y presentación; para términos menores de tres caracteres usa el fallback `LIKE`. Los GTIN sintéticos no se asociaron a productos: la fuente oficial no los suministra.

En la instalación Electron de prueba con una base SQLite temporal y migraciones actuales se verificó el flujo de escáner por entrada de teclado: un GTIN válido mostró el producto y el formulario de recepción; un GTIN desconocido quedó en `catalogo_codigos_pendientes`; el GTIN compartido por dos presentaciones mostró ambos CUM sin seleccionar uno; y un checksum inválido mostró error y limpió el producto previamente seleccionado. Antes de confirmar recepción, una consulta de solo lectura confirmó cero medicamentos, lotes y movimientos. La operación de recepción explícita se probó con una prueba SQLite sintética y generó un medicamento, un lote y un movimiento. No había lector físico conectado, así que se probó la ruta de teclado, no el hardware.

La simulación de fallos cubre descarga fallida antes de importar, desconexión tras recibir un bloque y fallo de auditoría durante el merge; cada caso conserva el catálogo anterior. La restauración sintética comprueba la copia del catálogo y de los GTIN pendientes. La disponibilidad offline de lectura se valida por persistencia local y ausencia de una consulta remota en el camino de escaneo; no se desconectó físicamente la red del equipo durante la sesión.

En esta fase las pruebas se ejecutaron con el binario de Electron como Node (`ELECTRON_RUN_AS_NODE=1`): la ejecución conjunta terminó con 39/39 casos aprobados (`catalogo_maestro_local.test.js` 19/19 y `startupRecovery.test.js` 20/20). Incluye dos bases sintéticas independientes con hashes y CUM distintos, y una segunda pasada de migraciones sin ejecutar 037/038 otra vez. La prueba específica de aislamiento confirmó que tampoco se incluye `catalogo_codigos_pendientes` en `SYNC_TABLES`. Lint terminó con código 0. La validación no inicia la interfaz instalada ni usa un lector físico.

La migración 037 es opcional respecto de FTS5: Electron 32.3.3 lo trae habilitado y crea/reconstruye el índice; una compilación SQLite sin FTS5 registra la migración y usa el fallback `LIKE`, de modo que una instalación existente no queda bloqueada por un índice de búsqueda opcional. La migración 038 es una migración registrada y no se repite en los arranques siguientes; `startupRecovery` reserva el scratch de `VACUUM`, valida el respaldo y exige espacio antes de promover la base preparada.

## GTIN/EAN e identificadores internacionales

El recurso oficial vigente consultado no contiene GTIN/EAN. Por ello la actualización INVIMA no rellena códigos de barras. La recepción busca primero entre los GTIN ya conocidos localmente; un resultado con varios CUM exige selección explícita. Un GTIN desconocido se anota en `catalogo_codigos_pendientes` y en auditoría sin crear un medicamento ni modificar lotes.

Fuentes complementarias evaluadas:

- [RxNorm (NLM, EE. UU.)](https://www.nlm.nih.gov/research/umls/rxnorm/overview.html) normaliza nombres genéricos y de marca estadounidenses, con ingrediente, concentración y forma farmacéutica. No es un registro colombiano ni ofrece por sí solo una clave probada para unir un CUM.
- [DailyMed (NLM)](https://dailymed.nlm.nih.gov/dailymed/app-support-web-services.cfm) publica etiquetas SPL y datos de NDC/empaque estadounidenses; NDC no es GTIN ni CUM.
- [openFDA NDC](https://open.fda.gov/apis/drug/ndc/searchable-fields/) expone marca, nombre genérico, ingrediente, fabricante y empaques asociados a NDC. No justifica trasladar esos datos a un producto colombiano por semejanza textual.
- [Verified by GS1](https://www.gs1.org/services/verified-by-gs1) puede verificar GTIN y datos de marca/titular, pero no se dispuso de credenciales ni acceso de consulta masiva en esta fase.

No se importa ni se enlaza automáticamente ningún producto extranjero. Las fuentes estadounidenses no se incorporan al catálogo hasta disponer de identificadores comunes y una regla de correspondencia revisable; no hay acceso de proveedor para consultar GTIN en lote.

## Aislamiento y actualización segura

`catalogo_cum`, `catalogo_empaques` y `catalogo_actualizaciones` se excluyen del allowlist de sincronización en nube. La importación descarga, valida y prepara una tabla temporal; el merge es transaccional. Si no hay datos válidos o falla la descarga/validación, la versión de catálogo existente se conserva. El inventario sigue residiendo en sus tablas actuales y no se cambia al actualizar la referencia.

Los eventos con `modulo = 'CATALOGO_CUM'` también se excluyen al extraer la tabla compartida `auditoria` para sincronización. Esto evita que la auditoría del catálogo se suba indirectamente aunque sus tablas estén fuera del allowlist. No se ejecutó ninguna escritura, eliminación ni prueba de conectividad contra Supabase.

## Pendiente de integración

- Fuente confiable con GTIN/EAN, registros CUM e IUM relacionados para enriquecer productos colombianos.
- Alineación supervisada de nombres, principios activos, marcas, concentraciones y presentaciones con RxNorm/DailyMed.
- Verificar y retirar cualquier copia histórica del catálogo que hubiera sido sincronizada antes de excluir estas tablas; no se ejecutó ninguna operación remota.
- Probar con lector físico y hacer una ejecución de escritorio con la red del equipo realmente desconectada.
- Probar el ciclo de actualización en dos PCs independientes; la inspección y las pruebas disponibles solo verifican que cada SQLite es local, sin transferencia entre equipos.
- No existe un paquete local comprimido de actualización: el servicio consulta páginas JSON de Socrata y calcula un hash del contenido normalizado para idempotencia. Ese hash no valida un archivo comprimido ni una firma; el empaquetado gzip e integridad de artefacto quedan pendientes.
- Obtener un perfil byte a byte por tabla/índice/campo en una herramienta SQLite que exponga `dbstat`, para separar el peso de la tabla base, FTS5 y los índices existentes.
