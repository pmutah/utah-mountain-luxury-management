/**
 * Guest, cleaner, and inbox behavior that can be judged without Stripe, Seam, or a vision model.
 * Nothing here charges a card, opens a lock, or messages a guest.
 */

export const TAX_NOTE =
  'Estimate only. Ben Campbell has not confirmed these rates. They are not added to the quoted stay and nothing is charged.';

/** Placeholders until the accountant confirms what these houses actually remit. */
export const TAX_RATES = {
  stateSales: 0.0485,
  countyTransient: 0.0425,
  confirmed: false,
};

export const CHECKOUT_HOLD_MINUTES = 15;

function cents(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export type TaxQuote = {
  lodging: number;
  cleaning: number;
  pet: number;
  subtotal: number;
  stateTax: number;
  countyTax: number;
  estimatedTotal: number;
  includedInQuotedStay: false;
  charged: false;
  confirmed: false;
  note: string;
};

export function quoteWithTax(input: { lodging: number; cleaning: number; pet?: number }): TaxQuote {
  const lodging = cents(Math.max(0, input.lodging));
  const cleaning = cents(Math.max(0, input.cleaning));
  const pet = cents(Math.max(0, input.pet ?? 0));
  const subtotal = cents(lodging + cleaning + pet);
  const stateTax = cents(subtotal * TAX_RATES.stateSales);
  const countyTax = cents(subtotal * TAX_RATES.countyTransient);
  return {
    lodging,
    cleaning,
    pet,
    subtotal,
    stateTax,
    countyTax,
    estimatedTotal: cents(subtotal + stateTax + countyTax),
    includedInQuotedStay: false,
    charged: false,
    confirmed: false,
    note: TAX_NOTE,
  };
}

export function formatCents(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents(value));
}

/** Shares add back to the total. Extra cents sit on the first names. */
export function splitPay(total: number, names: string[]): { name: string; amount: number }[] {
  const people = names.map((name) => name.trim()).filter(Boolean);
  if (people.length === 0) return [];
  const pennies = Math.round(cents(total) * 100);
  const base = Math.floor(pennies / people.length);
  let extra = pennies - base * people.length;
  return people.map((name) => {
    const share = base + (extra > 0 ? 1 : 0);
    if (extra > 0) extra -= 1;
    return { name, amount: share / 100 };
  });
}

export function stripeReadiness(env: { STRIPE_SECRET_KEY?: string }): {
  ready: boolean;
  mode: 'unset' | 'test' | 'refused-live';
  charges: false;
  reason: string;
} {
  const key = env.STRIPE_SECRET_KEY ?? '';
  if (key.startsWith('sk_live_')) {
    return { ready: false, mode: 'refused-live', charges: false, reason: 'A live Stripe secret is refused. Test mode only.' };
  }
  if (key.startsWith('sk_test_')) {
    return { ready: true, mode: 'test', charges: false, reason: 'A test secret is present. This app still does not create a charge.' };
  }
  return { ready: false, mode: 'unset', charges: false, reason: 'No Stripe test secret. Checkout is not armed.' };
}

export type TripStep = 'details' | 'agreement' | 'id' | 'deposit';

/**
 * Hours from now to the published check-in moment, or `null` when that cannot be known.
 *
 * The stay phone used to pass a literal `48` into `tripGate`, so the countdown was the same on every stay and the "door opens
 * within 24 hours" branch could never be reached from a real date. This does the arithmetic the card was pretending to do:
 * the house's own check-in time (4:00 PM), America/Denver, and a real `now`.
 *
 * A negative number means check-in has passed. `null` is returned for a date that is not a real day, so a malformed stay shows
 * no countdown rather than a plausible wrong one.
 */
export function hoursToCheckIn(input: { now: Date; checkIn: string; checkInTime: string }): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input.checkIn.trim());
  if (!match) return null;
  const [, year, month, day] = match;
  const clock = /^(\d{1,2}):(\d{2})\s*([AaPp][Mm])$/.exec(input.checkInTime.trim());
  let hour = 16;
  let minute = 0;
  if (clock) {
    hour = Number(clock[1]) % 12;
    if (clock[3]!.toLowerCase() === 'pm') hour += 12;
    minute = Number(clock[2]);
  }
  const asDate = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (asDate.getUTCFullYear() !== Number(year) || asDate.getUTCMonth() !== Number(month) - 1) return null;
  /*
   * Mountain Time is UTC-6 in summer and UTC-7 in winter. The offset is read from the zone itself rather than assumed, so a
   * November stay and a July stay both land at 4:00 PM local.
   */
  const target = mountainWallClock(Number(year), Number(month) - 1, Number(day), hour, minute);
  if (target === null) return null;
  return Math.round(((target.getTime() - input.now.getTime()) / 3_600_000) * 10) / 10;
}

/** The instant at which a Mountain Time wall clock reads this date and time. */
function mountainWallClock(year: number, month: number, day: number, hour: number, minute: number): Date | null {
  const naive = Date.UTC(year, month, day, hour, minute);
  if (!Number.isFinite(naive)) return null;
  // Two passes: guess with the offset in force at the naive instant, then re-read it at the corrected one.
  let guess = naive - 7 * 3_600_000;
  for (let pass = 0; pass < 2; pass += 1) {
    const offset = mountainOffsetMinutes(new Date(guess));
    guess = naive - offset * 60_000;
  }
  const settled = mountainOffsetMinutes(new Date(guess));
  return new Date(naive - settled * 60_000);
}

function mountainOffsetMinutes(at: Date): number {
  const long = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Denver',
    timeZoneName: 'longOffset',
  }).format(at);
  const match = /GMT([+-])(\d{2}):?(\d{2})?/.exec(long);
  if (!match) return 420; // Mountain Standard, which is what Utah keeps most of the year.
  const sign = match[1] === '-' ? -1 : 1;
  return sign * (Number(match[2]) * 60 + Number(match[3] ?? 0));
}

export function tripGate(input: {
  details: boolean;
  agreement: boolean;
  idVerified: boolean;
  depositSettled: boolean;
  /** Hours to the published check-in, or null when the date could not be read. */
  hoursUntilCheckIn: number | null;
  otpOk: boolean;
  nightBeforeFree: boolean;
  /**
   * The steps this site actually runs. Omitted means **not connected**, and an unconnected step is left out of the list.
   *
   * The card used to always draw four steps and told every guest that the ID check and the deposit were "Still open" — two
   * things no route on this site can do. A guest reading that could only conclude they had not finished, when there was
   * nothing to finish. Stripe Identity and a deposit processor are not connected; when they are, this turns them back on.
   */
  connected?: { id?: boolean; deposit?: boolean };
}): {
  steps: { id: TripStep; done: boolean; note: string }[];
  doorRevealed: boolean;
  earlyCheckInOffer: boolean;
  unlock: false;
  /** Steps that exist in the plan but are not set up here, so the card can say so plainly instead of implying the guest is late. */
  notSetUp: TripStep[];
} {
  const steps: { id: TripStep; done: boolean; note: string }[] = [
    { id: 'details', done: input.details, note: 'Party details' },
    { id: 'agreement', done: input.agreement, note: 'House rules and agreement topics' },
  ];
  const notSetUp: TripStep[] = [];
  if (input.connected?.id) {
    steps.push({
      id: 'id',
      done: input.idVerified,
      note: 'ID verification. Nothing is stored beyond the check.',
    });
  } else {
    notSetUp.push('id');
  }
  if (input.connected?.deposit) {
    steps.push({
      id: 'deposit',
      done: input.depositSettled,
      note: 'Deposit, arranged through the payment page.',
    });
  } else {
    notSetUp.push('deposit');
  }
  const ready = steps.every((step) => step.done);
  const inWindow = input.hoursUntilCheckIn !== null && input.hoursUntilCheckIn <= 24 && input.hoursUntilCheckIn > -12;
  return {
    steps,
    doorRevealed: ready && inWindow && input.otpOk,
    earlyCheckInOffer: input.nightBeforeFree,
    unlock: false,
    notSetUp,
  };
}

export function walletPass(input: { house: string; checkIn: string; checkOut: string }): {
  signed: false;
  reason: string;
  title: string;
} {
  return {
    signed: false,
    reason: 'This is not a signed Apple or Google pass.',
    title: `${input.house} ${input.checkIn} to ${input.checkOut}`,
  };
}

export const CLEANER_PAY = {
  name: 'April Jenson',
  lindon: 160,
  ranch: 350,
  river: null,
} as const;

export function cleanerPay(house: 'ranch' | 'lindon' | 'river'): { usd: number | null; who: string; reason: string } {
  if (house === 'river') {
    return { usd: null, who: CLEANER_PAY.name, reason: 'No River cleaner pay is published, so none is shown.' };
  }
  return {
    usd: CLEANER_PAY[house],
    who: CLEANER_PAY.name,
    reason: house === 'lindon' ? '$160 at the Lindon House.' : '$350 at the Ranch House.',
  };
}

export function snowDispatch(input: { inches: number | null; live: boolean }): { dispatch: boolean; reason: string } {
  if (!input.live || input.inches === null) {
    return { dispatch: false, reason: 'No live forecast is connected, so snow removal is not dispatched.' };
  }
  if (input.inches >= 2) return { dispatch: true, reason: `${input.inches} inches is enough to dispatch. This did not send a text.` };
  return { dispatch: false, reason: `${input.inches} inches is under the 2 inch line.` };
}

export function inspectRooms(input: { required: string[]; submitted: string[] }): {
  flags: string[];
  visionCalled: false;
  model: 'checklist';
} {
  const have = new Set(input.submitted.map((room) => room.toLowerCase()));
  const flags = input.required.filter((room) => !have.has(room.toLowerCase())).map((room) => `No photo for ${room}.`);
  return { flags, visionCalled: false, model: 'checklist' };
}

export function draftReply(input: {
  text: string;
  confidence: number;
  guidelineHit: boolean;
  autoReplyEnabled?: boolean;
}): { action: 'hold' | 'draft'; sent: false; reason: string } {
  if (input.guidelineHit) {
    return { action: 'hold', sent: false, reason: 'The draft crosses a house guideline, so it is held.' };
  }
  if (input.confidence < 0.85) {
    return { action: 'hold', sent: false, reason: 'Confidence is under 0.85, so this stays a draft.' };
  }
  if (!input.autoReplyEnabled) {
    return { action: 'draft', sent: false, reason: 'Auto-reply is off. A person sends this, or nobody does.' };
  }
  return { action: 'draft', sent: false, reason: 'Ready for a person to send. This module does not send it.' };
}

export function abandonedQuoteNote(house: string): { sent: false; text: string } {
  return {
    sent: false,
    text: `A quote for ${house} was started and not sent. This note is not an email.`,
  };
}

export const CUTOVER_CHECKLIST = [
  { id: 'stripe-test', done: false, item: 'A Stripe test booking that is refunded.' },
  { id: 'redirects', done: false, item: '301 map from the Hospitable Direct URLs.' },
  { id: 'dns', done: false, item: 'DNS stays put until the test booking is real.' },
  { id: 'rollback', done: false, item: 'Hospitable Direct stays available for 30 days after any move.' },
] as const;

export function cutoverReady(): boolean {
  return CUTOVER_CHECKLIST.every((row) => row.done);
}
