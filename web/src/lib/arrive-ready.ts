import { houseRules } from './house-rules';
import { houseStay } from './house-stay';
import type { HouseId } from './market/types';

export type ArriveStep = { id: string; text: string };

const SECRET = /door\s*code|wi-?fi|password|\$/i;

export type ArriveWhere = 'house' | 'quote' | 'phone';

type ArriveBuckets = Partial<Record<ArriveWhere, Partial<Record<HouseId, string[]>>>>;

function isBucket(value: unknown): value is Partial<Record<HouseId, string[]>> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cleanIds(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [];
}

/** Checks for one page. An older list that mixed the pages is left unread. */
export function readArriveChecks(raw: string | null, where: ArriveWhere, house: HouseId): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isBucket(parsed)) return [];
    const bucket = (parsed as ArriveBuckets)[where];
    if (!isBucket(bucket)) return [];
    return cleanIds(bucket[house]);
  } catch {
    return [];
  }
}

/** Saves checks for one page and leaves the other pages as they were. */
export function writeArriveChecks(raw: string | null, where: ArriveWhere, house: HouseId, ids: string[]): string {
  const parsed: ArriveBuckets = {};
  try {
    const current: unknown = raw ? JSON.parse(raw) : {};
    if (isBucket(current)) {
      const row = current as ArriveBuckets;
      if (isBucket(row.house)) parsed.house = row.house;
      if (isBucket(row.quote)) parsed.quote = row.quote;
      if (isBucket(row.phone)) parsed.phone = row.phone;
    }
  } catch {
    /* start a fresh list */
  }
  parsed[where] = { ...parsed[where], [house]: ids };
  return JSON.stringify(parsed);
}

/** Caption for the before-arrival list. The quote does not call the house open. */
export function arriveReadyNote(where: ArriveWhere): string {
  const base = 'From the published guide. A check stays on this page. Nothing is sent.';
  if (where === 'quote') return `${base} This does not say the house is open.`;
  return base;
}

/** Before-arrival steps the day-before note adds beyond how to arrive and where to park. */
export function arriveReadyExtra(house: HouseId): string {
  const text = arriveReady(house)
    .filter((step) => step.id !== 'arrival' && step.id !== 'parking')
    .map((step) => step.text)
    .join(' ');
  if (!text || text.includes('$') || /door\s*code|wi-?fi|password/i.test(text)) return '';
  return text;
}

/** What the published guide already asks before arrival. Checking a line does not send it. */
export function arriveReady(house: HouseId): ArriveStep[] {
  const stay = houseStay(house);
  const rows: ArriveStep[] = [
    { id: 'arrival', text: stay.arrival },
    { id: 'parking', text: stay.parking },
  ];
  const winter = stay.nearby.find((place) => /winter driving/i.test(place.name));
  if (winter) rows.push({ id: 'winter', text: `${winter.name}. ${winter.note}` });
  for (const note of stay.notes) {
    if (/septic/i.test(note.title)) rows.push({ id: 'septic', text: note.body });
    if (/hot tub/i.test(note.title)) rows.push({ id: 'tub', text: note.body });
  }
  const quiet = houseRules(house).find((rule) => /quiet/i.test(rule.text));
  if (quiet) rows.push({ id: 'quiet', text: quiet.text });
  return rows.filter((row) => row.text.trim().length > 0 && !SECRET.test(row.text));
}
