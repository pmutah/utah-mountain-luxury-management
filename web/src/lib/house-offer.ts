import { PROPERTIES } from './api';
import { HOUSE_PHOTOS } from './house-photos';
import { houseStay } from './house-stay';
import { LISTING_TITLE } from './listing';
import { bothHouseNextEventLine, houseNextEventLine } from './event-plan';
import { flexStayLine, publicFlexLine } from './house-manual';
import { bothHouseMonthNights, bothHouseQuote, compoundOffer } from './compound';
import { addonMenuLine, bothHouseFlex, bothHouseFlexRhythm, houseMenu } from './upsells';
import type { HouseId } from './market/types';

const HOUSES: HouseId[] = ['river', 'ranch', 'lindon'];
const SECRET = /door\s*code|wi-?fi|password/i;

export type HouseOffer = {
  house: HouseId;
  name: string;
  lines: string[];
  addon: string;
};

export type HouseListStay = {
  checkIn: string;
  checkOut: string;
  asOf: string;
  taken: Partial<Record<HouseId, readonly string[]>>;
  closed: Partial<Record<HouseId, readonly string[]>>;
  guests?: number | null;
  children?: number;
};

export type HouseAsideStay = {
  checkIn: string;
  checkOut: string;
  taken: readonly string[];
  closed?: readonly string[];
};

function namedAddons(house: HouseId): string {
  return houseMenu(house)
    .filter((offer) => offer.id === 'tub' || offer.id === 'groceries')
    .map((offer) => offer.name)
    .join('. ');
}

/** The house list has no dates, so it does not claim the calendar failed. */
export function houseListAddon(house: HouseId): string {
  const named = namedAddons(house);
  const body =
    'An early arrival and a later checkout follow the dates on the booking page. This list does not check a night. This list has no price and does not send a request.';
  const line = named ? `${named}. ${body}` : body;
  if (line.includes('$') || /\bis open\b/i.test(line) || SECRET.test(line)) {
    return 'This list has no price and does not send a request.';
  }
  return line;
}

export type HouseAsideParty = {
  guests: number | null;
  children?: number;
  taken: Partial<Record<HouseId, readonly string[]>>;
  closed?: Partial<Record<HouseId, readonly string[]>>;
};

/** Early and late for a party that needs both houses. A night booked at either house stays off. */
function bothHouseStayAddon(house: HouseId, asOf: string, stay: HouseAsideStay, party: HouseAsideParty): string {
  const guests = party.guests ?? 0;
  const offer = compoundOffer(stay.checkIn, stay.checkOut, guests, party.children, party.taken, asOf, () => 'unknown', party.closed);
  if (offer.show && !offer.ok && offer.reason && !offer.reason.includes('$') && !/\bis open\b/.test(offer.reason)) {
    return offer.reason;
  }
  const flex = bothHouseFlex({
    checkIn: stay.checkIn,
    checkOut: stay.checkOut,
    taken: party.taken,
    closed: party.closed,
  });
  const named = namedAddons(house);
  const body = bothHouseFlexRhythm(flex);
  const line = named ? `${named}. ${body}` : body;
  if (line.includes('$') || /\bis open\b/i.test(line) || /password/i.test(line)) return 'Nothing is sent.';
  return line;
}

/** Add-ons for the dates on a house page once the calendar has been read. No price. */
export function houseStayAddon(house: HouseId, asOf: string, stay: HouseAsideStay, party?: HouseAsideParty | null): string {
  if (party && bothHouseQuote(party.guests)) return bothHouseStayAddon(house, asOf, stay, party);
  const named = namedAddons(house);
  const flex = publicFlexLine(flexStayLine(
    'Can we arrive early and leave later?',
    house,
    { checkIn: stay.checkIn, checkOut: stay.checkOut },
    { taken: { [house]: stay.taken }, closed: { [house]: stay.closed ?? [] } },
    asOf,
  ));
  const follow = 'An early arrival and a later checkout follow the dates on this page. Nothing is sent.';
  if (flex && /Those nights are already booked|Those nights are closed|already passed|first stays|This stay is not quoted/.test(flex)) {
    return flex;
  }
  const body = flex && !flex.includes('calendar can be read') ? flex : follow;
  const line = named ? `${named}. ${body}` : body;
  if (line.includes('$') || /\bis open\b/i.test(line) || /password/i.test(line)) return follow;
  return line;
}

/** Add-ons and the next event on a house page. No price, and it does not say the house is open. */
export function housePageAside(
  house: HouseId,
  asOf: string,
  stay?: HouseAsideStay | null,
  party?: HouseAsideParty | null,
): string[] {
  return [
    stay ? houseStayAddon(house, asOf, stay, party) : addonMenuLine(house),
    party && bothHouseQuote(party.guests)
      ? bothHouseNextEventLine(asOf, bothHouseMonthNights(party.taken, party.closed))
      : houseNextEventLine(house, asOf, stay ? { taken: stay.taken, closed: stay.closed ?? [] } : undefined),
  ];
}

/** What each house is, from the published guide. No price, and it does not say a house is open. */
export function houseOffers(listStay?: HouseListStay | null): HouseOffer[] {
  const dated = Boolean(listStay && /^\d{4}-\d{2}-\d{2}$/.test(listStay.checkIn) && /^\d{4}-\d{2}-\d{2}$/.test(listStay.checkOut) && listStay.checkOut > listStay.checkIn);
  return HOUSES.map((house) => {
    const stay = houseStay(house);
    const photo = HOUSE_PHOTOS[house];
    const address = PROPERTIES[house]?.address ?? '';
    const party =
      dated && listStay && listStay.guests !== undefined && bothHouseQuote(listStay.guests)
        ? ({
            guests: listStay.guests,
            children: listStay.children,
            taken: listStay.taken,
            closed: listStay.closed,
          } satisfies HouseAsideParty)
        : null;
    const addon =
      dated && listStay
        ? houseStayAddon(
            house,
            listStay.asOf,
            {
              checkIn: listStay.checkIn,
              checkOut: listStay.checkOut,
              taken: listStay.taken[house] ?? [],
              closed: listStay.closed[house] ?? [],
            },
            party,
          )
        : houseListAddon(house);
    const lines = [
      LISTING_TITLE[house],
      address,
      stay.arrival,
      stay.parking,
      stay.bedrooms,
      ...stay.notes.map((note) => `${note.title}. ${note.body}`),
      photo && /rendering/i.test(photo.caption) ? photo.caption : null,
      addon,
    ].filter((line): line is string => typeof line === 'string' && line.length > 0 && !SECRET.test(line));
    return { house, name: PROPERTIES[house].name, lines, addon };
  });
}
