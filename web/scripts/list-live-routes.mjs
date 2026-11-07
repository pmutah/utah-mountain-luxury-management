/**
 * Which API routes exist on a deployed site, and which ones are served the SPA instead.
 *
 * Read-only. Built after a deploy was found to be a much older build than the branch: some routes
 * answered JSON, some answered the SPA's HTML (so the Function was missing), and one answered an
 * empty 5xx. This lists reality instead of guessing it.
 *
 *   node scripts/list-live-routes.mjs
 */

const BASE =
  (process.argv.find((a) => a.startsWith('--base=')) ?? '').replace('--base=', '') ||
  'https://wilhite-portfolio.pages.dev';

// Public, no-credential routes plus a few that fail closed with a readable reason. A 401 or 404 in
// JSON means the Function is deployed and considered the request; HTML means it is not there.
const PATHS = [
  '/api/agent/map',
  '/api/auth/session',
  '/api/portfolio/metrics',
  '/api/reservations',
  '/api/expenses',
  '/api/surveys',
  '/api/book/availability',
  '/api/book/requests',
  '/api/market/overview',
  '/api/guest-guide',
  '/api/clean/links',
  '/api/clean/progress',
  '/api/owner/links',
  '/api/pricing/snapshots',
  '/api/pricing/push-plan',
  '/api/pricing/shadow-days',
  '/api/pricing/approved-rates',
  '/api/expenses/archive',
  '/api/muse/instructions',
  '/api/muse/openapi.json',
];

async function probe(path) {
  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(20000),
    });
    const body = await res.text();
    return { status: res.status, type: res.headers.get('content-type') ?? '', len: body.length };
  } catch (err) {
    return { status: 0, type: '', len: 0, error: err instanceof Error ? err.message : String(err) };
  }
}

const rows = [];
for (const path of PATHS) {
  const r = await probe(path);
  // A Function that exists answers JSON (including a considered 401/404). HTML means it is missing.
  const kind = r.status === 0 ? 'error' : r.type.includes('text/html') ? 'missing' : r.type.includes('json') ? 'deployed' : 'other';
  rows.push({ path, status: r.status, kind, len: r.len });
}

const pad = (text, width) => String(text).padEnd(width);
console.log(`Live routes on ${BASE}\n`);
console.log(`${pad('route', 34)}${pad('status', 8)}${pad('body', 7)}verdict`);
for (const row of rows) {
  console.log(`${pad(row.path, 34)}${pad(row.status, 8)}${pad(row.len, 7)}${row.kind}`);
}

const missing = rows.filter((r) => r.kind === 'missing' || r.kind === 'error');
const broken = rows.filter((r) => r.kind === 'other');
console.log(
  `\n${rows.filter((r) => r.kind === 'deployed').length} deployed, ${missing.length} missing, ${broken.length} answered something else.`,
);
if (missing.length > 0) {
  console.log('\nMissing means the live site served the app HTML: that route is not in this deploy.');
}
