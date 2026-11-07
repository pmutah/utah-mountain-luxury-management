/**
 * The spec names paths. A path with no route file behind it is a lie an agent will act on, so every
 * declared path is checked against the filesystem.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { museUmlOpenApiSpec } from '../../functions/_lib/muse/openapi.ts';

const spec = museUmlOpenApiSpec();
const paths = Object.keys(spec.paths as Record<string, unknown>);

/** `/api/book/requests` → `functions/api/book/requests.ts`, and `{token}` → `[token]`. */
function routeFile(path: string): string {
  const rel = path.replace(/^\/api\//, '').replace(/\{(\w+)\}/g, '[$1]');
  return join(process.cwd(), 'functions', 'api', `${rel}.ts`);
}

/** A path may also be a directory route with an index file. */
function routeIndex(path: string): string {
  const rel = path.replace(/^\/api\//, '').replace(/\{(\w+)\}/g, '[$1]');
  return join(process.cwd(), 'functions', 'api', rel, 'index.ts');
}

test('every declared path has a route file behind it', () => {
  const missing = paths.filter((path) => !existsSync(routeFile(path)) && !existsSync(routeIndex(path)));
  assert.deepEqual(missing, [], `the spec declares paths with no route: ${missing.join(', ')}`);
});

test('the muse and amanda tool routes are both real', () => {
  // The spec declares the muse pair; the amanda pair is the same file shape.
  assert.ok(existsSync(routeFile('/api/muse/tools')));
  assert.ok(existsSync(routeFile('/api/amanda/tools')));
  assert.ok(existsSync(routeFile('/api/muse/openapi')));
});
