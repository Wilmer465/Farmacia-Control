// Capa de abstracción del dispositivo biométrico (sección 15 del spec).
// El resto del sistema NUNCA debe hablar directamente con un lector de huellas:
// siempre pasa por esta interfaz. Hoy no hay hardware conectado, así que
// capturarHuella() es un stub que el usuario dispara manualmente desde la UI
// (simula "ya puso el dedo"). Cuando se integre un lector real, esta es la
// única pieza que se reemplaza — controllers/services/repositories no cambian.

class BiometricService {
  // eslint-disable-next-line class-methods-use-this
  async capturarHuella() {
    // TODO Fase futura: reemplazar por la integración real del lector.
    return { capturada: true, dispositivo: 'STUB_MANUAL', timestamp: new Date().toISOString() };
  }
}

module.exports = new BiometricService();
