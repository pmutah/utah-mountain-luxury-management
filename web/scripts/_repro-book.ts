/**
 * Reproduce the booking 500 locally with a stack trace.
 *
 * Production answers a Cloudflare crash page with no detail, so the fix has to be found here. The
 * route is invoked directly with a fake KV and no Gmail, which is close enough to show where it throws.
 */
import { onRequestPost } from '../functions/api/book/index.ts';

const store = new Map<string, string>();
const kv = {
  async get(key: string) {
    return store.get(key) ?? null;
  },
  async put(key: string, value: string) {
    store.set(key, value);
  },
};

const env = { SETTINGS: kv };

const body = {
  propertyId: 'ranch',
  checkIn: '2027-03-08',
  checkOut: '2027-03-11',
  name: 'Diagnostic',
  email: 'probe@example.com',
  guests: 6,
};

try {
  const res = await onRequestPost!({
    request: new Request('https://x/api/book', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    env,
    params: {},
  } as never);
  console.log('status', res.status);
  console.log((await res.text()).slice(0, 400));
} catch (err) {
  console.log('THREW:', err instanceof Error ? err.stack?.split('\n').slice(0, 8).join('\n') : err);
}
