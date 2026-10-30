import { PROPERTIES } from './api';
import { HOUSE_PHOTOS } from './house-photos';
import { houseStay, nearbyGroups, SLEEPS, STAY_EMERGENCY } from './house-stay';
import { houseRules } from './house-rules';
import { LISTING_TITLE } from './listing';
import type { HouseId } from './market/types';
import { placeHref, placeSite } from './place-link';

const ORIGIN = 'https://wilhite-portfolio.pages.dev';
const SECRET = /door\s*code|wi-?fi|password/i;
const HOUSES: HouseId[] = ['river', 'ranch', 'lindon'];

export type PublicPlace = { name: string; note: string; href: string; site: string | null };
export type PublicGroup = { kind: string; label: string; places: PublicPlace[] };

export type PublicHouse = {
  id: HouseId;
  name: string;
  title: string;
  address: string;
  map: string;
  sleeps: number;
  checkIn: string;
  checkOut: string;
  photo: { src: string; caption: string };
  facts: string[];
  notes: { title: string; body: string }[];
  rules: string[];
  nearby: PublicGroup[];
  emergency: string;
  quoteHref: string;
  pageHref: string;
  opening: string | null;
  schema: Record<string, unknown>;
};

/** A public house page from the published guide. Door codes, Wi-Fi, and prices stay off it. */
export function publicHouse(house: HouseId): PublicHouse {
  const stay = houseStay(house);
  const photo = HOUSE_PHOTOS[house] ?? { src: '', caption: '' };
  const notes = stay.notes.filter((note) => !SECRET.test(`${note.title} ${note.body}`));
  const rules = houseRules(house)
    .map((rule) => rule.text)
    .filter((text) => !SECRET.test(text));
  const facts = [
    `Sleeps ${stay.sleeps}`,
    `Check-in ${stay.checkIn}`,
    `Check-out ${stay.checkOut}`,
    stay.bedrooms,
    stay.arrival,
    stay.parking,
  ].filter((line): line is string => typeof line === 'string' && line.length > 0 && !SECRET.test(line));
  const nearby = nearbyGroups(stay.nearby)
    .map((group) => ({
      kind: group.kind,
      label: group.label,
      places: group.places
        .filter((place) => !SECRET.test(`${place.name} ${place.note}`))
        .map((place) => ({
          name: place.name,
          note: place.note,
          href: placeHref(place),
          site: placeSite(place.url),
        })),
    }))
    .filter((group) => group.places.length > 0);
  const address = PROPERTIES[house]?.address ?? '';
  return {
    id: house,
    name: PROPERTIES[house]?.name ?? house,
    title: LISTING_TITLE[house],
    address,
    map: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`,
    sleeps: stay.sleeps,
    checkIn: stay.checkIn,
    checkOut: stay.checkOut,
    photo,
    facts,
    notes,
    rules,
    nearby,
    emergency: STAY_EMERGENCY,
    quoteHref: `/book?house=${house}`,
    pageHref: `/houses/${house}`,
    opening: house === 'river' ? 'First stays November 1, 2026' : null,
    schema: vacationRental(house, address, photo.src),
  };
}

export function publicHouses(): PublicHouse[] {
  return HOUSES.map((house) => publicHouse(house));
}

export const GROUP_TRIP =
  'A party larger than the River House can quote Ranch and River together. Twenty-five stay at the River House and the rest stay at the Ranch House. Each house keeps an adult. The booking page does not hold either house.';

export const GROUP_TRIP_HREF = '/book?house=river&guests=30';

/** `/houses`, `/houses/river`, or null when the path is not a public house page. */
export function parseHousePath(pathname: string): HouseId | 'index' | null {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (path === '/houses') return 'index';
  const match = path.match(/^\/houses\/(river|ranch|lindon)$/);
  return match ? (match[1] as HouseId) : null;
}

function vacationRental(house: HouseId, address: string, image: string): Record<string, unknown> {
  const stay = houseStay(house);
  const postal = postalAddress(address);
  return {
    '@context': 'https://schema.org',
    '@type': 'VacationRental',
    name: PROPERTIES[house]?.name ?? house,
    description: LISTING_TITLE[house],
    url: `${ORIGIN}/houses/${house}`,
    image: image ? `${ORIGIN}${image}` : undefined,
    address: { '@type': 'PostalAddress', ...postal },
    containsPlace: {
      '@type': 'Accommodation',
      occupancy: { '@type': 'QuantitativeValue', value: SLEEPS[house] },
    },
    checkinTime: stay.checkIn === '4:00 PM' ? '16:00' : stay.checkIn,
    checkoutTime: stay.checkOut === '11:00 AM' ? '11:00' : stay.checkOut,
  };
}

function postalAddress(address: string): {
  streetAddress: string;
  addressLocality: string;
  addressRegion: string;
  postalCode: string;
  addressCountry: string;
} {
  const parts = address.split(',').map((part) => part.trim());
  const last = parts[parts.length - 1] ?? '';
  return {
    streetAddress: parts[0] ?? address,
    addressLocality: parts.length >= 3 ? (parts[1] ?? '') : '',
    addressRegion: /Utah|\bUT\b/.test(last) ? 'UT' : '',
    postalCode: last.match(/\d{5}/)?.[0] ?? '',
    addressCountry: 'US',
  };
}
