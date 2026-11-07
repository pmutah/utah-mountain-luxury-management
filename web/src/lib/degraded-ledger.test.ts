/**
 * Every route that reads the ledger, run against a store that is refusing reads.
 *
 * This is the shape of the real outage: Cloudflare Error 1101, an unhandled exception, on routes that
 * read KV. Tightening `loadExtraCleaningFees` so it no longer swallows a limit failure made several
 * call sites able to throw where they used to return defaults, so each one is walked here and required
 * to answer with a status and a reason. A route that throws would be a 1101 in production.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

type Handler = (context: {
  request: Request;
  env: unknown;
  params: Record<string, string>;
}) => Promise<Response>;

const COOKIE = `wpm_auth=${btoa('wpm:pw').replace(/=+$/, '')}`;

/** A store at its read limit: every get raises the message `storageReadPaused` recognises. */
const limited = {
  SETTINGS: {
    async get() {
      throw new Error('KV GET limit exceeded');
    },
    async put() {},
    async delete() {},
    async list() {
      return { keys: [], list_complete: true };
    },
  },
  DASHBOARD_PASSWORD: 'pw',
};

async function call(path: string, method: 'GET' | 'PUT' | 'POST', body?: unknown): Promise<Response> {
  const mod = (await import(`../../functions/api/${path}.ts`)) as Record<string, unknown>;
  const handlerName = method === 'GET' ? 'onRequestGet' : method === 'PUT' ? 'onRequestPut' : 'onRequestPost';
  const handler = mod[handlerName] as Handler | undefined;
  assert.ok(handler, `${path} has no ${handlerName}`);
  return handler({
    request: new Request(`https://x/api/${path}`, {
      method,
      headers: { Cookie: COOKIE, 'Content-Type': 'application/json' },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }),
    env: limited,
    params: {},
  });
}

const ROUTES: Array<[string, 'GET' | 'PUT' | 'POST', unknown?]> = [
  ['portfolio/metrics', 'GET'],
  ['portfolio/history', 'GET'],
  ['portfolio/extra-cleaning', 'PUT', { 'ranch-2026-11': 400 }],
  ['agent/briefing', 'GET'],
  ['automation/run', 'POST'],
];

for (const [path, method, body] of ROUTES) {
  test(`${method} /api/${path} answers instead of throwing when the store refuses reads`, async () => {
    let res: Response;
    try {
      res = await call(path, method, body);
    } catch (err) {
      assert.fail(
        `/api/${path} threw ${err instanceof Error ? err.message : String(err)}. In production this is an unhandled exception, which Cloudflare reports as Error 1101.`,
      );
    }
    assert.equal(res.status, 503, `/api/${path} answered ${res.status} rather than refusing a paused read`);
    const text = await res.text();
    assert.ok(text.length > 0, `/api/${path} refused with an empty body, so it does not say why`);
    const json = JSON.parse(text) as Record<string, unknown>;
    assert.equal(typeof json.error, 'string', `/api/${path} has no error sentence`);
    assert.match(String(json.error), /could not be read|nothing was written/i);
  });
}

test('the fees read no longer hides a limit failure behind defaults', async () => {
  const { loadExtraCleaningFees } = await import('../../functions/_lib/kv.ts');
  await assert.rejects(
    () => loadExtraCleaningFees(limited as never),
    /could not be read|Storage reads are paused/i,
  );
});
