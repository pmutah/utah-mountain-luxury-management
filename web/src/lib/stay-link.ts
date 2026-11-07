import { isArrivalSlot, type ArrivalSlot } from './arrival';
import { isDepartureSlot, type DepartureSlot } from './departure';
import { quoteGateLine } from './house-rules';
import type { HouseId } from './market/types';
import type { UpsellId } from './upsells';

const HOUSES: HouseId[] = ['river', 'ranch', 'lindon'];
const ADDONS: UpsellId[] = ['early', 'late', 'tub', 'groceries'];

export type StayLink = {
  house: HouseId;
  checkIn: string;
  checkOut: string;
  guests: string;
  children?: string;
  addons?: UpsellId[];
  arrive?: ArrivalSlot;
  leave?: DepartureSlot;
  /** The stay is a party or an event. The request stays off. */
  event?: boolean;
};

function isHouse(value: string): value is HouseId {
  return HOUSES.includes(value as HouseId);
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** Read a shareable quote. Name, email, and notes are ignored. */
export function readStayLink(search: string): Partial<StayLink> {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const link: Partial<StayLink> = {};
  const house = params.get('house') ?? '';
  if (isHouse(house)) link.house = house;
  const checkIn = params.get('in') ?? '';
  const checkOut = params.get('out') ?? '';
  if (isIsoDate(checkIn) && isIsoDate(checkOut) && checkOut > checkIn) {
    link.checkIn = checkIn;
    link.checkOut = checkOut;
  }
  const guests = params.get('guests') ?? '';
  if (/^\d{1,2}$/.test(guests)) link.guests = guests;
  const children = params.get('children') ?? '';
  if (/^\d{1,2}$/.test(children)) link.children = children;
  const addons = readAddons(params.get('addons') ?? '');
  if (addons.length > 0) link.addons = addons;
  const arrive = params.get('arrive') ?? '';
  if (isArrivalSlot(arrive)) link.arrive = arrive;
  const leave = params.get('leave') ?? '';
  if (isDepartureSlot(leave)) {
    link.leave = leave;
    if (leave === '2:00 PM') link.addons = readAddons([...(link.addons ?? []), 'late'].join(','));
    if (leave === '11:00 AM' && link.addons) {
      const rest = link.addons.filter((id) => id !== 'late');
      if (rest.length > 0) link.addons = rest;
      else delete link.addons;
    }
  }
  if (params.get('event') === '1') link.event = true;
  return link;
}

function readAddons(raw: string): UpsellId[] {
  const found = new Set<UpsellId>();
  for (const part of raw.split(',')) {
    const id = part.trim();
    if (ADDONS.includes(id as UpsellId)) found.add(id as UpsellId);
  }
  return ADDONS.filter((id) => found.has(id));
}

/** Query string for this quote. It does not carry a name, email, or note. */
export function stayLinkSearch(link: StayLink & { addons?: readonly UpsellId[] }): string {
  const params = new URLSearchParams();
  params.set('house', link.house);
  params.set('in', link.checkIn);
  params.set('out', link.checkOut);
  if (/^\d{1,2}$/.test(link.guests)) params.set('guests', link.guests);
  if (link.children && /^\d{1,2}$/.test(link.children)) params.set('children', link.children);
  const addons = readAddons((link.addons ?? []).join(','));
  if (addons.length > 0) params.set('addons', addons.join(','));
  if (link.arrive && isArrivalSlot(link.arrive)) params.set('arrive', link.arrive);
  if (link.leave && isDepartureSlot(link.leave)) params.set('leave', link.leave);
  if (link.event) params.set('event', '1');
  return `?${params.toString()}`;
}

/** The share caption. A blocked stay names the reason. Nothing is sent. */
export function quoteShareLine(canQuote: boolean, reason?: string): string {
  const ready =
    'This link reopens the quote, the arrival time, the departure time, how many guests are children, and the add-ons that are checked. It does not send a request.';
  const held =
    'This link reopens these dates. This stay is not quoted. Arrival and departure times stay off this link. It does not send a request.';
  const line = canQuote ? ready : quoteGateLine(reason, 'This link reopens these dates. Arrival and departure times stay off this link.', held);
  if (line.includes('$') || /\bis open\b/.test(line)) return 'It does not send a request.';
  return line;
}

/** The copy button. A refused stay is not called a quote. */
export function quoteShareButton(canQuote: boolean): string {
  return canQuote ? 'Copy quote link' : 'Copy this link';
}
