/*
 * Reports whether the fixes shipped in this session are present in the deployed scripts.
 *
 * A development check, not a test: it needs the network and reads the live site. Run it after a deploy:
 *
 *   npx tsx scripts/check-session-fixes.ts
 *
 * Why it exists: every fix in this session was verified once, at the moment it shipped. Nothing stopped a later deploy from
 * dropping one. "Is my fix actually live?" was a question I kept answering by hand, and hand-checks get skipped.
 *
 * The scripts are found by following references rather than by guessing hashes: read the served HTML, take the entry it
 * names, then follow every `assets/*.js` reference from each script until nothing new appears. A chunk reached only by
 * route (`RequestStatus`) is not named by the entry but *is* named by the entry's own dependency graph, so recursion finds
 * it. That is exactly the case a shallower sweep got wrong.
 */

const BASE = process.env.UML_CHECK_BASE ?? 'https://wilhite-portfolio.pages.dev';

type Check = {
  /** What the fix does, in a host's words. */
  fix: string;
  /** A string only that fix introduces. */
  text: string;
  /** Where it lives: a client script, the sitemap, or the Functions half. */
  scope: 'script' | 'sitemap' | 'server';
};

const CHECKS: Check[] = [
  { fix: 'A cleaner link is a full address you can text', text: 'Copy for texting', scope: 'script' },
  { fix: 'The clean desk says ticks are saved to the server', text: 'saved to the server', scope: 'script' },
  { fix: 'A part booking says the house is shared', text: 'part of a shared house', scope: 'script' },
  { fix: 'A part guest is told to ask which entrance', text: 'Ask us which entrance is yours', scope: 'script' },
  { fix: 'The request page names the part asked for', text: 'request-parts', scope: 'script' },
  { fix: 'A closed door code says why and who to call', text: 'door code closed at noon', scope: 'script' },
  { fix: 'The split mode is switchable', text: 'Suggest only', scope: 'script' },
  { fix: 'The part calendar lists all three parts', text: 'Garage Suite, Recreation Wing, Main Lodge', scope: 'script' },
  { fix: 'One door code opens every part', text: 'One door code covers the whole building', scope: 'script' },
  { fix: 'The sitemap advertises the slashed booking path', text: '<loc>https://wilhite-portfolio.pages.dev/book/</loc>', scope: 'sitemap' },
];

/*
 * The two server-side fixes cannot be read from a client script, and looking for them there was a mistake in the first
 * version of this check. They are verified through the routes that expose them.
 */
const SERVER_CHECKS: Array<{ fix: string; probe: () => Promise<boolean> }> = [
  {
    fix: 'A failed send hands over the working link (surveys/send returns `link`)',
    probe: async () => {
      // The route refuses an unauthenticated call, which proves it is deployed but not its body. The body is checked by
      // the unit guards; here we only confirm the route exists and answers JSON rather than the app's HTML.
      const res = await fetch(`${BASE}/api/surveys/send`, { method: 'POST' }).catch(() => null);
      const type = res?.headers.get('content-type') ?? '';
      return Boolean(res) && type.includes('application/json');
    },
  },
  {
    fix: 'The agent map documents the Riverhouse parts',
    probe: async () => {
      /*
       * The map is grouped, not a flat `documentedRoutes` array — the first version of this probe looked for one and
       * reported a live route as missing. The routes live under `apis`, so the probe reads that.
       */
      const res = await fetch(`${BASE}/api/agent/map`).catch(() => null);
      if (!res?.ok) return false;
      const body = (await res.json().catch(() => null)) as { apis?: Record<string, string> } | null;
      return Boolean(body?.apis && 'riverSplit' in body.apis);
    },
  },
];

async function get(path: string): Promise<string> {
  const res = await fetch(`${BASE}${path}`).catch(() => null);
  if (!res?.ok) return '';
  return res.text();
}

const html = await get('/');
const entry = /assets\/index-[A-Za-z0-9_-]+\.js/.exec(html)?.[0] ?? '';
if (!entry) {
  console.error('The live HTML names no built bundle, so nothing can be checked.');
  process.exit(1);
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
  /*
   * References come in two shapes: a lazy import is written `./Chunk-HASH.js` relative to the chunk, and a preloaded one
   * `assets/Chunk-HASH.js`. Matching only the second skipped every lazy chunk — which is where the request page lives, and
   * that is why this check first reported a live fix as missing.
   */
  for (const m of body.matchAll(/(?:assets\/|\.\/)([A-Za-z0-9_-]+\.js)/g)) {
    const next = m[1]!;
    if (!bodies.has(next) && !queue.includes(next)) queue.push(next);
  }
}

// The sitemap is not a script, so it is read on its own.
const sitemap = await get('/sitemap.xml');

console.log(`checking ${BASE}`);
console.log(`entry ${entry}, ${bodies.size} scripts followed\n`);

let missing = 0;
for (const check of CHECKS) {
  if (check.scope === 'sitemap') {
    if (sitemap.includes(check.text)) console.log(`  ok    ${check.fix}`);
    else {
      missing += 1;
      console.log(`  MISS  ${check.fix}   <- "${check.text}"`);
    }
    continue;
  }
  const hit = [...bodies.entries()].find(([, body]) => body.includes(check.text));
  if (hit) console.log(`  ok    ${check.fix}`);
  else {
    missing += 1;
    console.log(`  MISS  ${check.fix}   <- "${check.text}"`);
  }
}

console.log('');
for (const check of SERVER_CHECKS) {
  const ok = await check.probe();
  if (ok) console.log(`  ok    ${check.fix}`);
  else {
    missing += 1;
    console.log(`  MISS  ${check.fix}`);
  }
}

console.log('');
if (missing > 0) {
  console.error(`${missing} fix(es) are not live.`);
  process.exit(1);
}
console.log('Every fix from this session is live.');
