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
): StayLengths | null {
  const floor = shortestStay(house, checkIn, taken, asOf, pace, guests);
  const cap = longestStay(house, checkIn, taken, asOf, pace, guests);
  if (!floor || !cap) return null;
  const options = { asOf, pace, ...(guests !== undefined ? { guests } : {}) };
  const wanted = [...new Set([floor.nights, ...CHOICES, cap.nights])]
    .filter((nights) => nights >= floor.nights && nights <= cap.nights)
    .sort((a, b) => a - b);
  const choices: StayLengthChoice[] = [];
  for (const nights of wanted) {
    const quote = quoteStay(house, checkIn, addDays(checkIn, nights), taken, options);
    if (!quote.ok) continue;
    choices.push({ nights: quote.nights.length, checkOut: quote.checkOut });
  }
  if (choices.length < 2) return null;
  return { through: cap.through, choices };
}
