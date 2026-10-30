import { PROPERTIES } from './api';
import { houseStay, STAY_CHECKOUT, STAY_EMERGENCY } from './house-stay';
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

/** The messages a stay would receive. This preview is not sent, and it has no door code. */
export function guestTimeline(house: HouseId): TimelineMessage[] {
  const stay = houseStay(house);
  const name = PROPERTIES[house]?.name ?? house;
  const notes = stay.notes.map((note) => `${note.title}. ${note.body}`).join(' ');
  const steps = STAY_CHECKOUT.join(' ');
  const bodies: Record<TimelineId, { subject: string; body: string }> = {
    booked: {
      subject: `${name} is confirmed`,
      body: `Your stay at ${name} is confirmed. Check-in is ${stay.checkIn}. Check-out is ${stay.checkOut}. ${stay.arrival} The door code stays off this message.`,
    },
    week: {
      subject: `A week until ${name}`,
      body: `${stay.arrival} ${notes} The house rules are on your stay page. The door code still opens the day before, after those rules are read.`,
    },
    eve: {
      subject: `Tomorrow at ${name}`,
      body: `Check-in is ${stay.checkIn}. ${stay.parking} The door code and Wi-Fi open on your phone the day before check-in, after you read the house rules. This message does not include the code.`,
    },
    arrive: {
      subject: `You are arriving at ${name}`,
      body: `${stay.arrival} ${stay.parking} ${STAY_EMERGENCY}`,
    },
    mid: {
      subject: `How is ${name}?`,
      body: notes
        ? `If something in the house needs attention, reply on this thread. ${notes}`
        : 'If something in the house needs attention, reply on this thread.',
    },
    leave: {
      subject: `Checkout at ${name} is ${stay.checkOut}`,
      body: `Checkout is ${stay.checkOut}. ${steps}`,
    },
    review: {
      subject: `How was ${name}?`,
      body: 'If the stay went well, a short review helps the next group. This preview does not post one.',
    },
    return: {
      subject: `Come back to ${name}`,
      body: `We would like you back at ${name}. Open weeks are on the booking page. This is not a discount.`,
    },
  };
  return TIMELINE_IDS.map((id) => ({ id, when: WHEN[id], subject: bodies[id].subject, body: bodies[id].body.trim() }));
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
