import { addDays } from './market/dates';

const HOUSES = ['river', 'ranch', 'lindon'] as const;
const LABEL: Record<(typeof HOUSES)[number], string> = { river: 'River', ranch: 'Ranch', lindon: 'Lindon' };

function isHouse(id: string): id is (typeof HOUSES)[number] {
  return HOUSES.includes(id as (typeof HOUSES)[number]);
}

function shortWhen(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(Date.UTC(year!, month! - 1, day)).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/** A guest count written on a booking note. Names, phones, and the rest of the note stay out. */
export function noteGuestCount(note: string | undefined): number | null {
  if (!note) return null;
  const guests = note.match(/\b(\d{1,2})\s+guests?\b/i);
  if (guests) {
    const count = Number(guests[1]);
    return count >= 1 && count <= 30 ? count : null;
  }
  const adults = note.match(/\b(\d{1,2})\s+adults?\b/i);
  if (!adults) return null;
  const grown = Number(adults[1]);
  const children = note.match(/\b(\d{1,2})\s+children\b/i);
  const kids = children ? Number(children[1]) : 0;
  const count = grown + kids;
  return count >= 1 && count <= 30 ? count : null;
}

/** The party size on a stay card. The raw note stays off this sentence. */
export function hostPartyPhrase(note: string | undefined): string {
  const count = noteGuestCount(note);
  if (count === null) return 'This stay does not say how many guests.';
  return count === 1 ? 'This stay is for 1 guest.' : `This stay is for ${count} guests.`;
}

/** Which stays beginning in the next 90 days name a party size. Names stay off the sentence. */
export function partyBrief(
  stays: readonly { propertyId: string; checkIn: string; status?: string; note?: string }[],
  asOf: string,
): string {
  const none = 'No stays begin in the next 90 days. Names stay off this line.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) return none;
  const until = addDays(asOf, 90);
  const upcoming = stays
    .filter((stay) => stay.status !== 'cancelled' && stay.status !== 'blocked' && isHouse(stay.propertyId))
    .filter((stay) => /^\d{4}-\d{2}-\d{2}$/.test(stay.checkIn) && stay.checkIn >= asOf && stay.checkIn < until)
    .sort((a, b) => a.checkIn.localeCompare(b.checkIn) || a.propertyId.localeCompare(b.propertyId));
  if (upcoming.length === 0) return none;
  const named = upcoming.filter((stay) => noteGuestCount(stay.note) !== null);
  const missing = upcoming.filter((stay) => noteGuestCount(stay.note) === null);
  if (missing.length === 0) {
    return `Every stay beginning in the next 90 days names a party size. ${named.length} ${named.length === 1 ? 'stay' : 'stays'}. Names stay off this line.`;
  }
  const shown = missing.slice(0, 6).map((stay) => `${LABEL[stay.propertyId as (typeof HOUSES)[number]]} ${shortWhen(stay.checkIn)}`);
  const more = missing.length - shown.length;
  const list = `${shown.join(', ')}${more > 0 ? `, and ${more} more` : ''}`;
  if (named.length === 0) {
    return `No stay beginning in the next 90 days names a party size. ${list}. Names stay off this line.`;
  }
  return `${named.length} ${named.length === 1 ? 'stay names' : 'stays name'} a party size. ${missing.length} ${missing.length === 1 ? 'does' : 'do'} not: ${list}. Names stay off this line.`;
}
