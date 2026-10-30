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
export function nightBeforeIsFree(checkIn: string, taken: readonly string[]): boolean {
  return !taken.includes(addDays(checkIn, -1));
}

/** Checkout morning can run long only when nobody is arriving that day. */
export function checkoutNightIsFree(checkOut: string, taken: readonly string[]): boolean {
  return !taken.includes(checkOut);
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
}): JourneyStep[] {
  const codeOpen = input.asOf >= input.opensOn;
  const steps: JourneyStep[] = [
    {
      id: 'agree',
      title: 'Stay agreement',
      detail: agreementLine(input.house ?? '', 'phone'),
      state: 'later',
    },
    {
      id: 'group',
      title: 'Your group',
      detail: input.preferencesDone
        ? 'We have your preferences.'
        : 'Tell us about your group so we can set the house.',
      state: input.preferencesDone ? 'done' : input.phase === 'after' ? 'later' : 'now',
    },
    {
      id: 'code',
      title: 'Door code and Wi-Fi',
      detail: codeOpen
        ? 'Your code and Wi-Fi are in Getting in.'
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
