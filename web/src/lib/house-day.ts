import { houseStay, type NearbyPlace } from './house-stay';
import type { HouseId } from './market/types';

export type DayKind = 'ski' | 'out' | 'sunday';

const SECRET = /door\s*code|wi-?fi|password|\$/i;

function line(place: NearbyPlace): string {
  const area = place.area ? `${place.area}. ` : '';
  return `${place.name}. ${area}${place.note}`;
}

function safe(places: Array<NearbyPlace | undefined>): string[] {
  return places
    .filter((place): place is NearbyPlace => Boolean(place))
    .map(line)
    .filter((text) => text.trim().length > 0 && !SECRET.test(text));
}

/** Caption for the day picker. The quote does not call the house open. */
export function houseDayNote(where: 'house' | 'quote' | 'phone'): string {
  const base = 'Composed from the published guide. Nothing is sent, and no price is quoted.';
  if (where === 'quote') return `${base} This does not say the house is open.`;
  return base;
}

/** Lines for a printed day. No price. */
export function houseDayPaper(day: { title: string; lines: string[] }, where: 'quote' | 'phone'): string[] {
  const tail =
    where === 'quote'
      ? 'This day is from the published guide. It has no price. Nothing is sent. This does not say the house is open.'
      : 'This day is from the published guide. It has no price. Nothing is sent.';
  return [day.title, ...day.lines, tail].filter((line) => line.trim().length > 0 && !SECRET.test(line));
}

/** A day from the published guide. No prices, and it does not say the house is open. */
export function houseDay(house: HouseId, kind: DayKind): { title: string; lines: string[] } {
  const nearby = houseStay(house).nearby;
  const first = (kindName: NearbyPlace['kind']) => nearby.find((place) => place.kind === kindName);
  if (kind === 'ski') {
    const drive = nearby.find(
      (place) => place.kind === 'essentials' && /winter|tire|awd|4wd/i.test(`${place.name} ${place.note}`),
    );
    return { title: 'A ski day', lines: safe([first('ski'), first('food'), drive]) };
  }
  if (kind === 'out') {
    const grocery = nearby.find((place) => /grocer/i.test(`${place.name} ${place.note}`));
    return { title: 'An outdoors day', lines: safe([first('outdoors'), first('food'), grocery]) };
  }
  const sunday =
    nearby.find((place) => place.kind === 'essentials' && /sunday/i.test(`${place.name} ${place.note}`)) ??
    nearby.find((place) => /sunday/i.test(`${place.name} ${place.note}`));
  return {
    title: 'Sunday',
    lines: sunday ? safe([sunday]) : ['The published guide does not list a Sunday note for this house.'],
  };
}
