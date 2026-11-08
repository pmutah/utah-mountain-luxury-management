import { PROPERTIES } from './api';
import { quoteGateLine } from './house-rules';
import { houseStay, SLEEPS } from './house-stay';
import { formatWhole } from './luxury';
import { addDays } from './market/dates';
import type { YearPace } from './market/fill';
import type { QuotedSheetNight } from './market/rate-sheet';
import type { HouseId } from './market/types';
import { guestPromoLine, quoteStay } from './quote';
import { agreementReadComplete } from './stay-agreement';

const TOGETHER = SLEEPS.river + SLEEPS.ranch;

export type CompoundOffer =
  | { show: false }
  | { show: true; ok: false; reason: string; paper: string[] }
  | {
      show: true;
      ok: true;
      nights: number;
      total: number;
      riverGuests: number;
      ranchGuests: number;
      line: string;
      paper: string[];
    };

/** Ranch and River for a party that fits neither house alone. Nothing is held or sent. */
export function compoundOffer(
  checkIn: string,
  checkOut: string,
  guests: number,
  children: number | undefined,
  taken: Partial<Record<HouseId, readonly string[]>>,
  asOf: string,
  paceFor: (house: HouseId) => YearPace,
  closed?: Partial<Record<HouseId, readonly string[]>>,
  /**
   * Host-approved guest rates, per house. Without this a two-house party paid the published card
   * while a one-house guest paid the price the host had approved for the very same night, so the
   * larger booking was the one that missed the host's pricing. It is optional because the callers
   * that only ask whether a stay is quotable never look at a price.
   */
  sheets?: Partial<Record<HouseId, readonly QuotedSheetNight[]>>,
): CompoundOffer {
  if (!Number.isInteger(guests) || guests < 1) return { show: false };
  if (guests <= SLEEPS.river) return { show: false };
  if (guests > TOGETHER) return refused(`Ranch and River together sleep ${TOGETHER}.`);

  const kids = children ?? 0;
  if (!Number.isInteger(kids) || kids < 0 || kids > guests) {
    return refused('Children are part of the overnight guests.');
  }
  if (kids === guests) return refused('A stay needs an adult.');
  const adults = guests - kids;
  if (adults < 2) return refused('A stay needs an adult in each house.');

  const riverGuests = SLEEPS.river;
  const ranchGuests = guests - riverGuests;
  let riverAdults = adults - 1;
  let ranchAdults = 1;
  if (riverAdults > riverGuests) {
    ranchAdults += riverAdults - riverGuests;
    riverAdults = riverGuests;
  }
  if (ranchAdults > ranchGuests || riverAdults < 1) return refused('A stay needs an adult in each house.');
  const riverChildren = riverGuests - riverAdults;
  const ranchChildren = ranchGuests - ranchAdults;
  if (riverChildren + ranchChildren !== kids) return refused('Children are part of the overnight guests.');

  const river = quoteStay('river', checkIn, checkOut, taken.river ?? [], {
    asOf,
    pace: paceFor('river'),
    closed: closed?.river ?? [],
    guests: riverGuests,
    children: riverChildren,
    sheet: sheets?.river ?? [],
  });
  if (!river.ok) return refused(labelReason('River', river.reason));

  const ranch = quoteStay('ranch', checkIn, checkOut, taken.ranch ?? [], {
    asOf,
    pace: paceFor('ranch'),
    closed: closed?.ranch ?? [],
    guests: ranchGuests,
    children: ranchChildren,
    sheet: sheets?.ranch ?? [],
  });
  if (!ranch.ok) return refused(labelReason('Ranch', ranch.reason));

  const childBit = kids > 0 ? `, including ${kids} ${kids === 1 ? 'child' : 'children'}` : '';
  const promo = guestPromoLine(river.promotionNights + ranch.promotionNights);
  const line = `${riverGuests} stay at the River House and ${ranchGuests} stay at the Ranch House${childBit}. Each house keeps an adult.${promo ? ` ${promo}` : ''} Nothing is sent.`;
  const nights = river.nights.length;
  const total = river.stayTotal + ranch.stayTotal;
  const paper = [
    `Ranch and River together ${formatWhole(total)} before tax for ${nights} ${nights === 1 ? 'night' : 'nights'}.`,
    line,
    'This paper does not hold either house or charge a card.',
  ];
  return { show: true, ok: true, nights, total, riverGuests, ranchGuests, line, paper };
}

/** Both houses, one request. The calendar and both agreements have to be open. Nothing is sent here. */
export function compoundRequestReady(input: {
  offerOk: boolean;
  calendarLive: boolean;
  rulesRead: boolean;
  event: boolean;
  riverTopics: readonly string[];
  ranchTopics: readonly string[];
}): boolean {
  if (!input.offerOk || !input.calendarLive || !input.rulesRead || input.event) return false;
  return agreementReadComplete('river', input.riverTopics) && agreementReadComplete('ranch', input.ranchTopics);
}

/** The note that would ride with one request for both houses. */
export function compoundRequestNote(line: string): string {
  return `${line} Both houses are one request. Nothing is held and nothing is charged yet.`;
}

/** Addresses, arrival, and parking for the two houses on one request. No price. */
export function bothHouseRequestNote(): string {
  const lines = (['river', 'ranch'] as const).flatMap((id) => {
    const stay = houseStay(id);
    const place = PROPERTIES[id];
    return [place?.name ?? '', place?.address ?? '', stay.arrival, stay.parking];
  });
  const body = lines.map((line) => line.trim()).filter((line) => line.length > 0).join(' ');
  const line = `Both houses are on this request. ${body} Nothing is held.`;
  if (line.includes('$') || /\bis open\b/.test(line) || /door\s*code|wi-?fi|password/i.test(line) || /Harcliff/i.test(line)) {
    return 'Both houses are on this request. Nothing is held.';
  }
  return line;
}

/** The together total stays off the page until the calendar can be read. */
export function compoundShownTotal(offer: CompoundOffer, calendarLive: boolean): string | null {
  if (!calendarLive || !offer.show || !offer.ok) return null;
  const line = formatWhole(offer.total);
  return line.includes('$') ? line : null;
}

/** Shown in place of both agreements. A refused stay names that reason. */
export function compoundAgreementHold(reason?: string): string {
  const fallback = 'The stay agreement stays off until both houses can be quoted. Nothing is sent.';
  return quoteGateLine(reason, 'The stay agreement stays off until then.', fallback);
}

/** The together price stays off the paper until the calendar can be read. */
export function compoundShownPaper(offer: CompoundOffer, calendarLive: boolean): string[] {
  if (!calendarLive || !offer.show) return [];
  if (offer.paper.some((line) => /door\s*code|wi-?fi|password/i.test(line))) return [];
  return offer.paper;
}

/** How a party larger than one house splits. No price, and it does not say a house is open. */
export function compoundSplitLine(guests: number, children?: number): string {
  const first = compoundPaperHold(guests, children)[0] ?? '';
  const line = first.replace(/ This does not say either house is open\.$/, '');
  if (!line || line.includes('$') || /\bis open\b/.test(line)) return '';
  return line;
}

/** Paper for a party that needs both houses before the calendar can be read. No price. */
export function compoundPaperHold(guests: number, children?: number): string[] {
  if (!Number.isInteger(guests) || guests <= SLEEPS.river || guests > TOGETHER) return [];
  const kids = children ?? 0;
  if (!Number.isInteger(kids) || kids < 0 || kids >= guests || guests - kids < 2) return [];
  const ranchGuests = guests - SLEEPS.river;
  const childBit = kids > 0 ? `, including ${kids} ${kids === 1 ? 'child' : 'children'}` : '';
  const lines = [
    `${SLEEPS.river} stay at the River House and ${ranchGuests} stay at the Ranch House${childBit}. Each house keeps an adult. This does not say either house is open.`,
    'This paper does not hold either house or charge a card. Nothing is sent.',
  ];
  return lines.some((line) => line.includes('$')) ? [] : lines;
}

/** A party that needs the River House and the Ranch House together. */
export function bothHouseQuote(guests: number | null): boolean {
  return guests !== null && Number.isInteger(guests) && guests > SLEEPS.river && guests <= SLEEPS.river + SLEEPS.ranch;
}

/** The house-page calendar. A party that needs both houses marks River and Ranch, and uses the River rules. */
export function housePageCalendar(
  house: HouseId,
  guests: number | null,
  ready: boolean,
  taken: Partial<Record<HouseId, readonly string[]>>,
  closed: Partial<Record<HouseId, readonly string[]>> = {},
): { house: HouseId; taken: string[]; closed: string[]; both: boolean } {
  if (ready && bothHouseQuote(guests)) {
    const nights = bothHouseMonthNights(taken, closed);
    return { house: 'river', taken: nights.taken, closed: nights.closed, both: true };
  }
  return { house, taken: [...(taken[house] ?? [])], closed: [...(closed[house] ?? [])], both: false };
}

/** Nights the two-house month has to mark. Lindon stays off this calendar. */
export function bothHouseMonthNights(
  taken: Partial<Record<HouseId, readonly string[]>>,
  closed: Partial<Record<HouseId, readonly string[]>> = {},
): { taken: string[]; closed: string[] } {
  const nights = (rows: readonly (readonly string[] | undefined)[]) =>
    [...new Set(rows.flatMap((row) => row ?? []))].filter((iso) => /^\d{4}-\d{2}-\d{2}$/.test(iso)).sort();
  return {
    taken: nights([taken.river, taken.ranch]),
    closed: nights([closed.river, closed.ranch]),
  };
}

const BOTH_LENGTHS = [2, 3, 4, 5, 7, 14, 28];

function lengthDate(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(Date.UTC(year!, month! - 1, day)).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** Lengths both houses can quote from this check-in. A night booked at either house stops the list. No price. */
export function bothHouseLengths(
  checkIn: string,
  guests: number,
  children: number | undefined,
  taken: Partial<Record<HouseId, readonly string[]>>,
  closed: Partial<Record<HouseId, readonly string[]>> | undefined,
  asOf: string,
  paceFor: (house: HouseId) => YearPace,
  /** Carried through so a shorter or longer stay is judged on the same prices as the stay itself. */
  sheets?: Partial<Record<HouseId, readonly QuotedSheetNight[]>>,
): { through: string; choices: { nights: number; checkOut: string }[] } | null {
  if (!bothHouseQuote(guests) || !/^\d{4}-\d{2}-\d{2}$/.test(checkIn)) return null;
  const kids = children ?? 0;
  if (!Number.isInteger(kids) || kids < 0 || kids >= guests || guests - kids < 2) return null;
  const choices: { nights: number; checkOut: string }[] = [];
  let through = '';
  let cap = 0;
  for (let nights = 2; nights <= 28; nights += 1) {
    const checkOut = addDays(checkIn, nights);
    const offer = compoundOffer(checkIn, checkOut, guests, kids, taken, asOf, paceFor, closed, sheets);
    if (!offer.show || !offer.ok) {
      if (offer.show && /at least \d+ nights/.test(offer.reason)) continue;
      break;
    }
    cap = nights;
    through = lengthDate(checkOut);
    if (BOTH_LENGTHS.includes(nights)) choices.push({ nights, checkOut });
  }
  if (cap > 0 && !choices.some((choice) => choice.nights === cap)) {
    choices.push({ nights: cap, checkOut: addDays(checkIn, cap) });
  }
  if (choices.length < 2 || !through) return null;
  if (JSON.stringify(choices).includes('$') || through.includes('$')) return null;
  return { through, choices };
}

/** Why those lengths are on a two-house quote. Nothing is held. */
export function bothHouseLengthNote(through: string): string {
  const line = `Both houses can quote this check-in through ${through}. Choosing a length does not send a request. Nothing is held.`;
  if (line.includes('$') || /\bis open\b/.test(line) || /door\s*code|wi-?fi|password/i.test(line)) {
    return 'Choosing a length does not send a request. Nothing is held.';
  }
  return line;
}

/** Why a two-house month marks a night. Nothing is held. */
export function bothHouseMonthNote(): string {
  const line = 'This month marks a night booked or closed at the River House or the Ranch House. Nothing is held.';
  if (line.includes('$') || /\bis open\b/.test(line) || /door\s*code|wi-?fi|password/i.test(line)) return 'Nothing is held.';
  return line;
}

function refused(reason: string): CompoundOffer {
  return {
    show: true,
    ok: false,
    reason,
    paper: [reason, 'This paper does not hold either house or charge a card.'],
  };
}

function labelReason(name: string, reason: string | null): string {
  const text = reason && !reason.includes('$') ? reason : 'This stay is not quoted.';
  if (text.startsWith('The ') || text.startsWith(`${name}:`)) return text;
  return `${name}: ${text}`;
}
