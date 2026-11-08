/**
 * Is the deployed site running what this branch has?
 *
 * On 2026-11-07 the live site answered `/api/expenses` with a 503 and an **empty body**, and
 * `/api/reservations` with a Cloudflare 500 — while this branch returned sensible answers for both.
 * The deploy was far older than the branch: the live `llms.txt` was 2.8 KB against a much larger one
 * locally, the live `/api/agent/map` reported **zero** documented routes, and routes built this
 * session were served the SPA's HTML instead of running as Functions.
 *
 * None of the existing checks would have caught that. They read the source, and the source was fine.
 * What was broken was the distance between the source and what was live.
 *
 * This hits the live site and asks it questions whose answers are knowable from the branch. It is
 * read-only, needs no credentials, and is meant to be run before and after a deploy.
 *
 *   node scripts/check-deployed.mjs
 *   node scripts/check-deployed.mjs --base=https://example.pages.dev
 */

/**
 * Which site to check.
 *
 * The default is the production domain, which is right for a production deploy and wrong for every
 * other branch: Cloudflare publishes a non-production branch to `<branch>.<project>.pages.dev`, so the
 * deploy pipeline deployed the branch and then failed its own check by probing production, which was
 * still the old build. `UML_CHECK_BASE` lets the pipeline point at what it actually just deployed.
 */
const BASE =
  (process.argv.find((a) => a.startsWith('--base=')) ?? '').replace('--base=', '') ||
  process.env.UML_CHECK_BASE ||
  'https://wilhite-portfolio.pages.dev';

const problems = [];
const notes = [];

/** A GET with a short timeout. Returns status, content type, and the body text. */
async function probe(path) {
  const url = `${BASE}${path}`;
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(20000),
    });
    const body = await res.text();
    return { path, status: res.status, type: res.headers.get('content-type') ?? '', body };
  } catch (err) {
    return { path, status: 0, type: '', body: '', error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * A route that must answer JSON. If it answers the SPA's HTML, the Function is not deployed at all,
 * which is how a stale deploy presents and it looks like a 200 to a casual check.
 */
async function expectJson(path) {
  const r = await probe(path);
  if (r.status === 0) {
    problems.push(`${path}: no answer (${r.error})`);
    return null;
  }
  if (r.type.includes('text/html')) {
    problems.push(
      `${path}: answered ${r.status} with the app's HTML, so the Function is not deployed. The live site is older than this branch.`,
    );
    return null;
  }
  if (!r.type.includes('application/json')) {
    problems.push(`${path}: answered ${r.status} as ${r.type || 'no content type'}, not JSON.`);
    return null;
  }
  if (r.body.trim() === '') {
    problems.push(`${path}: answered ${r.status} with an empty body. A route that fails should say why.`);
    return null;
  }
  try {
    return JSON.parse(r.body);
  } catch {
    problems.push(`${path}: said it was JSON but did not parse.`);
    return null;
  }
}

// 1. The site is up at all.
const home = await probe('/');
if (home.status !== 200) problems.push(`/: the site answered ${home.status || home.error}`);

// 2. The agent map is the cheapest signal of what is deployed: it lists the routes the build knows.
const map = await expectJson('/api/agent/map');
if (map) {
  const count = Array.isArray(map.documentedRoutes) ? map.documentedRoutes.length : 0;
  if (count === 0) {
    problems.push('/api/agent/map: the live build documents no routes, so it predates the map registry.');
  } else {
    notes.push(`/api/agent/map: ${count} documented routes`);
  }
}

// 3. llms.txt must carry the routes built this session. A short one is an old build.
const llms = await probe('/llms.txt');
if (llms.status !== 200) {
  problems.push(`/llms.txt: answered ${llms.status}`);
} else {
  const wanted = [
    '/api/book/requests',
    '/api/clean/links',
    '/api/owner/links',
    '/api/pricing/push-plan',
    '/api/pricing/approved-rates',
  ];
  const missing = wanted.filter((path) => !llms.body.includes(path));
  if (missing.length > 0) {
    problems.push(
      `/llms.txt does not name ${missing.join(', ')}. Either the deploy is older than this branch, or the doc was dropped.`,
    );
  } else {
    notes.push(`/llms.txt: ${llms.body.length} bytes, names every recent route`);
  }
}

// 4. The client bundle actually being served must be the one this build produced.
//
//    This is the check that was missing. On 2026-11-08 `npm run deploy` reported "Deployed and verified"
//    while production's index.html still referenced `index-Q9gtsZVq.js` and the build had produced
//    `index-GOWt05II.js`. Every API route was fresh, `llms.txt` was current, and all five checks below
//    passed — but a lazy-loaded chunk was being served as **3 KB of HTML fallback** instead of the 28 KB
//    component, so two turns of client fixes silently never reached anybody. I only found it by fetching
//    a chunk and noticing the byte length was absurd.
//
//    A content-hashed filename makes this exact: if the build produced a different hash than the deployed
//    HTML names, the static half of the deploy is stale. It compares names, never contents, so it cannot
//    false-positive on whitespace.
try {
  const { readFileSync } = await import('node:fs');
  const { join, dirname } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  /*
   * Resolved from the script's own location, not the caller's cwd.
   *
   * Run from the repo root this looked for `<root>/dist/index.html`, did not find it, and excused itself — so the
   * same command gave weaker assurance depending on which directory it was invoked from. A check whose strength
   * depends on cwd is a check that will be run the weak way.
   */
  const distIndex = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'index.html');
  const localIndex = readFileSync(distIndex, 'utf8');
  const localScript = /assets\/index-[A-Za-z0-9_-]+\.js/.exec(localIndex)?.[0] ?? null;
  const liveScript = /assets\/index-[A-Za-z0-9_-]+\.js/.exec(home.body)?.[0] ?? null;
  if (!localScript) {
    problems.push('dist/index.html names no built bundle, so this check cannot compare it.');
  } else if (!liveScript) {
    problems.push('/ : the live HTML names no built bundle, so the static deploy is not this build.');
  } else if (localScript !== liveScript) {
    problems.push(
      `/ : the live HTML loads ${liveScript} but this build produced ${localScript}. The static half of the deploy is stale, so client changes are not live even though the Functions are.`,
    );
  } else {
    notes.push(`/ : serving this build's bundle (${localScript.split('/').pop()})`);
  }
} catch (err) {
  /*
   * Not being able to compare is not the same as passing.
   *
   * The first version of this check recorded "could not compare the bundle" as a note and still printed
   * "The deployed site matches this branch on every check" — the exact soft-failure shape it was written to
   * remove. It has to be a problem when a dist exists and cannot be read, and only excused when there is
   * genuinely no build to compare against (a check run before `npm run build`).
   */
  const missingDist =
    err instanceof Error && /ENOENT/.test(err.message) && /dist[\\/]index\.html/.test(err.message);
  if (missingDist) {
    notes.push('/ : no dist/index.html yet, so the bundle was not compared (run the build first)');
  } else {
    problems.push(
      `/ : the built index.html could not be read (${err instanceof Error ? err.message : String(err)}), so this check cannot prove the static deploy matches this branch.`,
    );
  }
}

// 5. A public route must answer JSON, so a deployment with no KV or no Functions is caught here.
await expectJson('/api/book/availability');

// 6. A private route must refuse with a readable reason, not crash. An empty 5xx is a broken build:
//    this branch answers 401 with a message when no password is set.
const expenses = await probe('/api/expenses');
if (expenses.status === 0) {
  problems.push(`/api/expenses: no answer (${expenses.error})`);
} else if (expenses.type.includes('text/html')) {
  problems.push('/api/expenses: answered with the app HTML, so the Function is not deployed.');
} else if (expenses.status >= 500) {
  // A 5xx is never fine, whether or not it carries a body. A considered refusal is 401 or 404.
  problems.push(
    `/api/expenses: answered ${expenses.status}. A private route should refuse with 401 and a reason when no password is set, not fail with a server error.`,
  );
} else if (expenses.status === 401 || expenses.status === 404) {
  notes.push(`/api/expenses: ${expenses.status} (refused with a reason)`);
} else {
  problems.push(`/api/expenses: answered ${expenses.status}, which is neither a refusal nor an answer this check knows.`);
}

console.log(`Checking ${BASE}\n`);
for (const note of notes) console.log(`  ok    ${note}`);
if (problems.length > 0) {
  console.error('\nThe deployed site is not this branch:\n');
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error(`\n${problems.length} problem(s).`);
  process.exit(1);
}
console.log('\nThe deployed site matches this branch on every check.');
