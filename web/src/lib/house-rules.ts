import type { HouseId } from './market/types';

export type HouseRule = {
  id: string;
  text: string;
};

/** Published rules from the guest guide. The booking page does not load door codes or Wi-Fi. */
const RULES: Record<HouseId, HouseRule[]> = {
  river: [
    {
      id: 'stay',
      /*
       * This said "Whole-house rental only", which stopped being true when the house became sellable in parts — and it
       * was rendering directly above the guest's own part line, so a Garage Suite guest read both. The rule now says
       * what is actually true of either booking, and the part line says which one applies.
       */
      text: 'Quiet hours 10 PM to 6 AM. No parties or events without written approval. Follow the septic and trash notes below. No smoking indoors.',
    },
    {
      id: 'septic',
      text: 'The house is on septic. Only toilet paper goes in the toilets. No wipes, even flushable ones.',
    },
    {
      id: 'pets',
      text: 'Dogs only, up to 2, under 50 lb each. No cats. A pet fee applies per stay.',
    },
    {
      id: 'river',
      text: 'The Provo River runs cold and fast, especially in spring. Watch kids near the bank and wear life jackets on the water.',
    },
  ],
  ranch: [
    {
      id: 'stay',
      text: 'Quiet hours 10 PM to 6 AM. No parties. Stay within the booked guest count. No smoking indoors.',
    },
    {
      id: 'pets',
      text: 'Dogs only, up to 2, under 50 lb each. No cats. A pet fee applies per stay.',
    },
    {
      id: 'tub',
      text: 'Keep the hot tub cover on when it is not in use. No glass in or near the tub. Kids with an adult only.',
    },
  ],
  lindon: [
    {
      id: 'stay',
      text: 'Quiet hours 10 PM to 6 AM. No smoking indoors. No parties.',
    },
    {
      id: 'pets',
      text: 'Dogs only, up to 2, under 50 lb each. No cats. A pet fee applies per stay.',
    },
  ],
};

export function houseRules(house: HouseId): HouseRule[] {
  return RULES[house];
}

function safeRule(text: string): boolean {
  const line = text.trim();
  return line.length > 0 && !line.includes('$') && !/door\s*code|wi-?fi|password/i.test(line);
}

/** Saved house rules stay when they add something. Published rules the saved text left out are added. Nothing is sent. */
export function guestRuleLines(house: HouseId, saved: string): string[] {
  const published = houseRules(house).map((rule) => rule.text.trim()).filter(safeRule);
  const custom = saved.trim();
  const lines: string[] = [];
  if (safeRule(custom) && !published.some((rule) => rule.toLowerCase().includes(custom.toLowerCase()))) {
    lines.push(custom);
  }
  for (const rule of published) {
    if (lines.some((line) => line.toLowerCase().includes(rule.toLowerCase()))) continue;
    lines.push(rule);
  }
  return lines;
}

/**
 * The quiet-hours sentence, read from the published rules.
 *
 * All three houses are 10 PM to 6 AM — the owner confirmed that on 2026-11-10. Before this, the Ranch and Lindon said 8 AM
 * and the River House named no clock at all, so a guest there was told nothing.
 */
export function quietHoursSentence(house: HouseId): string {
  const stay = houseRules(house).find((rule) => rule.id === 'stay')?.text ?? '';
  const sentence = stay.match(/Quiet hours[^.]*\./)?.[0]?.trim() ?? '';
  if (!sentence || sentence.includes('$') || /door\s*code|wi-?fi|password/i.test(sentence)) return '';
  return sentence;
}

/** The rules a request note would include. This does not send the request. */
export function rulesNote(house: HouseId): string {
  const lines = houseRules(house)
    .map((rule) => rule.text.trim())
    .filter((text) => text.length > 0 && !/door\s*code|wi-?fi|password/i.test(text));
  return lines.length > 0 ? `House rules read: ${lines.join(' ')}` : '';
}

const HOUSE: Record<HouseId, string> = {
  river: 'The River House',
  ranch: 'The Ranch House',
  lindon: 'The Lindon House',
};

/**
 * The pet rule for the host desk, where a fee may be named.
 *
 * The policy is the same at all three houses per the owner's answer on 2026-11-10: dogs only, up to two, under 50 lb each, no
 * cats. The fee is **$149** per stay — the owner corrected the $150 that appeared in an earlier spec.
 *
 * `petRule()` gives the guest-facing text, which deliberately carries no figure: every guest page is asserted to contain no
 * `$`, so a page can never quote a price.
 */
export function petRuleLine(where: 'page' | 'desk' = 'page'): string {
  if (where === 'desk') {
    return 'Pets: dogs only, up to 2, under 50 lb each. No cats. $149 per stay at every house.';
  }
  return 'Pets: dogs only, up to 2, under 50 lb each. No cats. A pet fee applies per stay.';
}

/** The published pet rule text for one house, or null when none is published. */
export function petRule(house: HouseId): string | null {
  return houseRules(house).find((rule) => rule.id === 'pets')?.text ?? null;
}

/** The pet fee, for the desk and the stay agreement. Never rendered on a guest page. */
export const PET_FEE = 149;

/** A party or event stays off the request button. Nothing is sent. */
export function eventHoldLine(house: HouseId): string {
  if (house === 'river') {
    return `${HOUSE.river} does not take a party or event without written approval. This page does not send that request.`;
  }
  return `${HOUSE[house]} does not take a party. This page does not send that request.`;
}

/** The request button stays off until the quote is valid, the party fits, the calendar was read, and the rules are read. */
export function directRequestReady(input: {
  quoteOk: boolean;
  rulesRead: boolean;
  calendarLoading: boolean;
  calendarLive: boolean;
  partyOk: boolean;
  event?: boolean;
  /** False until every stay-agreement topic for this house has been opened. */
  agreementRead?: boolean;
}): boolean {
  if (input.event) return false;
  if (input.agreementRead === false) return false;
  return input.quoteOk && input.partyOk && input.rulesRead && input.calendarLive && !input.calendarLoading;
}

/** The host line while a direct request cannot be sent. No price. */
export function requestClosedLine(): string {
  return 'A direct request stays off until the calendar can be read. The quote does not ask for a name. Nothing is sent.';
}

/** The rules checkbox. It names a request only when that request can be sent. */
export function rulesReadLine(canSend: boolean, both: boolean): string {
  const houses = both ? 'the River House and Ranch House rules' : 'the house rules';
  const sign = both ? 'either agreement' : 'the stay agreement';
  if (!canSend) return `I have read ${houses}. Reading them does not sign ${sign}. Nothing is sent.`;
  return `I have read ${houses}. This request does not sign ${sign}.`;
}

/** Times can be chosen only for a stay this page can quote. */
export function quoteTimesReady(input: {
  partyOk: boolean;
  calendar: 'loading' | 'live' | 'off';
  quoteOk: boolean;
  publishedRule: boolean;
  bothOfferOk?: boolean;
}): boolean {
  if (input.bothOfferOk) {
    if (input.calendar === 'live') return true;
    if (input.calendar === 'off') return !input.publishedRule;
    return false;
  }
  if (!input.partyOk) return false;
  if (input.calendar === 'live') return input.quoteOk;
  if (input.calendar === 'off') return !input.publishedRule;
  return false;
}

/** A blocked quote names the reason already on the page. A price or an open night falls back. */
export function quoteGateLine(reason: string | undefined, waiting: string, fallback: string): string {
  const clean = (reason ?? '')
    .replace(/\s*Nothing is sent\.?\s*$/i, '')
    .replace(/\.\s*$/, '')
    .trim();
  const line = clean ? `${clean}. ${waiting} Nothing is sent.` : fallback;
  if (line.includes('$') || /\bis open\b/.test(line) || /door\s*code|wi-?fi|password/i.test(line)) return fallback;
  return line;
}

/** Shown in place of the time buttons. A guest-count or date reason replaces the generic line. */
export function quoteTimesHold(reason?: string): string {
  const fallback = 'Arrival and departure times stay off until this page can quote the stay. Nothing is sent.';
  return quoteGateLine(reason, 'Arrival and departure times stay off until then.', fallback);
}

/** Arrival, departure, and rules copy. While the button is off, it is not mentioned. */
export function quoteActionLine(canSend: boolean, kind: 'arrival' | 'early' | 'departure' | 'rules' | 'tail'): string {
  const sent = canSend ? 'Nothing is sent until you use the button.' : 'Nothing is sent.';
  if (kind === 'tail') return sent;
  if (kind === 'arrival') {
    return canSend
      ? `Check-in is 4:00 PM. A time is included in the request. ${sent}`
      : `Check-in is 4:00 PM. A time stays on this quote. ${sent}`;
  }
  if (kind === 'early') {
    return canSend ? 'Arrive at 1:00 PM is already on this request.' : `Arrive at 1:00 PM stays on this quote. ${sent}`;
  }
  if (kind === 'departure') {
    return `Checkout is 11:00 AM. Leave at 2:00 PM is the late checkout request when that morning is open. Nothing is charged yet. ${sent}`;
  }
  return canSend ? `A request includes these rules in the note. ${sent}` : `These rules stay on this quote. ${sent}`;
}

/** Why the request button is off. Empty when the button can be used. Nothing is sent here. */
export function requestHoldLine(input: {
  calendarLoading: boolean;
  calendarLive: boolean;
  both: boolean;
  event: boolean;
  agreementRead: boolean;
  partyOk: boolean;
  partyReason: string;
  quoteOk: boolean;
  quoteReason: string | null;
  rulesRead: boolean;
  bothOfferOk?: boolean;
  bothReason?: string;
}): string {
  const send = 'Nothing is sent.';
  if (input.calendarLoading) return `Checking the calendar. ${send}`;
  if (!input.calendarLive) {
    return input.both
      ? `The calendar could not be read. The request for both houses stays off. ${send}`
      : `The calendar could not be read. The request stays off. ${send}`;
  }
  if (input.both) {
    if (!input.bothOfferOk) {
      const reason = input.bothReason && !input.bothReason.includes('$') ? input.bothReason : 'This stay is not quoted.';
      return `${reason} ${send}`;
    }
  } else {
    if (!input.partyOk) {
      const reason = input.partyReason.includes('$') ? 'This party is not quoted.' : input.partyReason;
      return `${reason} ${send}`;
    }
    if (!input.quoteOk) {
      const reason = input.quoteReason && !input.quoteReason.includes('$') ? input.quoteReason : 'This stay is not quoted.';
      return `${reason} ${send}`;
    }
  }
  if (input.event) return `This stay is a party or an event. This page does not send that request. ${send}`;
  if (!input.agreementRead) return `Open each topic before the request. Opening a topic does not sign the agreement. ${send}`;
  if (!input.rulesRead) return `Read the house rules before the request. ${send}`;
  return '';
}

/** Shown in place of the agreement topics. A guest-count or date reason replaces the generic line. */
export function quoteAgreementHold(reason?: string): string {
  const fallback = 'The stay agreement stays off until this page can quote the stay. Nothing is sent.';
  return quoteGateLine(reason, 'The stay agreement stays off until then.', fallback);
}
