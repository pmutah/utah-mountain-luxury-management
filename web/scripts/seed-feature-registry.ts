/**
 * Seed the feature catalog into the production market database.
 *
 * Upsert only. No row is deleted, so a note a person wrote on a feature survives a reseed, and a feature that leaves the catalog keeps
 * its history. No expense, booking, or receipt is in this table.
 *
 * **Why this shells out to Wrangler instead of calling the D1 HTTP API.** The previous version read `oauth_token` out of
 * `%APPDATA%/xdg.config/.wrangler/config/default.toml` and posted it as a bearer to `api.cloudflare.com/client/v4/.../query`. That
 * token is an **OAuth** token, and the D1 HTTP endpoint accepts only **API** tokens: it answers `401 {"code":1000,"message":"Invalid
 * API Token"}`. The scope list was never the problem — `d1 (write)` was there. The credential type was. Wrangler refreshes and scopes
 * its own credential, so the only path that works is `wrangler d1 execute`.
 *
 * Run from `web/`:
 *   npx tsx scripts/seed-feature-registry.ts            (production)
 *   npx tsx scripts/seed-feature-registry.ts --dry      (writes nothing)
 *
 * It writes the SQL with `writeFileSync` at UTF-8: a PowerShell `>` redirect produces UTF-16, and Wrangler then reads the file as
 * binary, runs zero queries, and still exits 0 saying "Executed 0 queries". That is a success message for doing nothing, which is
 * exactly the failure this codebase keeps finding.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FEATURE_CATALOG } from '../src/lib/platform/feature-catalog.ts';

const DRY = process.argv.includes('--dry');
const DATABASE = 'uml-market';

/** A single-quoted SQL string with the quote doubled, which is the only escape SQLite needs here. */
function q(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

const SQL = FEATURE_CATALOG.map(
  (row) =>
    `INSERT INTO feature_registry (id, area, title, status, competitor, notes) VALUES (${q(row.id)}, ${q(row.area)}, ${q(row.title)}, ${q(row.status)}, ${q(row.competitor)}, ${q(row.reason)})
ON CONFLICT(id) DO UPDATE SET area = excluded.area, title = excluded.title, status = excluded.status, competitor = excluded.competitor, notes = excluded.notes;`,
).join('\n');

if (DRY) {
  console.log(`dry run: ${FEATURE_CATALOG.length} rows, nothing written`);
  for (const row of FEATURE_CATALOG) console.log('would upsert', row.id, `(${row.status})`);
  process.exit(0);
}

/*
 * Wrangler is invoked as a script through `node`, not as `npx.cmd`. On Windows, Node 24 refuses to spawn a `.cmd` file directly
 * (`spawnSync npx.cmd EINVAL`), so the old shell-out shape fails before Wrangler runs at all.
 */
const wranglerBin = join(process.cwd(), '..', 'node_modules', 'wrangler', 'bin', 'wrangler.js');

const dir = mkdtempSync(join(tmpdir(), 'uml-registry-'));
const file = join(dir, 'seed.sql');
try {
  writeFileSync(file, `${SQL}\nSELECT COUNT(*) AS n FROM feature_registry;\n`, 'utf8');
  const output = execFileSync(process.execPath, [wranglerBin, 'd1', 'execute', DATABASE, '--remote', '--file', file], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  /*
   * Wrangler exits 0 even when it ran nothing, so the answer is read out of its report rather than trusted from the exit code. A run
   * that wrote no query is a failure here, not a quiet success.
   */
  const executed = /Executed (\d+) queries/.exec(output);
  const written = /"Rows written": (\d+)/.exec(output) ?? /"rows_written": (\d+)/.exec(output);
  if (!executed || Number(executed[1]) === 0) {
    throw new Error(`Wrangler ran no query. It said: ${output.split('\n').slice(-4).join(' ')}`);
  }
  console.log(
    `upserted ${FEATURE_CATALOG.length} rows into ${DATABASE}: ${executed[1]} queries, ${written?.[1] ?? '?'} rows written.`,
  );
} finally {
  rmSync(dir, { recursive: true, force: true });
}
