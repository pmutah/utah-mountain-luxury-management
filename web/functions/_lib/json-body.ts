import { corsJson } from './data';

/**
 * Read a JSON request body, or answer 400.
 *
 * `await request.json()` throws on malformed input. Where that throw was unguarded it reached the
 * runtime and the caller got a Cloudflare **500 "Worker threw exception"** HTML page — on
 * `POST /api/book`, the public booking form, a guest whose body was cut off by a flaky connection saw
 * a crash page for a form they could simply resend.
 *
 * Some routes already guarded this by hand and some did not, so the behaviour differed per route. This
 * is the one way: a bad body is a bad request, and the message says what to do.
 *
 * Returns `{ ok: true, body }` or `{ ok: false, response }` so a caller can return early:
 *
 * ```ts
 * const read = await readJsonBody(request);
 * if (!read.ok) return read.response;
 * ```
 */
export type JsonBodyResult<T> =
  | { ok: true; body: T }
  | { ok: false; response: Response };

export async function readJsonBody<T = Record<string, unknown>>(
  request: Request,
  message = 'That request could not be read. Send it again.',
): Promise<JsonBodyResult<T>> {
  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    return { ok: false, response: corsJson(request, { error: message }, 400) };
  }
  /*
   * `null`, a bare string, and a number all parse as valid JSON and are all useless as a body. A route
   * that destructures one of those would throw further down, so it is refused here with the same 400.
   */
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, response: corsJson(request, { error: message }, 400) };
  }
  return { ok: true, body: parsed as T };
}
