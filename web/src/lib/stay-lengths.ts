import type { YearPace } from './market/fill';
import type { HouseId } from './market/types';
import { quoteStay } from './quote';
import { longestStay } from './longest-stay';
import { shortestStay } from './shortest-stay';
import { addDays } from './market/dates';

const CHOICES = [2, 3, 4, 7, 14, 28];

export type StayLengthChoice = {
  nights: number;
  checkOut: string;
  direct: number;
};

export type StayLengths = {
  through: string;
  choices: StayLengthChoice[];
};

/** Lengths this check-in can quote, from the shortest stay to the open stretch. */
export function stayLengths(
  house: HouseId,
  checkIn: string,
  taken: readonly string[],
  asOf: string,
  pace: YearPace,
  guests?: number,
  closed: readonly string[] = [],
  children?: number,
): StayLengths | null {
  const floor = shortestStay(house, checkIn, taken, asOf, pace, guests, closed, children);
  const cap = longestStay(house, checkIn, taken, asOf, pace, guests, closed, children);
  if (!floor || !cap) return null;
  const options = {
    asOf,
    pace,
    closed,
    ...(guests !== undefined ? { guests, ...(children !== undefined ? { children } : {}) } : {}),
  };
  const wanted = [...new Set([floor.nights, ...CHOICES, cap.nights])]
    .filter((nights) => nights >= floor.nights && nights <= cap.nights)
    .sort((a, b) => a - b);
  const choices: StayLengthChoice[] = [];
  for (const nights of wanted) {
    const quote = quoteStay(house, checkIn, addDays(checkIn, nights), taken, options);
    if (!quote.ok) continue;
    choices.push({ nights: quote.nights.length, checkOut: quote.checkOut, direct: quote.stayTotal });
  }
  if (choices.length < 2) return null;
  return { through: cap.through, choices };
}

export type PublishedLength = { nights: number; checkOut: string };

/** A live length list. It does not say the house is open, and it has no price. */
export function liveLengthLine(through: string): string {
  const line = `The rate card can quote this check-in through ${through}. Choosing a length does not send a request. This does not say the house is open.`;
  if (line.includes('$') || /door\s*code|wi-?fi|password/i.test(line)) {
    return 'Choosing a length does not send a request. This does not say the house is open.';
  }
  return line;
}

/** A live full stretch. It does not say the house is open, and it has no price. */
export function liveSpanLine(through: string, nights: number): string {
  const length = nights === 1 ? '1 night' : `${nights} nights`;
  const line = `The rate card can quote this check-in through ${through}, ${length}. Using the full stretch does not send a request. This does not say the house is open.`;
  if (line.includes('$') || /door\s*code|wi-?fi|password/i.test(line)) {
    return 'Using the full stretch does not send a request. This does not say the house is open.';
  }
  return line;
}

/** Lengths the rate card can quote when the calendar was not read. No price. */
export function publishedLengths(
  house: HouseId,
  checkIn: string,
  asOf: string,
  guests?: number,
  children?: number,
): { through: string; choices: PublishedLength[] } | null {
  const live = stayLengths(house, checkIn, [], asOf, 'unknown', guests, [], children);
  if (!live) return null;
  const choices = live.choices.map(({ nights, checkOut }) => ({ nights, checkOut }));
  const text = JSON.stringify(choices);
  if (text.includes('$')) return null;
  return { through: live.through, choices };
}
