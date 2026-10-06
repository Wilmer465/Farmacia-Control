// Firmas del pad: data-URL PNG/JPEG con contenido real. Antes cualquier
// string truthy (" ", "x") pasaba como firma y el despacho aceptaba
// `huella:true` declarado sin lector como evidencia.
function esFirmaValida(firmaData) {
  if (typeof firmaData !== 'string') return false;
  const m = firmaData.match(/^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=\s]+)$/);
  if (!m) return false;
  const cuerpo = m[2].replace(/\s+/g, '');
  // Un trazo real serializa en KBs; 100 chars de base64 (~75 bytes) es un
  // mínimo generoso que rechaza "x", " " y data-URLs vacías.
  return cuerpo.length >= 100;
}

module.exports = { esFirmaValida };
