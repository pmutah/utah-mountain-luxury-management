import type { SettingsEnv } from '../kv';
import { KV_CONSTRUCTION_MAX_BYTES } from './construction-limits';

export { KV_CONSTRUCTION_MAX_BYTES };

const KV_CONSTRUCTION_PREFIX = 'construction:file:';

export function isKvConstructionPath(storagePath: string | null | undefined): boolean {
  return Boolean(storagePath?.startsWith('kv:construction:'));
}

export function kvConstructionPath(docId: string): string {
  return `kv:construction:${docId}`;
}

function kvKey(docId: string): string {
  return `${KV_CONSTRUCTION_PREFIX}${docId}`;
}

type KvPayload = { contentType: string; data: string };

export async function storeConstructionFileInKv(
  env: SettingsEnv,
  docId: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<{ path: string; contentType: string }> {
  if (!env.SETTINGS) throw new Error('KV not configured');
  if (bytes.length > KV_CONSTRUCTION_MAX_BYTES) {
    throw new Error(`File exceeds ${KV_CONSTRUCTION_MAX_BYTES / (1024 * 1024)} MB KV limit`);
  }
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  await env.SETTINGS.put(kvKey(docId), JSON.stringify({ contentType, data: btoa(binary) }));
  return { path: kvConstructionPath(docId), contentType };
}

export async function loadConstructionFileFromKv(
  env: SettingsEnv,
  docId: string,
): Promise<{ bytes: Uint8Array; contentType: string }> {
  if (!env.SETTINGS) throw new Error('KV not configured');
  const raw = await env.SETTINGS.get(kvKey(docId));
  if (!raw) throw new Error('File not found');
  const payload = JSON.parse(raw) as KvPayload;
  const binary = atob(payload.data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { bytes, contentType: payload.contentType };
}

export async function deleteConstructionFileFromKv(env: SettingsEnv, docId: string): Promise<void> {
  if (env.SETTINGS) await env.SETTINGS.delete(kvKey(docId));
}

export function docIdFromKvPath(path: string): string {
  return path.replace(/^kv:construction:/, '');
}
