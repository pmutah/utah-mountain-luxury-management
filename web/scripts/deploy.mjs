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

/* -------- a non-production deploy has to name its commit, or nobody can tell what is live -------- */
if (!isProduction) {
  const dirty = capture('git', ['status', '--porcelain']);
  if (dirty.length > 0) {
    console.error(
      `Refusing to deploy ${branch} from a dirty tree.\n` +
        'A preview nobody can trace to a commit is how the live site ended up older than the branch.\n' +
        'Commit first, then deploy — or pass --skip-checks if you only want to publish what is here.',
    );
    process.exit(1);
  }
}

/* ------------------------------------ the gates, then the deploy ------------------------------------ */

if (!args.includes('--skip-checks')) {
  console.log('→ route guards');
  run('node', ['scripts/check-route-guards.cjs']);
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
console.log(`\nDeployed and verified: ${deployedUrl}`);
