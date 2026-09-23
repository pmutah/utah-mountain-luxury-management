import { RESERVATIONS } from './data';
import type { ICalEvent, PropertyId } from './agent/types';

export function datesOverlap(
  a: { checkIn: string; checkOut: string },
  b: { checkIn: string; checkOut: string },
): boolean {
  return a.checkIn < b.checkOut && b.checkIn < a.checkOut;
}

export function namesSimilar(a: string, b: string): boolean {
  const na = a.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const nb = b.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  const tokensA = na.split(' ').filter((t) => t.length > 2 && t !== 'group');
  const tokensB = new Set(nb.split(' ').filter((t) => t.length > 2 && t !== 'group'));
  return tokensA.some((t) => tokensB.has(t) && t.length >= 4);
}

export function findSeedStay(
  propertyId: PropertyId,
  guestName: string,
  checkIn: string,
  checkOut: string,
) {
  const stay = { checkIn, checkOut };
  const exact = RESERVATIONS.find(
    (s) => s.propertyId === propertyId && s.checkIn === checkIn && s.checkOut === checkOut,
  );
  if (exact) return exact;
  return RESERVATIONS.find(
    (s) =>
      s.propertyId === propertyId &&
      namesSimilar(s.guestName, guestName) &&
      datesOverlap(s, stay),
  );
}

/** Host net already recorded for a matching stay (after Airbnb/VRBO taxes and fees). */
export function findSeedBankPayout(
  propertyId: PropertyId,
  guestName: string,
  checkIn: string,
  checkOut: string,
): number | undefined {
  const seed = findSeedStay(propertyId, guestName, checkIn, checkOut);
  if (seed && seed.payout > 0) return seed.payout;
  return undefined;
}

/** Channels that mean "not set yet" — seed may fill these. Explicit labels such as Airbnb, VRBO, and HomeAway stay. */
function isPlaceholderChannel(source: string | undefined): boolean {
  return !source || source === 'Hospitable' || source === 'Calendar' || source === 'Direct';
}

function channelFromSeed(current: string | undefined, seedSource: string): string {
  if (isPlaceholderChannel(current)) return seedSource;
  return current!;
}

/**
 * Fill seed host-net and channel onto rows that do not have them yet.
 * A stored payout (> 0) or an explicit channel wins when property + dates collide with a seed stay.
 * Seed still supplies the amount for $0 iCal rows.
 */
export function applyHostNetFromSeed<
  T extends {
    propertyId: string;
    guestName: string;
    checkIn: string;
    checkOut: string;
    payout: number;
    source: string;
  },
>(row: T): T {
  const storedPayout = Number(row.payout);
  const hasPayout = Number.isFinite(storedPayout) && storedPayout > 0;
  const exact = RESERVATIONS.find(
    (s) => s.propertyId === row.propertyId && s.checkIn === row.checkIn && s.checkOut === row.checkOut,
  );
  const seed = exact
    ? exact
    : hasPayout
      ? undefined
      : findSeedStay(row.propertyId as PropertyId, row.guestName, row.checkIn, row.checkOut);
  if (!seed || seed.payout <= 0) return row;
  if (hasPayout && !isPlaceholderChannel(row.source)) return row;

  const payout = hasPayout ? storedPayout : seed.payout;
  const source = channelFromSeed(row.source, seed.source);
  if (payout === row.payout && source === row.source) return row;
  return { ...row, payout, source };
}

export function payoutFromIcalText(text?: string): number | undefined {
  if (!text) return undefined;
  const patterns = [
    /payout[:\s]*\$?\s*([\d,]+(?:\.\d{1,2})?)/i,
    /host\s*(?:payout|earnings|net)[:\s]*\$?\s*([\d,]+(?:\.\d{1,2})?)/i,
    /amount\s+paid[:\s]*\$?\s*([\d,]+(?:\.\d{1,2})?)/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (!m?.[1]) continue;
    const n = Number(m[1].replace(/,/g, ''));
    if (Number.isFinite(n) && n > 0) return n;
  }
  return undefined;
}

export function resolveIcalPayout(ev: ICalEvent, guestName: string, existing?: number): number {
  const fromText = payoutFromIcalText(ev.description) ?? payoutFromIcalText(ev.summary);
  if (fromText) return fromText;
  if (existing && existing > 0) return existing;
  if (!ev.propertyId) return existing ?? 0;
  const fromSeed = findSeedBankPayout(ev.propertyId, guestName, ev.start, ev.end);
  if (fromSeed) return fromSeed;
  return existing ?? 0;
}
