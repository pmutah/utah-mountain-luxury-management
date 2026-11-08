import { addDays } from './dates';
import { approvalBase, approvedGuestRate, MAX_DAILY_MOVE, sheetUsable, type ApprovedRate } from './rate-sheet';

/**
 * One night a batch approval will write, and why it was refused when it was.
 *
 * A batch is a real convenience with a real hazard: approving eight nights at once hides the eight independent
 * checks behind it. So each night is judged on its own and reports its own outcome — a batch that silently
 * skipped the booked night in the middle would leave a host believing the whole plan landed.
 */
export type BatchNight = {
  date: string;
  guest: number;
  cardGuest: number;
  /** Where this approval measures from: the approved price if the night had one, else the card. */
  base: number;
  ok: boolean;
  /** The price actually written, or the card when it was refused. */
  written: number;
  reason: string | null;
};

export type BatchPlan = {
  house: string;
  nights: BatchNight[];
  approved: number;
  refused: number;
  /** The one sentence the desk shows. Never quotes a rate for a night that was refused. */
  line: string;
};

/**
 * Decide a whole house's approvals at once, without writing anything.
 *
 * Every guard the single-night route applies is applied here, per night: the calendar, the floor, the 8% cap
 * measured from the price being replaced, and the ceiling. The caller writes what this returns, so the rules
 * live in one place rather than being re-implemented in a loop.
 *
 * Split out from the route so it can be tested without a KV: the ladder bug lived in exactly this arithmetic,
 * and it survived a full green suite because nothing exercised a second step.
 */
export function decideBatch(input: {
  house: string;
  requested: ReadonlyArray<{ date: string; guest: number }>;
  sheet: readonly ApprovedRate[];
  card: (date: string) => { guest: number; floorGuest: number };
  taken?: readonly string[];
  closed?: readonly string[];
  paused?: boolean;
}): BatchPlan {
  const nights: BatchNight[] = input.requested.map((row) => {
    const ask = input.card(row.date);
    const existing = input.sheet.filter((entry) => entry.house === input.house && entry.date === row.date);
    const base = approvalBase(ask.guest, existing);
    const refuse = (reason: string): BatchNight => ({
      date: row.date,
      guest: row.guest,
      cardGuest: ask.guest,
      base,
      ok: false,
      written: base,
      reason,
    });

    if (!sheetUsable(row.date, { taken: input.taken, closed: input.closed, paused: input.paused })) {
      return refuse('That night is booked or closed, so its price stays put.');
    }
    const allowed = approvedGuestRate([{ date: row.date, guest: row.guest }], row.date, {
      guest: base,
      floorGuest: ask.floorGuest,
    });
    if (allowed === null) {
      return refuse(
        base === ask.guest
          ? `That price is outside what this house can quote. The card is $${ask.guest} and a raise moves at most ${Math.round(MAX_DAILY_MOVE * 100)}% in one night.`
          : `That price is outside what this house can quote. The night is already approved at $${base}, and a raise moves at most ${Math.round(MAX_DAILY_MOVE * 100)}% in one night.`,
      );
    }
    return { date: row.date, guest: row.guest, cardGuest: ask.guest, base, ok: true, written: allowed, reason: null };
  });

  const approved = nights.filter((night) => night.ok).length;
  const refused = nights.length - approved;
  const line =
    nights.length === 0
      ? 'No night was sent, so nothing changed.'
      : refused === 0
        ? approved === 1
          ? '1 night was approved.'
          : `${approved} nights were approved.`
        : approved === 0
          ? `No night was approved. ${nights.find((night) => !night.ok)?.reason ?? ''}`.trim()
          : `${approved === 1 ? '1 night was' : `${approved} nights were`} approved; ${refused === 1 ? '1 was' : `${refused} were`} refused, and each says why.`;
  return { house: input.house, nights, approved, refused, line };
}

/** The rows a batch would write, in the shape the sheet stores. */
export function batchRows(plan: BatchPlan, approvedAt: string): ApprovedRate[] {
  return plan.nights
    .filter((night) => night.ok)
    .map((night) => ({ house: plan.house, date: night.date, guest: night.written, approvedAt }));
}

/** Nights after `from`, for callers that need the sequence. Re-exported so the batch has no clock of its own. */
export { addDays };
