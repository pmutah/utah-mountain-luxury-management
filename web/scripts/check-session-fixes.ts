/*
 * Reports whether the fixes shipped in this session are present in the deployed scripts.
 *
 * A development check, not a test: it needs the network and reads the live site. `npm run deploy` runs it after the deploy,
 * against the URL wrangler just published, so a bad merge or a reverted file cannot leave the bundle current and a fix
 * gone. Run it by hand with:
 *
 *   npx tsx scripts/check-session-fixes.ts
 *
 * Why it exists: every fix in this session was verified once, at the moment it shipped. Nothing stopped a later deploy from
 * dropping one. "Is my fix actually live?" was a question I kept answering by hand, and hand-checks get skipped.
 *
 * The scripts are found by following references, not by guessing hashes. A lazy import is written `./Chunk-HASH.js`
 * relative to its parent, which is the shape a shallower sweep missed — it reported a live fix as missing.
 */

const BASE = process.env.UML_CHECK_BASE ?? 'https://wilhite-portfolio.pages.dev';

type Check = {
  /** What the fix does, in a host's words. */
  fix: string;
  /** A string only that fix introduces. */
  text: string;
};

const SCRIPT_CHECKS: Check[] = [
  { fix: 'A cleaner link is a full address you can text', text: 'Copy for texting' },
  { fix: 'The clean desk says ticks are saved to the server', text: 'saved to the server' },
  { fix: 'A part booking says the house is shared', text: 'part of a shared house' },
  { fix: 'A part guest is told to ask which entrance', text: 'Ask us which entrance is yours' },
  { fix: 'The request page names the part asked for', text: 'request-parts' },
  { fix: 'A closed door code says why and who to call', text: 'door code closed at noon' },
  { fix: 'The split mode is switchable', text: 'Suggest only' },
  { fix: 'The part calendar lists all three parts', text: 'Garage Suite, Recreation Wing, Main Lodge' },
  { fix: 'One door code opens every part', text: 'One door code covers the whole building' },
];

async function get(path: string): Promise<string> {
  const res = await fetch(`${BASE}${path}`).catch(() => null);
  if (!res?.ok) return '';
  return res.text();
}

async function main(): Promise<number> {
  const html = await get('/');
  const entry = /assets\/index-[A-Za-z0-9_-]+\.js/.exec(html)?.[0] ?? '';
  if (!entry) {
    console.error('The live HTML names no built bundle, so nothing can be checked.');
    return 1;
  }

  /** Follow every script reference from every script until nothing new appears. */
  const bodies = new Map<string, string>();
  const queue = [entry.slice('assets/'.length)];
  while (queue.length > 0) {
    const name = queue.shift()!;
    if (bodies.has(name)) continue;
    const body = await get(`/assets/${name}`);
    if (!body) continue;
    bodies.set(name, body);
    // Two shapes: `assets/Chunk-HASH.js` for a preload, `./Chunk-HASH.js` for a lazy import.
    for (const m of body.matchAll(/(?:assets\/|\.\/)([A-Za-z0-9_-]+\.js)/g)) {
      const next = m[1]!;
      if (!bodies.has(next) && !queue.includes(next)) queue.push(next);
    }
  }

  const sitemap = await get('/sitemap.xml');

  console.log(`checking ${BASE}`);
  console.log(`entry ${entry}, ${bodies.size} scripts followed\n`);

  let missing = 0;
  for (const check of SCRIPT_CHECKS) {
    const hit = [...bodies.values()].some((body) => body.includes(check.text));
    if (hit) console.log(`  ok    ${check.fix}`);
    else {
      missing += 1;
      console.log(`  MISS  ${check.fix}   <- "${check.text}"`);
    }
  }

  console.log('');
  if (sitemap.includes('<loc>https://wilhite-portfolio.pages.dev/book/</loc>')) {
    console.log('  ok    The sitemap advertises the slashed booking path');
  } else {
    missing += 1;
    console.log('  MISS  The sitemap advertises the slashed booking path');
  }

  /*
   * Two fixes live in Functions, not in a client script, so they are read through the routes that expose them. Looking for
   * them in scripts was a mistake in an earlier version of this check.
   */
  const sendRoute = await fetch(`${BASE}/api/surveys/send`, { method: 'POST' }).catch(() => null);
  const sendType = sendRoute?.headers.get('content-type') ?? '';
  if (sendType.includes('application/json')) console.log('  ok    The send route answers JSON, so a failed send can return a link');
  else {
    missing += 1;
    console.log('  MISS  The send route is not answering JSON');
  }

  const mapRes = await fetch(`${BASE}/api/agent/map`).catch(() => null);
  const map = mapRes?.ok ? ((await mapRes.json().catch(() => null)) as { apis?: Record<string, string> } | null) : null;
  if (map?.apis && 'riverSplit' in map.apis) console.log('  ok    The agent map documents the Riverhouse parts');
  else {
    missing += 1;
    console.log('  MISS  The agent map does not document the Riverhouse parts');
  }

  console.log('');
  if (missing > 0) {
    console.error(`${missing} fix(es) are not live.`);
    return 1;
  }
  console.log('Every fix from this session is live.');
  return 0;
}

/*
 * `process.exitCode` rather than `process.exit`. Exiting while fetches are still settling leaves the event loop open, and
 * on Windows that trips a libuv assertion — the run then reports a crash code instead of a clean failure, which reads as
 * broken tooling rather than a missing fix.
 */
process.exitCode = await main();
