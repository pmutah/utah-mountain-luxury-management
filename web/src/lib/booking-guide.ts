import { PROPERTIES } from './api';
import { accessLine, houseStay, nearbyGroups } from './house-stay';
import { houseRules } from './house-rules';
import type { HouseId } from './market/types';
import { placeSite } from './place-link';

export type BookingGuide = {
  name: string;
  facts: string[];
  rules: string[];
  checkout: string[];
  nearby: string[];
  close: string;
};

/** Paper copy of the public house. It does not include a door code, a name, or an email. */
export function bookingGuide(house: HouseId, checkIn: string, checkOut: string): BookingGuide {
  const stay = houseStay(house);
  const access = accessLine(checkIn);
  const facts = [
    `Sleeps ${stay.sleeps}. Check-in ${stay.checkIn}. Check-out ${stay.checkOut}.`,
    stay.bedrooms ?? '',
    stay.arrival,
    stay.parking,
    PROPERTIES[house].address,
    stay.emergency,
    access ?? '',
    checkIn && checkOut ? `Dates on this quote: ${checkIn} to ${checkOut}.` : '',
  ].filter((line) => line.length > 0);
  return {
    name: PROPERTIES[house].name,
    facts,
    rules: houseRules(house).map((rule) => rule.text),
    checkout: [...stay.checkout],
    nearby: nearbyGroups(stay.nearby).flatMap((group) => [
      group.label,
      ...group.places.map((place) => {
        const site = placeSite(place.url);
        const where = place.area ? `, ${place.area}` : '';
        return `${place.name}${where}. ${place.note}${site ? ` ${site}` : ''}`;
      }),
    ]),
    close: 'This paper does not hold the dates or charge a card. The door code stays off this paper.',
  };
}
