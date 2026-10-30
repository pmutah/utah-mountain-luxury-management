import { SLEEPS } from './house-stay';
import { formatWhole } from './luxury';
import type { YearPace } from './market/fill';
import type { HouseId } from './market/types';
import { quoteStay } from './quote';

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
): CompoundOffer {
  if (!Number.isInteger(guests) || guests < 1) return { show: false };
  if (guests <= SLEEPS.river) return { show: false };
  if (guests > TOGETHER) return refused('Ranch and River together sleep 45.');

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
  });
  if (!river.ok) return refused(labelReason('River', river.reason));

  const ranch = quoteStay('ranch', checkIn, checkOut, taken.ranch ?? [], {
    asOf,
    pace: paceFor('ranch'),
    closed: closed?.ranch ?? [],
    guests: ranchGuests,
    children: ranchChildren,
  });
  if (!ranch.ok) return refused(labelReason('Ranch', ranch.reason));

  const childBit = kids > 0 ? `, including ${kids} ${kids === 1 ? 'child' : 'children'}` : '';
  const line = `${riverGuests} stay at the River House and ${ranchGuests} stay at the Ranch House${childBit}. Each house keeps an adult. Nothing is sent.`;
  const nights = river.nights.length;
  const total = river.stayTotal + ranch.stayTotal;
  const paper = [
    `Ranch and River together ${formatWhole(total)} before tax for ${nights} ${nights === 1 ? 'night' : 'nights'}.`,
    line,
    'This paper does not hold either house or charge a card.',
  ];
  return { show: true, ok: true, nights, total, riverGuests, ranchGuests, line, paper };
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
