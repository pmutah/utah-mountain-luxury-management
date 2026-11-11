/**
 * Seed the feature catalog into the production market database.
 *
 * Upsert only. No row is deleted, no expense, booking, or receipt is touched, and R2 is not involved.
 * Run from `web/`: `npx tsx scripts/seed-feature-registry.ts`
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FEATURE_CATALOG } from '../src/lib/platform/feature-catalog.ts';

const DATABASE = '082c6644-4cb0-4fbd-b3d0-1d4d684f15a8';
const ACCOUNT = '513c82ca37c8d7e83926801120de3eee';
const DRY = process.argv.includes('--dry');

function oauthToken(): string {
  const path = join(process.env.APPDATA ?? '', 'xdg.config', '.wrangler', 'config', 'default.toml');
  const line = readFileSync(path, 'utf8')
    .split(/\r?\n/)
    .find((row) => row.startsWith('oauth_token'));
  const token = line?.split('=').slice(1).join('=').trim().replace(/^"|"$/g, '');
  if (!token) throw new Error('No Wrangler OAuth token. Sign in with `npx wrangler whoami` first.');
  return token;
}

const token = DRY ? '' : oauthToken();

async function run(sql: string, params: unknown[]) {
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/d1/database/${DATABASE}/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql, params }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`${res.status} ${JSON.stringify(body.errors ?? [])}`);
  return body.result?.[0]?.meta?.changes ?? 0;
}

const SQL = `INSERT INTO feature_registry (id, area, title, status, competitor, notes)
VALUES (?, ?, ?, ?, ?, ?)
ON CONFLICT(id) DO UPDATE SET
  area = excluded.area,
  title = excluded.title,
  status = excluded.status,
  competitor = excluded.competitor,
  notes = excluded.notes`;

let changed = 0;
for (const row of FEATURE_CATALOG) {
  if (DRY) {
    console.log('would upsert', row.id);
    continue;
  }
  changed += await run(SQL, [row.id, row.area, row.title, row.status, row.competitor, row.reason]);
}

if (DRY) {
  console.log(`dry run: ${FEATURE_CATALOG.length} rows, nothing written`);
} else {
  const counted = await run('SELECT COUNT(*) AS n FROM feature_registry', []);
  const rows = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/d1/database/${DATABASE}/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql: 'SELECT COUNT(*) AS n FROM feature_registry' }),
  }).then((res) => res.json());
  console.log(`upserted ${FEATURE_CATALOG.length} rows into feature_registry (${changed} changed).`);
  console.log('rows now', JSON.stringify(rows.result?.[0]?.results ?? []));
  void counted;
}
