import { isRealDay } from './dates';

/**
 * An approved guest rate for one night. This is the one place a comp-driven price is allowed to
 * reach a guest: the host approves a night, and the quote reads it instead of the static card.
 *
 * Everything here fails closed. A rate that is not approved, not on a real day, outside the floor
 * and ceiling, more than the daily cap away from the published base, or on a night the calendar
 * has taken is simply not used. A guest is never charged a price the engine only guessed.
 */
export type ApprovedRate = {
  house: string;
  date: string;
  /** The guest price for that night, in whole dollars. */
  guest: number;
  /** When the host approved it. */
  approvedAt: string;
};

/**
 * The guest price a promotion may reach: 20% under the published base, matching the fill rules. A
 * downward approval may go no lower than this, and only when the floor still allows it.
 */
export const PROMOTION_OFF = 0.2;

/** The most a published base may rise in one night, matching the shadow engine's cap. */
export const MAX_DAILY_MOVE = 0.08;

/**
 * The largest number of approved nights the sheet may carry. Three houses at a night apiece for a
 * year is 1,098 rows, so this covers a full year of pricing on every house with room to spare, and
 * a row is about a hundred bytes — far inside a KV value. It used to be 400, which is only about
 * four months per house, so a host pricing a year would hit the cap while doing normal work.
 */
export const MAX_SHEET_NIGHTS = 1200;

function whole(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  return rounded > 0 ? rounded : null;
}

/**
 * One approved rate, or null. A row that cannot be trusted is dropped rather than repaired: a
 * wrong price is worse than the published base, because the guest would be quoted it.
 */
export function toApprovedRate(value: unknown): ApprovedRate | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const house = typeof raw.house === 'string' ? raw.house.trim() : '';
  const date = typeof raw.date === 'string' ? raw.date.trim() : '';
  const guest = whole(raw.guest);
  const approvedAt = typeof raw.approvedAt === 'string' ? raw.approvedAt.trim() : '';
  if (!house || !isRealDay(date) || guest === null || !approvedAt) return null;
  if (Number.isNaN(Date.parse(approvedAt))) return null;
  return { house, date, guest, approvedAt };
}

/** The only two fields a quote needs from an approved night. The approval time stays on the server. */
export type QuotedSheetNight = { date: string; guest: number };

/**
 * The price a new approval is measured from.
 *
 * The 8% daily cap compares against **the price being replaced**, which is the published card the first time a
 * night is priced and the approved price every time after. Those were assumed to be the same, and they are not.
 *
 * The board already starts from the approved price, so it proposes the next step ($193 → $208) while the route
 * validated against the card ($179) and refused it. Measured on production, the ladder broke at its second
 * rung: a night could be raised once and never again, which put Lindon's $421 market median out of reach by any
 * number of approvals. One function, so the board, the route, and the quote cannot disagree about the base.
 */
export function approvalBase(card: number, approved: readonly { guest: number }[], date?: string): number {
  if (approved.length === 0) return card;
  /*
   * The base belongs to **one night**. This took the maximum across every row it was handed, and callers hand
   * it a whole house's sheet — so Lindon's $291 weekend nights became the base for a $179 weekday, $188 was
   * judged against $291, fell outside the 8% band, and was refused. The board then fell all the way back to
   * the card and read $179 on every night, discarding six rows that were perfectly valid.
   *
   * `date` scopes it when the caller knows which night it is asking about. Without one the rows are treated as
   * belonging to the same night, which is what the approve route and the quote pass.
   */
  const relevant = date
    ? approved.filter((row) => (row as { date?: string }).date === date)
    : approved;
  if (relevant.length === 0) return card;
  const highest = Math.max(...relevant.map((row) => Math.round(row.guest)));
  return Number.isFinite(highest) && highest > 0 ? highest : card;
}

/**
 * The rate a guest may be quoted for one night, or null when the published base stands.
 *
 * A raise is capped at the daily move, because the engine's own cap exists so a price cannot jump
 * far in one night. A cut may go as far as the published 20% promotion, but never under the floor:
 * the floor is the number the business already said it will not go below.
 */
export function approvedGuestRate(
  sheet: readonly QuotedSheetNight[],
  date: string,
  base: { guest: number; floorGuest: number },
): number | null {
  if (!isRealDay(date)) return null;
  const row = sheet.find((entry) => entry.date === date);
  if (!row) return null;
  const guest = whole(row.guest);
  if (guest === null) return null;
  const floor = Math.round(base.floorGuest);
  if (guest < floor) return null;
  if (guest > Math.round(base.guest * 2)) return null;
  if (guest > base.guest) {
    // A raise follows the engine's cap.
    if (guest - base.guest > Math.round(base.guest * MAX_DAILY_MOVE)) return null;
    return guest;
  }
  // A cut follows the published promotion, and the floor still wins.
  const promotionFloor = Math.max(floor, Math.round(base.guest * (1 - PROMOTION_OFF)));
  if (guest < promotionFloor) return null;
  return guest;
}

/** Nights the sheet must never price, because the rate is not the question that night. */
export type SheetBlockers = {
  taken?: readonly string[];
  closed?: readonly string[];
  paused?: boolean;
};

/**
 * Whether a house's sheet can be used on one night. A paused house, a booked night, and a closed
 * night all keep the published base: the engine deliberately left those alone, so approving a
 * price there would undo a decision the engine already made.
 */
export function sheetUsable(date: string, blockers: SheetBlockers = {}): boolean {
  if (blockers.paused) return false;
  if ((blockers.taken ?? []).includes(date)) return false;
  if ((blockers.closed ?? []).includes(date)) return false;
  return true;
}

/** Saved rows for a house between two days, the shape the quote reads. */
export function sheetFor(sheet: readonly ApprovedRate[], house: string, from: string, to: string): ApprovedRate[] {
  return sheet
    .filter((row) => row.house === house && row.date >= from && row.date < to)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** One house's approved nights as the plain pairs a quote reads. */
export function quotedSheet(sheet: readonly ApprovedRate[], house: string): QuotedSheetNight[] {
  return sheet.filter((row) => row.house === house).map((row) => ({ date: row.date, guest: row.guest }));
}

/** True when any night in this range carries an approved rate. */
export function sheetCovers(sheet: readonly ApprovedRate[], house: string, from: string, to: string): boolean {
  return sheet.some((row) => row.house === house && row.date >= from && row.date < to);
}

/**
 * Keep the sheet inside its cap by dropping the **furthest-out** nights, never the near ones.
 *
 * This used to sort by house and then keep the last 400 rows, which had two defects. The house came
 * first in the sort, so `lindon` sorted to the front and was erased entirely — 200 approved Lindon
 * nights were dropped in one write while River and Ranch kept all of theirs, and every one of those
 * nights silently went back to the card price. And the rows kept were the latest dates, so even the
 * surviving houses lost the nights a guest is about to book while keeping next year's.
 *
 * A night inside the booking horizon is worth more than one past it, so trimming starts at the far
 * end. `dropped` is returned rather than swallowed: a write that silently discards approvals is how
 * the first bug stayed invisible.
 */
export function trimSheet(sheet: readonly ApprovedRate[]): { sheet: ApprovedRate[]; dropped: number } {
  const sorted = [...sheet].sort((a, b) =>
    a.date === b.date ? a.house.localeCompare(b.house) : a.date.localeCompare(b.date),
  );
  if (sorted.length <= MAX_SHEET_NIGHTS) return { sheet: sorted, dropped: 0 };
  return { sheet: sorted.slice(0, MAX_SHEET_NIGHTS), dropped: sorted.length - MAX_SHEET_NIGHTS };
}

/**
 * One approved row, kept or replaced. A second approval for the same night replaces the first, so
 * the sheet never carries two answers for one night.
 */
export function withApprovedRate(sheet: readonly ApprovedRate[], row: ApprovedRate): ApprovedRate[] {
  return withApprovedRateReport(sheet, row).sheet;
}

/** The same write, saying how many nights the cap took, so the caller cannot drop one in silence. */
export function withApprovedRateReport(
  sheet: readonly ApprovedRate[],
  row: ApprovedRate,
): { sheet: ApprovedRate[]; dropped: number } {
  const next = sheet.filter((entry) => !(entry.house === row.house && entry.date === row.date));
  next.push(row);
  return trimSheet(next);
}

/**
 * Many rows in **one** write.
 *
 * A batch that called `withApprovedRateReport` per night would rewrite the whole sheet each time — eight
 * nights meant eight full-value KV writes, which is what produced the 503s I hit climbing the ladder one
 * approval at a time. This replaces every matching night in a single pass and trims once, so approving a
 * seven-night plan costs one write rather than seven.
 */
export function withApprovedRates(
  sheet: readonly ApprovedRate[],
  rows: readonly ApprovedRate[],
): { sheet: ApprovedRate[]; dropped: number } {
  if (rows.length === 0) return { sheet: [...sheet], dropped: 0 };
  const replacing = new Set(rows.map((row) => `${row.house}|${row.date}`));
  const kept = sheet.filter((entry) => !replacing.has(`${entry.house}|${entry.date}`));
  return trimSheet([...kept, ...rows]);
}

/** The sheet without one house's row for one night. Approving a night can be undone. */
export function withoutApprovedRate(sheet: readonly ApprovedRate[], house: string, date: string): ApprovedRate[] {
  return sheet.filter((entry) => !(entry.house === house && entry.date === date));
}

/** A line for the host desk. It says how many nights carry an approved price and never quotes one. */
export function sheetLine(sheet: readonly ApprovedRate[], house: string): string {
  const nights = sheet.filter((row) => row.house === house).length;
  if (nights === 0) return 'No night carries an approved price. Every night uses the published card.';
  return `${nights === 1 ? '1 night carries' : `${nights} nights carry`} an approved price. Every other night uses the published card.`;
}
