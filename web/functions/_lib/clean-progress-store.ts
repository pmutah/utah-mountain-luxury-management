import { kvGet, kvPut } from './kv-json';
import type { SettingsEnv } from './kv';
import { progressKey, type CleanProgress } from '../../src/lib/clean-progress';

const KV_KEY = 'cleanProgress';
/** Two weeks of turns plus a little slack. An old turn falls off rather than growing forever. */
const KEEP = 200;

export async function loadProgress(env: SettingsEnv): Promise<CleanProgress[]> {
  return kvGet<CleanProgress[]>(env, KV_KEY, []);
}

export async function saveProgress(env: SettingsEnv, rows: CleanProgress[]): Promise<CleanProgress[]> {
  return kvPut(env, KV_KEY, rows.slice(-KEEP));
}

/** Replace the ticks for one turn. Any other turn is left exactly as it was. */
export async function putProgress(env: SettingsEnv, next: CleanProgress): Promise<CleanProgress[]> {
  const rows = await loadProgress(env);
  const key = progressKey(next.house, next.checkout);
  const kept = rows.filter((row) => progressKey(row.house, row.checkout) !== key);
  return saveProgress(env, [...kept, next]);
}

/** Read only the turns on or after a day, so a cleaner does not see stale history. */
export async function progressSince(env: SettingsEnv, from: string): Promise<CleanProgress[]> {
  return (await loadProgress(env)).filter((row) => row.checkout >= from);
}
