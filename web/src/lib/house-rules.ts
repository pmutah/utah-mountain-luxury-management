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
      text: 'Whole-house rental only. Quiet hours in this mountain neighborhood. No parties or events without written approval. Follow the septic and trash notes below. No smoking indoors.',
    },
    {
      id: 'septic',
      text: 'The house is on septic. Only toilet paper goes in the toilets. No wipes, even flushable ones.',
    },
    {
      id: 'river',
      text: 'The Provo River runs cold and fast, especially in spring. Watch kids near the bank and wear life jackets on the water.',
    },
  ],
  ranch: [
    {
      id: 'stay',
      text: 'Quiet hours 10 PM to 8 AM. No parties. Stay within the booked guest count. No smoking indoors.',
    },
    {
      id: 'tub',
      text: 'Keep the hot tub cover on when it is not in use. No glass in or near the tub. Kids with an adult only.',
    },
  ],
  lindon: [
    {
      id: 'stay',
      text: 'Quiet hours 10 PM to 8 AM. No smoking indoors. No parties.',
    },
  ],
};

export function houseRules(house: HouseId): HouseRule[] {
  return RULES[house];
}

/** The request button stays off until the quote is valid, the party fits, the calendar check has finished, and the rules are read. */
export function directRequestReady(input: {
  quoteOk: boolean;
  rulesRead: boolean;
  calendarLoading: boolean;
  partyOk: boolean;
}): boolean {
  return input.quoteOk && input.partyOk && input.rulesRead && !input.calendarLoading;
}
