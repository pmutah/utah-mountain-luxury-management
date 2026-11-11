/**
 * Read-only KV export.
 *
 * Writes outside the git repo. A failed key is recorded and the snapshot is left incomplete.
 * A failed read is never saved as an empty ledger. This script does not delete anything.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const dest = resolve(process.env.UML_BACKUP_DIR || join(homedir(), 'uml-data-backups', new Date().toISOString().slice(0, 10)));
const namespace = 'a211af7ec8bd4c2e973d6421cccd8beb';

function allowed(repoRoot, out) {
  const norm = (value) => value.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
  const root = norm(repoRoot);
  const target = norm(out);
  return Boolean(root && target && target !== root && !target.startsWith(`${root}/`));
}

if (!allowed(repo, dest)) {
  console.error('Refusing to write a backup inside the git repo.');
  process.exit(1);
}

const token = process.env.CLOUDFLARE_API_TOKEN;
const account = process.env.CLOUDFLARE_ACCOUNT_ID;
if (!token || !account) {
  console.error('CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID are required. Nothing was written.');
  process.exit(2);
}

async function cf(path) {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${account}/storage/kv/namespaces/${namespace}${path}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!response.ok) throw new Error(`KV read failed ${response.status}`);
  return response;
}

const names = [];
let cursor = '';
do {
  const listed = await cf(`/keys?limit=1000${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
  const body = await listed.json();
  if (!body.success) throw new Error('KV list failed');
  for (const key of body.result ?? []) names.push(key.name);
  cursor = body.result_info?.cursor || '';
} while (cursor);

const missing = [];
const values = {};
for (const name of names) {
  try {
    const response = await cf(`/values/${encodeURIComponent(name)}`);
    values[name] = await response.text();
  } catch {
    missing.push(name);
  }
}

mkdirSync(dest, { recursive: true });
if (missing.length > 0) {
  writeFileSync(join(dest, 'INCOMPLETE.json'), JSON.stringify({ missing, saved: false }, null, 2));
  console.error(`Incomplete. ${missing.length} keys failed. No ledger was saved as empty.`);
  process.exit(3);
}

writeFileSync(join(dest, 'kv.json'), JSON.stringify(values));
writeFileSync(
  join(dest, 'manifest.json'),
  JSON.stringify({ keys: names.length, at: new Date().toISOString(), namespace }, null, 2),
);
console.log(`Wrote ${names.length} keys. Counts are in manifest.json.`);
