import assert from 'node:assert/strict';
import test from 'node:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { readJsonBody } from './json-body.ts';

/*
 * `await request.json()` throws on malformed input. Unguarded, that throw reached the runtime and the
 * caller got a Cloudflare 500 "Worker threw exception" page. Found on `POST /api/book` — the public
 * booking form — where a guest whose body was truncated by a bad connection saw a crash page instead
 * of a message they could act on.
 */

function post(body: string): Request {
  return new Request('https://x/api/book', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
}

test('a malformed body is a bad request, not a server fault', async () => {
  for (const bad of ['{broken', '', 'not json', '{"a":']) {
    const read = await readJsonBody(post(bad));
    assert.equal(read.ok, false, `"${bad}" was accepted`);
    if (read.ok) continue;
    assert.equal(read.response.status, 400, `"${bad}" did not answer 400`);
    const body = (await read.response.json()) as { error?: string };
    assert.match(String(body.error), /could not be read/i, 'the 400 does not say what to do');
  }
});

test('valid JSON that is not an object is refused the same way', async () => {
  /*
   * `null`, a bare string, and an array all parse as valid JSON and are all useless as a request body.
   * A route that destructures one would throw further down, which is the same 500 by a longer path.
   */
  for (const notABody of ['null', '"text"', '42', '[1,2,3]', 'true']) {
    const read = await readJsonBody(post(notABody));
    assert.equal(read.ok, false, `${notABody} was accepted as a body`);
    if (read.ok) continue;
    assert.equal(read.response.status, 400);
  }
});

test('an object body comes back parsed', async () => {
  const read = await readJsonBody<{ name: string }>(post('{"name":"Brandon"}'));
  assert.equal(read.ok, true);
  if (!read.ok) return;
  assert.equal(read.body.name, 'Brandon');
});

test('the public booking route cannot crash on a bad body', async () => {
  /*
   * Checked against the route itself, not the helper: the defect was that the route called
   * `request.json()` directly. A guard on the helper proves nothing about a route that does not use it.
   */
  const source = readFileSync(join(process.cwd(), 'functions', 'api', 'book', 'index.ts'), 'utf8');
  assert.match(source, /try\s*\{[\s\S]{0,200}?await request\.json\(\)/, 'the booking route parses JSON unguarded');
  assert.doesNotMatch(
    source,
    /:\s*PagesFunction<[^>]*>\s*=\s*async\s*\(\{\s*request,\s*env\s*\}\)\s*=>\s*\{\s*const body = \(await request\.json\(\)\)/,
    'the booking route is back to an unguarded body read',
  );
});

test('no guest route parses JSON without a guard', async () => {
  /*
   * The guest-facing routes are the ones where a crash page is worst: a real person, mid-booking, with
   * no idea what to do. This walks the guest routes and requires each one to guard its body.
   */
  const guestRoutes = [
    ['api', 'book', 'index.ts'],
    ['api', 'stay-preferences', '[token].ts'],
    ['api', 'esign', 'sign', '[token].ts'],
  ];
  const naked: string[] = [];
  for (const parts of guestRoutes) {
    const path = join(process.cwd(), 'functions', ...parts);
    const source = readFileSync(path, 'utf8');
    if (!source.includes('request.json()')) continue;
    const guarded =
      source.includes('readJsonBody') ||
      /try\s*\{[\s\S]{0,300}?await request\.json\(\)/.test(source);
    if (!guarded) naked.push(parts.join('/'));
  }
  assert.deepEqual(naked, [], `guest routes that crash on a bad body:\n${naked.join('\n')}`);
});

test('no route anywhere parses a JSON body unguarded', async () => {
  /*
   * The same hole existed in 20 host and admin routes. A 500 on a host form is less severe than on a
   * guest booking, but it is the same defect and it was found one route at a time. This is the sweep:
   * every file under `functions/` that reads a body must go through `readJsonBody` or guard the throw.
   */
  const naked: string[] = [];
  for (const file of walk(join(process.cwd(), 'functions'))) {
    if (file.endsWith('.test.ts')) continue;
    const source = readFileSync(file, 'utf8');
    if (!source.includes('await request.json()')) continue;
    /*
     * The guard has to be at the **call site**, not merely imported. The first version of this sweep
     * passed a deliberately-unguarded route because the file still imported `readJsonBody` while no
     * longer calling it — so an unused import made a crashing route look safe. A guard test that a
     * broken file can pass is not a guard.
     */
    const guarded =
      /await readJsonBody[<(]/.test(source) ||
      // `request.json().catch(() => ({}))` already handles the throw.
      source.includes('request.json().catch(') ||
      /try\s*\{[\s\S]{0,400}?await request\.json\(\)/.test(source);
    if (!guarded) naked.push(file.slice(process.cwd().length + 1).replace(/\\/g, '/'));
  }
  assert.deepEqual(naked, [], `routes that crash on a malformed body:\n${naked.join('\n')}`);
});

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSafe(dir)) {
    const path = join(dir, entry);
    if (statSafe(path) === 'dir') out.push(...walk(path));
    else if (entry.endsWith('.ts')) out.push(path);
  }
  return out;
}

function readdirSafe(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

function statSafe(path: string): 'dir' | 'file' | 'none' {
  try {
    return statSync(path).isDirectory() ? 'dir' : 'file';
  } catch {
    return 'none';
  }
}
