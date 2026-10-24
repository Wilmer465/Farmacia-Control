# Facturación comercial y habilitación DIAN

## Flujo implementado

Farmacia-Control mantiene los datos comerciales, la cola y la evidencia de transmisión en SQLite. La factura consume inventario por lote en la transacción local; la cola no envía en segundo plano. El operador prepara el UBL, lo firma y verifica localmente, y puede iniciar manualmente el envío únicamente a habilitación. La pantalla exige conexión, un `TestSetId` de la DIAN y confirmación explícita. Producción no transmite.

La operación de habilitación usa el WSDL SOAP oficial y `SendTestSetAsync`: cada documento firmado se coloca en un ZIP con el nombre XML conservado, se firma el sobre SOAP con el certificado cliente y se persiste el XML de solicitud antes de abrir la conexión. La respuesta auténtica con `ZipKey` deja el documento `ENVIADO`, que significa recibido para procesamiento asíncrono, no aceptado. `GetStatusZip` solo actualiza a validado o rechazado cuando encuentra el mismo nombre de XML y CUFE/CUDE, y recibe los códigos DIAN correspondientes. Un resultado de transporte incierto queda bloqueado para reenvío automático y requiere conciliación manual para evitar duplicados.

La tabla `facturacion_transmisiones_dian` conserva solicitudes/respuestas SOAP, código HTTP, resultado, `ZipKey`, mensajes y hash SHA-256 del documento. La auditoría y `facturacion_eventos_dian` registran los envíos, consultas, errores y transiciones; un GetStatusZip sin coincidencia conserva `ENVIADO` y deja evidencia sin aceptar el documento. La aplicación nunca presenta fixtures de prueba como respuestas reales. El certificado PKCS#12 y su PIN se leen de la bóveda cifrada del proceso principal; la validación exige vigencia, cadena contra raíces confiables configuradas y comprobación fail-closed de CRL firmada y vigente. No se permiten redirecciones en SOAP/CRL ni endpoints alternos al host oficial de habilitación.

La integración SQLite se ejecuta con `pnpm run test:dian:electron`: el runner inicia Electron con `ELECTRON_RUN_AS_NODE=1` para usar el ABI nativo 128 de `better-sqlite3`. Los fixtures SOAP y reemplazos de firma/revocación de ese test son exclusivamente sintéticos; la firma criptográfica, XML/UBL, ZIP y parsing SOAP también tienen pruebas puras separadas en `tests/business-rules/`.

## Configuración para la prueba del titular

1. Provisionar el certificado cliente DIAN válido y su contraseña mediante las variables `DIAN_CERTIFICATE_PATH`, `DIAN_CERTIFICATE_PASSWORD`, `DIAN_TRUSTED_CA_BUNDLE`, junto con el PIN y clave técnica del software en el proceso principal. No incluir esos valores en el repositorio ni en renderer.
2. Guardar la autorización y datos tributarios del emisor correspondientes al rango y modo de habilitación asignados por DIAN.
3. Ingresar en configuración el `TestSetId` entregado al titular en el portal DIAN.
4. Crear documentos, firmarlos localmente, revisar el XML y transmitir manualmente desde la cola. Consultar el ZIP hasta obtener respuesta auténtica.
5. Completar el set oficial del software propio en el portal del titular. La aplicación no declara por sí misma software habilitado ni inicia operación.

## Bloqueos y límites comprobables

- No se hizo una llamada real a DIAN en este entorno: no están provisionados un certificado empresarial válido, el `TestSetId` del titular ni el set oficial. Los tests crean certificados temporales y respuestas SOAP sintéticas únicamente dentro de `tests/`; no prueban confianza de una CA DIAN ni aceptación del servicio.
- No hay reenvío automático cuando se pierde la respuesta de `SendTestSetAsync`. El operador debe consultar/conciliar el intento en DIAN antes de decidir una acción; no se debe borrar el registro de transmisión para forzar un segundo envío.
- `SendTestSetAsync` es el flujo de set de habilitación. Esta implementación no envía documentos a producción ni implementa `SendBillSync` en ambiente de operación.
- Los CRL se validan desde las URL publicadas por el certificado y el proceso falla cerrado si la cadena no publica CRL alcanzables por IPv4, vigentes y verificables con la CA emisora. Se debe probar contra la cadena real del titular; aún no hay una fuente OCSP configurada.
- El XML se valida localmente contra UBL 2.1 y reglas fiscales implementadas; esto no sustituye la validación integral de los artefactos/casos de la caja DIAN ni la respuesta de habilitación real. Requiere ejecutar el set oficial vigente del titular.
- XML, solicitudes y respuestas quedan en SQLite local. La política de respaldo, retención legal, entrega al adquirente, representación gráfica y conservación de ApplicationResponse deben concretarse con el titular antes de operación.

## Responsabilidades

El cliente es titular de los derechos patrimoniales cedidos mediante contrato y ejecuta su propio registro y habilitación DIAN. Esta aplicación se limita a ese cliente; no incluye alta multiempresa ni prestación del sistema a terceros. El titular configura la clasificación fiscal con su asesor contable, provisiona y custodia su certificado y secretos, revisa la resolución y rango, verifica cada resultado DIAN y define respaldo y conservación.

## Fuentes oficiales (consultadas 23-10-2026)

- [Anexo Técnico Factura Electrónica de Venta 1.9, DIAN](https://www.dian.gov.co/impuestos/factura-electronica/Documents/Anexo-Tecnico-Factura-Electronica-de-Venta-vr-1-9.pdf): perfiles UBL, extensiones, firmas y servicios.
- [WSDL oficial DIAN de habilitación](https://vpfe-hab.dian.gov.co/WcfDianCustomerServices.svc?singleWsdl): endpoint, `SendTestSetAsync` y `GetStatusZip`.
- [Resolución DIAN 000227 de 2025](https://www.dian.gov.co/normatividad/Paginas/Resolucion-000227-del-23092025.aspx): compilación regulatoria del sistema de facturación.
- [Proceso de registro y habilitación](https://micrositios.dian.gov.co/sistema-de-facturacion-electronica/proceso-de-registro-y-habilitacion-como-facturador-electronico/): trámite y set de pruebas del titular.
