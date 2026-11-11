/**
 * Webhook signatures.
 *
 * Stripe sends `t=<unix>,v1=<hex>` over `${t}.${body}`.
 * Hospitable and Seam, until their live schemes are confirmed, send `x-uml-signature` as hex HMAC of the raw body.
 * A missing secret is a refusal, not an open door.
 */

export type HookVerdict = { ok: true } | { ok: false; reason: string };

const MAX_AGE_SECONDS = 5 * 60;

export async function hmacHex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signed = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return [...new Uint8Array(signed)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function sameHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifyWebhook(input: {
  secret: string | undefined;
  body: string;
  signature: string | null;
  nowSeconds?: number;
}): Promise<HookVerdict> {
  if (!input.secret) return { ok: false, reason: 'The webhook secret is not set.' };
  if (!input.signature) return { ok: false, reason: 'The signature is missing.' };
  const header = input.signature.trim();
  if (header.includes('v1=')) {
    const parts = Object.fromEntries(
      header.split(',').map((part) => {
        const index = part.indexOf('=');
        return [part.slice(0, index).trim(), part.slice(index + 1).trim()];
      }),
    );
    const stamp = Number(parts.t);
    const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
    if (!Number.isFinite(stamp) || Math.abs(now - stamp) > MAX_AGE_SECONDS) {
      return { ok: false, reason: 'The signature is too old.' };
    }
    const expected = await hmacHex(input.secret, `${stamp}.${input.body}`);
    if (!parts.v1 || !sameHex(expected, parts.v1)) return { ok: false, reason: 'The signature does not match.' };
    return { ok: true };
  }
  const expected = await hmacHex(input.secret, input.body);
  if (!sameHex(expected, header.toLowerCase())) return { ok: false, reason: 'The signature does not match.' };
  return { ok: true };
}
