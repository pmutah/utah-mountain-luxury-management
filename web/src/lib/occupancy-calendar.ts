import { isHouseId, type StaySpan } from './availability';
import { addDays } from './market/dates';
import type { HouseId } from './market/types';

const LABEL: Record<HouseId, string> = {
  ranch: 'Ranch',
  lindon: 'Lindon',
  river: 'River',
};

function stamp(asOf: string): string {
  const day = /^\d{4}-\d{2}-\d{2}$/.test(asOf) ? asOf.replace(/-/g, '') : '19700101';
  return `${day}T120000Z`;
}

function dateStamp(iso: string): string {
  return iso.replace(/-/g, '');
}

const HOUSES: HouseId[] = ['river', 'ranch', 'lindon'];

function covered(stays: readonly StaySpan[], house: HouseId, iso: string): boolean {
  return stays.some(
    (stay) =>
      stay.propertyId === house &&
      stay.status !== 'cancelled' &&
      stay.checkIn <= iso &&
      iso < stay.checkOut,
  );
}

/** Consecutive closed nights become one unavailable block. A night already on a stay is left once. */
function blockSpans(
  stays: readonly StaySpan[],
  closed: Partial<Record<HouseId, readonly string[]>> | undefined,
  asOf: string,
): StaySpan[] {
  if (!closed) return [];
  const spans: StaySpan[] = [];
  for (const house of HOUSES) {
    const nights = [...new Set(closed[house] ?? [])]
      .filter((iso) => /^\d{4}-\d{2}-\d{2}$/.test(iso) && !covered(stays, house, iso))
      .sort();
    let start = '';
    let prev = '';
    const flush = () => {
      if (!start || !prev) return;
      const checkOut = addDays(prev, 1);
      if (checkOut > asOf) {
        spans.push({
          propertyId: house,
          checkIn: start < asOf ? asOf : start,
          checkOut,
          status: 'blocked',
        });
      }
      start = '';
      prev = '';
    };
    for (const iso of nights) {
      if (prev && addDays(prev, 1) === iso) {
        prev = iso;
        continue;
      }
      flush();
      start = iso;
      prev = iso;
    }
    flush();
  }
  return spans;
}

/** Taken nights for a calendar app. Names and payouts are not fields on this file. */
export function occupancyCalendar(
  stays: readonly StaySpan[],
  asOf: string,
  closed?: Partial<Record<HouseId, readonly string[]>>,
): string {
  const seen = new Map<string, number>();
  const events = [...stays, ...blockSpans(stays, closed, asOf)]
    .filter(
      (stay) =>
        isHouseId(stay.propertyId) &&
        stay.status !== 'cancelled' &&
        /^\d{4}-\d{2}-\d{2}$/.test(stay.checkIn) &&
        /^\d{4}-\d{2}-\d{2}$/.test(stay.checkOut) &&
        stay.checkOut > stay.checkIn &&
        stay.checkOut > asOf,
    )
    .sort((a, b) => a.checkIn.localeCompare(b.checkIn) || a.propertyId.localeCompare(b.propertyId))
    .map((stay) => {
      const house = stay.propertyId as HouseId;
      const base = `${house}-${stay.checkIn}-${stay.checkOut}`;
      const count = (seen.get(base) ?? 0) + 1;
      seen.set(base, count);
      const uid = count === 1 ? `${base}@uml` : `${base}-${count}@uml`;
      return [
        'BEGIN:VEVENT',
        `UID:${uid}`,
        `DTSTAMP:${stamp(asOf)}`,
        `DTSTART;VALUE=DATE:${dateStamp(stay.checkIn)}`,
        `DTEND;VALUE=DATE:${dateStamp(stay.checkOut)}`,
        `SUMMARY:${LABEL[house]} unavailable`,
        'END:VEVENT',
      ].join('\r\n');
    });
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Utah Mountain Luxury//Occupancy//EN', 'CALSCALE:GREGORIAN', ...events, 'END:VCALENDAR', ''].join(
    '\r\n',
  );
}

export function occupancyFilename(): string {
  return 'uml-occupancy.ics';
}
