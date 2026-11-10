// The objective's central invariant: existing bookings are never changed.
// Counts booked nights per property straight from the deployed API, so a later run can compare.
import { writeFileSync } from 'node:fs';

const BASE = 'https://wilhite-portfolio.pages.dev';

async function get(path: string, token?: string): Promise<unknown> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { headers });
  return res.json();
}

const token = process.env.UML_BOT_TOKEN ?? process.env.MUSE_BOT_SECRET ?? '';
if (!token) {
  console.log('no bearer token in env — cannot read the private calendar');
  process.exit(1);
}

const nights = new Map<string, Set<string>>();
const data = (await get('/api/agent/map', token)) as unknown;

// Use the reservations route directly; the map tells us what exists.
const res = await fetch(`${BASE}/api/reservations`, { headers: { Authorization: `Bearer ${token}` } });
if (!res.ok) {
  console.log(`/api/reservations answered ${res.status}`);
  process.exit(1);
}
const body = (await res.json()) as { reservations?: Array<{ propertyId: string; checkIn: string; checkOut: string; status?: string }> };
const list = body.reservations ?? [];
for (const r of list) {
  if ((r.status ?? '').toLowerCase() === 'cancelled') continue;
  const set = nights.get(r.propertyId) ?? new Set<string>();
  const start = new Date(`${r.checkIn}T00:00:00Z`);
  const end = new Date(`${r.checkOut}T00:00:00Z`);
  for (let d = new Date(start); d < end; d.setUTCDate(d.getUTCDate() + 1)) {
    set.add(d.toISOString().slice(0, 10));
  }
  nights.set(r.propertyId, set);
}

const counts: Record<string, number> = {};
for (const [k, v] of [...nights].sort()) counts[k] = v.size;
console.log(JSON.stringify({ reservations: list.length, bookedNights: counts }, null, 2));
const out = process.env.BASELINE_OUT;
if (out) {
  writeFileSync(out, JSON.stringify({ reservations: list.length, bookedNights: counts }, null, 2));
  console.log(`wrote ${out}`);
}
void data;
