/**
 * Has any branch fallen so far behind that its preview alias is serving old code?
 *
 * On 2026-11-08 `elite-rebuild` was **57 commits behind** `main` while
 * `https://elite-rebuild.wilhite-portfolio.pages.dev` answered 200 and ran the old build **against the
 * same KV store**. Anyone reaching that URL got a booking route that crashed with a Cloudflare 500 on a
 * malformed body, and host routes whose guards had already been tightened. Pushing the branch did not
 * help: no new preview deployment was created, so a pinned alias kept serving the old code until it was
 * deployed directly.
 *
 * That is invisible from source, invisible from the test suite, and invisible from a production check —
 * production was healthy the whole time. So it needs its own check.
 *
 * Read-only. Needs `git` and nothing else, so it can run in CI before a deploy.
 *
 *   node scripts/check-branches.mjs
 *   node scripts/check-branches.mjs --max=2
 */
import { execFileSync } from 'node:child_process';

const MAX = Number(
  (process.argv.find((a) => a.startsWith('--max=')) ?? '').replace('--max=', '') || 0,
);

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

/** The branch that ships. Every other branch is compared against it. */
const SHIPPING = 'main';

let branches;
try {
  branches = git(['branch', '--format=%(refname:short)'])
    .split('\n')
    .map((name) => name.trim())
    .filter((name) => name && !name.startsWith('('));
} catch (err) {
  console.error(`could not list branches: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
}

const problems = [];
for (const branch of branches) {
  if (branch === SHIPPING) continue;
  let behind;
  try {
    behind = Number(git(['rev-list', '--count', `${branch}..${SHIPPING}`]));
  } catch {
    // No common ancestor is a different problem, and not this check's business.
    continue;
  }
  if (behind > MAX) {
    problems.push(`${branch} is ${behind} commit${behind === 1 ? '' : 's'} behind ${SHIPPING}`);
  }
}

if (problems.length === 0) {
  console.log(
    `Every branch is within ${MAX} commit${MAX === 1 ? '' : 's'} of ${SHIPPING}, so no alias can be serving stale code.`,
  );
  process.exit(0);
}

console.error('A branch that is behind can still be a live preview running old code:');
for (const line of problems) console.error(`  - ${line}`);
console.error('');
console.error('Fast-forward it, and deploy it if a preview alias exists for it:');
console.error(`  git checkout <branch> && git merge --ff-only ${SHIPPING} && git push`);
console.error('  npx wrangler pages deploy dist --project-name wilhite-portfolio --branch <branch>');
process.exit(1);
