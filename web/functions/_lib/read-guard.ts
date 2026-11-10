import { corsHeaders } from './data';
import { storageReadPaused } from './kv-json';

/**
 * Run a store read, and either give back the value or a refusal to send to the caller.
 *
 * Twenty-four routes on this branch awaited a store read with no guard. A store at its read limit
 * throws a `StorageReadError`, so those routes produced an unhandled exception — Cloudflare's **Error
 * 1101** — instead of saying the books were unreadable. That is exactly what the live site was doing.
 *
 * The pattern at a call site:
 *
 *   const read = await readOrRefuse(request, () => getAllReservations(env), 'Saved bookings');
 *   if ('response' in read) return read.response;
 *   const stays = read.value;
 *
 * A non-pause error is rethrown, because that is a real fault and a 500 is the honest answer for it.
 */
export type ReadResult<T> = { ok: true; value: T } | { ok: false; response: Response };

export async function readOrRefuse<T>(
  request: Request,
  read: () => Promise<T>,
  what = 'Saved records',
): Promise<ReadResult<T>> {
  try {
    return { ok: true, value: await read() };
  } catch (err) {
    if (!storageReadPaused(err)) throw err;
    return { ok: false, response: pausedResponse(request, what) };
  }
}

/**
 * Run a whole guest handler, turning a paused store into a 503 instead of an unhandled throw.
 *
 * The guest routes resolve a token to a stay before they can answer anything, so the read is at the
 * top of the handler and there is no single call to wrap. This wraps the handler body instead.
 */
export async function withPausedGuard(
  request: Request,
  run: () => Promise<Response>,
  what = 'This stay',
): Promise<Response> {
  try {
    return await run();
  } catch (err) {
    if (!storageReadPaused(err)) throw err;
    return pausedResponse(request, what);
  }
}

/** The same refusal on its own, for a route that already has its own try. */export function pausedResponse(request: Request, what = 'Saved records'): Response {
  return new Response(
    JSON.stringify({
      error: `${what} could not be read just now, so nothing is shown. Nothing was written over them. Try again shortly.`,
      storageReads: 'paused',
    }),
    {
      status: 503,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        ...corsHeaders(request),
      },
    },
  );
}

/**
 * Report an unexpected throw as JSON naming the fault, instead of letting Cloudflare answer with an opaque 1102.
 *
 * Measured on production 2026-11-10: `/api/pricing/push-plan` and `/api/pricing/yield-plan` returned
 * `HTTP 503` with `Content-Type: text/plain` and the body `error code: 1102` - Cloudflare's "Worker exceeded
 * resource limits" page, which it serves for **any** uncaught throw. That page names nothing: not the route, not
 * the error, not the line. It is unactionable for a host (`wrangler pages deployment tail` also refused to
 * attach, so the stack was not reachable from outside at all) and it hides a real bug behind a platform error.
 *
 * So a route that can throw unexpectedly wraps its body here and gets a 500 that says what happened. The status
 * stays 5xx - this does not pretend the request worked - but the message is the diagnostic.
 *
 * Deliberately not used to swallow anything: the error is still reported, with its name and message, and the
 * route's own refusals (a paused store, a bad token) keep their existing statuses and wording.
 */
export function unexpectedResponse(request: Request, err: unknown, what = 'This request'): Response {
  const detail =
    err instanceof Error
      ? `${err.name}: ${err.message}`
      : typeof err === 'string'
        ? err
        : 'no detail was available';
  return new Response(
    JSON.stringify({
      error: `${what} failed unexpectedly. Nothing was written. ${detail}`,
      unexpected: true,
    }),
    {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        ...corsHeaders(request),
      },
    },
  );
}
