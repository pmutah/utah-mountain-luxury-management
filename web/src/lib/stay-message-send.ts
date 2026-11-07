import { addDays, isRealDay } from './market/dates';
import { guestTimeline, type TimelineId, type TimelineMessage } from './guest-timeline';
import type { HouseId } from './market/types';

/**
 * Sending a stay message.
 *
 * The timeline was preview-only: a host could see the seven messages a stay would receive and no
 * button ever sent one. This is the missing half, built so it cannot be used carelessly.
 *
 * The host picks one message and sends it by hand. Nothing is scheduled, because the right moment for
 * "checkout tomorrow" is a judgement about a real house, and a sender that fires on its own would
 * email a guest at the wrong time with no one watching.
 *
 * Every rule here exists because of a way the send could go wrong:
 *   - a message sent weeks early says "Tomorrow at the house" on the wrong day
 *   - a door code or a Wi-Fi password in an email is a security problem, not a convenience
 *   - a price in a guest email is a quote nobody agreed to
 *   - the same message twice looks like a mistake to the guest
 */

/**
 * The days a message may go, as a distance from check-in or checkout. `from` is the furthest ahead,
 * `to` the closest, so the pair is a range of day counts.
 */
const WINDOW: Record<TimelineId, { from: number; to: number; anchor: 'in' | 'out' }> = {
  // A confirmation can go any time after the stay is booked, up to the arrival day.
  booked: { from: 365, to: 0, anchor: 'in' },
  // The week-ahead note from eight days out to six, so the whole week it describes is covered.
  week: { from: 8, to: 6, anchor: 'in' },
  eve: { from: 2, to: 1, anchor: 'in' },
  arrive: { from: 0, to: 0, anchor: 'in' },
  mid: { from: 1, to: 0, anchor: 'out' },
  leave: { from: 1, to: 1, anchor: 'out' },
  review: { from: 0, to: -30, anchor: 'out' },
  // The come-back note is for long after the stay, never during it.
  return: { from: -30, to: -365, anchor: 'out' },
};

function daysBetween(from: string, to: string): number | null {
  if (!isRealDay(from) || !isRealDay(to)) return null;
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86_400_000);
}

/**
 * A price, a door code, or a Wi-Fi password that must never reach a guest by email.
 *
 * The guest messages deliberately *mention* the door code, to say it is not in this message and opens
 * on the phone later. Banning the word would block every one of them. What must not go out is the
 * code itself: a four-to-eight character run after "code", or a password/code given as a value.
 */
export function unsafeGuestText(text: string): string | null {
  if (typeof text !== 'string') return 'The message is empty.';
  if (/\$\s?\d/.test(text)) return 'This message carries a price. A guest email must not quote one.';
  // A code handed over as a value, e.g. "the code is 4412" or "code: 4412#".
  if (/\b(?:door\s*code|lock\s*box|access\s*code)\b[^.]{0,20}?\b\d{3,8}\b/i.test(text)) {
    return 'This message gives a door code. It stays on the guest phone, never in an email.';
  }
  // A password handed over as a value.
  if (/\bpassword\b\s*(?:is|:|=)\s*\S+/i.test(text)) {
    return 'This message gives a password. It stays on the guest phone, never in an email.';
  }
  return null;
}

export type SendCheck =
  | { ok: true; message: TimelineMessage; day: string }
  | { ok: false; reason: string };

/**
 * Whether a message points the guest at their stay page.
 *
 * The week-before note says "the house rules are on your stay page". When the guest app is off for
 * that house, that page answers 403, so the message sends the guest to a dead end. This lets the
 * sender refuse instead of emailing a broken instruction.
 */
export function pointsAtStayPage(message: { subject: string; body: string }): boolean {
  return /your stay page|the house rules are on your stay page|on your phone/i.test(
    `${message.subject} ${message.body}`,
  );
}

/**
 * Whether one message may go on one day.
 *
 * `asOf` is the day the host sends. It is compared against the message's own window, so a host cannot
 * send "Checkout tomorrow" a month out, or a review note before the guest has left.
 *
 * `guestAppOn` is false when the guest app is off for that house. A message that sends the guest to
 * their stay page is refused then, because that page answers 403 and the instruction is a dead end.
 */
export function canSendMessage(input: {
  house: HouseId;
  checkIn: string;
  checkOut: string;
  id: unknown;
  asOf: string;
  /** Ids already sent for this stay, so a second send is refused rather than repeated. */
  alreadySent?: readonly string[];
  /** False when the guest app is off. Defaults to true, so a caller that does not know is unchanged. */
  guestAppOn?: boolean;
}): SendCheck {
  const { checkIn, checkOut, asOf } = input;
  if (!isRealDay(checkIn) || !isRealDay(checkOut) || checkOut <= checkIn) {
    return { ok: false, reason: 'This stay does not name dates we can send a message about.' };
  }
  if (!isRealDay(asOf)) return { ok: false, reason: 'The send day is not a real date.' };

  const id = typeof input.id === 'string' ? (input.id as TimelineId) : null;
  const message = id
    ? guestTimeline(input.house, { checkIn, checkOut }, 'stay').find((row) => row.id === id)
    : null;
  if (!message) return { ok: false, reason: 'That is not one of the messages this stay receives.' };

  if ((input.alreadySent ?? []).includes(message.id)) {
    return {
      ok: false,
      reason: `The "${message.subject}" message has already gone to this guest. Sending it twice looks like a mistake.`,
    };
  }

  // The wording itself has to be safe before we talk about timing.
  const unsafe = unsafeGuestText(`${message.subject} ${message.body}`);
  if (unsafe) return { ok: false, reason: unsafe };

  // A message that sends the guest to their stay page is useless while that page is switched off.
  if (input.guestAppOn === false && pointsAtStayPage(message)) {
    return {
      ok: false,
      reason: 'The guest app is off for this house, so this message would send the guest to a page that says it is off. Turn the app on in Guests first, or send a different message.',
    };
  }

  const window = WINDOW[message.id];
  // A message with no window is one this sender has no rule for, so it is refused rather than guessed.
  if (!window) {
    return { ok: false, reason: 'There is no send rule for that message yet, so nothing was sent.' };
  }
  const anchorDate = window.anchor === 'in' ? checkIn : checkOut;
  const away = daysBetween(asOf, anchorDate);
  if (away === null) return { ok: false, reason: 'This stay does not name dates we can send a message about.' };
  const low = Math.min(window.from, window.to);
  const high = Math.max(window.from, window.to);
  if (away < low || away > high) {
    return {
      ok: false,
      reason: `"${message.subject}" is for ${message.when.toLowerCase()}, so it is not right to send today. Nothing was sent.`,
    };
  }
  return { ok: true, message, day: asOf };
}

/**
 * The messages that may go today, for the desk. A refusal is left off rather than shown as a failed
 * button; `canSendMessage` gives the reason a message is not offered.
 */
export function sendableToday(input: {
  house: HouseId;
  checkIn: string;
  checkOut: string;
  asOf: string;
  alreadySent?: readonly string[];
  guestAppOn?: boolean;
}): TimelineMessage[] {
  return guestTimeline(input.house, { checkIn: input.checkIn, checkOut: input.checkOut }, 'stay').filter(
    (message) => canSendMessage({ ...input, id: message.id }).ok,
  );
}

/** A line for the desk. It names how many are ready and never a price. */
export function sendableLine(messages: readonly TimelineMessage[], alreadySent: readonly string[]): string {
  if (messages.length === 0) {
    return alreadySent.length > 0
      ? 'No other message is right for today. The ones already sent are listed below.'
      : 'No message is right for today. Nothing is sent on its own.';
  }
  const one = messages.length === 1;
  return `${one ? '1 message is' : `${messages.length} messages are`} ready to send today. Nothing is sent on its own.`;
}

/** The day a message first becomes right, so the desk can say when to come back. */
export function messageOpensOn(id: TimelineId, checkIn: string, checkOut: string): string | null {
  if (!isRealDay(checkIn) || !isRealDay(checkOut)) return null;
  const window = WINDOW[id];
  if (!window) return null;
  const anchor = window.anchor === 'in' ? checkIn : checkOut;
  // `from` is the furthest ahead a message may go, so that is the first day it opens.
  return addDays(anchor, -window.from);
}

export type { TimelineId, TimelineMessage };
