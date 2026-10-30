import type { HouseId } from './market/types';

const HOUSES: HouseId[] = ['river', 'ranch', 'lindon'];

export type StayLink = {
  house: HouseId;
  checkIn: string;
  checkOut: string;
  guests: string;
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
  return link;
}

/** Query string for this quote. It does not carry a name, email, or note. */
export function stayLinkSearch(link: StayLink): string {
  const params = new URLSearchParams();
  params.set('house', link.house);
  params.set('in', link.checkIn);
  params.set('out', link.checkOut);
  if (/^\d{1,2}$/.test(link.guests)) params.set('guests', link.guests);
  return `?${params.toString()}`;
}
