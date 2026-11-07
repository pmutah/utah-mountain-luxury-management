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

/** Children named on a booking note. They count only when they fit inside a guest total. */
export function noteChildCount(note: string | undefined): number | null {
  if (!note) return null;
  const match = note.match(/\b(\d{1,2})\s+child(?:ren)?\b/i);
  if (!match) return null;
  const count = Number(match[1]);
  if (!Number.isInteger(count) || count < 0 || count > 30) return null;
  const guests = note.match(/\b(\d{1,2})\s+guests?\b/i);
  if (guests && count > Number(guests[1])) return null;
  return count;
}

function childClause(children: number | null): string {
  if (children === null || children < 1) return '';
  return children === 1 ? ', including 1 child' : `, including ${children} children`;
}

/** The party size on a stay card. The raw note stays off this sentence. */
export function hostPartyPhrase(note: string | undefined): string {
  const count = noteGuestCount(note);
  const children = noteChildCount(note);
  if (count === null) {
    if (children !== null && children >= 1) {
      const named = children === 1 ? '1 child' : `${children} children`;
      return `This stay names ${named} and does not say how many guests.`;
    }
    return 'This stay does not say how many guests.';
  }
  const base = count === 1 ? 'This stay is for 1 guest' : `This stay is for ${count} guests`;
  if (children !== null && children === count) return 'This stay names only children. A stay needs an adult.';
  return `${base}${childClause(children)}.`;
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

/** Which stays beginning in the next 90 days name children. Names stay off the sentence. */
export function childBrief(
  stays: readonly { propertyId: string; checkIn: string; status?: string; note?: string }[],
  asOf: string,
): string {
  const tail = 'Names stay off this line.';
  const none = `No stays begin in the next 90 days. ${tail}`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) return none;
  const until = addDays(asOf, 90);
  const upcoming = stays
    .filter((stay) => stay.status !== 'cancelled' && stay.status !== 'blocked' && isHouse(stay.propertyId))
    .filter((stay) => /^\d{4}-\d{2}-\d{2}$/.test(stay.checkIn) && stay.checkIn >= asOf && stay.checkIn < until)
    .sort((a, b) => a.checkIn.localeCompare(b.checkIn) || a.propertyId.localeCompare(b.propertyId));
  if (upcoming.length === 0) return none;
  const named = upcoming.filter((stay) => (noteChildCount(stay.note) ?? 0) >= 1);
  if (named.length === 0) return `No stay beginning in the next 90 days names children. ${tail}`;
  const shown = named.slice(0, 6).map((stay) => {
    const children = noteChildCount(stay.note) ?? 0;
    const word = children === 1 ? '1 child' : `${children} children`;
    return `${LABEL[stay.propertyId as (typeof HOUSES)[number]]} ${shortWhen(stay.checkIn)}, ${word}`;
  });
  const more = named.length - shown.length;
  const list = `${shown.join('; ')}${more > 0 ? `; and ${more} more` : ''}`;
  const word = named.length === 1 ? 'stay names' : 'stays name';
  return `${named.length} ${word} children: ${list}. ${tail}`;
}
