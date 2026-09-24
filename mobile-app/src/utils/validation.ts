export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validarRequerido(valor: any, campo: string, errors: string[]): void {
  if (valor === undefined || valor === null || (typeof valor === 'string' && valor.trim() === '')) {
    errors.push(`${campo} es obligatorio`);
  }
}

export function validarEnteroPositivo(valor: any, campo: string, errors: string[], permiteCero: boolean = true): void {
  if (valor === undefined || valor === null) return;
  const num = Number(valor);
  if (!Number.isInteger(num) || (permiteCero ? num < 0 : num <= 0)) {
    errors.push(`${campo} debe ser un número entero ${permiteCero ? 'mayor o igual a 0' : 'mayor a 0'}`);
  }
}

export function validarEntero(valor: any, campo: string, errors: string[], min?: number, max?: number): void {
  if (valor === undefined || valor === null) return;
  const num = Number(valor);
  if (!Number.isInteger(num)) {
    errors.push(`${campo} debe ser un número entero`);
    return;
  }
  if (min !== undefined && num < min) {
    errors.push(`${campo} debe ser mayor o igual a ${min}`);
  }
  if (max !== undefined && num > max) {
    errors.push(`${campo} debe ser menor o igual a ${max}`);
  }
}

export function validarString(valor: any, campo: string, errors: string[], minLength?: number, maxLength?: number): void {
  if (valor === undefined || valor === null) return;
  const str = String(valor).trim();
  if (minLength !== undefined && str.length < minLength) {
    errors.push(`${campo} debe tener al menos ${minLength} caracteres`);
  }
  if (maxLength !== undefined && str.length > maxLength) {
    errors.push(`${campo} no debe exceder ${maxLength} caracteres`);
  }
}

export function validarEmail(valor: any, campo: string, errors: string[]): void {
  if (valor === undefined || valor === null || valor === '') return;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(String(valor).trim())) {
    errors.push(`${campo} debe ser un email válido`);
  }
}

export function validarTelefono(valor: any, campo: string, errors: string[]): void {
  if (valor === undefined || valor === null || valor === '') return;
  const telefonoRegex = /^[\d\s\-\+\(\)]{7,20}$/;
  if (!telefonoRegex.test(String(valor).trim())) {
    errors.push(`${campo} debe ser un teléfono válido`);
  }
}

export function validarFecha(fecha: any, campo: string, errors: string[]): void {
  if (fecha === undefined || fecha === null || fecha === '') return;
  const parsed = new Date(fecha);
  if (isNaN(parsed.getTime())) {
    errors.push(`${campo} debe ser una fecha válida (YYYY-MM-DD)`);
  }
}

export function validarFechaNoPasada(fecha: any, campo: string, errors: string[]): void {
  if (fecha === undefined || fecha === null || fecha === '') return;
  const parsed = new Date(fecha);
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  if (parsed < hoy) {
    errors.push(`${campo} no puede ser una fecha pasada`);
  }
}

export function validarEnum<T extends string>(valor: any, campo: string, valoresPermitidos: T[], errors: string[]): void {
  if (valor === undefined || valor === null) return;
  if (!valoresPermitidos.includes(valor as T)) {
    errors.push(`${campo} debe ser uno de: ${valoresPermitidos.join(', ')}`);
  }
}

export function validarMedicamento(data: any): ValidationResult {
  const errors: string[] = [];
  
  validarRequerido(data.codigo, 'Código', errors);
  validarString(data.codigo, 'Código', errors, 1, 50);
  
  validarRequerido(data.nombre, 'Nombre', errors);
  validarString(data.nombre, 'Nombre', errors, 1, 200);
  
  validarString(data.principio_activo, 'Principio activo', errors, 0, 200);
  validarString(data.presentacion, 'Presentación', errors, 0, 100);
  validarString(data.concentracion, 'Concentración', errors, 0, 100);
  validarString(data.laboratorio, 'Laboratorio', errors, 0, 200);
  
  validarRequerido(data.unidad_medida, 'Unidad de medida', errors);
  validarEnum(data.unidad_medida, 'Unidad de medida', ['TABLETA', 'CAPSULA', 'FRASCO', 'AMPOLLA', 'SOBRE', 'OTRO'], errors);
  
  validarEnteroPositivo(data.unidades_por_caja, 'Unidades por caja', errors, false);
  
  return { valid: errors.length === 0, errors };
}

export function validarLote(data: any): ValidationResult {
  const errors: string[] = [];
  
  validarRequerido(data.medicamento_id, 'Medicamento', errors);
  validarEnteroPositivo(data.medicamento_id, 'Medicamento', errors, false);
  
  validarRequerido(data.sede_id, 'Sede', errors);
  validarEnteroPositivo(data.sede_id, 'Sede', errors, false);
  
  validarRequerido(data.numero_lote, 'Número de lote', errors);
  validarString(data.numero_lote, 'Número de lote', errors, 1, 50);
  
  validarRequerido(data.fecha_expedicion, 'Fecha de expedición', errors);
  validarFecha(data.fecha_expedicion, 'Fecha de expedición', errors);
  
  validarRequerido(data.fecha_vencimiento, 'Fecha de vencimiento', errors);
  validarFecha(data.fecha_vencimiento, 'Fecha de vencimiento', errors);
  
  validarEnteroPositivo(data.cantidad_cajas, 'Cajas', errors, true);
  validarEnteroPositivo(data.cantidad_unidades_sueltas, 'Unidades sueltas', errors, true);
  
  const totalCajas = Number(data.cantidad_cajas || 0);
  const totalSueltas = Number(data.cantidad_unidades_sueltas || 0);
  if (totalCajas === 0 && totalSueltas === 0) {
    errors.push('Debe ingresar al menos una cantidad (cajas o unidades sueltas)');
  }
  
  return { valid: errors.length === 0, errors };
}

export function validarItemsOrden(items: any[]): ValidationResult {
  const errors: string[] = [];
  
  if (!Array.isArray(items) || items.length === 0) {
    errors.push('Debe agregar al menos un medicamento a la orden');
    return { valid: false, errors };
  }
  
  items.forEach((item, index) => {
    const prefijo = `Línea ${index + 1}`;
    
    validarRequerido(item.medicamento_id, `${prefijo}: Medicamento`, errors);
    validarEnteroPositivo(item.medicamento_id, `${prefijo}: Medicamento`, errors, false);
    
    validarEnteroPositivo(item.cantidad_cajas_solicitada, `${prefijo}: Cajas`, errors, true);
    validarEnteroPositivo(item.cantidad_unidades_solicitada, `${prefijo}: Unidades`, errors, true);
    
    const cajas = Number(item.cantidad_cajas_solicitada || 0);
    const unidades = Number(item.cantidad_unidades_solicitada || 0);
    if (cajas === 0 && unidades === 0) {
      errors.push(`${prefijo}: Debe solicitar al menos una unidad`);
    }
  });
  
  return { valid: errors.length === 0, errors };
}

export function validarItemsDespacho(items: any[]): ValidationResult {
  const errors: string[] = [];
  
  if (!Array.isArray(items) || items.length === 0) {
    errors.push('Debe agregar al menos un item al despacho');
    return { valid: false, errors };
  }
  
  items.forEach((item, index) => {
    const prefijo = `Línea ${index + 1}`;
    
    validarRequerido(item.orden_detalle_id, `${prefijo}: Detalle de orden`, errors);
    validarEnteroPositivo(item.orden_detalle_id, `${prefijo}: Detalle de orden`, errors, false);
    
    validarRequerido(item.lote_id, `${prefijo}: Lote`, errors);
    validarEnteroPositivo(item.lote_id, `${prefijo}: Lote`, errors, false);
    
    validarEnteroPositivo(item.cantidad_cajas_despachada, `${prefijo}: Cajas`, errors, true);
    validarEnteroPositivo(item.cantidad_unidades_sueltas_despachada, `${prefijo}: Unidades`, errors, true);
    
    const cajas = Number(item.cantidad_cajas_despachada || 0);
    const unidades = Number(item.cantidad_unidades_sueltas_despachada || 0);
    const totalUnidades = Number(item.cantidad_unidades_despachada || item.cantidad_total_despachada || 0);
    
    if (cajas === 0 && unidades === 0 && totalUnidades === 0) {
      errors.push(`${prefijo}: Debe despachar al menos una unidad`);
    }
  });
  
  return { valid: errors.length === 0, errors };
}

export function validarSolicitudEliminacion(data: any): ValidationResult {
  const errors: string[] = [];
  
  validarRequerido(data.registro_id, 'Registro', errors);
  validarEnteroPositivo(data.registro_id, 'Registro', errors, false);
  
  validarRequerido(data.motivo, 'Motivo', errors);
  validarString(data.motivo, 'Motivo', errors, 10, 500);
  
  return { valid: errors.length === 0, errors };
}

export function validarSolicitudIntercambio(data: any): ValidationResult {
  const errors: string[] = [];
  
  validarRequerido(data.tipo, 'Tipo', errors);
  validarEnum(data.tipo, 'Tipo', ['ENVIO', 'INTERCAMBIO'], errors);
  
  validarRequerido(data.sede_origen_id, 'Sede origen', errors);
  validarEnteroPositivo(data.sede_origen_id, 'Sede origen', errors, false);
  
  validarRequerido(data.sede_destino_id, 'Sede destino', errors);
  validarEnteroPositivo(data.sede_destino_id, 'Sede destino', errors, false);
  
  if (data.sede_origen_id === data.sede_destino_id) {
    errors.push('La sede origen y destino deben ser diferentes');
  }
  
  validarRequerido(data.lote_id, 'Lote', errors);
  validarEnteroPositivo(data.lote_id, 'Lote', errors, false);
  
  validarRequerido(data.medicamento_id, 'Medicamento', errors);
  validarEnteroPositivo(data.medicamento_id, 'Medicamento', errors, false);
  
  validarEnteroPositivo(data.cantidad_cajas, 'Cajas', errors, true);
  validarEnteroPositivo(data.cantidad_unidades, 'Unidades', errors, true);
  
  validarRequerido(data.motivo, 'Motivo', errors);
  validarString(data.motivo, 'Motivo', errors, 10, 500);
  
  return { valid: errors.length === 0, errors };
}

export function validarOrden(data: any): ValidationResult {
  const errors: string[] = [];
  
  if (!data.items || !Array.isArray(data.items) || data.items.length === 0) {
    errors.push('Debe agregar al menos un medicamento');
    return { valid: false, errors };
  }
  
  validarRequerido(data.receptor_nombre, 'Nombre del receptor', errors);
  validarString(data.receptor_nombre, 'Nombre del receptor', errors, 1, 200);
  
  validarRequerido(data.receptor_documento, 'Documento del receptor', errors);
  validarString(data.receptor_documento, 'Documento del receptor', errors, 1, 50);
  
  validarString(data.receptor_telefono, 'Teléfono del receptor', errors, 0, 30);
  validarTelefono(data.receptor_telefono, 'Teléfono del receptor', errors);
  
  validarString(data.receptor_correo, 'Correo del receptor', errors, 0, 200);
  validarEmail(data.receptor_correo, 'Correo del receptor', errors);
  
  const itemsValidation = validarItemsOrden(data.items);
  errors.push(...itemsValidation.errors);
  
  return { valid: errors.length === 0, errors };
}