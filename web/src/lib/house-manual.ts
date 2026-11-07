import { partyDeskAnswer } from './house-search';
import { PROPERTIES } from './api';
import { RIVER_FIRST_STAY } from './brand';
import { eventHoldLine, houseRules, petRuleLine, quietHoursSentence } from './house-rules';
import { agreementTopicLine, visitorLine, visitorQuestion } from './stay-agreement';
import { accessLine, houseCheckout, houseStay, STAY_EMERGENCY } from './house-stay';
import { checkoutNightIsFree, nightBeforeIsFree } from './journey';
import { addDays, denverToday } from './market/dates';
import { nightAsk } from './market/rates';
import { quoteStay } from './quote';
import { quietNowAnswer } from './stay-rhythm';
import type { HouseId } from './market/types';

export type ManualHit = {
  house: HouseId;
  title: string;
  text: string;
};

const HOUSES: HouseId[] = ['river', 'ranch', 'lindon'];
const SECRET = /door\s*code|wi-?fi|password/i;
const STOP = new Set([
  'a', 'an', 'the', 'at', 'to', 'for', 'of', 'in', 'on', 'and', 'or', 'is', 'are', 'can', 'we', 'i',
  'do', 'does', 'where', 'what', 'how', 'you', 'your', 'our', 'me', 'please', 'about', 'from', 'with',
  'this', 'that', 'there', 'here', 'near', 'nearby', 'us', 'my', 'get', 'go', 'going', 'be', 'it',
  'its', 'who', 'when', 'which', 'should', 'would', 'could', 'work', 'have', 'has', 'use', 'using',
  'need', 'want',
]);

/** Published lines a guest can search. Door codes, Wi-Fi, and prices stay off. */
export function houseManual(house: HouseId): ManualHit[] {
  const stay = houseStay(house);
  const rows: ManualHit[] = [
    { house, title: 'Address', text: PROPERTIES[house]?.address ?? '' },
    { house, title: 'Arrival', text: stay.arrival },
    { house, title: 'Check-in', text: `Check-in time is ${stay.checkIn}.` },
    { house, title: 'Checkout', text: `Checkout time is ${stay.checkOut}.` },
    { house, title: 'Parking', text: stay.parking },
    ...stay.checkout.map((step) => ({ house, title: 'Before you leave', text: step })),
    { house, title: 'If something is wrong', text: stay.emergency },
  ];
  if (stay.bedrooms) rows.push({ house, title: 'Bedrooms', text: stay.bedrooms });
  for (const note of stay.notes) rows.push({ house, title: note.title, text: note.body });
  for (const rule of houseRules(house)) rows.push({ house, title: 'House rules', text: rule.text });
  for (const place of stay.nearby) {
    const text = [place.area, place.note].filter((part) => part && part.length > 0).join('. ');
    rows.push({ house, title: place.name, text });
  }
  return rows.filter((row) => {
    const line = `${row.title} ${row.text}`;
    return row.text.trim().length > 0 && !SECRET.test(line) && !line.includes('$');
  });
}

/** A guest asking where the house is. Parking and the hot tub stay on their own lines. */
export function asksHousePlace(query: string): boolean {
  const q = query.toLowerCase();
  if (/\b(park|parking|driveway|tub|septic|ski|grocery|groceries)\b/.test(q)) return false;
  return (
    /\bwhere (?:is|are) (?:the |this |our )?(?:house|place)\b/.test(q) ||
    /\bwhere are we\b/.test(q) ||
    /\bwhere (?:is|are) we staying\b/.test(q)
  );
}

/** Directions use the published address and arrival note. Parking and the hot tub stay on their own lines. */
export function guideDirectionHits(query: string, house: HouseId): ManualHit[] {
  const q = query.toLowerCase();
  if (/\b(park|parking|driveway|tub|septic|ski|grocery|groceries)\b/.test(q)) return [];
  const asks =
    /\b(direction|directions|navigate)\b/.test(q) ||
    /\bget (there|here)\b/.test(q) ||
    /\bhow (?:do|can|to) (?:i|we) get\b/.test(q) ||
    asksHousePlace(q);
  if (!asks) return [];
  const stay = houseStay(house);
  const address = PROPERTIES[house]?.address ?? '';
  const hits: ManualHit[] = [];
  if (address.trim() && !address.includes('$') && !SECRET.test(address)) {
    hits.push({ house, title: 'Address', text: address.trim() });
  }
  if (stay.arrival.trim() && !stay.arrival.includes('$') && !SECRET.test(stay.arrival)) {
    hits.push({ house, title: 'Arrival', text: stay.arrival.trim() });
  }
  return hits;
}

function words(query: string): string[] {
  return query
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length >= 3 && !STOP.has(word));
}

function namedGuestCount(query: string): string | undefined {
  const q = query.toLowerCase();
  return (
    q.match(/\b(\d{1,2})\s+(?:people|person|guests|guest)\b/)?.[1] ??
    q.match(/\b(?:people|person|guests|guest|sleeps)\s+(\d{1,2})\b/)?.[1]
  );
}

/** A pet question does not invent a rule. A numbered party uses the sleep count. Other misses stay empty. */
export function manualGapLine(query: string, house?: HouseId): string | null {
  const q = query.toLowerCase();
  const count = namedGuestCount(q);
  if (/\b(child|children|kids|kid)\b/.test(q)) {
    const kids =
      q.match(/\b(\d{1,2})\s+(?:children|child|kids|kid)\b/)?.[1] ??
      q.match(/\b(?:children|child|kids|kid)\s+(\d{1,2})\b/)?.[1];
    const fit = count ? partyDeskAnswer(house ? [house] : HOUSES, count) : '';
    const onlyChildren = Boolean(kids && count && Number(kids) >= Number(count));
    const rule = onlyChildren
      ? 'A stay needs an adult. Children count toward the overnight guests.'
      : 'Children count toward the overnight guests. A stay needs an adult.';
    const text = `${fit ? `${fit} ` : ''}${rule} Nothing is sent.`;
    if (text.includes('$') || SECRET.test(text) || /\bis open\b/.test(text)) return `${rule} Nothing is sent.`;
    return text;
  }
  if (count) {
    const line = partyDeskAnswer(house ? [house] : HOUSES, count);
    if (line && !line.includes('$') && !SECRET.test(line)) return `${line} Nothing is sent.`;
  }
  if (/\b(pet|pets|dog|dogs|cat|cats|animal|animals)\b/.test(q)) {
    const line = `${petRuleLine('page')} Nothing is sent.`;
    if (line.includes('$') || /door\s*code|wi-?fi|password/i.test(line)) return null;
    return line;
  }
  if (/\b(insure|insurance|belongings|valuables)\b/.test(q)) return agreementTopicLine('belongings') || null;
  if (/\b(as-is|as is|broken amenity|cancel)\b/.test(q)) return agreementTopicLine('asis') || null;
  if (/\b(firework|fireworks|lifeguard)\b/.test(q)) return agreementTopicLine('safety') || null;
  if (/\b(lease|tenant|tenancy)\b/.test(q)) return agreementTopicLine('license') || null;
  return null;
}

export type StayGuideLookup = {
  kind: 'blank' | 'secret' | 'gap' | 'empty' | 'hits';
  text: string;
  hits: ManualHit[];
  more: number;
};

export type ThisStay = { checkIn: string; checkOut: string };

const STAY_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The stay phone already has this stay. Naming those dates does not start a new quote. */
function thisStayLine(query: string, stay: ThisStay | undefined): string | null {
  if (!stay || !STAY_DAY.test(stay.checkIn) || !STAY_DAY.test(stay.checkOut) || stay.checkOut <= stay.checkIn) return null;
  const q = query.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  if (
    /\b(park|parking|swim|tub|towel|trash|dish|smok|vape|grocery|groceries|hike|ski|eat|dinner|meal|address|where|length|lengths|how long|how many nights|early|late|later|arrive|arrival|leave|checkout|january|february|march|april|may|june|july|august|september|october|november|december)\b/.test(
      q,
    )
  ) {
    return null;
  }
  if (!/\b(these|those|this) (dates|nights|stay)\b/.test(q)) return null;
  const line = `This stay checks in on ${stayDay(stay.checkIn)} and checks out on ${stayDay(stay.checkOut)}. Nothing is sent.`;
  if (line.includes('$') || /\bis open\b/.test(line) || /door\s*code|wi-?fi|password/i.test(line)) return 'Nothing is sent.';
  return line;
}

function stayDay(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(Date.UTC(year!, month! - 1, day)).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

const CLOCK_LINE = new Set(['Check-in', 'Checkout', 'Arrival']);

/** A parking question stays on the parking line. Park City stays on a Park City question. */
export function keepParkingLines(
  query: string,
  found: { hits: ManualHit[]; more: number },
): { hits: ManualHit[]; more: number } {
  const q = query.toLowerCase();
  if (/\bpark city\b/.test(q)) return found;
  if (!/\b(park|parking|driveway)\b/.test(q)) return found;
  return { hits: found.hits.filter((hit) => hit.title === 'Parking'), more: 0 };
}

const HOUSE_NAME: Record<HouseId, string> = {
  river: 'The River House',
  ranch: 'The Ranch House',
  lindon: 'The Lindon House',
};

function cleanFact(line: string): string | null {
  const text = line.trim();
  if (!text || text.includes('$') || SECRET.test(text) || /\bis open\b/i.test(text)) return null;
  return text;
}

/** A bedroom question uses the published line. A house that does not publish a count says so. */
export function bedroomFact(query: string, house: HouseId): string | null {
  if (!/\b(bedroom|bedrooms|king suite|king suites)\b/i.test(query)) return null;
  const bedrooms = houseStay(house).bedrooms?.trim() ?? '';
  const line = bedrooms
    ? `${HOUSE_NAME[house]}: ${bedrooms}`
    : `The published guide does not list a bedroom count for ${HOUSE_NAME[house]}.`;
  return cleanFact(line);
}

/** The arrival note when it names the airport. Other houses do not get a drive time. */
export function airportSentence(house: HouseId): string {
  const arrival = houseStay(house).arrival.trim();
  if (/\bairport\b/i.test(arrival)) return cleanFact(arrival) ?? 'The published guide does not name the airport for this house.';
  return 'The published guide does not name the airport for this house.';
}

function airportFact(query: string, house: HouseId): string | null {
  if (!/\bairport\b/i.test(query)) return null;
  return cleanFact(airportSentence(house));
}

const CHECKOUT_TOPICS: ReadonlyArray<{ ask: RegExp; step: RegExp }> = [
  { ask: /\btrash\b/i, step: /\btrash\b/i },
  { ask: /\btowels?\b/i, step: /\btowels?\b/i },
  { ask: /\bdishwashers?\b/i, step: /\bdishwasher\b/i },
  { ask: /\bfireplace\b/i, step: /\bfireplace\b/i },
];

/** A checkout question uses that published step. Extra words stay out of the match. */
export function checkoutStepHits(query: string, house: HouseId): ManualHit[] {
  const hits: ManualHit[] = [];
  for (const topic of CHECKOUT_TOPICS) {
    if (!topic.ask.test(query)) continue;
    const step = houseCheckout(house).find((line) => topic.step.test(line));
    const text = step ? cleanFact(step) : null;
    if (text) hits.push({ house, title: 'Before you leave', text });
  }
  return hits;
}

/** A parking question uses the published parking line. Park City stays on a Park City question. */
function parkingFact(query: string, house: HouseId): string | null {
  const q = query.toLowerCase();
  if (/\bpark city\b/.test(q)) return null;
  if (!/\b(park|parking|driveway)\b/.test(q)) return null;
  return cleanFact(houseStay(house).parking);
}

/** A party question uses the published hold. A numbered guest count stays on the fit line. */
function partyFact(query: string, house: HouseId): string | null {
  const q = query.toLowerCase();
  if (namedGuestCount(q)) return null;
  if (!(/\b(have|host|throw|hold) (a |an )?(party|parties|event|events)\b/.test(q) || /\bparties\b/.test(q))) return null;
  return cleanFact(eventHoldLine(house));
}

/** A sleep-count question with no guest number uses the published count. */
function sleepFact(query: string, house: HouseId): string | null {
  const q = query.toLowerCase();
  if (namedGuestCount(q) || /\b(child|children|kids|kid)\b/.test(q)) return null;
  const capacity =
    (/\bhow many\b/.test(q) && /\b(sleep|sleeps|people|guests)\b/.test(q)) ||
    (/\b(sleep|sleeps)\b/.test(q) && /\b(many|capacity)\b/.test(q));
  if (!capacity) return null;
  return cleanFact(`${HOUSE_NAME[house]} sleeps ${houseStay(house).sleeps}.`);
}

/** A septic question uses the published note. A house without one says so. */
function septicFact(query: string, house: HouseId): string | null {
  if (!/\bseptic\b/i.test(query)) return null;
  const rule = houseRules(house).find((item) => item.id === 'septic')?.text?.trim() ?? '';
  const line = rule ? `${HOUSE_NAME[house]}: ${rule}` : `${HOUSE_NAME[house]} does not list a septic note.`;
  return cleanFact(line);
}

function riverFirstStaySentence(): string {
  const [year, month, day] = RIVER_FIRST_STAY.split('-').map(Number);
  const label = new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return `The River House takes its first stays on ${label}.`;
}

/** A first-stay question uses the River date. Other houses do not gain one. */
function firstStayFact(query: string, house: HouseId): string | null {
  if (!/\bfirst stays?\b/i.test(query)) return null;
  if (house === 'river' || /\briver\b/i.test(query)) return cleanFact(riverFirstStaySentence());
  return cleanFact(`The published guide does not name a first-stay date for ${HOUSE_NAME[house]}.`);
}

/** The published quiet-hours sentence. A “right now” question stays on the clock. */
function quietScheduleFact(query: string, house: HouseId): string | null {
  const q = query.toLowerCase();
  if (!/\bquiet\b/.test(q)) return null;
  if (/\b(now|tonight|currently)\b/.test(q) || /\bin effect\b/.test(q)) return null;
  return cleanFact(quietHoursSentence(house));
}

/** Published facts the word search drops. A right-now quiet-hours question stays out. */
export function publishedFactHits(query: string, house: HouseId): ManualHit[] {
  const rows: ManualHit[] = [];
  const parking = parkingFact(query, house);
  if (parking) rows.push({ house, title: 'Parking', text: parking });
  rows.push(...checkoutStepHits(query, house));
  const party = partyFact(query, house);
  if (party) rows.push({ house, title: 'Party', text: party });
  const sleep = sleepFact(query, house);
  if (sleep) rows.push({ house, title: 'Sleeps', text: sleep });
  const septic = septicFact(query, house);
  if (septic) rows.push({ house, title: 'Septic', text: septic });
  const first = firstStayFact(query, house);
  if (first) rows.push({ house: house === 'river' || /\briver\b/i.test(query) ? 'river' : house, title: 'First stays', text: first });
  const beds = bedroomFact(query, house);
  if (beds) rows.push({ house, title: 'Bedrooms', text: beds });
  const airport = airportFact(query, house);
  if (airport) rows.push({ house, title: 'Airport', text: airport });
  const quiet = quietScheduleFact(query, house);
  if (quiet) rows.push({ house, title: 'Quiet hours', text: quiet });
  return rows;
}

/** Swimming stays on the house in the question. Lindon houses do not inherit the river warning. */
export function swimFacts(query: string, house: HouseId): string | null {
  const q = query.toLowerCase();
  const swimAsk = /\b(swim|swimming|life jackets?)\b/.test(q);
  const riverAsk = /\briver\b/.test(q) && (swimAsk || /\b(water|bank|cold|safe|safety)\b/.test(q) || /\bis the river\b/.test(q));
  if (!swimAsk && !riverAsk) return null;
  if (house !== 'river') {
    const line = swimAsk
      ? `${HOUSE_NAME[house]} is in Lindon. The published guide does not name a place to swim for this house.`
      : `${HOUSE_NAME[house]} is in Lindon. The published guide does not name the river for this house.`;
    return line.includes('$') ? null : line;
  }
  const warning = houseRules('river').find((rule) => rule.id === 'river')?.text?.trim() ?? '';
  const swim = swimAsk ? houseStay('river').nearby.find((place) => /\bswimming\b/i.test(place.note)) : undefined;
  const place = swim ? `${swim.name}: ${swim.note}` : '';
  const line = [warning, place].filter((part) => part.length > 0).join(' ');
  if (!line || line.includes('$') || SECRET.test(line)) return null;
  return line;
}

/** A fire, medical, or danger question stays on the emergency line. A fireplace question stays on its own line. */
export function emergencyLine(query: string): string | null {
  const q = query.toLowerCase();
  if (/\bfireplace\b/.test(q) || /\bfireworks?\b/.test(q)) return null;
  if (!/\b(fire|911|emergency|danger|medical)\b/.test(q)) return null;
  const line = `${STAY_EMERGENCY} Nothing is sent.`;
  if (line.includes('$') || /door\s*code|wi-?fi|password/i.test(line)) return 'Nothing is sent.';
  return line;
}

/** The published hot-tub rule, or the line that this house does not list one. */
export function hotTubLine(query: string, house: HouseId): string | null {
  if (!/\b(hot tub|hottub)\b/i.test(query)) return null;
  const rule = houseRules(house).find((row) => row.id === 'tub')?.text?.trim() ?? '';
  const line = rule ? `${HOUSE_NAME[house]}: ${rule}` : `${HOUSE_NAME[house]} does not list a hot tub.`;
  if (line.includes('$') || SECRET.test(line)) return null;
  return line;
}

/** The published no-smoking sentence. Extra words such as “allowed” stay off the search. */
export function smokingRuleLine(query: string, house: HouseId): string | null {
  if (!/\b(smok(?:e|ing|es|ed)|cigarette|cigarettes)\b/i.test(query)) return null;
  const sentences = houseRules(house)
    .flatMap((rule) => rule.text.split(/(?<=\.)\s+/))
    .map((sentence) => sentence.trim())
    .filter((sentence) => /\bsmok/i.test(sentence) && !sentence.includes('$') && !SECRET.test(sentence));
  if (sentences.length === 0) return null;
  return sentences.join(' ');
}

/** A check-in or checkout question stays on those lines. Other “check” sentences stay off. */
export function keepClockLines(
  query: string,
  found: { hits: ManualHit[]; more: number },
): { hits: ManualHit[]; more: number } {
  if (!clockKind(query)) return found;
  return { hits: found.hits.filter((hit) => CLOCK_LINE.has(hit.title)), more: 0 };
}

function clockKind(query: string): 'in' | 'out' | 'both' | null {
  const q = query.toLowerCase();
  if (/\bbefore\b/.test(q) && /\bleave\b/.test(q)) return null;
  if (/\b(my|our|this)\s+stay\b|\b(my|our)\s+dates\b/.test(q)) return 'both';
  const inn = /\b(arriv\w*|check-?in)\b/.test(q);
  const out = /\b(leav\w*|depart\w*|check-?out)\b/.test(q);
  if (inn && out) return 'both';
  if (inn) return 'in';
  if (out) return 'out';
  return null;
}

/** Arrive and leave questions name the published time. This stay’s date is added only when the phone knows it. */
export function guideClockHits(query: string, house: HouseId, stay?: ThisStay, already: readonly ManualHit[] = []): ManualHit[] {
  const kind = clockKind(query);
  if (!kind) return [];
  const times = houseStay(house);
  const dated = Boolean(stay && STAY_DAY.test(stay.checkIn) && STAY_DAY.test(stay.checkOut));
  const arriveOn = dated && stay ? `This stay checks in on ${stayDay(stay.checkIn)}. ` : '';
  const leaveOn = dated && stay ? `This stay checks out on ${stayDay(stay.checkOut)}. ` : '';
  const rows: ManualHit[] = [];
  const has = (title: string) => already.some((hit) => hit.title === title) || rows.some((hit) => hit.title === title);
  if ((kind === 'in' || kind === 'both') && !has('Check-in')) {
    rows.push({ house, title: 'Check-in', text: `${arriveOn}Check-in time is ${times.checkIn}.` });
  }
  if ((kind === 'out' || kind === 'both') && !has('Checkout')) {
    rows.push({ house, title: 'Checkout', text: `${leaveOn}Checkout time is ${times.checkOut}.` });
  }
  if (/\barriv\w*\b/.test(query.toLowerCase()) && !has('Arrival')) {
    const arrival = houseManual(house).find((row) => row.title === 'Arrival');
    if (arrival) rows.push(arrival);
  }
  return rows.filter((row) => row.text.trim().length > 0 && !row.text.includes('$') && !SECRET.test(`${row.title} ${row.text}`));
}

/** Check-in and checkout hits name this stay’s dates. Other guests stay off the line. */
export function dateThisStay(hits: readonly ManualHit[], stay?: ThisStay): ManualHit[] {
  return withThisStay([...hits], stay);
}

function withThisStay(hits: ManualHit[], stay?: ThisStay): ManualHit[] {
  if (!stay || !STAY_DAY.test(stay.checkIn) || !STAY_DAY.test(stay.checkOut)) return hits;
  const arrive = stayDay(stay.checkIn);
  const leave = stayDay(stay.checkOut);
  return hits.map((hit) => {
    if (hit.title === 'Check-in') return { ...hit, text: `This stay checks in on ${arrive}. ${hit.text}` };
    if (hit.title === 'Checkout') return { ...hit, text: `This stay checks out on ${leave}. ${hit.text}` };
    return hit;
  });
}

export type FlexCalendar = {
  taken: Partial<Record<HouseId, readonly string[]>>;
  closed?: Partial<Record<HouseId, readonly string[]>>;
};

function asksOneOclock(query: string): boolean {
  return /\b(?:at|by|around)\s+1(?::00)?(?![:\d])(?!\s*nights)\b/.test(query);
}

function asksTwoOclock(query: string): boolean {
  return /\b(?:at|by|around)\s+2(?::00)?(?![:\d])(?!\s*nights)\b/.test(query);
}

export function asksEarly(query: string): boolean {
  return (
    /\bearly arrival\b/.test(query) ||
    /\barrive early\b/.test(query) ||
    /\bcome early\b/.test(query) ||
    /\bcheck-?in early\b/.test(query) ||
    (/\bearly\b/.test(query) && /\b(arriv\w*|check-?in|come)\b/.test(query)) ||
    (/\b1(?::00)?\s*pm\b/.test(query) && /\b(arriv\w*|check-?in|early)\b/.test(query)) ||
    (/\b(?:arriv\w*|come|check[\s-]?in)\b/.test(query) && asksOneOclock(query))
  );
}

export function asksLate(query: string): boolean {
  return (
    /\blate checkout\b/.test(query) ||
    /\bcheck-? ?out late\b/.test(query) ||
    (/\b(late|later)\b/.test(query) && /\b(leav\w*|depart\w*|check-?out)\b/.test(query)) ||
    (/\b2(?::00)?\s*pm\b/.test(query) && /\b(leav\w*|depart\w*|check-?out|late)\b/.test(query)) ||
    (/\b(?:leav\w*|depart\w*|check[\s-]?out)\b/.test(query) && asksTwoOclock(query))
  );
}

function flexDates(stay?: ThisStay): ThisStay | null {
  if (!stay || !STAY_DAY.test(stay.checkIn) || !STAY_DAY.test(stay.checkOut) || stay.checkOut <= stay.checkIn) return null;
  return stay;
}

/** Winter driving from the published River lines. Other houses do not invent a rule. */
export function winterDriveLine(query: string, house?: HouseId): string | null {
  const q = query.toLowerCase();
  if (!/\b(4wd|awd|4x4|snow|winter|plow|plows|four[- ]wheel)\b/.test(q)) return null;
  if (/\b(ski|skiing)\b/.test(q)) return null;
  const river = houseStay('river');
  const published = `${river.arrival} ${river.parking}`;
  const none = 'The published guide does not name a winter driving rule for this house.';
  let line = '';
  if (house === 'ranch' || house === 'lindon') line = `${none} Nothing is sent.`;
  else if (house === 'river') line = `${published} Nothing is sent.`;
  else line = `${published} The Ranch House and the Lindon House guides do not name a winter driving rule. Nothing is sent.`;
  if (line.includes('$') || /\bis open\b/i.test(line) || /password/i.test(line)) return 'Nothing is sent.';
  return line;
}

/** An early arrival or a later checkout for the dates on the page. No price. Nothing is sent. */
export function flexStayLine(
  query: string,
  house: HouseId,
  stay?: ThisStay,
  calendar?: FlexCalendar | null,
  asOf = denverToday(),
): string | null {
  const q = query.toLowerCase();
  const early = asksEarly(q);
  const late = asksLate(q);
  if (!early && !late) return null;
  const dates = flexDates(stay);
  if (dates && calendar) {
    const held = quotedStayHold(house, dates, calendar, asOf);
    if (held) return held;
  }
  const parts: string[] = [];
  if (early) parts.push(earlyFlex(house, dates, calendar, asOf));
  if (late) parts.push(lateFlex(house, dates, calendar, asOf));
  const line = `${parts.join(' ')} Nothing is sent.`;
  if (line.includes('$') || /password/i.test(line)) return 'Nothing is sent.';
  return line;
}

/** An early or late answer stays off when these dates cannot be quoted. */
function quotedStayHold(house: HouseId, stay: ThisStay, calendar: FlexCalendar, asOf: string): string | null {
  const quote = quoteStay(house, stay.checkIn, stay.checkOut, calendar.taken[house] ?? [], {
    asOf,
    closed: calendar.closed?.[house] ?? [],
    pace: 'unknown',
  });
  if (quote.ok) return null;
  const reason = quote.reason ?? 'This stay is not quoted.';
  if (reason.includes('$') || /password/i.test(reason) || /\bis open\b/i.test(reason)) {
    return 'This stay is not quoted. Nothing is sent.';
  }
  return `${reason} Nothing is sent.`;
}

function earlyFlex(house: HouseId, stay: ThisStay | null, calendar: FlexCalendar | null | undefined, asOf: string): string {
  const time = `Check-in time is ${houseStay(house).checkIn}.`;
  if (stay && asOf >= stay.checkIn) return `${time} This stay has already started.`;
  if (!stay) return `${time} Arrive at 1:00 PM is a request. The night before has to be clear on the calendar. Nothing is charged yet.`;
  if (nightAsk(house, addDays(stay.checkIn, -1)).closed) return 'An early arrival is not open for this stay.';
  if (!calendar) return `${time} Arrive at 1:00 PM is a request. It waits until the calendar can be read. Nothing is charged yet.`;
  const taken = calendar.taken[house] ?? [];
  const closed = calendar.closed?.[house] ?? [];
  if (!nightBeforeIsFree(stay.checkIn, taken, closed)) return 'An early arrival is not open for this stay.';
  return 'Arrive at 1:00 PM is a request. Nothing is charged yet. The door code still opens the day before.';
}

function lateFlex(house: HouseId, stay: ThisStay | null, calendar: FlexCalendar | null | undefined, asOf: string): string {
  const time = `Checkout time is ${houseStay(house).checkOut}.`;
  if (stay && asOf >= stay.checkOut) return `${time} This stay has checked out.`;
  if (!stay) return `${time} Leave at 2:00 PM is a request. That morning has to be clear on the calendar. Nothing is charged yet.`;
  if (nightAsk(house, stay.checkOut).closed) return 'A 2:00 PM leave is not open for this checkout.';
  if (!calendar) return `${time} Leave at 2:00 PM is a request. It waits until the calendar can be read. Nothing is charged yet.`;
  const taken = calendar.taken[house] ?? [];
  const closed = calendar.closed?.[house] ?? [];
  if (!checkoutNightIsFree(stay.checkOut, taken, closed)) return 'A 2:00 PM leave is not open for this checkout.';
  return 'Leave at 2:00 PM is a request. Nothing is charged yet. A same-day arrival still starts at 4:00 PM.';
}

/** A public page keeps the request and leaves the door-code timing off. The stay phone keeps its own line. */
export function publicFlexLine(line: string | null): string | null {
  if (!line) return null;
  const text = line.replace(/The door code still opens the day before\. ?/gi, '').replace(/\s+/g, ' ').trim();
  if (/door\s*code|wi-?fi|password/i.test(text)) return null;
  return text;
}

const FOOD_ASK = /\b(eat|eats|eating|food|restaurant|restaurants|dinner|lunch|breakfast|brunch|hungry)\b/i;
const SKI_ASK = /\b(ski|skiing)\b/i;
const GROCERY_ASK = /\bgrocer(?:y|ies)\b/i;

function nearbyPlaceHits(house: HouseId, places: readonly { name: string; area?: string; note: string }[]): ManualHit[] {
  return places
    .map((place) => ({
      house,
      title: place.name,
      text: [place.area, place.note].filter((part) => part && part.length > 0).join('. '),
    }))
    .filter((hit) => hit.text.trim().length > 0 && !hit.text.includes('$') && !SECRET.test(`${hit.title} ${hit.text}`));
}

/** The same published line is listed once. */
export function uniqueGuideHits(hits: readonly ManualHit[]): ManualHit[] {
  const seen = new Set<string>();
  const unique: ManualHit[] = [];
  for (const hit of hits) {
    const key = `${hit.house}|${hit.title}|${hit.text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(hit);
  }
  return unique;
}
const OUT_ASK = /\b(hike|hikes|hiking|trail|trails|waterfall|outdoors|outdoor|fishing|raft|rafting)\b/i;
const FAMILY_ASK = /\b(kids|kid|children|family)\b/i;

/** A nearby question uses the published list for that kind. A planned day stays on its own answer. */
export function guideNearbyHits(query: string, house: HouseId): ManualHit[] {
  if (guideDirectionHits(query, house).length > 0 || /\bplan\b/i.test(query)) return [];
  if (GROCERY_ASK.test(query)) {
    const places = houseStay(house).nearby.filter(
      (place) => place.kind === 'essentials' && /grocer/i.test(`${place.name} ${place.note}`),
    );
    const hits = nearbyPlaceHits(house, places).slice(0, 6);
    if (hits.length > 0) return hits;
    return [{ house, title: 'Groceries', text: 'The published guide does not name a grocery store for this house.' }];
  }
  const where = /\b(where|should we|can we|nearby)\b/i.test(query);
  const kind = SKI_ASK.test(query) && where
    ? 'ski'
    : FOOD_ASK.test(query)
      ? 'food'
      : OUT_ASK.test(query)
        ? 'outdoors'
        : FAMILY_ASK.test(query) && where && !/\b\d{1,2}\b/.test(query)
          ? 'family'
          : null;
  if (!kind) return [];
  const places = nearbyPlaceHits(
    house,
    houseStay(house).nearby.filter((place) => place.kind === kind),
  ).slice(0, 6);
  if (kind !== 'food' || !/\bsunday\b/i.test(query)) return places;
  const sunday = houseStay(house).nearby.find(
    (place) => place.kind === 'essentials' && /sunday/i.test(`${place.name} ${place.note}`),
  );
  const text = sunday ? `${sunday.name}. ${sunday.note}`.trim() : '';
  if (!text || text.includes('$') || SECRET.test(text) || /\bis open\b/i.test(text)) return places;
  return [{ house, title: 'Sunday', text }, ...places].slice(0, 6);
}

/** When the code opens. Asking for the code itself stays off the phone. */
function asksWhenAccess(query: string): boolean {
  const q = query.toLowerCase();
  if (/\bpassword\b/.test(q)) return false;
  if (/\b(what|whats)\b/.test(q) && /\b(is|are)\b/.test(q)) return false;
  if (!/\b(when|which day)\b/.test(q) && !/\bwhat (time|day)\b/.test(q)) return false;
  return /\b(door code|code|wi-?fi|wifi)\b/.test(q);
}

/** A search on the stay phone. Other guests’ dates, door codes, and Wi-Fi stay off. Nothing is sent. */
export function stayGuideLookup(
  query: string,
  house: HouseId,
  stay?: ThisStay,
  hour?: number,
  calendar?: FlexCalendar | null,
): StayGuideLookup {
  const trimmed = query.trim();
  if (!trimmed) return { kind: 'blank', text: '', hits: [], more: 0 };
  if (asksWhenAccess(trimmed) && stay?.checkIn) {
    const line = accessLine(stay.checkIn);
    if (line && !line.includes('$') && !/code\s*\d/i.test(line)) {
      return { kind: 'gap', text: `${line} Nothing is sent.`, hits: [], more: 0 };
    }
  }
  if (/\b(wi-?fi|password|door code|code)\b/i.test(trimmed)) {
    return { kind: 'secret', text: 'The door code and Wi-Fi stay off this phone.', hits: [], more: 0 };
  }
  if (visitorQuestion(trimmed)) {
    const line = visitorLine('phone');
    if (line) return { kind: 'gap', text: `${line} Nothing is sent.`, hits: [], more: 0 };
  }
  const placed = asksHousePlace(trimmed) ? guideDirectionHits(trimmed, house) : [];
  if (placed.length > 0) return { kind: 'hits', text: '', hits: placed, more: 0 };
  const flex = flexStayLine(trimmed, house, stay, calendar);
  if (flex) return { kind: 'gap', text: flex, hits: [], more: 0 };
  const owned = thisStayLine(trimmed, stay);
  if (owned) return { kind: 'gap', text: owned, hits: [], more: 0 };
  const smoke = smokingRuleLine(trimmed, house);
  if (smoke) return { kind: 'gap', text: `${smoke} Nothing is sent.`, hits: [], more: 0 };
  const swim = swimFacts(trimmed, house);
  if (swim) return { kind: 'gap', text: `${swim} Nothing is sent.`, hits: [], more: 0 };
  const tub = hotTubLine(trimmed, house);
  if (tub) return { kind: 'gap', text: `${tub} Nothing is sent.`, hits: [], more: 0 };
  const emergency = emergencyLine(trimmed);
  if (emergency) return { kind: 'gap', text: emergency, hits: [], more: 0 };
  const facts = publishedFactHits(trimmed, house);
  if (facts.length > 0) return { kind: 'hits', text: '', hits: facts, more: 0 };
  const winter = winterDriveLine(trimmed, house);
  if (winter) return { kind: 'gap', text: winter, hits: [], more: 0 };
  const found = keepParkingLines(trimmed, keepClockLines(trimmed, searchHouseManual(trimmed, [house])));
  const nearbyFirst = guideNearbyHits(trimmed, house);
  const gap = manualGapLine(trimmed, house);
  const party = Boolean(gap && /\bsleeps \d+\b/.test(gap));
  const countedParty = party || /\b\d{1,2}\b/.test(trimmed);
  if (gap && (party || (found.hits.length === 0 && (countedParty || nearbyFirst.length === 0)))) {
    const text = gap.includes('$') || SECRET.test(gap) ? 'The published guide does not say that.' : gap;
    return { kind: 'gap', text, hits: [], more: 0 };
  }
  const guideHits = withThisStay(
    found.hits.filter((hit) => !hit.text.includes('$') && !SECRET.test(`${hit.title} ${hit.text}`)),
    stay,
  );
  const quiet = quietNowAnswer(trimmed, house, hour);
  const quietHits: ManualHit[] = quiet ? [{ house, title: 'Quiet hours', text: quiet }] : [];
  const hits = uniqueGuideHits([
    ...quietHits,
    ...guideDirectionHits(trimmed, house),
    ...nearbyFirst,
    ...guideClockHits(trimmed, house, stay, guideHits),
    ...guideHits,
  ]).slice(0, 6);
  if (hits.length === 0) return { kind: 'empty', text: 'The published guide does not say that.', hits: [], more: 0 };
  return { kind: 'hits', text: '', hits, more: found.more };
}

/** Matches from the published guide. An empty question matches nothing. */
export function searchHouseManual(query: string, houses: readonly HouseId[]): { hits: ManualHit[]; more: number } {
  const need = words(query);
  if (need.length === 0 || houses.length === 0) return { hits: [], more: 0 };
  const scope = HOUSES.filter((house) => houses.includes(house));
  const matched = scope.flatMap((house) => houseManual(house)).filter((row) => {
    const hay = `${row.title} ${row.text}`.toLowerCase();
    return need.every((word) => (word === 'washer' ? /\bwasher\b/.test(hay) : hay.includes(word)));
  });
  const ranked = [...matched].sort((a, b) => {
    const titleRank = (row: ManualHit) => (need.every((word) => row.title.toLowerCase().includes(word)) ? 0 : 1);
    return titleRank(a) - titleRank(b);
  });
  return { hits: ranked.slice(0, 6), more: Math.max(0, ranked.length - 6) };
}
