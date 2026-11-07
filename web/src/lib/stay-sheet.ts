import { arrivalNote, guestArrivalLine } from './arrival';
import { PROPERTIES } from './api';
import { guestDepartureLine, quoteLeave } from './departure';
import { hostEarlyPhrase, houseCheckout, houseStay, STAY_EMERGENCY } from './house-stay';
import { placeHref, placeSite } from './place-link';
import type { PlaceKind } from './house-stay';
import { agreementLine, agreementTopics } from './stay-agreement';
import { stayPhotoCaption } from './house-photos';
import { stayEventLine } from './market/events';
import { bothHouseFlexLine } from './upsells';

function longDate(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export type TripNote = { title: string; body: string };

export type TripPlace = { name: string; note: string; area: string; href: string; site: string | null; kind: PlaceKind };

export type TripSheet = {
  house: string;
  when: string;
  event: string;
  address: string;
  photo: string;
  privateNote: string;
  arrival: string;
  guestArrival: string;
  guestDeparture: string;
  checkoutRule: string;
  earlyRule: string;
  parking: string;
  rules: string;
  agreement: string;
  notes: TripNote[];
  nearby: TripPlace[];
  emergency: string;
  checkout: string[];
};

const SECRET = /door\s*code|wi-?fi|password/i;

function checkoutRule(input: { checkOutTime: string; guestDeparture?: string; laterLeaveOpen?: boolean }): string {
  if (guestDepartureLine(input.guestDeparture)) return '';
  if (input.laterLeaveOpen === true) {
    return `Checkout is ${input.checkOutTime}. Leave at 2:00 PM is a request. Nothing is charged yet. A same-day arrival still starts at 4:00 PM.`;
  }
  if (input.laterLeaveOpen === false) return `Checkout is ${input.checkOutTime}. A later leave is not open for this stay.`;
  return '';
}

function publicText(value: string | undefined): string {
  const text = value?.trim() ?? '';
  if (!text || SECRET.test(text)) return '';
  return text;
}

function publicCheckout(steps: readonly string[] | undefined): string[] {
  return (steps ?? []).map((step) => step.trim()).filter((step) => step.length > 0 && !SECRET.test(step));
}

function publicNotes(notes: readonly { title?: string; body?: string }[] | undefined): TripNote[] {
  return (notes ?? [])
    .map((note) => ({ title: note.title?.trim() ?? '', body: note.body?.trim() ?? '' }))
    .filter((note) => note.title.length > 0 && note.body.length > 0 && !SECRET.test(`${note.title} ${note.body}`));
}

function publicNearby(
  places: readonly { name?: string; note?: string; area?: string; url?: string; kind?: string }[] | undefined,
): TripPlace[] {
  return (places ?? [])
    .map((place) => ({
      name: place.name?.trim() ?? '',
      note: place.note?.trim() ?? '',
      area: place.area?.trim() ?? '',
      url: place.url?.trim() ?? '',
      kind: place.kind,
    }))
    .filter((place) => place.name.length > 0 && !SECRET.test(`${place.name} ${place.note} ${place.area} ${place.url}`))
    .map((place) => ({
      name: place.name,
      note: place.note,
      area: place.area,
      href: placeHref(place),
      site: placeSite(place.url),
      kind: isKind(place.kind) ? place.kind : 'essentials',
    }));
}

function isKind(value: string | undefined): value is PlaceKind {
  return value === 'ski' || value === 'food' || value === 'outdoors' || value === 'family' || value === 'essentials';
}

/** A chosen arrival or leave, labeled as not booked. A 2:00 PM leave stays off until that morning is open. */
export function quotePaperTimes(arrival: string | null, departure: string | null, lateOpen: boolean): string {
  const come = arrivalNote(arrival, false);
  const leave = quoteLeave(departure, lateOpen);
  const parts = [come, leave].filter((line) => line.length > 0);
  if (parts.length === 0) return '';
  const text = `${parts.join(' ')} This stay is not booked. Nothing is sent.`;
  if (text.includes('$') || /door\s*code|wi-?fi|password/i.test(text)) return '';
  return text;
}

/** The nearby list on the quote paper. No price. */
export function tripNearbyNote(): string {
  return 'Nearby places from the published guide. This list has no price. This paper is not a booking.';
}

/** The quote labels the paper. The stay is not booked. */
export function tripPaperNote(): string {
  return 'This paper is not a booking. Nothing is sent. The door code stays off this paper.';
}

export type BothHousePaper = TripSheet & { id: 'river' | 'ranch' };

/** The two-house quote labels the paper. The stay is not booked. */
export function bothHousePaperNote(): string {
  const line = 'This paper covers both houses. This stay is not booked. Nothing is sent. The door code stays off this paper.';
  if (line.includes('$') || /wi-?fi|password/i.test(line)) return 'This stay is not booked. Nothing is sent.';
  return line;
}

/** Published facts for the River House and the Ranch House. No price and no door-code timing. */
export function bothHousePapers(input: { checkIn: string; checkOut: string; early: boolean; late: boolean }): BothHousePaper[] {
  const earlyRule = bothHouseFlexLine('early', input.early);
  const checkoutRule = bothHouseFlexLine('late', input.late);
  return (['river', 'ranch'] as const).map((id) => {
    const guide = houseStay(id);
    const place = PROPERTIES[id];
    const sheet = tripSheet({
      house: place?.name ?? id,
      houseId: id,
      checkIn: input.checkIn,
      checkOut: input.checkOut,
      checkInTime: guide.checkIn,
      checkOutTime: guide.checkOut,
      address: place?.address ?? '',
      arrival: guide.arrival,
      parking: guide.parking,
      notes: guide.notes,
      nearby: guide.nearby,
      emergency: STAY_EMERGENCY,
      checkout: houseCheckout(id),
    });
    return { ...sheet, id, earlyRule, checkoutRule };
  });
}

/** Paper copy of a stay. Door codes and Wi-Fi are not fields on this sheet. */
export function tripSheet(input: {
  house: string;
  checkIn: string;
  checkOut: string;
  checkInTime: string;
  checkOutTime: string;
  address?: string;
  arrival?: string;
  guestArrival?: string;
  guestDeparture?: string;
  laterLeaveOpen?: boolean;
  nightBeforeFree?: boolean | null;
  parking?: string;
  rules?: string;
  houseId?: string;
  notes?: readonly { title?: string; body?: string }[];
  nearby?: readonly { name?: string; note?: string; area?: string; url?: string; kind?: string }[];
  emergency?: string;
  checkout?: readonly string[];
}): TripSheet {
  return {
    house: input.house,
    when: `Check-in ${input.checkInTime} on ${longDate(input.checkIn)}. Checkout ${input.checkOutTime} on ${longDate(input.checkOut)}.`,
    event: stayEventLine(input.checkIn, input.checkOut) ?? '',
    address: input.address?.trim() ?? '',
    photo: stayPhotoCaption(input.houseId),
    privateNote: 'Door code and Wi-Fi stay on the phone. They are not on this paper.',
    arrival: publicText(input.arrival),
    guestArrival: guestArrivalLine(input.guestArrival),
    guestDeparture: guestDepartureLine(input.guestDeparture),
    checkoutRule: checkoutRule(input),
    earlyRule: typeof input.nightBeforeFree === 'boolean' ? hostEarlyPhrase(input.nightBeforeFree) : '',
    parking: publicText(input.parking),
    notes: publicNotes(input.notes),
    nearby: publicNearby(input.nearby),
    emergency: publicText(input.emergency),
    rules: publicText(input.rules),
    agreement: [
      agreementLine(input.houseId ?? '', 'paper'),
      ...agreementTopics(input.houseId ?? '', 'paper').map((topic) => `${topic.title}. ${topic.detail}`),
    ].join(' '),
    checkout: publicCheckout(input.checkout),
  };
}
