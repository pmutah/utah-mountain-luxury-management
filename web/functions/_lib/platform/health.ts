/**
 * Deep health. Names which bindings exist. Never includes a secret value.
 */

import { dbTables } from './market-db';

export type HealthEnv = {
  SETTINGS?: { get?: (key: string) => Promise<unknown> };
  MARKET_DB?: unknown;
  PHOTOS?: unknown;
  AIRROI_API_KEY?: string;
  HOSPITABLE_PAT?: string;
  HOSPITABLE_WRITE_TOKEN?: string;
  STRIPE_SECRET_KEY?: string;
  SEAM_API_KEY?: string;
  TURNSTILE_SECRET?: string;
};

function present(value: unknown): boolean {
  return typeof value === 'string' && value.length > 0;
}

export async function deepHealth(env: HealthEnv): Promise<Record<string, unknown>> {
  let kvReads: 'ok' | 'paused' | 'unbound' = 'unbound';
  if (env.SETTINGS?.get) {
    try {
      await env.SETTINGS.get('platform:health');
      kvReads = 'ok';
    } catch {
      kvReads = 'paused';
    }
  }
  const stripe = env.STRIPE_SECRET_KEY ?? '';
  const tables = await dbTables(env);
  return {
    ok: true,
    kv: Boolean(env.SETTINGS),
    kvReads,
    d1: Boolean(env.MARKET_DB),
    d1Tables: tables.ok ? tables.rows.map((row) => row.name) : [],
    d1Read: tables.ok ? 'ok' : 'unread',
    r2: Boolean(env.PHOTOS),
    keys: {
      airroi: present(env.AIRROI_API_KEY),
      hospitable: present(env.HOSPITABLE_PAT) || present(env.HOSPITABLE_WRITE_TOKEN),
      stripeTest: stripe.startsWith('sk_test_'),
      stripeLiveRefused: stripe.startsWith('sk_live_'),
      seam: present(env.SEAM_API_KEY),
      turnstile: present(env.TURNSTILE_SECRET),
    },
    lastCron: 'not recorded on this binding',
    send: false,
    books: 'not read for totals',
  };
}
