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
  if (existing && existing > 0) return existing;
  const fromText = payoutFromIcalText(ev.description) ?? payoutFromIcalText(ev.summary);
  if (fromText) return fromText;
  if (!ev.propertyId) return existing ?? 0;
  return findSeedBankPayout(ev.propertyId, guestName, ev.start, ev.end) ?? existing ?? 0;
}
