import { kvGet, kvPut, newId } from './kv-json';
import type { SettingsEnv } from './kv';
import type { CalendarBlock, ICalEvent, ICalFeedConfig, PropertyId } from './agent/types';
import { syncReservationsFromIcal } from './ical-reservation-sync';
import { getAllReservations } from './reservations-store';

const KV_BLOCKS = 'calendarBlocks';
const KV_FEEDS = 'icalFeeds';
const KV_CACHE = 'icalCache';

export async function loadCalendarBlocks(env: SettingsEnv): Promise<CalendarBlock[]> {
  return kvGet(env, KV_BLOCKS, []);
}

export async function addCalendarBlock(
  env: SettingsEnv,
  block: Omit<CalendarBlock, 'id' | 'createdAt'>,
): Promise<CalendarBlock> {
  const item: CalendarBlock = { ...block, id: newId('blk'), createdAt: new Date().toISOString() };
  const list = await loadCalendarBlocks(env);
  list.push(item);
  await kvPut(env, KV_BLOCKS, list);
  return item;
}

export async function deleteCalendarBlock(env: SettingsEnv, id: string): Promise<boolean> {
  const list = await loadCalendarBlocks(env);
  const next = list.filter((b) => b.id !== id);
  if (next.length === list.length) return false;
  await kvPut(env, KV_BLOCKS, next);
  return true;
}

export async function loadIcalFeeds(env: SettingsEnv): Promise<ICalFeedConfig> {
  return kvGet(env, KV_FEEDS, {});
}

export async function saveIcalFeeds(env: SettingsEnv, feeds: ICalFeedConfig): Promise<ICalFeedConfig> {
  return kvPut(env, KV_FEEDS, feeds);
}

export async function loadIcalCache(env: SettingsEnv): Promise<{ events: ICalEvent[]; fetchedAt?: string }> {
  return kvGet(env, KV_CACHE, { events: [] });
}

export async function saveIcalCache(
  env: SettingsEnv,
  events: ICalEvent[],
): Promise<{ events: ICalEvent[]; fetchedAt: string }> {
  const data = { events, fetchedAt: new Date().toISOString() };
  await kvPut(env, KV_CACHE, data);
  return data;
}

/** Minimal iCal VEVENT parser */
export function parseIcalEvents(text: string, propertyId?: PropertyId): ICalEvent[] {
  const events: ICalEvent[] = [];
  const chunks = text.split('BEGIN:VEVENT');
  for (const chunk of chunks.slice(1)) {
    const dtStart = chunk.match(/DTSTART(?:;[^:\r\n]*)?:(\d{8})/)?.[1];
    const dtEnd = chunk.match(/DTEND(?:;[^:\r\n]*)?:(\d{8})/)?.[1];
    const uid = chunk.match(/UID:([^\r\n]+)/)?.[1]?.trim();
    const unfolded = chunk.replace(/\r?\n[ \t]/g, '');
    const summary = unfolded.match(/SUMMARY:([^\r\n]+)/)?.[1]?.trim();
    const description = unfolded.match(/DESCRIPTION:([^\r\n]+)/)?.[1]?.trim();
    if (!dtStart || !uid) continue;
    const start = `${dtStart.slice(0, 4)}-${dtStart.slice(4, 6)}-${dtStart.slice(6, 8)}`;
    const endRaw = dtEnd ?? dtStart;
    const end = `${endRaw.slice(0, 4)}-${endRaw.slice(4, 6)}-${endRaw.slice(6, 8)}`;
    events.push({ uid, start, end, summary, description, propertyId, source: 'ical' });
  }
  return events;
}

export async function syncIcalFeeds(env: SettingsEnv): Promise<{ events: ICalEvent[]; fetchedAt: string }> {
  const feeds = await loadIcalFeeds(env);
  const all: ICalEvent[] = [];
  for (const prop of ['ranch', 'lindon'] as PropertyId[]) {
    const url = feeds[prop];
    if (!url) continue;
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const text = await res.text();
      all.push(...parseIcalEvents(text, prop));
    } catch {
      // skip failed feed
    }
  }
  await saveIcalFeeds(env, { ...feeds, lastSyncedAt: new Date().toISOString() });
  return saveIcalCache(env, all);
}

const STALE_SYNC_MS = 30 * 60 * 1000;

export function isIcalSyncStale(lastSyncedAt?: string): boolean {
  if (!lastSyncedAt) return true;
  return Date.now() - new Date(lastSyncedAt).getTime() > STALE_SYNC_MS;
}

/** Fetch Hospitable iCal feeds and merge events into the reservation calendar. */
export async function syncIcalAndReservations(env: SettingsEnv): Promise<{
  events: ICalEvent[];
  fetchedAt: string;
  reservationSync: Awaited<ReturnType<typeof syncReservationsFromIcal>>;
  discrepancies: Awaited<ReturnType<typeof checkCalendarDiscrepancies>>;
}> {
  const { events, fetchedAt } = await syncIcalFeeds(env);
  const reservationSync = await syncReservationsFromIcal(env, events);
  const discrepancies = await checkCalendarDiscrepancies(env);
  return { events, fetchedAt, reservationSync, discrepancies };
}

/** Sync when feeds are configured and cache is older than 30 minutes. */
export async function syncIcalIfStale(env: SettingsEnv): Promise<void> {
  const feeds = await loadIcalFeeds(env);
  if (!feeds.ranch && !feeds.lindon) return;
  if (!isIcalSyncStale(feeds.lastSyncedAt)) return;
  await syncIcalAndReservations(env);
}

export function findCalendarGaps(
  reservations: Array<{ propertyId: PropertyId; checkIn: string; checkOut: string }>,
  blocks: CalendarBlock[],
  propertyId: PropertyId,
  from: string,
  to: string,
): Array<{ start: string; end: string; nights: number }> {
  const occupied: Array<{ start: string; end: string }> = [
    ...reservations
      .filter((r) => r.propertyId === propertyId)
      .map((r) => ({ start: r.checkIn, end: r.checkOut })),
    ...blocks.filter((b) => b.propertyId === propertyId).map((b) => ({ start: b.start, end: b.end })),
  ].sort((a, b) => a.start.localeCompare(b.start));

  const gaps: Array<{ start: string; end: string; nights: number }> = [];
  let cursor = from;
  for (const occ of occupied) {
    if (occ.end <= cursor || occ.start >= to) continue;
    if (occ.start > cursor) {
      const nights = Math.round(
        (new Date(occ.start).getTime() - new Date(cursor).getTime()) / 86400000,
      );
      if (nights > 0) gaps.push({ start: cursor, end: occ.start, nights });
    }
    if (occ.end > cursor) cursor = occ.end;
  }
  if (cursor < to) {
    const nights = Math.round((new Date(to).getTime() - new Date(cursor).getTime()) / 86400000);
    if (nights > 0) gaps.push({ start: cursor, end: to, nights });
  }
  return gaps;
}

export async function checkCalendarDiscrepancies(env: SettingsEnv): Promise<
  Array<{ type: string; message: string; event?: ICalEvent }>
> {
  const cache = await loadIcalCache(env);
  const reservations = await getAllReservations(env);
  const issues: Array<{ type: string; message: string; event?: ICalEvent }> = [];

  for (const ev of cache.events) {
    const match = reservations.find(
      (r) =>
        r.propertyId === ev.propertyId &&
        r.checkIn <= ev.start &&
        r.checkOut >= ev.end &&
        r.status !== 'cancelled',
    );
    if (!match) {
      issues.push({
        type: 'ical_without_reservation',
        message: `iCal block ${ev.start}–${ev.end} (${ev.summary ?? 'blocked'}) has no matching reservation`,
        event: ev,
      });
    }
  }
  return issues;
}
