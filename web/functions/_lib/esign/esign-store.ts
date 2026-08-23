import { kvGet, kvPut, newId } from '../kv-json';
import type { SettingsEnv } from '../kv';
import type { EsignSession, VaultDocument } from './types';

const KV_DOCS = 'esignDocuments';
const KV_SESSION_PREFIX = 'esign:session:';
const KV_TOKEN_PREFIX = 'esign:token:';

const SESSION_DAYS = 30;

export function newEsignDocId(): string {
  return newId('esign');
}

export function newSessionId(): string {
  return newId('esess');
}

export function randomViewerToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function sessionExpiresAt(from = new Date()): string {
  return new Date(from.getTime() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

export async function loadVaultDocuments(env: SettingsEnv): Promise<VaultDocument[]> {
  return kvGet(env, KV_DOCS, []);
}

export async function saveVaultDocuments(
  env: SettingsEnv,
  docs: VaultDocument[],
): Promise<VaultDocument[]> {
  return kvPut(env, KV_DOCS, docs);
}

export async function addVaultDocument(
  env: SettingsEnv,
  doc: VaultDocument,
): Promise<VaultDocument> {
  const list = await loadVaultDocuments(env);
  list.unshift(doc);
  await saveVaultDocuments(env, list);
  return doc;
}

export async function getVaultDocument(
  env: SettingsEnv,
  id: string,
): Promise<VaultDocument | null> {
  const list = await loadVaultDocuments(env);
  return list.find((d) => d.id === id) ?? null;
}

export async function updateVaultDocument(
  env: SettingsEnv,
  id: string,
  patch: Partial<VaultDocument>,
): Promise<VaultDocument | null> {
  const list = await loadVaultDocuments(env);
  const idx = list.findIndex((d) => d.id === id);
  if (idx < 0) return null;
  const next: VaultDocument = { ...list[idx]!, ...patch, id };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) delete (next as Record<string, unknown>)[key];
  }
  list[idx] = next;
  await saveVaultDocuments(env, list);
  return next;
}

export async function deleteVaultDocument(
  env: SettingsEnv,
  id: string,
): Promise<VaultDocument | null> {
  const list = await loadVaultDocuments(env);
  const idx = list.findIndex((d) => d.id === id);
  if (idx < 0) return null;
  const [removed] = list.splice(idx, 1);
  await saveVaultDocuments(env, list);
  return removed ?? null;
}

export async function saveEsignSession(env: SettingsEnv, session: EsignSession): Promise<EsignSession> {
  if (!env.SETTINGS) return session;
  await env.SETTINGS.put(`${KV_SESSION_PREFIX}${session.id}`, JSON.stringify(session));
  await env.SETTINGS.put(`${KV_TOKEN_PREFIX}${session.viewerToken}`, session.id);
  return session;
}

export async function getEsignSession(
  env: SettingsEnv,
  sessionId: string,
): Promise<EsignSession | null> {
  if (!env.SETTINGS) return null;
  const raw = await env.SETTINGS.get(`${KV_SESSION_PREFIX}${sessionId}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as EsignSession;
  } catch {
    return null;
  }
}

export async function findSessionByToken(
  env: SettingsEnv,
  token: string,
): Promise<EsignSession | null> {
  if (!env.SETTINGS || !token) return null;
  const sessionId = await env.SETTINGS.get(`${KV_TOKEN_PREFIX}${token}`);
  if (!sessionId) return null;
  return getEsignSession(env, sessionId);
}

export function publicSignUrl(origin: string, token: string): string {
  return `${origin.replace(/\/$/, '')}/esign/${encodeURIComponent(token)}`;
}

export function isSessionOpen(session: EsignSession): boolean {
  if (session.completedAt || session.cancelledAt) return false;
  return new Date(session.expiresAt).getTime() > Date.now();
}
