import { PROPERTIES } from './api';
import type { HouseId } from './market/types';
import { RIVER_UNIT_DETAIL } from './river-units';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** The parts by name, so a guest reads "River Garage Suite" rather than a slug. */
const UNIT_NAME = new Map<string, string>(RIVER_UNIT_DETAIL.map((unit) => [unit.id as string, unit.name]));

/** "A", "A and B", "A, B, and C" — the way a person writes a list. */
function listOf(names: readonly string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0]!;
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}

function longDate(iso: string): string {
  if (!DATE.test(iso)) return '';
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(Date.UTC(year!, month! - 1, day)).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function houseName(id: string): string {
  if (id === 'river' || id === 'ranch' || id === 'lindon') return PROPERTIES[id as HouseId]?.name ?? id;
  return id;
}

export type RequestNote = {
  guestName: string;
  houses: readonly string[];
  checkIn: string;
  checkOut: string;
  nights: number;
  guests?: number;
  children?: number;
  /**
   * Which parts of the Riverhouse this request takes.
   *
   * Absent means the whole house. A guest who asked for the Garage Suite was told "your request for The River House",
   * which is the wrong house — the email is their own record of what they asked for.
   */
  units?: readonly string[];
  /**
   * The guest's own link to this request. It is the credential, so it goes only in the guest's mail
   * and never on the host desk. A URL that is not a plain https link is dropped.
   */
  statusLink?: string;
};

export type Mail = { subject: string; body: string };

/**
 * What the guest is told when their request is saved. It says a request was received, not that a
 * stay is booked. It names no price, no door code, and it does not promise the dates.
 */
export function guestRequestReceipt(note: RequestNote): Mail {
  /*
   * A part request must name the part. "Your request for The River House" when the guest asked for the Garage Suite is
   * the wrong house, and this email is the guest's own record of what they asked for.
   */
  const parts = (note.units ?? []).filter((unit) => typeof unit === 'string' && unit.length > 0);
  const partNames = parts
    .map((unit) => UNIT_NAME.get(unit) ?? unit)
    .filter(Boolean);
  const houses =
    partNames.length > 0
      ? `${listOf(partNames)} at ${note.houses.map(houseName).join(' and ')}`
      : note.houses.map(houseName).join(' and ');
  const first = note.guestName.split(' ')[0] || note.guestName;
  const nights = note.nights === 1 ? '1 night' : `${note.nights} nights`;
  const party =
    typeof note.guests === 'number' && note.guests >= 1
      ? note.children && note.children > 0
        ? ` for ${note.guests} guests including ${note.children === 1 ? '1 child' : `${note.children} children`}`
        : ` for ${note.guests === 1 ? '1 guest' : `${note.guests} guests`}`
      : '';
  const statusLink = sanitizeLink(note.statusLink);
  const body = [
    `Hi ${first},`,
    '',
    `We have your request for ${houses}, ${longDate(note.checkIn)} to ${longDate(note.checkOut)} (${nights})${party}.`,
    '',
    'This is a request, not a confirmed booking. A person reads every request and writes back, usually the same day. Your dates are held while we reply, and the hold lets go on its own if we cannot take the stay.',
    '',
    ...(statusLink
      ? [`You can see where the request stands at any time, without signing in: ${statusLink}`, '']
      : []),
    'We do not take payment on this site and we never ask for a card by email. If you need something sooner, reply to this message and it comes to the same inbox.',
    '',
    'Utah Mountain Luxury',
  ];
  const mail = { subject: `We have your request · ${houses}`, body: body.join('\n') };
  return sanitize(mail);
}

/**
 * A link that is safe to put in a guest email. Only a plain https URL survives, so a javascript: or
 * data: value cannot be injected into the mail body.
 */
function sanitizeLink(value: string | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!/^https:\/\/[A-Za-z0-9.-]+\/[A-Za-z0-9/_?=&%.#-]*$/.test(trimmed)) return null;
  return trimmed;
}

/**
 * What the guest is told when the host accepts. It still does not collect payment and does not
 * carry a door code: the code opens on the guest phone the day before arrival.
 */
export function guestAcceptedMail(note: RequestNote): Mail {
  const houses = note.houses.map(houseName).join(' and ');
  const first = note.guestName.split(' ')[0] || note.guestName;
  const nights = note.nights === 1 ? '1 night' : `${note.nights} nights`;
  const body = [
    `Hi ${first},`,
    '',
    `Your stay at ${houses} is confirmed for ${longDate(note.checkIn)} to ${longDate(note.checkOut)} (${nights}).`,
    '',
    'Check-in is at 4:00 PM and checkout is at 11:00 AM. We will write again before you arrive with the way in and the house guide. The door code opens on the guest phone the day before your stay.',
    '',
    'If anything about the stay changes, reply to this message.',
    '',
    'Utah Mountain Luxury',
  ];
  return sanitize({ subject: `Your stay is confirmed · ${houses}`, body: body.join('\n') });
}

/** A subject or body that would carry a price or a code is not sent. */
function sanitize(mail: Mail): Mail {
  const clean = (text: string) => text.replace(/\$\s?\d[\d,.]*/g, '').replace(/\b\d{4,8}\b(?=\s*(?:is|opens|code))/gi, '');
  const body = clean(mail.body);
  const subject = clean(mail.subject);
  return { subject: subject.slice(0, 160) || 'Utah Mountain Luxury', body };
}

/** A line for the host desk. It says what was sent without repeating the guest address. */
export function sentLine(kind: 'receipt' | 'accepted', to: string): string {
  const address = to.trim();
  const masked = address.includes('@') ? `${address.split('@')[0]!.slice(0, 2)}…@${address.split('@')[1]}` : 'the guest';
  if (kind === 'receipt') return `A receipt went to ${masked}. It says the stay is a request, not a booking.`;
  return `A confirmation went to ${masked}. It says the stay is confirmed and does not carry a door code.`;
}
