import { PROPERTIES } from './api';
import { bookingRules } from './booking-rules';
import { addonMenuLine } from './upsells';
import { houseCheckout, houseStay, nearbyGroups, STAY_EMERGENCY } from './house-stay';
import { addDays } from './market/dates';
import { arriveReadyExtra } from './arrive-ready';
import { stayEventLine } from './market/events';
import { confirmationAgreement } from './stay-agreement';
import { LISTING_TITLE } from './listing';
import { arrivalNote } from './arrival';
import { quoteLeave } from './departure';
import type { HouseId } from './market/types';

export const TIMELINE_IDS = ['booked', 'week', 'eve', 'arrive', 'mid', 'leave', 'review', 'return'] as const;
export type TimelineId = (typeof TIMELINE_IDS)[number];

export type TimelineMessage = {
  id: TimelineId;
  when: string;
  subject: string;
  body: string;
};

const WHEN: Record<TimelineId, string> = {
  booked: 'When the stay is booked',
  week: 'Seven days before check-in',
  eve: 'The day before check-in',
  arrive: 'Check-in day',
  mid: 'Halfway through the stay',
  leave: 'Checkout morning',
  review: 'After checkout',
  return: 'Before the next season',
};

const STORAGE_KEY = 'uml-guest-timeline';

export type TimelineStay = {
  propertyId: string;
  checkIn: string;
  checkOut: string;
  status?: string;
};

function labelDate(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(Date.UTC(year!, month! - 1, day)).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function stayNearbyLine(house: HouseId): string {
  const groups = nearbyGroups(houseStay(house).nearby);
  const picks: string[] = [];
  for (const kind of ['ski', 'food', 'outdoors'] as const) {
    const name = groups.find((group) => group.kind === kind)?.places[0]?.name;
    if (name && !/door\s*code|wi-?fi|password/i.test(name)) picks.push(name);
  }
  if (picks.length === 0) return '';
  return `While you are here: ${picks.join(', ')}.`;
}

function halfway(checkIn: string, checkOut: string): string {
  const nights: string[] = [];
  let cursor = checkIn;
  while (cursor < checkOut && nights.length < 28) {
    nights.push(cursor);
    cursor = addDays(cursor, 1);
  }
  if (nights.length === 0) return checkIn;
  return nights[Math.min(nights.length - 1, Math.floor(nights.length / 2))]!;
}

function datedStay(stay?: { checkIn: string; checkOut: string } | null): { checkIn: string; checkOut: string } | null {
  if (!stay) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(stay.checkIn) || !/^\d{4}-\d{2}-\d{2}$/.test(stay.checkOut)) return null;
  if (stay.checkOut <= stay.checkIn) return null;
  return { checkIn: stay.checkIn, checkOut: stay.checkOut };
}

function whenFor(id: TimelineId, stay: { checkIn: string; checkOut: string } | null): string {
  if (!stay) return WHEN[id];
  const inn = labelDate(stay.checkIn);
  const out = labelDate(stay.checkOut);
  if (id === 'week') return `Seven days before ${inn}`;
  if (id === 'eve') return `The day before ${inn}`;
  if (id === 'arrive') return `Check-in day, ${inn}`;
  if (id === 'mid') return `Halfway through, ${labelDate(halfway(stay.checkIn, stay.checkOut))}`;
  if (id === 'leave') return `Checkout morning, ${out}`;
  if (id === 'review') return `After ${out}`;
  return WHEN[id];
}

export function timelineStayLabel(checkIn: string, checkOut: string): string {
  const dated = datedStay({ checkIn, checkOut });
  if (!dated) return '';
  return `${labelDate(dated.checkIn)} to ${labelDate(dated.checkOut)}`;
}

/** The next stay for this house. A stay in progress wins. Names are not read. */
export function timelineStayFor(house: HouseId, stays: readonly TimelineStay[], asOf: string): { checkIn: string; checkOut: string } | null {
  const live = stays.filter(
    (stay) =>
      stay.propertyId === house &&
      stay.status !== 'cancelled' &&
      stay.status !== 'blocked' &&
      datedStay(stay) !== null &&
      stay.checkOut > asOf,
  );
  const current = live.find((stay) => stay.checkIn <= asOf);
  const picked = current ?? live.sort((a, b) => a.checkIn.localeCompare(b.checkIn))[0];
  return picked ? { checkIn: picked.checkIn, checkOut: picked.checkOut } : null;
}

function returnBody(house: HouseId, name: string): string {
  const title = LISTING_TITLE[house];
  const named = title.includes('$') || /door\s*code|wi-?fi|password/i.test(title) ? '' : `${title}. `;
  return `We would like you back at ${name}. ${named}The booking page can quote a stay. This does not name an open week. This is not a discount. Nothing is sent.`;
}

function evePrep(house: HouseId): string {
  const extra = arriveReadyExtra(house);
  if (!extra) return '';
  return ` ${extra} These steps are from the published guide. Nothing is sent.`;
}

/** The messages a stay would receive. A quote does not call the stay confirmed. This preview is not sent, and it has no door code. */
export function guestTimeline(
  house: HouseId,
  dates?: { checkIn: string; checkOut: string } | null,
  audience: 'stay' | 'quote' = 'stay',
  times?: { arrival?: string | null; departure?: string | null; lateOpen?: boolean; early?: boolean },
): TimelineMessage[] {
  const guide = houseStay(house);
  const name = PROPERTIES[house]?.name ?? house;
  const notes = guide.notes.map((note) => `${note.title}. ${note.body}`).join(' ');
  const steps = houseCheckout(house).join(' ');
  const rules = bookingRules(house).join(' ');
  const terms = confirmationAgreement();
  const nearby = stayNearbyLine(house);
  const bodies: Record<TimelineId, { subject: string; body: string }> = {
    booked: {
      subject: `${name} is confirmed`,
      body: `Your stay at ${name} is confirmed. Check-in is ${guide.checkIn}. Check-out is ${guide.checkOut}. ${guide.arrival} ${rules} ${terms} The door code stays off this message.`,
    },
    week: {
      subject: `A week until ${name}`,
      body: `${guide.arrival} ${notes} ${addonMenuLine(house)} The house rules are on your stay page. The door code still opens the day before, after the house rules are read and each stay-agreement topic is opened. Opening a topic does not sign the agreement. This message does not include the code.`,
    },
    eve: {
      subject: `Tomorrow at ${name}`,
      body: `Check-in is ${guide.checkIn}. ${guide.parking} The door code and Wi-Fi open on your phone the day before check-in, after you read the house rules and open each stay-agreement topic. Opening a topic does not sign the agreement. This message does not include the code.${evePrep(house)}`,
    },
    arrive: {
      subject: `You are arriving at ${name}`,
      body: `${guide.arrival} ${guide.parking} ${STAY_EMERGENCY}${evePrep(house)}`,
    },
    mid: {
      subject: `How is ${name}?`,
      body: [`If something in the house needs attention, reply on this thread.`, notes, nearby].filter((line) => line.length > 0).join(' '),
    },
    leave: {
      subject: `Checkout at ${name} is ${guide.checkOut}`,
      body: `Checkout is ${guide.checkOut}. ${steps}`,
    },
    review: {
      subject: `How was ${name}?`,
      body: 'If the stay went well, a short review helps the next group. This preview does not post one.',
    },
    return: {
      subject: `Come back to ${name}`,
      body: returnBody(house, name),
    },
  };
  const dated = datedStay(dates);
  if (dated) {
    const inn = labelDate(dated.checkIn);
    const out = labelDate(dated.checkOut);
    const event = stayEventLine(dated.checkIn, dated.checkOut);
    bodies.booked.body = `Your stay at ${name} is confirmed. Check-in is ${inn}. Check-out is ${out}. ${guide.arrival}${event ? ` ${event}` : ''} ${rules} ${terms} The door code stays off this message.`;
    bodies.eve.body = `Check-in is ${inn}. ${guide.parking} The door code and Wi-Fi open on your phone the day before check-in, after you read the house rules and open each stay-agreement topic. Opening a topic does not sign the agreement. This message does not include the code.${evePrep(house)}`;
    bodies.leave.body = `Checkout is ${out} at ${guide.checkOut}. ${steps}`;
    if (event && !event.includes('$') && !/door\s*code|wi-?fi|password/i.test(event)) {
      bodies.mid.body = `${bodies.mid.body} ${event} Nothing is sent.`;
    }
    bodies.review.body = `If the stay that ended ${out} went well, a short review helps the next group. This preview does not post one.`;
  }
  const come = arrivalNote(times?.arrival ?? null, times?.early === true);
  if (come && !come.includes('$') && !/door\s*code|wi-?fi|password/i.test(come)) {
    bodies.eve.body = `${bodies.eve.body} ${come}`;
    bodies.arrive.body = `${bodies.arrive.body} ${come}`;
  }
  const leave = quoteLeave(times?.departure, times?.lateOpen === true);
  if (leave && !leave.includes('$') && !/door\s*code|wi-?fi|password/i.test(leave)) {
    bodies.leave.body = `${bodies.leave.body} ${leave} Nothing is sent.`;
  }
  const messages = TIMELINE_IDS.map((id) => ({ id, when: whenFor(id, dated), subject: bodies[id].subject, body: bodies[id].body.trim() }));
  if (audience !== 'quote') return messages;
  return messages.map((message) => {
    const body = quotePublicBody(
      message.id === 'booked'
        ? message.body
            .replace('Your stay at', 'This stay at')
            .replace(' is confirmed.', ' is not booked. Nothing is sent.')
            .replace('Check-in is ', 'Check-in would be ')
            .replace('Check-out is ', 'Check-out would be ')
        : message.body,
    );
    return message.id === 'booked'
      ? { ...message, subject: `${name} is not booked`, body }
      : { ...message, subject: `If this stay is booked: ${message.subject}`, body };
  });
}

/** A public quote does not say when a door code opens. */
function quotePublicBody(body: string): string {
  return body
    .replace(/The door code still opens the day before[^.]*\. ?/gi, '')
    .replace(/The door code and Wi-Fi open on your phone the day before check-in[^.]*\. ?/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function emptySwitches(): Record<HouseId, Record<TimelineId, boolean>> {
  const on = Object.fromEntries(TIMELINE_IDS.map((id) => [id, true])) as Record<TimelineId, boolean>;
  return { river: { ...on }, ranch: { ...on }, lindon: { ...on } };
}

/** Missing switches stay on. A saved off switch stays off. */
export function readTimelineSwitches(raw: string | null): Record<HouseId, Record<TimelineId, boolean>> {
  const next = emptySwitches();
  if (!raw) return next;
  try {
    const parsed = JSON.parse(raw) as Partial<Record<HouseId, Partial<Record<TimelineId, boolean>>>>;
    for (const house of ['river', 'ranch', 'lindon'] as const) {
      const saved = parsed[house];
      if (!saved) continue;
      for (const id of TIMELINE_IDS) {
        if (saved[id] === false) next[house][id] = false;
      }
    }
  } catch {
    return emptySwitches();
  }
  return next;
}

export function timelineStorageKey(): string {
  return STORAGE_KEY;
}

export function timelineOnCount(switches: Record<TimelineId, boolean>): number {
  return TIMELINE_IDS.filter((id) => switches[id]).length;
}

/** The host timeline when the guest list could not be read. It does not name a stay. */
export function timelineUnreadLine(): string {
  return 'Saved bookings could not be read. This timeline does not name a stay. Nothing is sent.';
}

/**
 * The stay phone lists the notes this stay would receive. The door code stays off the list.
 *
 * This is the guest's own view, which has no send control, so "nothing is sent" is true here: the
 * host sends from the desk, not from the guest's phone. The host panel's wording is separate because
 * it sits beside a sender.
 */
export function stayMessageNote(): string {
  const line =
    'These are the notes this stay receives. The door code stays off this list, and nothing on this phone sends one.';
  if (line.includes('$') || /wi-?fi|password/i.test(line)) return 'The door code stays off this list.';
  return line;
}

/** When and subject only. Message bodies stay off this list. */
export function stayMessageSchedule(
  house: HouseId,
  dates: { checkIn: string; checkOut: string },
): { id: TimelineId; when: string; subject: string }[] {
  return guestTimeline(house, dates, 'stay')
    .map((message) => ({ id: message.id, when: message.when, subject: message.subject }))
    .filter((row) => {
      const text = `${row.when} ${row.subject}`;
      return !text.includes('$') && !/door\s*code|wi-?fi|password/i.test(text);
    });
}

/** When and subject for a public quote. Message bodies stay off this list. */
export function quoteMessageSchedule(
  house: HouseId,
  dates: { checkIn: string; checkOut: string },
): { id: TimelineId; when: string; subject: string }[] {
  return guestTimeline(house, dates, 'quote')
    .map((message) => ({ id: message.id, when: message.when, subject: message.subject }))
    .filter((row) => {
      const text = `${row.when} ${row.subject}`;
      return !text.includes('$') && !/door\s*code|wi-?fi|password/i.test(text);
    });
}

/** Both houses on a quote. The stay is not booked. */
export function bothHouseMessageNote(): string {
  const line =
    'These are the messages a booked stay at both houses would receive. This stay is not booked. Nothing is sent. The door code stays off every message.';
  if (line.includes('$') || /wi-?fi|password/i.test(line)) return 'This stay is not booked. Nothing is sent.';
  return line;
}

/** The quote page labels the message list. The stay is not booked. */
export function quoteMessageNote(): string {
  return 'These are the messages a booked stay would receive. This stay is not booked. Nothing is sent. The door code stays off every message.';
}

/** Shown with the confirmation preview. The file does not hold the dates. */
export function quoteCalendarLine(): string {
  return 'These dates can be saved on a calendar. That file does not hold the dates. This stay is not booked.';
}
