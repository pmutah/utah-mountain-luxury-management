/** Store receipt PDFs/images in Cloudflare KV when Firebase is not configured. */

import type { SettingsEnv } from './kv';

const KV_RECEIPT_PREFIX = 'receipt:';
/** Stay under KV 25 MiB limit with base64 overhead */
export const KV_RECEIPT_MAX_BYTES = 4 * 1024 * 1024;

export function isKvReceiptPath(storagePath: string | null | undefined): boolean {
  return Boolean(storagePath?.startsWith('kv:'));
}

export function kvReceiptPath(expenseId: string): string {
  return `kv:${expenseId}`;
}

function kvKey(expenseId: string): string {
  return `${KV_RECEIPT_PREFIX}${expenseId}`;
}

type KvReceiptPayload = {
  contentType: string;
  data: string;
};

export async function storeReceiptInKv(
  env: SettingsEnv,
  expenseId: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<{ path: string; contentType: string }> {
  if (!env.SETTINGS) {
    throw new Error('KV SETTINGS binding not available');
  }
  if (bytes.length > KV_RECEIPT_MAX_BYTES) {
    throw new Error(`File is too large for KV storage (max ${KV_RECEIPT_MAX_BYTES / (1024 * 1024)} MB)`);
  }

  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);

  const payload: KvReceiptPayload = {
    contentType,
    data: btoa(binary),
  };

  await env.SETTINGS.put(kvKey(expenseId), JSON.stringify(payload));
  return { path: kvReceiptPath(expenseId), contentType };
}

export async function loadReceiptFromKv(
  env: SettingsEnv,
  expenseId: string,
): Promise<{ bytes: Uint8Array; contentType: string }> {
  if (!env.SETTINGS) {
    throw new Error('KV SETTINGS binding not available');
  }
  const raw = await env.SETTINGS.get(kvKey(expenseId));
  if (!raw) throw new Error('Receipt not found');

  const payload = JSON.parse(raw) as KvReceiptPayload;
  const binary = atob(payload.data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { bytes, contentType: payload.contentType || 'application/octet-stream' };
}

export async function deleteReceiptFromKv(env: SettingsEnv, expenseId: string): Promise<void> {
  if (!env.SETTINGS) return;
  await env.SETTINGS.delete(kvKey(expenseId));
}

export function expenseIdFromKvPath(storagePath: string): string {
  return storagePath.replace(/^kv:/, '');
}
