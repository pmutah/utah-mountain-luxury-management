import type { SettingsEnv } from './kv';

export async function kvGet<T>(env: SettingsEnv, key: string, fallback: T): Promise<T> {
  if (!env.SETTINGS) return fallback;
  try {
    const raw = await env.SETTINGS.get(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function kvPut<T>(env: SettingsEnv, key: string, value: T): Promise<T> {
  if (env.SETTINGS) {
    await env.SETTINGS.put(key, JSON.stringify(value));
  }
  return value;
}

export function newId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
