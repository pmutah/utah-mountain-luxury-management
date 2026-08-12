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

function channelFromSeed(current: string | undefined, seedSource: string): string {
  if (!current || current === 'Hospitable' || current === 'Calendar' || current === 'Direct') {
    return seedSource;
  }
  return current;
}

/** Overlay Airbnb/VRBO host-net onto an iCal row. Exact date match always wins. */
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
  const exact = RESERVATIONS.find(
    (s) => s.propertyId === row.propertyId && s.checkIn === row.checkIn && s.checkOut === row.checkOut,
  );
  if (exact && exact.payout > 0) {
    return {
      ...row,
      payout: exact.payout,
      source: channelFromSeed(row.source, exact.source),
    };
  }
  if ((row.payout ?? 0) > 0) return row;
  const seed = findSeedStay(row.propertyId as PropertyId, row.guestName, row.checkIn, row.checkOut);
  if (!seed || seed.payout <= 0) return row;
  return {
    ...row,
    payout: seed.payout,
    source: channelFromSeed(row.source, seed.source),
  };
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
  if (!ev.propertyId) return existing ?? 0;
  const fromSeed = findSeedBankPayout(ev.propertyId, guestName, ev.start, ev.end);
  if (fromSeed) return fromSeed;
  return existing ?? 0;
}
