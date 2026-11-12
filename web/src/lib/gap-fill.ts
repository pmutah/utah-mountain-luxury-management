import { bookPath } from './public-paths';
import { addDays } from './market/dates';
import type { Reservation } from './api';

export type GapStay = Pick<Reservation, 'id' | 'propertyId' | 'checkIn' | 'checkOut' | 'guestName' | 'guestEmail' | 'guestPhone' | 'status' | 'source'>;

export type NightGap = {
  house: 'ranch' | 'lindon' | 'river';
  checkIn: string;
  checkOut: string;
  nights: number;
  link: string;
  guests: Array<{ name: string; stays: number }>;
  draft: string;
};

function active(stay: GapStay): boolean {
  const status = (stay.status ?? 'confirmed').toLowerCase();
  return status !== 'cancelled' && status !== 'blocked' && status !== 'declined';
}

export function findNightGaps(reservations: readonly GapStay[], asOf: string, horizon = 60, hideLindon = false): NightGap[] {
  const until = addDays(asOf, horizon);
  const houses = (['ranch', 'lindon', 'river'] as const).filter((house) => house !== 'lindon' || !hideLindon);
  const gaps: NightGap[] = [];
  for (const house of houses) {
    const stays = reservations
      .filter((stay) => stay.propertyId === house && active(stay) && stay.checkOut > asOf && stay.checkIn < until)
      .slice()
      .sort((a, b) => a.checkIn.localeCompare(b.checkIn));
    for (let i = 0; i < stays.length - 1; i++) {
      const left = stays[i]!;
      const right = stays[i + 1]!;
      if (left.checkOut >= right.checkIn) continue;
      const nights = Math.round((Date.parse(`${right.checkIn}T12:00:00Z`) - Date.parse(`${left.checkOut}T12:00:00Z`)) / 86_400_000);
      if (nights < 1 || nights > 4) continue;
      const guests = pastGuests(reservations, house, left.checkOut);
      gaps.push({
        house,
        checkIn: left.checkOut,
        checkOut: right.checkIn,
        nights,
        link: bookPath(`house=${house}&checkIn=${left.checkOut}&checkOut=${right.checkIn}`),
        guests,
        draft: outreachDraft(house, left.checkOut, right.checkIn, guests[0]?.name),
      });
    }
  }
  return gaps;
}

function pastGuests(reservations: readonly GapStay[], house: string, before: string): Array<{ name: string; stays: number }> {
  const counts = new Map<string, { name: string; stays: number }>();
  for (const stay of reservations) {
    if (stay.propertyId !== house || !active(stay) || stay.checkOut > before) continue;
    const key = (stay.guestEmail || stay.guestPhone || '').trim().toLowerCase();
    if (!key || !stay.guestName) continue;
    const row = counts.get(key) ?? { name: stay.guestName, stays: 0 };
    row.stays += 1;
    counts.set(key, row);
  }
  return [...counts.values()].sort((a, b) => b.stays - a.stays).slice(0, 5);
}

export function outreachDraft(house: string, checkIn: string, checkOut: string, name?: string): string {
  const who = name ? name.split(' ')[0] : 'there';
  const place = house === 'ranch' ? 'the Ranch House' : house === 'lindon' ? 'the Lindon House' : 'the River House';
  return `Hi ${who} — ${place} has ${checkIn} to ${checkOut} open. If you want those nights, the quote is on our site. Nothing is held until you ask.`;
}
