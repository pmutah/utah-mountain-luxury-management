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
