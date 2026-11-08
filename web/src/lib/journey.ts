import { guestDepartureLine } from './departure';
import { addDays } from './market/dates';
import { agreementLine } from './stay-agreement';

export type JourneyState = 'done' | 'now' | 'later';

export type JourneyStep = {
  id: 'group' | 'agree' | 'code' | 'early' | 'arrive' | 'leave';
  title: string;
  detail: string;
  state: JourneyState;
};

function label(iso: string) {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(Date.UTC(year!, month! - 1, day)).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/** The night before check-in is empty, so an earlier arrival is possible. */
export function nightBeforeIsFree(checkIn: string, taken: readonly string[], closed: readonly string[] = []): boolean {
  const night = addDays(checkIn, -1);
  return !taken.includes(night) && !closed.includes(night);
}

/** Checkout morning can run long only when nobody is arriving that day. */
export function checkoutNightIsFree(checkOut: string, taken: readonly string[], closed: readonly string[] = []): boolean {
  return !taken.includes(checkOut) && !closed.includes(checkOut);
}

/** A paused booking read does not say the night before or the checkout morning is free. */
export function stayNightFlags(
  paused: boolean,
  nightBeforeFree: boolean,
  checkoutNightFree: boolean,
): { nightBeforeFree: boolean | null; checkoutNightFree: boolean | null } {
  if (paused) return { nightBeforeFree: null, checkoutNightFree: null };
  return { nightBeforeFree, checkoutNightFree };
}

/** Shown on the guest phone when bookings could not be read. No door code. */
export function stayCalendarHold(paused: boolean, nightsKnown = false, loading = false): string {
  if (!paused) return '';
  const line = loading
    ? 'Checking the booking calendar. Nothing was written.'
    : nightsKnown
      ? 'Saved bookings could not be read. Early arrival and a later checkout use the booking calendar. Nothing was written over them.'
      : 'Saved bookings could not be read. This phone does not say a night is free. Nothing was written over them.';
  if (line.includes('$') || /door\s*code|wi-?fi|password/i.test(line)) return '';
  return line;
}

function leaveDetail(input: {
  checkOutTime: string;
  checkOut: string;
  checkoutNightFree?: boolean | null;
  departure?: string | null;
}): string {
  const when = `${input.checkOutTime} on ${label(input.checkOut)}`;
  const named = guestDepartureLine(input.departure);
  if (named) return `${named} Checkout is ${when}.`;
  if (input.checkoutNightFree === true) {
    return `Checkout is ${when}. Leave at 2:00 PM is a request. Nothing is charged yet. A same-day arrival still starts at 4:00 PM.`;
  }
  if (input.checkoutNightFree === false) {
    return `Checkout is ${when}. A later leave is not open, because someone arrives that day.`;
  }
  return when;
}

export function arrivalJourney(input: {
  asOf: string;
  checkIn: string;
  checkOut: string;
  opensOn: string;
  preferencesDone: boolean;
  checkInTime: string;
  checkOutTime: string;
  phase: 'before' | 'during' | 'after';
  /** Null when the calendar was not checked. */
  nightBeforeFree: boolean | null;
  /** Null when the calendar was not checked. True when nobody arrives on checkout morning. */
  checkoutNightFree?: boolean | null;
  /** A saved leave time. A phone or other typed value is ignored. */
  departure?: string | null;
  house?: string;
  /** True when every agreement topic was opened on this phone. That does not sign it. */
  agreementRead?: boolean;
  /** True when the preference survey was submitted, even if it carried no answers. */
  hasSurvey?: boolean;
}): JourneyStep[] {
  const codeOpen = input.asOf >= input.opensOn;
  const steps: JourneyStep[] = [
    {
      id: 'agree',
      title: 'Stay agreement',
      detail: agreementLine(input.house ?? '', 'phone'),
      state: input.agreementRead ? 'done' : input.phase === 'after' ? 'later' : 'now',
    },
    {
      id: 'group',
      title: 'Your group',
      /*
       * A survey that was submitted with no answers is neither "we have your preferences" nor a blank
       * start. Saying the first was false — the card section on the same page correctly said there was
       * no card — and saying "tell us about your group" reads as though nothing arrived.
       */
      detail: input.preferencesDone
        ? 'We have your preferences.'
        : input.hasSurvey
          ? 'Your preference card came in empty. Add what matters to your group whenever you like.'
          : 'Tell us about your group so we can set the house.',
      state: input.preferencesDone ? 'done' : input.phase === 'after' ? 'later' : 'now',
    },
    {
      id: 'code',
      title: 'Door code and Wi-Fi',
      detail: codeOpen
        ? input.agreementRead === false
          ? 'Open each stay-agreement topic first. The door code and Wi-Fi stay off this phone until then.'
          : 'Your code and Wi-Fi are in Getting in.'
        : `They appear here on ${label(input.opensOn)}, the day before check-in.`,
      state: input.phase === 'after' ? 'done' : codeOpen ? 'now' : 'later',
    },
  ];
  if (input.phase === 'before' && input.asOf < input.checkIn && typeof input.nightBeforeFree === 'boolean') {
    steps.push({
      id: 'early',
      title: 'Arrive early',
      detail: input.nightBeforeFree
        ? 'Arrive at 1:00 PM is a request. Nothing is charged yet. The door code still opens the day before.'
        : 'An early arrival is not open for this stay.',
      state: 'now',
    });
  }
  const arrived = input.phase !== 'before';
  steps.push({
    id: 'arrive',
    title: 'Check in',
    detail: `${input.checkInTime} on ${label(input.checkIn)}.`,
    state: input.phase === 'after' ? 'done' : arrived ? 'now' : 'later',
  });
  steps.push({
    id: 'leave',
    title: 'Check out',
    detail: leaveDetail(input),
    state: input.phase === 'after' ? 'done' : input.asOf >= input.checkOut ? 'now' : 'later',
  });
  return steps;
}

const NOW_ORDER = ['agree', 'group', 'code', 'leave', 'arrive', 'early'] as const;

/** One current step for the guest phone. The list below can still show other open steps. */
export function rightNow(steps: readonly JourneyStep[]): string {
  const leave = steps.find((step) => step.id === 'leave');
  const arrive = steps.find((step) => step.id === 'arrive');
  if (leave?.state === 'done' && arrive?.state === 'done') {
    return 'This stay is finished. The door code stays off this phone. Nothing is sent.';
  }
  const open = NOW_ORDER.map((id) => steps.find((step) => step.id === id && step.state === 'now')).filter(
    (step): step is JourneyStep => Boolean(step),
  );
  if (open.length === 0) return 'Nothing is due on this phone right now. Nothing is sent.';
  const extra = open.length - 1;
  const more =
    extra <= 0 ? '' : extra === 1 ? ' One other step is also open.' : extra === 2 ? ' Two other steps are also open.' : ` ${extra} other steps are also open.`;
  return `Right now: ${open[0]!.title}.${more} Nothing is sent.`;
}

function daySpan(from: string, to: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return null;
  const [ay, am, ad] = from.split('-').map(Number);
  const [by, bm, bd] = to.split('-').map(Number);
  return Math.round((Date.UTC(by!, bm! - 1, bd!) - Date.UTC(ay!, am! - 1, ad!)) / 86_400_000);
}

/** How long until check-in or checkout. A quote does not say the house is open. Nothing is sent. */
export function stayCountdown(asOf: string, checkIn: string, checkOut: string, where: 'quote' | 'phone' = 'quote'): string {
  const untilIn = daySpan(asOf, checkIn);
  const untilOut = daySpan(asOf, checkOut);
  if (untilIn === null || untilOut === null || untilOut <= untilIn) return '';
  const hold = where === 'quote' ? ' This does not say the house is open.' : '';
  const tail = `${hold} Nothing is sent.`;
  let line = '';
  if (untilIn > 1) line = `Check-in is in ${untilIn} nights.${tail}`;
  else if (untilIn === 1) line = `Check-in is tomorrow at 4:00 PM.${tail}`;
  else if (untilIn === 0) line = `Check-in is today at 4:00 PM.${tail}`;
  else if (untilOut > 1) line = `Checkout is in ${untilOut} nights.${tail}`;
  else if (untilOut === 1) line = `Checkout is tomorrow at 11:00 AM.${tail}`;
  if (line.includes('$') || /door\s*code|wi-?fi|password/i.test(line)) return '';
  return line;
}

/** Where a stay sits today, from the dates only. It does not claim what the guest opened on their phone. */
export function stayMoment(asOf: string, checkIn: string, checkOut: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf) || !/^\d{4}-\d{2}-\d{2}$/.test(checkIn) || !/^\d{4}-\d{2}-\d{2}$/.test(checkOut)) {
    return '';
  }
  if (checkOut <= checkIn) return '';
  if (asOf >= checkOut) return 'This stay is finished. The door code stays off this list. Nothing is sent.';
  if (asOf >= checkIn) return `This stay is in the house. Checkout is ${label(checkOut)} at 11:00 AM. Nothing is sent.`;
  const opensOn = addDays(checkIn, -1);
  if (asOf >= opensOn) {
    return 'The day before check-in. The door code can be on the guest phone. It stays off this list. Nothing is sent.';
  }
  return `Before this stay. The door code opens ${label(opensOn)}, after the house rules are read. Nothing is sent.`;
}
