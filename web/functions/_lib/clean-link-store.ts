import { kvGet, kvPut } from './kv-json';
import type { SettingsEnv } from './kv';
import type { CleanLinkRecord } from '../../src/lib/clean-link';

const KV_KEY = 'cleanLinks';

/** The links handed to cleaners. Minting one writes this list and nothing else. */
export async function loadCleanLinks(env: SettingsEnv): Promise<CleanLinkRecord[]> {
  return kvGet<CleanLinkRecord[]>(env, KV_KEY, []);
}

export async function saveCleanLinks(env: SettingsEnv, links: CleanLinkRecord[]): Promise<CleanLinkRecord[]> {
  return kvPut(env, KV_KEY, links.slice(-40));
}

export async function findCleanLink(env: SettingsEnv, token: string): Promise<CleanLinkRecord | null> {
  const links = await loadCleanLinks(env);
  return links.find((link) => link.token === token) ?? null;
}

/** Mint a link for one cleaner. The label is a name, and it stays off the cleaner's own page. */
export async function createCleanLink(env: SettingsEnv, label: string): Promise<CleanLinkRecord> {
  const links = await loadCleanLinks(env);
  const record: CleanLinkRecord = {
    token: crypto.randomUUID().replace(/-/g, ''),
    label: label.trim().slice(0, 60) || 'Cleaner',
    createdAt: new Date().toISOString(),
  };
  await saveCleanLinks(env, [...links, record]);
  return record;
}

/** Stamp a view so the host can see whether the cleaner actually opened the link. */
export async function stampCleanView(env: SettingsEnv, token: string): Promise<void> {
  const links = await loadCleanLinks(env);
  const index = links.findIndex((link) => link.token === token);
  if (index < 0) return;
  links[index] = {
    ...links[index]!,
    lastViewedAt: new Date().toISOString(),
    views: (links[index]!.views ?? 0) + 1,
  };
  await saveCleanLinks(env, links);
}

/** A link that is no longer wanted. The record stays so a stale link reads as revoked, not invalid. */
export async function revokeCleanLink(env: SettingsEnv, token: string): Promise<boolean> {
  const links = await loadCleanLinks(env);
  const index = links.findIndex((link) => link.token === token);
  if (index < 0) return false;
  const next = links.filter((link) => link.token !== token);
  await saveCleanLinks(env, next);
  return true;
}
