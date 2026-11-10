/**
 * Deploy, then check the thing that was actually deployed.
 *
 * `npm run deploy` builds and deploys, and then runs `check:deployed`, which probes a fixed URL —
 * production. On a non-production branch Cloudflare publishes to `<branch>.<project>.pages.dev`
 * instead, so the pipeline deployed the branch correctly and then failed its own check by looking at
 * the old production build. That is a confusing failure: the deploy worked and the exit code says it
 * did not.
 *
 * This asks wrangler for the URL it deployed, then checks that URL. It also refuses to run on a dirty
 * tree for a non-production branch, because "which commit is live" is exactly what took a whole
 * session to work out once already.
 *
 *   node scripts/deploy.mjs                 # current branch
 *   node scripts/deploy.mjs --branch=foo    # an explicit Pages branch
 *   node scripts/deploy.mjs --skip-checks   # deploy only (the checks already ran)
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const web = resolve(import.meta.dirname, '..');
const repo = resolve(web, '..');
const PROJECT = 'wilhite-portfolio';
const PRODUCTION = `https://${PROJECT}.pages.dev`;

const args = process.argv.slice(2);
const argOf = (prefix) => args.find((a) => a.startsWith(prefix))?.slice(prefix.length);

function run(command, commandArgs, options = {}) {
  return execFileSync(command, commandArgs, {
    cwd: web,
    stdio: 'inherit',
    // On Windows `npx` and `npm` are `.cmd` shims, which `spawnSync` cannot exec without a shell.
    shell: process.platform === 'win32',
    ...options,
  });
}

function capture(command, commandArgs) {
  return execFileSync(command, commandArgs, {
    cwd: web,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  }).trim();
}

const branch = argOf('--branch=') ?? capture('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
const isProduction = branch === 'main';

/* -------- a deploy has to name its commit, or nobody can tell what is live -------- */
/*
 * This guard used to cover only non-production branches, which is backwards: `main` is the site guests and owners use.
 * A dirty tree on `main` published code that exists in no commit — the live site could then differ from the branch with
 * nothing to trace it to. Both cases are refused now.
 */
const dirtyTree = capture('git', ['status', '--porcelain']);
if (dirtyTree.length > 0) {
  console.error(
    `Refusing to deploy ${branch} from a dirty tree.\n` +
      (isProduction
        ? 'This is production: uncommitted code would go live with no commit behind it.\n'
        : 'A preview nobody can trace to a commit is how the live site ended up older than the branch.\n') +
      // `--skip-checks` does not bypass this: the dirty check runs before it. Saying otherwise would be a false promise.
      'Commit first, then deploy. There is no flag that skips this check.',
  );
  process.exit(1);
}

if (!isProduction) {
  /*
   * Say out loud what a preview alias actually is.
   *
   * Measured on 2026-11-09: `elite-rebuild.wilhite-portfolio.pages.dev` and the production host report the same 21 River
   * and 61 Ranch booked nights. The branch alias is a **second live URL over the same data** — a request made there writes
   * real expenses, bookings, and receipts. Worth knowing before clicking through a preview, and worth saying once per
   * deploy rather than leaving to be discovered.
   */
  console.log(
    `\n  Note: ${branch}.${PROJECT}.pages.dev is a live URL over the SAME data as production.\n` +
      '  Requests made there change real bookings, expenses, and receipts.\n' +
      '  Use local `wrangler pages dev` for probing, which has its own store.\n',
  );
}

/* ------------------------------------ the gates, then the deploy ------------------------------------ */

if (!args.includes('--skip-checks')) {
  console.log('→ route guards');
  run('node', ['scripts/check-route-guards.cjs']);
  /*
   * A branch that is behind can still be a live preview alias running old code against the same store.
   * `elite-rebuild` sat 57 commits back on 2026-11-08 and went unnoticed because production and the tests
   * were both healthy. This refuses a deploy from a tree that has drifted, rather than discovering it weeks
   * later at a URL nobody was checking.
   */
  console.log('→ branch drift');
  run('node', ['scripts/check-branches.mjs']);
  console.log('→ functions typecheck');
  run('npx', ['tsc', '-p', 'tsconfig.functions.json']);
  console.log('→ tests');
  run('npm', ['test']);
  console.log('→ build');
  run('npm', ['run', 'build']);
}

console.log(`→ deploying ${branch}`);
const out = execFileSync(
  'npx',
  [
    'wrangler',
    'pages',
    'deploy',
    'dist',
    `--project-name=${PROJECT}`,
    '--commit-dirty=true',
    ...(isProduction ? [] : [`--branch=${branch}`]),
  ],
  { cwd: web, encoding: 'utf8', shell: process.platform === 'win32' },
);
process.stdout.write(out);

/* ------------------ check the URL that was deployed, not a hard-coded one ------------------ */

const deployedUrl =
  out.match(/https:\/\/[a-z0-9-]+\.${PROJECT}\.pages\.dev/i)?.[0] ??
  out.match(/https:\/\/[a-z0-9-]+\.pages\.dev/i)?.[0] ??
  (isProduction ? PRODUCTION : `https://${branch}.${PROJECT}.pages.dev`);

console.log(`→ checking ${deployedUrl}`);
try {
  run('node', ['scripts/check-deployed.mjs', `--base=${deployedUrl}`]);
} catch {
  console.error(
    `\nThe deploy itself succeeded, but ${deployedUrl} does not match this branch.\n` +
      'That is a real problem to fix — not a reason to re-deploy and hope.',
  );
  process.exit(1);
}

/*
 * Then check that the fixes a person would notice are actually in the scripts being served.
 *
 * `check-deployed` answers "is this branch live". This answers "did the thing I fixed survive to production" — a bad
 * merge or a reverted file can leave the bundle current and the fix gone. It was written last turn and nothing ran it,
 * which is the same defect it exists to catch, one level up.
 */
console.log('→ fixes present in the served scripts');
try {
  run('npx', ['tsx', 'scripts/check-session-fixes.ts'], { env: { ...process.env, UML_CHECK_BASE: deployedUrl } });
} catch {
  console.error(
    `\n${deployedUrl} is this branch, but at least one fix is not in the scripts it serves.\n` +
      'That is a real regression to fix, not a reason to re-deploy.',
  );
  process.exit(1);
}
console.log(`\nDeployed and verified: ${deployedUrl}`);
