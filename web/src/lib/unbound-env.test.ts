/**
 * A guard call that names an `env` the handler never bound throws a ReferenceError the moment the
 * route is hit. TypeScript catches it only if the Functions folder is typechecked, which it was not
 * until this test's tsconfig existed. This test reads the source and fails on the same pattern, so
 * the mistake is caught even without the typecheck.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(process.cwd(), 'functions');

function files(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...files(full));
    else if (name.endsWith('.ts')) out.push(full);
  }
  return out;
}

/** Handlers whose parameter list omits `env` but whose body calls a guard with it. */
function unboundEnv(file: string): string[] {
  const text = readFileSync(file, 'utf8');
  const bad: string[] = [];
  // A handler signature, then the guard call within the first stretch of the body.
  const re = /export const (onRequest\w+)[^=]*=\s*async \(([^)]*)\)\s*=>\s*\{([\s\S]{0,400}?)\n\};/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    const name = match[1]!;
    const params = match[2]!;
    const body = match[3]!;
    const usesEnv = /\b(?:hostOnly|hostDenied|isAuthenticated|isMuseAuthorized)\([^)]*\benv\b/.test(body);
    const bindsEnv = /\benv\b/.test(params);
    if (usesEnv && !bindsEnv) bad.push(name);
  }
  return bad;
}

test('no handler calls a guard with an env it never bound', () => {
  const offenders: string[] = [];
  for (const file of files(ROOT)) {
    for (const handler of unboundEnv(file)) {
      offenders.push(`${file.replace(process.cwd(), '')} → ${handler}`);
    }
  }
  assert.deepEqual(offenders, [], `a guard reads an unbound env: ${offenders.join(', ')}`);
});

test('every guarded handler destructures env', () => {
  // A narrower check on the two files that had the bug, so a regression is obvious.
  for (const rel of ['api/esign/lien-release.ts', 'api/esign/templates/index.ts']) {
    const text = readFileSync(join(ROOT, ...rel.split('/')), 'utf8');
    for (const match of text.matchAll(/export const onRequestGet[^=]*=\s*async \(\{([^}]*)\}\)/g)) {
      assert.match(match[1] ?? '', /\benv\b/, `${rel} onRequestGet does not bind env`);
    }
  }
});
