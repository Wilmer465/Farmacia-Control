import { v4 as uuidv4 } from 'uuid';
import * as Crypto from 'expo-crypto';

export function generateIdempotencyKey(): string {
  return uuidv4();
}

export async function generateIdempotencyKeyFromData(entity: string, entityId: number, operation: string, userId: number): Promise<string> {
  const data = `${entity}:${entityId}:${operation}:${userId}:${Date.now()}:${Math.random()}`;
  return (await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, data)).substring(0, 32);
}

export function generateLocalId(): string {
  return `local_${uuidv4()}`;
}

export function generateSyncId(): string {
  return `sync_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

export async function hashData(data: any): Promise<string> {
  const str = typeof data === 'string' ? data : JSON.stringify(data, Object.keys(data).sort());
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, str);
}

export async function hashForIdempotency(operation: string, entity: string, payload: any, userId: number): Promise<string> {
  const data = `${operation}:${entity}:${JSON.stringify(payload, Object.keys(payload).sort())}:${userId}`;
  return (await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, data)).substring(0, 64);
}

export function isValidUUID(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}
