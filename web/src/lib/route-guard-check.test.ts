/**
 * The pre-deploy guard check is the only thing standing between a new route and a wide-open ledger.
 * It has already missed a class of bug: `isAuthenticated` looks like a guard but returns true when
 * DASHBOARD_PASSWORD is unset, which is how five routes answered an anonymous caller. These tests run
 * the real script against a fixture tree, so a future edit that weakens it fails here.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

// The tests run from the `web` package root, which is where the script lives.
const SCRIPT = resolve(process.cwd(), 'scripts', 'check-route-guards.cjs');

type Fixture = Record<string, string>;

/** Run the real check against a fixture tree. Returns the exit code and the combined output. */
function run(files: Fixture): { code: number; output: string } {
  const root = mkdtempSync(join(tmpdir(), 'uml-guards-'));
  try {
    mkdirSync(join(root, 'functions', 'api', 'book'), { recursive: true });
    for (const [rel, text] of Object.entries(files)) {
      mkdirSync(join(root, 'functions', 'api', rel, '..'), { recursive: true });
      writeFileSync(join(root, 'functions', 'api', rel), text);
    }
    try {
      const out = execFileSync(process.execPath, [SCRIPT], { cwd: root, encoding: 'utf8' });
      return { code: 0, output: out };
    } catch (err) {
      const e = err as { status?: number; stdout?: string; stderr?: string };
      return { code: e.status ?? 1, output: `${e.stdout ?? ''}${e.stderr ?? ''}` };
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// A host route that the script already knows about, with a chosen guard in the body.
const hostRoute = (guard: string) =>
  `export const onRequestGet: PagesFunction = async ({ request, env }) => {
  ${guard}
  return corsJson(request, {}, 200);
};
`;

/**
 * Every route the script expects to find, stubbed as a correctly guarded host route, so a fixture can
 * override just the one file it is testing. The script requires each listed file to exist.
 */
const BASELINE = (() => {
  const source = execFileSync(
    process.execPath,
    [
      '-e',
      `
    const fs = require('fs');
    const text = fs.readFileSync(${JSON.stringify(SCRIPT)}, 'utf8');
    const grab = (name) => {
      const at = text.indexOf('const ' + name + ' = [');
      if (at < 0) return [];
      const end = text.indexOf('];', at);
      return [...text.slice(at, end).matchAll(/'([^']+\\.ts)'/g)].map((m) => m[1]);
    };
    process.stdout.write(JSON.stringify({
      host: grab('HOST_ROUTES'),
      other: [...grab('GUEST_ROUTES'), ...grab('PUBLIC_ROUTES')],
    }));
  `,
    ],
    { encoding: 'utf8' },
  );
  return JSON.parse(source) as { host: string[]; other: string[] };
})();

/** The real files for the guest and public routes, so those checks see their actual handlers. */
function realFile(rel: string): string {
  return readFileSync(resolve(process.cwd(), 'functions', 'api', rel), 'utf8');
}

function baseline(overrides: Fixture = {}): Fixture {
  const files: Fixture = {};
  for (const rel of BASELINE.host) {
    files[rel] = hostRoute('if (!hostOnly(request, env)) return hostDenied(request, env);');
  }
  for (const rel of BASELINE.other) {
    files[rel] = realFile(rel);
  }
  return { ...files, ...overrides };
}

test('hostOnly passes, and isAuthenticated is rejected as a weak guard', () => {
  const strong = run(baseline());
  assert.equal(strong.code, 0, strong.output);

  const weak = run(
    baseline({
      'portfolio/metrics.ts': hostRoute(
        'if (!isAuthenticated(request, env)) return unauthorized(request);',
      ),
    }),
  );
  assert.equal(weak.code, 1, 'a weak isAuthenticated guard was accepted');
  assert.match(weak.output, /passes when no password is set/);
});

test('a host route with no guard at all is still caught', () => {
  const out = run(baseline({ 'portfolio/metrics.ts': hostRoute('void env;') }));
  assert.equal(out.code, 1);
  assert.match(out.output, /has no host guard/);
});

test('a route file nobody classified fails the check', () => {
  const out = run(
    baseline({
      'book/brand-new.ts': hostRoute('if (!hostOnly(request, env)) return hostDenied(request, env);'),
    }),
  );
  assert.equal(out.code, 1);
  assert.match(out.output, /book\/brand-new\.ts: not listed as a host, guest, or public route/);
});

test('a guest route that returns a door code fails the check', () => {
  const out = run(
    baseline({
      'guest-guide.ts': `export const onRequestGet: PagesFunction = async ({ request }) => {
  return corsJson(request, { doorCode: '1234' }, 200);
};
`,
    }),
  );
  assert.equal(out.code, 1);
  assert.match(out.output, /door code or Wi-Fi password with no guard/);
});

test('a route that reflects an arbitrary Origin fails the check', () => {
  const out = run(
    baseline({
      'book/echo.ts': `export const onRequestGet: PagesFunction = async ({ request }) => {
  return new Response('{}', { headers: { 'Access-Control-Allow-Origin': request.headers.get('Origin') } });
};
`,
    }),
  );
  assert.equal(out.code, 1);
  assert.match(out.output, /reflects the caller's Origin/);
});
