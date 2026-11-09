import { RIVER_UNIT_DETAIL, RIVER_UNITS, type RiverUnitId } from './river-units';
import { unitRateState, type RiverUnitRates } from './river-unit-rates';
import { riverMonth, type RiverDayInput } from './river-calendar';

/**
 * What the co-host is told about the Riverhouse parts, so it can answer a host's real question.
 *
 * The prompt said "sleeps 24" and nothing else, so the AI described a house that can only be rented whole. A host asking
 * "can I still sell Saturday?" would have been told no whenever any part was taken — the opposite of the rule — or told
 * yes for the whole house while a part was gone.
 *
 * This is a fact line, not a tool: the model cannot book or block from it. It exists so the answer it gives matches the
 * calendar the host can see.
 */

export type PartFacts = {
  /** One line naming the parts and their capacities. Always present when the house is sold in parts. */
  partsLine: string;
  /** How many of the three are priced and therefore sellable. Null when the price sheet could not be read. */
  priced: number | null;
  /** The next few nights where something is still sellable, and what. */
  openNights: Array<{ date: string; free: RiverUnitId[]; reason: string }>;
};

const SHORT: Record<RiverUnitId, string> = {
  'garage-suite': 'Garage Suite',
  'recreation-wing': 'Recreation Wing',
  'main-lodge': 'Main Lodge',
};

function names(units: readonly RiverUnitId[]): string {
  const short = units.map((unit) => SHORT[unit]);
  if (short.length === 0) return 'none';
  if (short.length === 1) return short[0]!;
  if (short.length === 2) return `${short[0]} and ${short[1]}`;
  return `${short.slice(0, -1).join(', ')}, and ${short[short.length - 1]}`;
}

/**
 * The parts fact for a prompt.
 *
 * `rates` may be null when the price sheet could not be read, which is said plainly rather than reported as "no parts".
 * `days` is however many nights ahead to summarise; the caller passes what it already loaded.
 */
export function partFacts(
  rates: RiverUnitRates | null,
  spans: readonly RiverDayInput[],
  from: string,
  days = 7,
): PartFacts {
  const capacities = RIVER_UNIT_DETAIL.map((unit) => `${SHORT[unit.id]} ${unit.sleeps}`).join(', ');
  const partsLine = `The River House is also sold in three parts (${capacities}; the three sum to 25 though the house sleeps 24). A night is sold once: any part taken blocks the whole house for that night, and the other parts stay sellable. Two parts together are one booking.`;

  if (rates === null) {
    /*
     * Null is "could not read", which is not "none priced". Reporting it as zero would make the model tell a host that
     * nothing is for sale when the truth is that we do not know.
     */
    return { partsLine, priced: null, openNights: [] };
  }
  const priced = RIVER_UNITS.filter((unit) => unitRateState(rates[unit]) === 'ready').length;

  // The month the window starts in, read from the same calendar the host page uses.
  const month = from.slice(0, 7);
  const all = riverMonth(month, spans, from);
  const openNights = all
    .filter((day) => day.date >= from)
    .slice(0, days)
    .map((day) => ({ date: day.date, free: day.freeParts, reason: day.reason }));

  return { partsLine, priced, openNights: priced > 0 ? openNights : [] };
}

/** The prompt lines for the parts. The window is read off the data, so it cannot disagree with what was checked. */
export function partPromptLines(facts: PartFacts): string[] {
  const lines = [`Riverhouse parts: ${facts.partsLine}`];
  if (facts.priced === null) {
    lines.push(
      'The part prices could not be read, so do not say whether a part is sellable and do not quote a part rate. Say the prices could not be read.',
    );
    return lines;
  }
  if (facts.priced === 0) {
    lines.push(
      'No part has a price yet, so no part is sellable. Do not quote or offer a part, and do not invent a nightly rate for one.',
    );
    return lines;
  }
  if (facts.priced < RIVER_UNITS.length) {
    lines.push(
      `${facts.priced} of ${RIVER_UNITS.length} parts are priced. A part with no price is not sellable; say which one is missing rather than quoting it.`,
    );
  }
  if (facts.openNights.length > 0) {
    const sample = facts.openNights
      .slice(0, 4)
      .map((night) => `${night.date} (${night.free.length === 0 ? 'nothing free' : `${names(night.free)} free`})`)
      .join('; ');
    /*
     * The window has to be stated, not implied.
     *
     * The line used to read "sellability from <date>" with no end, and the prompt only carries the next few nights. Asked
     * about a date beyond them the model had no data and answered anyway — it told me the Main Lodge and the whole house
     * were both free on a night a whole-house stay already covered. A fact line that says where it stops cannot be read as
     * a statement about every future date.
     */
    const last = facts.openNights[facts.openNights.length - 1]!.date;
    lines.push(
      `Riverhouse sellability, checked only for ${facts.openNights[0]!.date} through ${last}: ${sample}.`,
    );
    lines.push(
      `For any date outside ${facts.openNights[0]!.date} to ${last} you have no availability data. Say so and check the calendar or the River card. **Do not say a date is free, booked, or sellable when it is outside that window.**`,
    );
  }
  return lines;
}
