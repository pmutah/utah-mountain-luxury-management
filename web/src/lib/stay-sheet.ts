import { guestArrivalLine } from './arrival';
import { guestDepartureLine } from './departure';
import { placeHref, placeSite } from './place-link';
import type { PlaceKind } from './house-stay';
import { agreementLine } from './stay-agreement';

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
  address: string;
  privateNote: string;
  arrival: string;
  guestArrival: string;
  guestDeparture: string;
  checkoutRule: string;
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
    address: input.address?.trim() ?? '',
    privateNote: 'Door code and Wi-Fi stay on the phone. They are not on this paper.',
    arrival: publicText(input.arrival),
    guestArrival: guestArrivalLine(input.guestArrival),
    guestDeparture: guestDepartureLine(input.guestDeparture),
    checkoutRule: checkoutRule(input),
    parking: publicText(input.parking),
    notes: publicNotes(input.notes),
    nearby: publicNearby(input.nearby),
    emergency: publicText(input.emergency),
    rules: publicText(input.rules),
    agreement: agreementLine(input.houseId ?? '', 'paper'),
    checkout: publicCheckout(input.checkout),
  };
}
