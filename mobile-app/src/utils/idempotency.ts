import { v4 as uuidv4 } from 'uuid';
import { createHash } from 'crypto';

export function generateIdempotencyKey(): string {
  return uuidv4();
}

export function generateIdempotencyKeyFromData(entity: string, entityId: number, operation: string, userId: number): string {
  const data = `${entity}:${entityId}:${operation}:${userId}:${Date.now()}:${Math.random()}`;
  return createHash('sha256').update(data).digest('hex').substring(0, 32);
}

export function generateLocalId(): string {
  return `local_${uuidv4()}`;
}

export function generateSyncId(): string {
  return `sync_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

export function hashData(data: any): string {
  const str = typeof data === 'string' ? data : JSON.stringify(data, Object.keys(data).sort());
  return createHash('sha256').update(str).digest('hex');
}

export function hashForIdempotency(operation: string, entity: string, payload: any, userId: number): string {
  const data = `${operation}:${entity}:${JSON.stringify(payload, Object.keys(payload).sort())}:${userId}`;
  return createHash('sha256').update(data).digest('hex').substring(0, 64);
}

export function isValidUUID(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}