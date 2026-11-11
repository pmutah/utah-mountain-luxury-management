import { corsHeaders } from '../data';
import { pausedResponse, unexpectedResponse } from '../read-guard';
import { storageReadPaused } from '../kv-json';

export function jsonResponse(request: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...corsHeaders(request),
    },
  });
}

/**
 * A write route has to refuse when the ledger cannot be read, even if this route does not save the books.
 * A 2xx while the store is down would tell the caller a write landed.
 */
export async function refuseIfLedgerUnreadable(request: Request, env: unknown): Promise<Response | null> {
  const settings = (env as { SETTINGS?: { get?: (key: string) => Promise<unknown> } }).SETTINGS;
  if (!settings?.get) return null;
  try {
    await settings.get('platform:probe');
    return null;
  } catch (err) {
    if (!storageReadPaused(err)) throw err;
    return pausedResponse(request, 'Saved records');
  }
}

export function failSoft(request: Request, err: unknown, what: string): Response {
  return unexpectedResponse(request, err, what);
}
