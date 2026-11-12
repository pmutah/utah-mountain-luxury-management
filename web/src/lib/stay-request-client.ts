import type { UpsellId } from './upsells';

const KEPT = 'Kept on this phone. The desk could not take it. Nothing was charged or texted.';

/**
 * File or withdraw one add-on on the host desk.
 *
 * The phone copy is already saved by the caller. This only reports whether the desk took it. A non-JSON answer,
 * a missing flag, or a network failure stays on the phone and is not described as filed.
 */
export async function postStayRequest(token: string, kind: UpsellId, on: boolean, note?: string): Promise<string> {
  try {
    const res = await fetch(`/api/stay-guide/${encodeURIComponent(token)}/requests`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, on, ...(note ? { note } : {}) }),
    });
    const text = await res.text();
    let body: { line?: unknown; sends?: unknown; changesBooking?: unknown } | null = null;
    try {
      const parsed = JSON.parse(text) as unknown;
      body = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as { line?: unknown }) : null;
    } catch {
      body = null;
    }
    if (!res.ok || !body || body.sends !== false || body.changesBooking !== false) return KEPT;
    return typeof body.line === 'string' && body.line ? body.line : 'On the desk. Nothing was charged or texted, and the booking was not moved.';
  } catch {
    return KEPT;
  }
}
