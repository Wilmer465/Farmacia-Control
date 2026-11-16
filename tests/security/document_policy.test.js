'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
  MAX_DOCUMENTO_BYTES,
  MAX_NOMBRE,
  DocumentoInvalidoError,
  decodificarBase64,
  detectarTipoPorFirma,
  extensionParaTipo,
  normalizarAdjuntoOrden,
  normalizarDocumentoAdjunto,
  normalizarNombre
} = require('../../shared/documentPolicy');

const PDF = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n', 'binary');
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const GIF = Buffer.from('GIF89a\x01\x00\x01\x00\x00\x00\x00;', 'binary');
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0x1a, 0x00, 0x00, 0x00]), Buffer.from('WEBPVP8 ')]);

function base64(buffer) {
  return buffer.toString('base64');
}

function documento(overrides = {}) {
  return {
    documento_adjunto_nombre: 'documento.pdf',
    documento_adjunto_data: base64(PDF),
    documento_adjunto_tipo: 'PDF',
    ...overrides
  };
}

function adjuntoOrden(overrides = {}) {
  return {
    nombre: 'documento.pdf',
    data: `data:application/pdf;base64,${base64(PDF)}`,
    tipo: 'PDF',
    ...overrides
  };
}

describe('Política de documentos adjuntos', () => {
  test('detecta el tipo real por firma binaria', () => {
    assert.deepEqual(detectarTipoPorFirma(PDF), { tipo: 'PDF', mime: 'application/pdf', extension: 'pdf' });
    assert.deepEqual(detectarTipoPorFirma(PNG), { tipo: 'IMAGEN', mime: 'image/png', extension: 'png' });
    assert.deepEqual(detectarTipoPorFirma(JPEG), { tipo: 'IMAGEN', mime: 'image/jpeg', extension: 'jpg' });
    assert.deepEqual(detectarTipoPorFirma(GIF), { tipo: 'IMAGEN', mime: 'image/gif', extension: 'gif' });
    assert.deepEqual(detectarTipoPorFirma(WEBP), { tipo: 'IMAGEN', mime: 'image/webp', extension: 'webp' });
    assert.equal(detectarTipoPorFirma(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')), null);
    assert.equal(detectarTipoPorFirma(Buffer.from('MZ')), null);
    assert.equal(detectarTipoPorFirma(Buffer.alloc(0)), null);
    assert.equal(detectarTipoPorFirma('no es buffer'), null);
  });

  test('acepta PDF e imágenes con tipo declarado coherente', () => {
    const pdf = normalizarDocumentoAdjunto(documento());
    assert.equal(pdf.tipo, 'PDF');
    assert.equal(pdf.mime, 'application/pdf');
    assert.equal(pdf.extension, 'pdf');
    assert.equal(pdf.nombre, 'documento.pdf');
    assert.equal(pdf.base64, base64(PDF));

    const png = normalizarDocumentoAdjunto(documento({
      documento_adjunto_nombre: 'foto.png',
      documento_adjunto_data: base64(PNG),
      documento_adjunto_tipo: 'IMAGEN'
    }));
    assert.equal(png.tipo, 'IMAGEN');
    assert.equal(png.mime, 'image/png');

    const pdfMime = normalizarDocumentoAdjunto(documento({ documento_adjunto_tipo: 'application/pdf' }));
    assert.equal(pdfMime.tipo, 'PDF');
  });

  test('un tipo declarado ausente se deduce de los bytes', () => {
    const sinTipo = normalizarDocumentoAdjunto(documento({ documento_adjunto_tipo: null }));
    assert.equal(sinTipo.tipo, 'PDF');
  });

  test('rechaza un tipo declarado que no coincide con la firma', () => {
    assert.throws(
      () => normalizarDocumentoAdjunto(documento({ documento_adjunto_data: base64(PNG) })),
      /no coincide con su contenido/
    );
    assert.throws(
      () => normalizarDocumentoAdjunto(documento({ documento_adjunto_tipo: 'IMAGEN' })),
      /no coincide con su contenido/
    );
  });

  test('rechaza SVG y bytes arbitrarios aunque se declaren PDF', () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    assert.throws(
      () => normalizarDocumentoAdjunto(documento({
        documento_adjunto_nombre: 'malicioso.pdf',
        documento_adjunto_data: base64(svg),
        documento_adjunto_tipo: 'PDF'
      })),
      /debe ser un PDF o una imagen/
    );
    assert.throws(
      () => normalizarDocumentoAdjunto(documento({ documento_adjunto_data: base64(Buffer.from('MZ\x90\x00')) })),
      /debe ser un PDF o una imagen/
    );
  });

  test('rechaza base64 inválido, vacío, con relleno incorrecto o no textual', () => {
    for (const data of ['%%%', 'a', 'abc=def', '====', '   ', '', null, 42, {}]) {
      assert.throws(
        () => normalizarDocumentoAdjunto(documento({ documento_adjunto_data: data })),
        DocumentoInvalidoError,
        String(data)
      );
    }
    assert.throws(() => decodificarBase64('undefined'), /base64 válido/);
  });

  test('aplica el límite de tamaño antes de aceptar el contenido', () => {
    assert.equal(MAX_DOCUMENTO_BYTES, 10 * 1024 * 1024);
    const grande = Buffer.concat([PDF, Buffer.alloc(128)]);
    assert.throws(() => decodificarBase64(base64(grande), 64), /tamaño máximo/);
  });

  test('rechaza nombres con rutas, caracteres de control o longitud excesiva', () => {
    for (const nombre of ['../documento.pdf', '..\\documento.pdf', 'carpeta/documento.pdf', 'documento\u0000.pdf', 'documento\n.pdf']) {
      assert.throws(() => normalizarNombre(nombre), /caracteres no permitidos/, nombre);
    }
    assert.throws(() => normalizarNombre('   '), /obligatorio/);
    assert.throws(() => normalizarNombre(null), /obligatorio/);
    assert.throws(() => normalizarNombre(42), /inválido/);
    assert.throws(() => normalizarNombre('a'.repeat(MAX_NOMBRE + 1)), /255/);
    assert.equal(normalizarNombre('  documento.pdf  '), 'documento.pdf');
  });

  test('un adjunto completamente vacío se representa como ausencia de documento', () => {
    assert.deepEqual(normalizarDocumentoAdjunto({}), {
      nombre: null,
      base64: null,
      tipo: null,
      mime: null,
      extension: null
    });
    assert.deepEqual(normalizarDocumentoAdjunto(null), {
      nombre: null,
      base64: null,
      tipo: null,
      mime: null,
      extension: null
    });
  });

  test('un adjunto incompleto se rechaza en lugar de guardarse parcialmente', () => {
    assert.throws(
      () => normalizarDocumentoAdjunto({ documento_adjunto_nombre: 'documento.pdf' }),
      /incompleto/
    );
    assert.throws(
      () => normalizarDocumentoAdjunto({ documento_adjunto_data: base64(PDF) }),
      /incompleto/
    );
  });

  test('normaliza data URLs de órdenes y detecta el MIME real', () => {
    const pdf = normalizarAdjuntoOrden(adjuntoOrden());
    assert.equal(pdf.tipo, 'PDF');
    assert.equal(pdf.data, `data:application/pdf;base64,${base64(PDF)}`);

    const png = normalizarAdjuntoOrden(adjuntoOrden({
      nombre: 'foto.png',
      data: `data:image/png;base64,${base64(PNG)}`,
      tipo: 'IMAGEN'
    }));
    assert.equal(png.tipo, 'IMAGEN');
    assert.equal(png.mime, 'image/png');
    assert.equal(png.data, `data:image/png;base64,${base64(PNG)}`);
  });

  test('rechaza data URLs ausentes, mal formadas o con MIME incoherente', () => {
    assert.throws(
      () => normalizarAdjuntoOrden(adjuntoOrden({ data: base64(PDF) })),
      /data URL base64/
    );
    assert.throws(
      () => normalizarAdjuntoOrden(adjuntoOrden({ data: 'data:application/pdf;base64,%%%' })),
      DocumentoInvalidoError
    );
    assert.throws(
      () => normalizarAdjuntoOrden(adjuntoOrden({ data: `data:text/html;base64,${base64(PDF)}` })),
      /no coincide con su contenido/
    );
    assert.throws(
      () => normalizarAdjuntoOrden(adjuntoOrden({ data: `data:image/png;base64,${base64(PDF)}` })),
      /no coincide con su contenido/
    );
    assert.throws(
      () => normalizarAdjuntoOrden(adjuntoOrden({ data: `data:image/png;base64,${base64(PNG)}`, tipo: 'PDF' })),
      /no coincide con su contenido/
    );
  });

  test('el adjunto de orden vacío también se representa como ausencia', () => {
    assert.deepEqual(normalizarAdjuntoOrden({}), {
      nombre: null,
      data: null,
      tipo: null,
      mime: null,
      extension: null
    });
  });

  test('extensionParaTipo devuelve una extensión segura y no usa el nombre original', () => {
    assert.equal(extensionParaTipo('PDF'), 'pdf');
    assert.equal(extensionParaTipo('pdf'), 'pdf');
    assert.equal(extensionParaTipo('IMAGEN'), 'png');
    assert.equal(extensionParaTipo('../../evil.exe'), 'png');
    assert.equal(extensionParaTipo(null), 'png');
  });
});
