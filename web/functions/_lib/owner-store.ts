import { kvGet, kvPut } from './kv-json';
import type { SettingsEnv } from './kv';
import type { OwnerAccessRecord } from '../../src/lib/owner-portal';

const KV_KEY = 'ownerAccess';

/**
 * Owner links. Minting one is a write to the settings store; opening one only stamps the view count.
 * Nothing here touches a booking, an expense, or a receipt.
 */
export async function loadOwnerLinks(env: SettingsEnv): Promise<OwnerAccessRecord[]> {
  return kvGet<OwnerAccessRecord[]>(env, KV_KEY, []);
}

export async function saveOwnerLinks(env: SettingsEnv, links: OwnerAccessRecord[]): Promise<OwnerAccessRecord[]> {
  return kvPut(env, KV_KEY, links);
}

export async function findOwnerLink(env: SettingsEnv, token: string): Promise<OwnerAccessRecord | null> {
  const links = await loadOwnerLinks(env);
  return links.find((link) => link.token === token) ?? null;
}

/** Mint a new link. An existing link for the same owner is kept, so a shared link does not break. */
export async function createOwnerLink(env: SettingsEnv): Promise<OwnerAccessRecord> {
  const links = await loadOwnerLinks(env);
  const record: OwnerAccessRecord = {
    token: crypto.randomUUID().replace(/-/g, ''),
    createdAt: new Date().toISOString(),
  };
  await saveOwnerLinks(env, [...links, record]);
  return record;
}

/** Stamp a view. A link that is not saved is not stamped. */
export async function stampOwnerView(env: SettingsEnv, token: string): Promise<OwnerAccessRecord | null> {
  const links = await loadOwnerLinks(env);
  const index = links.findIndex((link) => link.token === token);
  if (index < 0) return null;
  const next: OwnerAccessRecord = {
    ...links[index]!,
    lastViewedAt: new Date().toISOString(),
    views: (links[index]!.views ?? 0) + 1,
  };
  links[index] = next;
  await saveOwnerLinks(env, links);
  return next;
}
