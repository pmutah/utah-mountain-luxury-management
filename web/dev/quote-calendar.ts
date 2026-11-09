import { MAX_DAILY_MOVE, type ApprovedRate } from '../src/lib/market/rate-sheet';
import { devApprovedForCalendar } from './approved-rates';
import { addDays, denverToday } from '../src/lib/market/dates';
import { nightAsk } from '../src/lib/market/rates';
import { publicCalendarFromLists, type PublicCalendar } from '../src/lib/public-calendar';

const ORIGIN = 'https://wilhite-portfolio.pages.dev';

async function readJson(path: string): Promise<unknown | null> {
  const res = await fetch(`${ORIGIN}${path}`).catch(() => null);
  const type = res?.headers.get('content-type') ?? '';
  if (!res?.ok || !type.includes('application/json')) return null;
  return res.json().catch(() => null);
}

/** Nights only. The guest browser never receives the reservation list. */
export async function devPublicCalendar(): Promise<PublicCalendar> {
  const today = denverToday();
  const staysBody = await readJson('/api/reservations');
  const blocksBody = await readJson('/api/calendar/blocks');
  const reservations =
    staysBody && typeof staysBody === 'object' && Array.isArray((staysBody as { reservations?: unknown }).reservations)
      ? (staysBody as { reservations: unknown[] }).reservations
      : null;
  const blocks =
    blocksBody && typeof blocksBody === 'object' && Array.isArray((blocksBody as { blocks?: unknown }).blocks)
      ? (blocksBody as { blocks: unknown[] }).blocks
      : null;
  if (!reservations || !blocks || (staysBody as { storageReads?: string }).storageReads === 'paused') {
    return {
      storageReads: 'paused',
      from: today,
      until: today,
      nights: null,
      closed: null,
      held: null,
      approved: null,
      pace: { ranch: 'unknown', lindon: 'unknown', river: 'unknown' },
      turns: null,
      units: null,
    };
  }
  // The preview has no approved sheet of its own, so one night carries a preview approval. That is
  // what lets the approved-price path be checked in a browser before a host has approved anything.
  // It is 8% over the published card, the most the cap allows, and it walks forward until it finds a
  // night the calendar has not taken. An approval made in this preview is added on top.
  return publicCalendarFromLists(reservations, blocks, today, [], [
    ...devApprovedNights(today, reservations, blocks),
    ...devApprovedForCalendar(),
  ]);
}

/** One preview approval per house, on the first open night about a month out. */
function devApprovedNights(
  today: string,
  reservations: readonly unknown[],
  blocks: readonly unknown[],
): ApprovedRate[] {
  const taken = new Set<string>();
  const collect = (row: unknown) => {
    if (!row || typeof row !== 'object') return;
    const record = row as Record<string, unknown>;
    const start = typeof record.checkIn === 'string' ? record.checkIn : typeof record.start === 'string' ? record.start : '';
    const end = typeof record.checkOut === 'string' ? record.checkOut : typeof record.end === 'string' ? record.end : '';
    if (!start || !end) return;
    let cursor = start;
    while (cursor < end) {
      taken.add(cursor);
      cursor = addDays(cursor, 1);
    }
  };
  reservations.forEach(collect);
  blocks.forEach(collect);

  const out: ApprovedRate[] = [];
  for (const house of ['ranch', 'lindon', 'river'] as const) {
    for (let i = 30; i < 60; i += 1) {
      const date = addDays(today, i);
      if (taken.has(date)) continue;
      const ask = nightAsk(house, date);
      if (ask.closed) continue;
      out.push({
        house,
        date,
        guest: ask.guest + Math.round(ask.guest * MAX_DAILY_MOVE),
        approvedAt: new Date().toISOString(),
      });
      break;
    }
  }
  return out;
}
