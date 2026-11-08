/**
 * The payload Hospitable's calendar write expects, built from a push plan.
 *
 * **Read this before wiring it up.** The owner's vault note and `pricing-doctrine.ts` both say a rate must
 * not be set in Hospitable: "Do not change the rate and do not create the promotion in Hospitable.
 * Hospitable stays the calendar and the inbox." A rate and a promotion are typed on **Airbnb and VRBO
 * directly**, because that is where the promotion badges and email exposure come from — a discount set in
 * Hospitable would change the price without producing the marketing that makes it worth running.
 *
 * So this module is a **payload builder, not a sender**, and it is deliberately unconnected: nothing calls
 * it. It exists so the shape is proven and tested, and so that a future writer has correct batching rather
 * than a second hand-rolled implementation. Wiring it to a live call would do the one thing the doctrine
 * forbids, which is why `sendHold` refuses without an explicit unit and property uuid and nothing here
 * performs a request.
 *
 * `PUT /v2/properties/{uuid}/calendar` takes `{ dates: [{ date, price: { amount }, available, min_stay }] }`,
 * answers **202 accepted** (asynchronous), and accepts at most **60 dates per request**.
 *
 * Two things are deliberately NOT guessed:
 *
 * 1. **Price units.** Hospitable's own calendar example shows `"amount": 15000` rendering as `$150.00`,
 *    which reads as cents, but the write reference does not state the unit. Sending dollars where cents
 *    are expected would price a night 100× low, and the reverse 100× high.
 * 2. **Property UUIDs.** This app has never mapped ranch/lindon/river to Hospitable property uuids.
 *    A write to the wrong uuid would change another listing's calendar.
 */

export type PushNightForSend = { date: string; rate: number };

export type HospitableDate = {
  date: string;
  price: { amount: number };
  available: true;
  min_stay?: number;
};

/** Hospitable accepts at most 60 dates in one request. */
export const HOSPITABLE_MAX_DATES = 60;

/** The unit of `price.amount`. Cents and dollars differ by 100× on a live listing. */
export type PriceUnit = 'cents' | 'dollars';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Turn a night into the amount to send, in the caller's declared unit.
 *
 * A fractional cent is not representable, so cents must be a whole number — a rate of $2160.40 cannot be
 * sent as cents without deciding where the half-cent goes, and guessing there is how a price drifts.
 */
export function amountFor(rate: number, unit: PriceUnit): number | null {
  if (!Number.isFinite(rate) || rate <= 0) return null;
  if (unit === 'dollars') return Math.round(rate);
  const cents = rate * 100;
  if (!Number.isInteger(cents)) return null;
  return cents;
}

/** One calendar-write request body. Never more than 60 dates. */
export function calendarBody(
  nights: readonly PushNightForSend[],
  unit: PriceUnit,
  minStay?: number,
): { dates: HospitableDate[]; skipped: Array<{ date: string; why: string }> } | { error: string } {
  if (nights.length === 0) return { error: 'There is no night to send.' };
  if (nights.length > HOSPITABLE_MAX_DATES) {
    return {
      error: `${nights.length} nights is over Hospitable's limit of ${HOSPITABLE_MAX_DATES} dates per request. Batch it.`,
    };
  }
  const dates: HospitableDate[] = [];
  const skipped: Array<{ date: string; why: string }> = [];
  const seen = new Set<string>();
  for (const night of nights) {
    if (!DATE.test(night.date)) {
      skipped.push({ date: String(night.date), why: 'not a YYYY-MM-DD date' });
      continue;
    }
    if (seen.has(night.date)) {
      skipped.push({ date: night.date, why: 'the same date appears twice' });
      continue;
    }
    const amount = amountFor(night.rate, unit);
    if (amount === null) {
      skipped.push({
        date: night.date,
        why:
          unit === 'cents'
            ? `a rate of ${night.rate} is not a whole number of cents`
            : `a rate of ${night.rate} is not a price above zero`,
      });
      continue;
    }
    seen.add(night.date);
    dates.push({
      date: night.date,
      price: { amount },
      available: true,
      ...(minStay && minStay > 0 ? { min_stay: Math.round(minStay) } : {}),
    });
  }
  if (dates.length === 0) return { error: 'No night in the plan could be sent.' };
  return { dates, skipped };
}

/** Split a plan into requests Hospitable will accept. */
export function calendarBatches(
  nights: readonly PushNightForSend[],
  unit: PriceUnit,
  minStay?: number,
): Array<{ dates: HospitableDate[]; skipped: Array<{ date: string; why: string }> }> {
  const out: Array<{ dates: HospitableDate[]; skipped: Array<{ date: string; why: string }> }> = [];
  for (let i = 0; i < nights.length; i += HOSPITABLE_MAX_DATES) {
    const slice = nights.slice(i, i + HOSPITABLE_MAX_DATES);
    const body = calendarBody(slice, unit, minStay);
    if ('dates' in body) out.push(body);
  }
  return out;
}

/** Why a send cannot run. Null means the request could be built. */
export function sendHold(input: {
  hasToken: boolean;
  uuid: string | null | undefined;
  unit: PriceUnit | null | undefined;
  restorable: boolean;
}): string | null {
  if (!input.hasToken) return 'There is no Hospitable write token, so nothing is sent.';
  if (!input.uuid) {
    return 'This house is not mapped to a Hospitable property uuid, so nothing is sent. A write to the wrong uuid would change another listing.';
  }
  if (!input.unit) {
    return 'The price unit has not been confirmed, so nothing is sent. Hospitable does not state whether amount is cents or dollars, and the difference is 100x on a live listing.';
  }
  if (!input.restorable) {
    return 'This plan cannot be reversed from a snapshot, so nothing is sent.';
  }
  return null;
}
