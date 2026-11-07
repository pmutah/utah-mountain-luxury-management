import { PROPERTIES } from './api';
import { houseStay, nearbyGroups } from './house-stay';
import { bookingRules } from './booking-rules';
import { agreementTopics } from './stay-agreement';
import { houseStayAddon, type HouseAsideStay } from './house-offer';
import { addonMenuLine } from './upsells';
import { stayRhythm } from './stay-rhythm';
import { houseRules } from './house-rules';
import { formatWhole } from './luxury';
import type { HouseId } from './market/types';
import { otherStayRules, stayRuleLines } from './house-search';
import { publishedShortestLine } from './shortest-stay';
import { denverToday } from './market/dates';
import { stayPhotoCaption } from './house-photos';
import { placeSite } from './place-link';

export type BookingGuide = {
  name: string;
  facts: string[];
  rules: string[];
  nights: string[];
  checkout: string[];
  nearby: string[];
  /** Houses that fail a published night rule for these dates. Empty unless the calendar is unread. */
  compared: string[];
  /** The shortest stay this check-in can quote, when these dates fail. Empty when they pass. */
  shortest: string;
  close: string;
};

function once(lines: string[]): string[] {
  const seen = new Set<string>();
  const next: string[] = [];
  for (const line of lines) {
    if (!line || seen.has(line)) continue;
    seen.add(line);
    next.push(line);
  }
  return next;
}

function comparedLines(
  house: HouseId,
  checkIn: string,
  checkOut: string,
  compare?: { asOf: string; guests?: number; children?: number },
): string[] {
  if (!compare) return [];
  const own = stayRuleLines(checkIn, checkOut, compare.guests, compare.children, compare.asOf).find((row) => row.house === house);
  const others = otherStayRules(house, checkIn, checkOut, compare.guests, compare.children, compare.asOf);
  const lines = [own?.line ?? '', ...others.map((row) => row.line)].filter((line) => line.length > 0);
  if (lines.length === 0) return [];
  if (lines.some((line) => line.includes('$') || /\bis open\b/.test(line) || /door\s*code|wi-?fi|password/i.test(line))) return [];
  return [...lines, 'A house that meets the rule is left off. This does not say a house is open. Nothing is sent.'];
}

function shortestPaper(
  house: HouseId,
  checkIn: string,
  checkOut: string,
  compare?: { asOf: string; guests?: number; children?: number },
): string {
  if (!compare) return '';
  const line = publishedShortestLine(house, checkIn, checkOut, compare.asOf, compare.guests) ?? '';
  if (!line || line.includes('$') || /door\s*code|wi-?fi|password/i.test(line)) return '';
  return line;
}

/** The printed add-on line. The door-code timing stays on the access line. */
function paperAddon(house: HouseId, asOf: string, nights: HouseAsideStay): string {
  const line = houseStayAddon(house, asOf, nights).replace(/The door code still opens the day before\. ?/g, '');
  if (line.includes('$') || /\bis open\b/i.test(line) || /password/i.test(line)) {
    return 'An early arrival and a later checkout follow the dates on this page. Nothing is sent.';
  }
  return line;
}

/** Paper copy of the public house. It does not include a door code, a name, or an email. */
export function bookingGuide(
  house: HouseId,
  checkIn: string,
  checkOut: string,
  compare?: { asOf: string; guests?: number; children?: number },
  nights?: HouseAsideStay | null,
): BookingGuide {
  const stay = houseStay(house);
  const addons = nights ? paperAddon(house, compare?.asOf ?? denverToday(), nights) : addonMenuLine(house);
  const photo = stayPhotoCaption(house);
  const facts = [
    photo && /rendering/i.test(photo) ? photo : '',
    `Sleeps ${stay.sleeps}. Check-in ${stay.checkIn}. Check-out ${stay.checkOut}.`,
    stay.bedrooms ?? '',
    stay.arrival,
    stay.parking,
    PROPERTIES[house].address,
    stay.emergency,
    checkIn && checkOut ? `Dates on this quote: ${checkIn} to ${checkOut}.` : '',
    ...stayRhythm(house, checkIn, checkOut).map((line) => line.text),
    ...agreementTopics(house, 'paper').map((topic) => `${topic.title}. ${topic.detail}`),
    addons,
  ];
  return {
    name: PROPERTIES[house].name,
    facts: once(facts),
    rules: once(houseRules(house).map((rule) => rule.text)),
    nights: once(bookingRules(house)),
    checkout: once([...stay.checkout]),
    nearby: once(nearbyGroups(stay.nearby).flatMap((group) => [
      group.label,
      ...group.places.map((place) => {
        const site = placeSite(place.url);
        const where = place.area ? `, ${place.area}` : '';
        return `${place.name}${where}. ${place.note}${site ? ` ${site}` : ''}`;
      }),
    ])),
    compared: once(comparedLines(house, checkIn, checkOut, compare)),
    shortest: shortestPaper(house, checkIn, checkOut, compare),
    close: 'This paper does not hold the dates or charge a card. The door code stays off this paper.',
  };
}

export type PrintNoteKind = 'unread' | 'refused' | 'held' | 'priced';

/** What the print button says about the price. A refused stay is not called a quote. */
export function printPriceNote(kind: PrintNoteKind): string {
  const tail = 'It does not charge a card or hold the dates. A name stays off the paper.';
  if (kind === 'unread') return `The printed guide leaves the price off until the calendar can be read. ${tail}`;
  if (kind === 'refused') return `The printed guide leaves the price off. This stay is not quoted. ${tail}`;
  if (kind === 'held') return `The printed guide leaves the price off until the request can be sent. ${tail}`;
  return `The printed guide includes this price, the party, the arrival time, and the departure time. ${tail}`;
}

/** The print button. A refused stay is not called a quote. */
export function printGuideButton(kind: PrintNoteKind): string {
  return kind === 'priced' || kind === 'held' ? 'Print this quote' : 'Print these dates';
}

/** The price lines on the printed guide. A name, an email, and a refused total stay off. */
export function quotePaper(input: {
  ok: boolean;
  reason: string | null;
  nights: number;
  lodging: number;
  cleaning: number;
  stayTotal: number;
  party: string;
  arrival: string;
  departure?: string;
  /** A party or event. The paper leaves the price off. */
  event?: string;
  /** The agreement topics are still closed. The paper leaves the price off. */
  agreement?: string;
  /** A checked add-on. The paper leaves it out of the stay total. */
  addon?: string;
  /** Nights at 20% off. The paper does not add a second price. */
  promo?: string;
}): string[] {
  const close = 'This paper does not hold the dates or charge a card.';
  if (!input.ok) {
    const reason = input.reason && !input.reason.includes('$') ? input.reason : 'This stay is not quoted.';
    return [reason, close];
  }
  const held = input.event || input.agreement;
  if (held) return [held, close];
  const nights = `${input.nights} ${input.nights === 1 ? 'night' : 'nights'}`;
  const cleaning = input.cleaning > 0 ? ` Cleaning ${formatWhole(input.cleaning)}.` : '';
  return [
    `Direct price ${formatWhole(input.stayTotal)} before tax for ${nights}.`,
    `Nights ${formatWhole(input.lodging)}.${cleaning}`,
    input.party,
    input.arrival,
    input.departure ?? '',
    input.promo ?? '',
    input.addon ?? '',
    close,
  ].filter((line) => line.trim().length > 0);
}

/** The note one house would send. A discounted stay keeps the guest discount on that note. */
export function stayRequestNote(input: {
  guestNote: string;
  party: string;
  arrival: string;
  departure: string;
  preview: string;
  promo: string;
  addon: string;
  rules: string;
  agreement: string;
}): string {
  const promo = /\bfill\b|published base|\$/i.test(input.promo) ? '' : input.promo.trim();
  const text = [input.guestNote, input.party, input.arrival, input.departure, input.preview, promo, input.addon, input.rules, input.agreement]
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .join(' ')
    .replace(/The door code still opens the day before\. ?/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (/door\s*code|wi-?fi|password/i.test(text)) {
    return text.replace(/door\s*code|wi-?fi|password/gi, '').replace(/\s+/g, ' ').trim();
  }
  return text;
}

/** Shown when that note includes a discount. It does not repeat the price. */
export function stayRequestPromoLine(promo: string): string {
  if (!promo.trim() || /\bfill\b|published base|\$/i.test(promo)) return '';
  const line = 'The request note includes that discount. Nothing is sent.';
  if (line.includes('$') || /\bfill\b/i.test(line)) return '';
  return line;
}
