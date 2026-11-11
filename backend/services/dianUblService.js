const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { calcularCodigoSeguridadSoftware } = require('./dianControlCodes');

const NS = {
  inv: 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2',
  cn: 'urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2',
  dn: 'urn:oasis:names:specification:ubl:schema:xsd:DebitNote-2',
  cac: 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
  cbc: 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',
  ext: 'urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2',
  sts: 'dian:gov:co:facturaelectronica:Structures-2-1',
};
const ROOTS = { FACTURA: ['Invoice', 'inv'], NOTA_CREDITO: ['CreditNote', 'cn'], NOTA_DEBITO: ['DebitNote', 'dn'] };
const SCHEMAS = { FACTURA: 'UBL-Invoice-2.1.xsd', NOTA_CREDITO: 'UBL-CreditNote-2.1.xsd', NOTA_DEBITO: 'UBL-DebitNote-2.1.xsd' };

function xml(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}
function required(value, label) {
  if (value === undefined || value === null || String(value).trim() === '') throw new Error(`Falta ${label} para generar UBL.`);
  return String(value).trim();
}
function amount(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw new Error('El XML contiene un valor monetario inválido.');
  return n.toFixed(2);
}
function decimal(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new Error(`El valor fiscal ${label} debe ser un decimal no negativo.`);
  return number;
}
function cents(value) { return Math.round((value + Number.EPSILON) * 100) / 100; }
function tag(name, value, attrs = '') { return `<cbc:${name}${attrs}>${xml(value)}</cbc:${name}>`; }
function party(p, role) {
  const id = required(p?.numero_documento, `${role}: número de identificación`);
  const nombre = required(p?.nombre, `${role}: nombre legal`);
  const tipo = required(p?.tipo_identificacion || p?.codigo_identificacion_dian, `${role}: código de identificación DIAN`);
  const direccion = required(p?.direccion, `${role}: dirección`);
  const ciudad = required(p?.municipio, `${role}: municipio`);
  const departamento = required(p?.departamento, `${role}: departamento`);
  const pais = required(p?.codigo_pais || 'CO', `${role}: país`);
  const correo = p?.correo ? `<cac:Contact>${tag('ElectronicMail', p.correo)}</cac:Contact>` : '';
  const idAttrs = ` schemeID="${xml(tipo)}"`;
  const identification = `${id}${p?.digito_verificacion ? `-${p.digito_verificacion}` : ''}`;
  return `<cac:${role}><cac:Party><cac:PartyName>${tag('Name', nombre)}</cac:PartyName><cac:PostalAddress>${tag('ID', required(p.codigo_municipio, `${role}: código de municipio`))}${tag('CityName', ciudad)}${tag('CountrySubentity', departamento)}${tag('CountrySubentityCode', required(p.codigo_departamento, `${role}: código de departamento`))}<cac:AddressLine>${tag('Line', direccion)}</cac:AddressLine><cac:Country>${tag('IdentificationCode', pais)}</cac:Country></cac:PostalAddress><cac:PartyTaxScheme>${tag('RegistrationName', nombre)}${tag('CompanyID', identification, idAttrs)}<cac:TaxScheme>${tag('ID', required(p.impuesto_id, `${role}: código del esquema tributario`))}${tag('Name', required(p.impuesto_nombre, `${role}: nombre del esquema tributario`))}</cac:TaxScheme></cac:PartyTaxScheme><cac:PartyLegalEntity>${tag('RegistrationName', nombre)}${tag('CompanyID', identification, idAttrs)}</cac:PartyLegalEntity>${correo}</cac:Party></cac:${role}>`;
}

function generarExtensionesDian(dian, ambiente, codigoUnico) {
  if (!dian) return '';
  const autorizacion = required(dian.autorizacion, 'número de autorización de numeración DIAN');
  const desde = required(dian.fecha_inicio_autorizacion, 'inicio de autorización DIAN');
  const hasta = required(dian.fecha_fin_autorizacion, 'fin de autorización DIAN');
  const prefijo = required(dian.prefijo, 'prefijo autorizado DIAN');
  const rangoDesde = required(dian.rango_desde, 'inicio del rango autorizado');
  const rangoHasta = required(dian.rango_hasta, 'fin del rango autorizado');
  const proveedorNit = required(dian.proveedor_nit, 'NIT del proveedor de software sin DV');
  const proveedorDv = required(dian.proveedor_dv, 'DV del proveedor de software');
  const softwareId = required(dian.software_id, 'SoftwareID autorizado');
  const pin = required(dian.software_pin, 'SoftwarePIN');
  if (!/^\d{14}$/.test(autorizacion) || !/^\d{1,9}$/.test(String(rangoDesde)) || !/^\d{1,9}$/.test(String(rangoHasta))) throw new Error('Los datos de autorización DIAN no tienen el formato exigido.');
  if (!/^\d{3,15}$/.test(proveedorNit) || !/^\d$/.test(proveedorDv)) throw new Error('La identificación DIAN del proveedor de software no es válida.');
  if (!codigoUnico || !/^[a-f0-9]{96}$/i.test(codigoUnico)) throw new Error('Se requiere un CUFE/CUDE SHA-384 para formar la extensión DIAN.');
  const agency = ' schemeAgencyID="195" schemeAgencyName="CO, DIAN (Dirección de Impuestos y Aduanas Nacionales)"';
  const idProveedor = ` schemeID="${xml(proveedorDv)}" schemeName="31"${agency}`;
  const securityCode = calcularCodigoSeguridadSoftware({ softwareId, pin, numero: required(dian.numero_documento, 'número del documento para la huella de software') });
  const dianXml = `<sts:DianExtensions><sts:InvoiceControl><sts:InvoiceAuthorization>${xml(autorizacion)}</sts:InvoiceAuthorization><sts:AuthorizationPeriod>${tag('StartDate', desde)}${tag('EndDate', hasta)}</sts:AuthorizationPeriod><sts:AuthorizedInvoices>${tag('Prefix', prefijo)}<sts:From>${xml(rangoDesde)}</sts:From><sts:To>${xml(rangoHasta)}</sts:To></sts:AuthorizedInvoices></sts:InvoiceControl><sts:InvoiceSource><cbc:IdentificationCode listAgencyID="6" listAgencyName="United Nations Economic Commission for Europe" listSchemeURI="urn:oasis:names:specification:ubl:codelist:gc:CountryIdentificationCode-2.1">CO</cbc:IdentificationCode></sts:InvoiceSource><sts:SoftwareProvider><sts:ProviderID${idProveedor}>${xml(proveedorNit)}</sts:ProviderID><sts:softwareID${agency}>${xml(softwareId)}</sts:softwareID></sts:SoftwareProvider><sts:SoftwareSecurityCode${agency}>${securityCode}</sts:SoftwareSecurityCode><sts:AuthorizationProvider><sts:AuthorizationProviderID schemeID="4" schemeName="31"${agency}>800197268</sts:AuthorizationProviderID></sts:AuthorizationProvider><sts:QRCode>${xml(`${ambiente === '1' ? 'https://catalogo-vpfe.dian.gov.co' : 'https://catalogo-vpfe-hab.dian.gov.co'}/document/searchqr?documentkey=${codigoUnico}`)}</sts:QRCode></sts:DianExtensions>`;
  return `<ext:UBLExtensions><ext:UBLExtension><ext:ExtensionContent>${dianXml}</ext:ExtensionContent></ext:UBLExtension></ext:UBLExtensions>`;
}

function generarXml(documento, opciones = {}) {
  const tipo = documento?.tipo_documento || 'FACTURA';
  const rootInfo = ROOTS[tipo];
  if (!rootInfo) throw new Error('Tipo de documento electrónico no soportado.');
  const [root, prefix] = rootInfo;
  const config = opciones.configuracion || {};
  const emisor = opciones.emisor || config.emisor;
  const cliente = opciones.cliente || documento.cliente;
  const ambiente = config.ambiente === 'PRODUCCION' ? '1' : '2';
  const id = required(documento.numero, 'número autorizado');
  const fecha = required(documento.fecha, 'fecha de emisión').slice(0, 10);
  const moneda = required(documento.moneda || 'COP', 'moneda');
  if (!Array.isArray(documento.lineas) || !documento.lineas.length) throw new Error('El documento requiere líneas.');
  const isInvoice = tipo === 'FACTURA';
  const esquemasImpuesto = { '01': 'IVA', '03': 'ICA', '04': 'INC' };
  const profile = isInvoice ? 'DIAN 2.1: Factura Electrónica de Venta' : `DIAN 2.1: ${tipo === 'NOTA_CREDITO' ? 'Nota Crédito' : 'Nota Débito'} de Factura Electrónica de Venta`;
  const reference = !isInvoice ? required(documento.factura_referencia_numero, 'número de factura de referencia para la nota') : null;
  const prefixDecl = `xmlns="${NS[prefix]}" xmlns:cac="${NS.cac}" xmlns:cbc="${NS.cbc}" xmlns:ext="${NS.ext}"`;
  const codigoUnico = opciones.codigoUnico || documento.cufe || documento.cude;
  const extensiones = generarExtensionesDian(opciones.dian, ambiente, codigoUnico);
  const headers = `${tag('UBLVersionID', 'UBL 2.1')}${tag('CustomizationID', '10')}${tag('ProfileID', profile)}${tag('ProfileExecutionID', ambiente)}${tag('ID', id)}${codigoUnico ? tag('UUID', required(codigoUnico, 'CUFE/CUDE'), ` schemeName="${isInvoice ? 'CUFE' : 'CUDE'}-SHA384" schemeID="${ambiente}"`) : ''}${tag('IssueDate', fecha)}${tag('IssueTime', required(documento.hora_emision || '00:00:00-05:00', 'hora de emisión'))}${isInvoice ? tag('InvoiceTypeCode', '01') : tag('Note', required(documento.motivo_nota, 'motivo de la nota'))}${tag('DocumentCurrencyCode', moneda)}${tag('LineCountNumeric', documento.lineas.length)}`;
  const referenceXml = !isInvoice ? `<cac:BillingReference><cac:InvoiceDocumentReference>${tag('ID', reference)}${tag('UUID', required(documento.factura_referencia_cufe, 'CUFE de la factura de referencia'), ' schemeName="CUFE-SHA384"')}${tag('IssueDate', required(documento.factura_referencia_fecha, 'fecha de la factura de referencia'))}</cac:InvoiceDocumentReference></cac:BillingReference>` : '';
  const payment = `<cac:PaymentMeans>${tag('ID', documento.forma_pago === 'CREDITO' ? '2' : '1')}${tag('PaymentMeansCode', required(documento.codigo_medio_pago || config.codigo_medio_pago, 'código DIAN del medio de pago'))}</cac:PaymentMeans>`;
  const taxes = new Map();
  let subtotalCalculado = 0;
  let impuestoCalculado = 0;
  for (const line of documento.lineas) {
    const code = required(line.codigo_impuesto, 'código DIAN del impuesto por línea');
    if (!esquemasImpuesto[code]) throw new Error(`El código de impuesto ${code} no está soportado por las reglas fiscales locales.`);
    const name = required(line.nombre_impuesto, 'nombre DIAN del impuesto por línea');
    if (name !== esquemasImpuesto[code] && !(code === '04' && name === 'Impuesto Nacional al Consumo')) throw new Error(`El nombre del impuesto ${code} no coincide con su código DIAN.`);
    const rate = decimal(line.porcentaje_impuesto, 'tarifa');
    if (rate > 100) throw new Error('La tarifa fiscal no puede superar el 100%.');
    const qty = decimal(line.cantidad, 'cantidad');
    const unit = decimal(line.precio_unitario, 'precio unitario');
    const base = decimal(line.base_imponible, 'base de línea');
    const tax = decimal(line.valor_impuesto, 'impuesto de línea');
    if (cents(qty * unit) !== cents(base)) throw new Error('La base imponible de una línea no coincide con cantidad por precio unitario.');
    if (cents(base * rate / 100) !== cents(tax)) throw new Error('El impuesto de línea no coincide con la tarifa aplicada a su base imponible.');
    subtotalCalculado = cents(subtotalCalculado + base);
    impuestoCalculado = cents(impuestoCalculado + tax);
    const key = `${code}|${name}|${rate}`;
    const bucket = taxes.get(key) || { code, name, rate, base: 0, tax: 0 };
    bucket.base = cents(bucket.base + base); bucket.tax = cents(bucket.tax + tax); taxes.set(key, bucket);
  }
  const taxXml = [...new Set([...taxes.values()].map(t => t.code))].map((code) => {
    const subtotales = [...taxes.values()].filter(t => t.code === code);
    const totalCodigo = cents(subtotales.reduce((sum, t) => sum + t.tax, 0));
    return `<cac:TaxTotal>${tag('TaxAmount', amount(totalCodigo), ` currencyID="${xml(moneda)}"`)}${subtotales.map(t => `<cac:TaxSubtotal>${tag('TaxableAmount', amount(t.base), ` currencyID="${xml(moneda)}"`)}${tag('TaxAmount', amount(t.tax), ` currencyID="${xml(moneda)}"`)}<cac:TaxCategory>${tag('ID', t.code)}${tag('Percent', amount(t.rate))}<cac:TaxScheme>${tag('ID', t.code)}${tag('Name', t.name)}</cac:TaxScheme></cac:TaxCategory></cac:TaxSubtotal>`).join('')}</cac:TaxTotal>`;
  }).join('');
  if (cents(decimal(documento.subtotal, 'subtotal')) !== subtotalCalculado) throw new Error('El subtotal del documento no coincide con la suma de las bases imponibles.');
  if (cents(decimal(documento.total_impuestos, 'total de impuestos')) !== impuestoCalculado) throw new Error('Los impuestos del documento no coinciden con la suma de los impuestos de línea.');
  if (cents(decimal(documento.total, 'total')) !== cents(subtotalCalculado + impuestoCalculado)) throw new Error('El total del documento no coincide con subtotal más impuestos.');
  const lineXml = documento.lineas.map((l, i) => {
    const qty = Number(l.cantidad), unit = Number(l.precio_unitario);
    if (!(qty > 0) || !Number.isFinite(qty) || !Number.isFinite(unit) || unit < 0) throw new Error('El XML contiene una línea inválida.');
    const qName = isInvoice ? 'InvoicedQuantity' : (tipo === 'NOTA_CREDITO' ? 'CreditedQuantity' : 'DebitedQuantity');
    const lineName = isInvoice ? 'InvoiceLine' : (tipo === 'NOTA_CREDITO' ? 'CreditNoteLine' : 'DebitNoteLine');
    const lineCode = required(l.codigo_impuesto, 'código DIAN del impuesto por línea');
    const lineNameTax = required(l.nombre_impuesto, 'nombre DIAN del impuesto por línea');
    const lineTax = `<cac:TaxTotal>${tag('TaxAmount', amount(l.valor_impuesto), ` currencyID="${xml(moneda)}"`)}<cac:TaxSubtotal>${tag('TaxableAmount', amount(l.base_imponible), ` currencyID="${xml(moneda)}"`)}${tag('TaxAmount', amount(l.valor_impuesto), ` currencyID="${xml(moneda)}"`)}<cac:TaxCategory>${tag('ID', lineCode)}${tag('Percent', amount(l.porcentaje_impuesto))}<cac:TaxScheme>${tag('ID', lineCode)}${tag('Name', lineNameTax)}</cac:TaxScheme></cac:TaxCategory></cac:TaxSubtotal></cac:TaxTotal>`;
    return `<cac:${lineName}>${tag('ID', i + 1)}${tag(qName, qty, ` unitCode="${xml(l.unidad_codigo || 'NIU')}"`)}${tag('LineExtensionAmount', amount(l.base_imponible), ` currencyID="${xml(moneda)}"`)}${lineTax}<cac:Item>${tag('Description', required(l.descripcion, 'descripción de línea'))}<cac:StandardItemIdentification>${tag('ID', required(l.codigo_producto, 'código del medicamento'))}</cac:StandardItemIdentification></cac:Item><cac:Price>${tag('PriceAmount', amount(unit), ` currencyID="${xml(moneda)}"`)}${tag('BaseQuantity', 1, ` unitCode="${xml(l.unidad_codigo || 'NIU')}"`)}</cac:Price></cac:${lineName}>`;
  }).join('');
  const subtotal = amount(documento.subtotal), totalTax = amount(documento.total_impuestos), total = amount(documento.total);
  const totalElement = tipo === 'NOTA_DEBITO' ? 'RequestedMonetaryTotal' : 'LegalMonetaryTotal';
  const legal = `<cac:${totalElement}>${tag('LineExtensionAmount', subtotal, ` currencyID="${xml(moneda)}"`)}${tag('TaxExclusiveAmount', subtotal, ` currencyID="${xml(moneda)}"`)}${tag('TaxInclusiveAmount', amount(Number(subtotal) + Number(totalTax)), ` currencyID="${xml(moneda)}"`)}${tag('PayableAmount', total, ` currencyID="${xml(moneda)}"`)}</cac:${totalElement}>`;
  const body = `${headers}${referenceXml}${party(emisor, 'AccountingSupplierParty')}${party(cliente, 'AccountingCustomerParty')}${payment}${taxXml}${legal}${lineXml}`;
  const extensionNamespaces = extensiones ? ` xmlns:sts="${NS.sts}"` : '';
  return `<?xml version="1.0" encoding="UTF-8"?><${root} ${prefixDecl}${extensionNamespaces}>${extensiones}${body}</${root}>`;
}

async function validarXml(xmlContent, tipo) {
  const schemaFile = SCHEMAS[tipo];
  if (!schemaFile) throw new Error('No existe un esquema UBL para este documento.');
  const [{ XmlDocument, XsdValidator }, { xmlRegisterFsInputProviders }] = await Promise.all([
    import('libxml2-wasm'), import('libxml2-wasm/lib/nodejs.mjs')
  ]);
  xmlRegisterFsInputProviders();
  const schemaPath = path.join(__dirname, '../resources/ubl-2.1/xsd/maindoc', schemaFile);
  const schemaDoc = XmlDocument.fromString(fs.readFileSync(schemaPath, 'utf8'), { url: pathToFileURL(schemaPath).href });
  const xmlDoc = XmlDocument.fromString(xmlContent);
  let validator;
  try {
    validator = XsdValidator.fromDoc(schemaDoc);
    validator.validate(xmlDoc);
    return { valido: true, esquema: `OASIS UBL 2.1 ${schemaFile}` };
  } finally {
    validator?.dispose(); xmlDoc.dispose(); schemaDoc.dispose();
  }
}

module.exports = { generarXml, validarXml };
