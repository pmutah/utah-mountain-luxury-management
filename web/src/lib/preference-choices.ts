import { guestArrivalLine } from './arrival';
import { guestDepartureLine } from './departure';
import { houseStay } from './house-stay';
import type { HouseId } from './market/types';

export type PreferenceCardInput = {
  adults?: string;
  children?: string;
  tripWhy?: string[];
  topAmenities?: string[];
  amenities?: string[];
  evenings?: string;
  arrivalWindow?: string;
  earlyLate?: string;
  allergies?: string;
  coffeeStyle?: string;
  coffeeMilk?: string;
  extraPillows?: string;
  kidsSleep?: string;
  celebration?: string;
  dogs?: string;
  cell?: string;
  codeRecipients?: string;
};

/** Overnight guests from a saved preference form. Names and contact fields stay out. */
export function preferencePartyCount(answers?: PreferenceCardInput | null): { guests: number; children?: number } | null {
  if (!answers?.adults?.trim()) return null;
  const adults = Number(answers.adults.trim());
  if (!Number.isInteger(adults) || adults < 1 || adults > 30) return null;
  const kidRaw = answers.children?.trim();
  let children = 0;
  if (kidRaw) {
    const kids = Number(kidRaw);
    if (!Number.isInteger(kids) || kids < 0 || kids >= adults) return null;
    children = kids;
  }
  const guests = adults + children;
  if (guests < 1 || guests > 30) return null;
  return children > 0 ? { guests, children } : { guests };
}

function isHouse(house: string | null | undefined): house is HouseId {
  return house === 'river' || house === 'ranch' || house === 'lindon';
}

/** Trip reasons from the published guide. A valley house does not offer the river. */
export function preferenceWhy(house: string | null | undefined): string[] {
  const lines = ['Family / reunion', 'Recreation / getaway', 'Skiing or snowboarding', 'Hiking', 'A celebration'];
  if (house === 'river') lines.splice(3, 0, 'The river');
  return lines;
}

function publishedGuideText(house: HouseId): string {
  const guide = houseStay(house);
  return [
    guide.arrival,
    guide.parking,
    ...guide.notes.map((note) => `${note.title} ${note.body}`),
    ...guide.checkout,
    ...guide.nearby.map((place) => `${place.name} ${place.note}`),
  ].join(' ');
}

/** Amenities the published guide names. A missing hot tub, sauna, or fire pit stays off the list. */
export function preferenceAmenities(house: string | null | undefined): string[] {
  if (!isHouse(house)) return ['Fireplace'];
  const text = publishedGuideText(house);
  const lines: string[] = [];
  if (house === 'river' && /\briver\b/i.test(text)) lines.push('The river');
  if (/hot tub/i.test(text)) lines.push('Hot tub');
  if (/fireplace/i.test(text)) lines.push('Fireplace');
  if (/sundance/i.test(text)) lines.push('Sundance');
  if (/garage/i.test(text)) lines.push('Garage / winter parking');
  return lines.filter((line) => !/sauna|fire pit/i.test(line));
}

/** Evening choices from the published guide. */
export function preferenceEvenings(house: string | null | undefined): string[] {
  const lines: string[] = [];
  if (house === 'ranch') lines.push('Hot tub');
  if (house === 'river') lines.push('The river');
  if (!isHouse(house) || /fireplace/i.test(houseStay(house).checkout.join(' '))) lines.push('Fireplace');
  return lines;
}

/** Activities from the published guide. The River House does not offer a hot tub night. */
export function preferenceActivities(house: string | null | undefined): string[] {
  const lines = ['Skiing', 'Hiking'];
  if (house === 'river') lines.unshift('River / paddle boarding');
  return lines;
}

function cleanCardValue(value: string | undefined): string {
  const text = value?.trim() ?? '';
  if (!text || text.includes('$') || /door\s*code|wi-?fi|password|sauna|fire pit|\bdogs?\b/i.test(text)) return '';
  if (/\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/.test(text)) return '';
  return text;
}

/** Lines from this stay’s preference card. Pets, a sauna, a fire pit, and phone numbers stay off. */
export function preferenceCardLines(house: string | null | undefined, answers: PreferenceCardInput | null | undefined): string[] {
  if (!answers) return [];
  const lines: string[] = [];
  const push = (label: string, value: string) => {
    const text = cleanCardValue(value);
    if (text) lines.push(`${label}: ${text}`);
  };
  const why = (answers.tripWhy ?? []).filter((item) => preferenceWhy(house).includes(item));
  if (why.length) push('Why', why.join(', '));
  const allowed = new Set(preferenceAmenities(house));
  const amenities = [...new Set([...(answers.topAmenities ?? []), ...(answers.amenities ?? [])])].filter((item) => allowed.has(item));
  if (amenities.length) push('For this stay', amenities.join(', '));
  if (answers.evenings && preferenceEvenings(house).includes(answers.evenings)) push('Evenings', answers.evenings);
  const arrival = guestArrivalLine(answers.arrivalWindow);
  if (arrival) push('Arrival', arrival.replace(/\.$/, ''));
  const leave = guestDepartureLine(answers.earlyLate);
  if (leave) push('Checkout', leave.replace(/\.$/, ''));
  push('Celebrating', answers.celebration ?? '');
  push('Allergies', answers.allergies ?? '');
  push('Coffee', [answers.coffeeStyle, answers.coffeeMilk].filter((part) => part && part.trim()).join(', '));
  push('Extra pillows', answers.extraPillows ?? '');
  push('Kids sleep', answers.kidsSleep ?? '');
  return lines;
}

/** The stay phone names the card. Nothing is sent. */
export function preferenceCardNote(count: number): string {
  const line =
    count > 0
      ? 'This phone shows the preference card for this stay. Nothing is sent.'
      : 'This stay has no preference card yet. Nothing is sent.';
  if (line.includes('$') || /door\s*code|wi-?fi|password/i.test(line)) return 'Nothing is sent.';
  return line;
}

/**
 * What the phone says about pets.
 *
 * No house currently publishes a pet rule, so the old line said "The published guide does not name a
 * pet rule" — true, but useless to a guest deciding whether to bring a dog, and it reads as a gap in the
 * product. The honest and useful answer is that pets are not covered by the guide and the guest should
 * ask before booking. It invents no policy; it points at a person.
 */
export function preferencePetLine(): string {
  const line =
    'Pets are not covered in the published guide. Ask us before you book and we will tell you what this house allows. Nothing is sent.';
  if (line.includes('$') || /door\s*code|wi-?fi|password/i.test(line)) return 'Nothing is sent.';
  return line;
}
