/**
 * Ask the readiness gate what it thinks of each saved guide on production.
 *
 * The gate is the thing that decides whether a guest app may go on, so the only honest answer to
 * "why is the guest portal off" is the gate's own, not a guess from field counts.
 */
import { guideReadiness, switchLine } from '../src/lib/guest-app-ready.ts';

const BASE = process.env.UML_BASE ?? 'https://wilhite-portfolio.pages.dev';
const password = process.argv[2];
if (!password) {
  console.error('usage: node scripts/guide-readiness.mjs <password>');
  process.exit(1);
}

const login = await fetch(`${BASE}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ password }),
});
const cookie = (login.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
const res = await fetch(`${BASE}/api/guest-guide`, { headers: { Cookie: cookie } });
const body = await res.json();

for (const [id, guide] of Object.entries(body.guides ?? {})) {
  const g = guide;
  const readiness = guideReadiness(g);
  console.log(`${id}: enabled=${g.enabled} ready=${readiness.ready}`);
  console.log(`  ${switchLine(g, g.enabled)}`);
  if (!readiness.ready) console.log(`  missing: ${readiness.missing.join(', ')}`);
  console.log(`  sections=${(g.sections ?? []).length} places=${(g.places ?? []).length}`);
}
