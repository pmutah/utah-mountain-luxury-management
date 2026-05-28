import type { SettingsEnv } from '../kv';
import {
  CONSTRUCTION_MAX_BYTES,
  KV_CONSTRUCTION_CHUNK_BYTES,
  KV_CONSTRUCTION_SINGLE_MAX_BYTES,
} from './construction-limits';
import { base64ToUint8, uint8ToBase64 } from './construction-binary';

export { CONSTRUCTION_MAX_BYTES as KV_CONSTRUCTION_MAX_BYTES };

const KV_CONSTRUCTION_PREFIX = 'construction:file:';

export function isKvConstructionPath(storagePath: string | null | undefined): boolean {
  return Boolean(storagePath?.startsWith('kv:construction:'));
}

export function kvConstructionPath(docId: string): string {
  return `kv:construction:${docId}`;
}

export function kvConstructionChunkedPath(docId: string): string {
  return `kv:construction:chunked:${docId}`;
}

function kvKey(docId: string): string {
  return `${KV_CONSTRUCTION_PREFIX}${docId}`;
}

function kvMetaKey(docId: string): string {
  return `${KV_CONSTRUCTION_PREFIX}${docId}:meta`;
}

function kvPartKey(docId: string, part: number): string {
  return `${KV_CONSTRUCTION_PREFIX}${docId}:part:${part}`;
}

type KvPayload = { contentType: string; data: string };

export async function storeConstructionFileInKv(
  env: SettingsEnv,
  docId: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<{ path: string; contentType: string }> {
  if (!env.SETTINGS) throw new Error('KV not configured');
  if (bytes.length > KV_CONSTRUCTION_SINGLE_MAX_BYTES) {
    throw new Error(
      `File exceeds ${KV_CONSTRUCTION_SINGLE_MAX_BYTES / (1024 * 1024)} MB single KV object limit`,
    );
  }
  await env.SETTINGS.put(
    kvKey(docId),
    JSON.stringify({ contentType, data: uint8ToBase64(bytes) }),
  );
  return { path: kvConstructionPath(docId), contentType };
}

/** Split large files across multiple KV values (up to CONSTRUCTION_MAX_BYTES total). */
export async function storeConstructionFileInKvChunked(
  env: SettingsEnv,
  docId: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<{ path: string; contentType: string }> {
  if (!env.SETTINGS) throw new Error('KV not configured');
  if (bytes.length > CONSTRUCTION_MAX_BYTES) {
    throw new Error(`File exceeds ${CONSTRUCTION_MAX_BYTES / (1024 * 1024)} MB limit`);
  }
  const parts = Math.ceil(bytes.length / KV_CONSTRUCTION_CHUNK_BYTES);
  await env.SETTINGS.put(
    kvMetaKey(docId),
    JSON.stringify({ contentType, parts, totalBytes: bytes.length }),
  );
  for (let p = 0; p < parts; p++) {
    const start = p * KV_CONSTRUCTION_CHUNK_BYTES;
    const chunk = bytes.subarray(start, Math.min(start + KV_CONSTRUCTION_CHUNK_BYTES, bytes.length));
    await env.SETTINGS.put(kvPartKey(docId, p), uint8ToBase64(chunk));
  }
  return { path: kvConstructionChunkedPath(docId), contentType };
}

export async function loadConstructionFileFromKv(
  env: SettingsEnv,
  docId: string,
): Promise<{ bytes: Uint8Array; contentType: string }> {
  if (!env.SETTINGS) throw new Error('KV not configured');

  const metaRaw = await env.SETTINGS.get(kvMetaKey(docId));
  if (metaRaw) {
    const meta = JSON.parse(metaRaw) as {
      contentType: string;
      parts: number;
      totalBytes: number;
    };
    const out = new Uint8Array(meta.totalBytes);
    let offset = 0;
    for (let p = 0; p < meta.parts; p++) {
      const partB64 = await env.SETTINGS.get(kvPartKey(docId, p));
      if (!partB64) throw new Error('File chunk missing');
      const chunk = base64ToUint8(partB64);
      out.set(chunk, offset);
      offset += chunk.length;
    }
    return { bytes: out, contentType: meta.contentType };
  }

  const raw = await env.SETTINGS.get(kvKey(docId));
  if (!raw) throw new Error('File not found');
  const payload = JSON.parse(raw) as KvPayload;
  return { bytes: base64ToUint8(payload.data), contentType: payload.contentType };
}

export async function deleteConstructionFileFromKv(env: SettingsEnv, docId: string): Promise<void> {
  if (!env.SETTINGS) return;
  const metaRaw = await env.SETTINGS.get(kvMetaKey(docId));
  if (metaRaw) {
    const meta = JSON.parse(metaRaw) as { parts: number };
    await env.SETTINGS.delete(kvMetaKey(docId));
    for (let p = 0; p < meta.parts; p++) {
      await env.SETTINGS.delete(kvPartKey(docId, p));
    }
    return;
  }
  await env.SETTINGS.delete(kvKey(docId));
}

export function docIdFromKvPath(path: string): string {
  return path.replace(/^kv:construction:(?:chunked:)?/, '');
}
