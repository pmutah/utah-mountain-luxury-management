/**
 * Read a whole month (or two) of a VRBO listing's nightly prices from its date picker.
 *
 * Run this in the browser harness, pasted into `js(...)`, after opening a listing and clicking the
 * "Start date" button so the calendar is showing. It parses the picker's own text, which renders as
 * alternating day numbers and prices:
 *
 *     8 | $1,545 | 9 | $1,545 | ... | 29 | $2,076 | 30 | $1,742 | December 2026 | ...
 *
 * Why this exists: reading one night per calendar load made a real band unreachable — the engine needs
 * three overlapping observations per night, so a single read covering one night meant ~36 loads for a
 * dozen nights. One read of a two-month picker yields twenty-odd observations, which is the difference
 * between "collecting comps forever" and getting a live band.
 *
 * A blank after a day number means the night is unavailable, so it is skipped rather than priced at zero.
 *
 * Returns `{ 'YYYY-MM-DD': rate }`.
 */
export function readVrboCalendarPrices(text: string, year: number): Record<string, number> {
  const out: Record<string, number> = {};
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  // The picker prints month headings in order; track which month a day belongs to as we walk the text.
  // A day and its price arrive either as separate cells (`1 | $690`) or joined (`1:$690`), depending on
  // how the picker was rendered, so the split is on any of the separators real pages produce.
  const tokens = text
    .split(/\||\n|\s*:\s*/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
  let month: number | null = null;
  let cursorYear = year;

  // Walk by position, not by value. A two-month picker repeats every day number, so looking a token up
  // with `indexOf` finds the first month's day and reads its price for the second month too.
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];

    const monthHit = months.find((name) => token.startsWith(name));
    if (monthHit) {
      const monthIndex = months.indexOf(monthHit) + 1;
      // A month heading that goes backwards means the picker moved into the next year.
      if (month !== null && monthIndex < month) cursorYear += 1;
      month = monthIndex;
      continue;
    }
    if (month === null) continue;

    // A day cell is a bare number, optionally followed by a price in the very next token.
    const day = /^(\d{1,2})$/.exec(token);
    if (!day) continue;
    const dayNumber = Number(day[1]);
    if (dayNumber < 1 || dayNumber > 31) continue;

    const next = tokens[index + 1] ?? '';
    const price = /^\$([\d,]+)$/.exec(next);
    if (!price) continue;

    const date = `${cursorYear}-${String(month).padStart(2, '0')}-${String(dayNumber).padStart(2, '0')}`;
    out[date] = Number(price[1].replace(/,/g, ''));
  }

  return out;
}


