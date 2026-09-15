// Capa de abstracción del dispositivo biométrico (sección 15 del spec).
// El resto del sistema NUNCA debe hablar directamente con un lector de huellas:
// siempre pasa por esta interfaz. Hoy no hay hardware conectado, así que
// capturarHuella() retorna capturada:false — NO genera evidencia falsa de
// entrega biométrica. Cuando se integre un lector real, esta es la
// única pieza que se reemplaza — controllers/services/repositories no cambian.

class BiometricService {
  // eslint-disable-next-line class-methods-use-this
  async capturarHuella() {
    // Sin lector real: negar explícitamente para que la UI y los services
    // marquen la huella como pendiente en vez de "registrada".
    return {
      capturada: false,
      dispositivo: 'SIN_LECTOR',
      timestamp: new Date().toISOString(),
      mensaje: 'Lector biométrico no conectado. La huella queda pendiente.'
    };
  }
}

module.exports = new BiometricService();
