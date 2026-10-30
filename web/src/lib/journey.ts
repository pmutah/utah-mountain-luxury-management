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
  if (input.phase === 'before' && input.nightBeforeFree === true && input.asOf < input.checkIn) {
    steps.push({
      id: 'early',
      title: 'Arrive early',
      detail: `The night before is open. Ask us if you want to arrive before ${input.checkInTime}. The door code still opens on ${label(input.opensOn)}.`,
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
    detail: `${input.checkOutTime} on ${label(input.checkOut)}.`,
    state: input.phase === 'after' ? 'done' : input.asOf >= input.checkOut ? 'now' : 'later',
  });
  return steps;
}
