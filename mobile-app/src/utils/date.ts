import { format, parseISO, isValid, differenceInDays, startOfDay, endOfDay } from 'date-fns';
import { es } from 'date-fns/locale';

export function toISOString(date: Date = new Date()): string {
  return date.toISOString();
}

export function fromISOString(isoString: string): Date {
  const parsed = parseISO(isoString);
  if (!isValid(parsed)) {
    throw new Error(`Invalid ISO date string: ${isoString}`);
  }
  return parsed;
}

export function formatDate(date: Date | string, pattern: string = 'yyyy-MM-dd'): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  if (!isValid(d)) return '';
  return format(d, pattern, { locale: es });
}

export function formatDateTime(date: Date | string, pattern: string = 'yyyy-MM-dd HH:mm:ss'): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  if (!isValid(d)) return '';
  return format(d, pattern, { locale: es });
}

export function formatRelativeTime(date: Date | string): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  if (!isValid(d)) return '';
  
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  
  if (diffMins < 1) return 'Ahora mismo';
  if (diffMins < 60) return `Hace ${diffMins} min`;
  if (diffHours < 24) return `Hace ${diffHours} h`;
  if (diffDays < 7) return `Hace ${diffDays} días`;
  return formatDate(d, 'dd/MM/yyyy');
}

export function daysUntilExpiration(fechaVencimiento: string): number {
  const vencimiento = parseISO(fechaVencimiento);
  if (!isValid(vencimiento)) return -1;
  const hoy = startOfDay(new Date());
  const venc = startOfDay(vencimiento);
  return differenceInDays(venc, hoy);
}

export function getLoteEstado(fechaVencimiento: string, cantidadTotal: number, estadoManual?: string): 'DISPONIBLE' | 'PROXIMO_VENCER' | 'VENCIDO' | 'AGOTADO' | 'DADO_DE_BAJA' {
  if (estadoManual === 'DADO_DE_BAJA' || cantidadTotal <= 0) return 'AGOTADO';
  
  const dias = daysUntilExpiration(fechaVencimiento);
  if (dias < 0) return 'VENCIDO';
  if (dias <= 90) return 'PROXIMO_VENCER';
  return 'DISPONIBLE';
}

export function isToday(date: Date | string): boolean {
  const d = typeof date === 'string' ? parseISO(date) : date;
  const today = startOfDay(new Date());
  return d >= today && d < endOfDay(today);
}

export function isPast(date: Date | string): boolean {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return d < new Date();
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export function startOfDayUTC(date: Date = new Date()): Date {
  return startOfDay(date);
}

export function endOfDayUTC(date: Date = new Date()): Date {
  return endOfDay(date);
}