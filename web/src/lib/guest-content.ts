/**
 * Guest reviews, the FAQ, and the cancellation line.
 *
 * Three rules, all of them the same rule: **nothing here is invented.**
 *
 *   1. **Reviews are a curated list the owner approves.** A fabricated testimonial is a lie told to a guest who is about to pay,
 *      and it is illegal under the FTC's rule on fake reviews. A house with no approved review shows no review block — which is
 *      the honest state for a house that has not hosted anyone yet (the River House opens in December).
 *   2. **The FAQ answers what the house actually does.** Each answer is derived from the published guide, the booking rules, and
 *      the owner's own policies, not from what a competitor's FAQ says.
 *   3. **The cancellation policy is the owner's to set, and is not guessed.** Until he gives the terms, the page says the terms
 *      are arranged when the request is confirmed and links to a person. It does not invent a refund window, because a guest
 *      relying on an invented 30-day policy and being refused is worse than being told to ask.
 */

import type { HouseId } from './market/types';
import { houseStay } from './house-stay';
import { houseRules } from './house-rules';

export type Review = {
  /** A first name and last initial, as the guest agreed to be shown. */
  who: string;
  house: HouseId;
  /** The month and year of the stay. Never a full date, which would identify the booking. */
  when: string;
  /** 1 to 5. A review without a rating is still a review. */
  rating?: number;
  text: string;
  /** Where it came from, so a reader can weigh it: Airbnb, VRBO, Google, or direct. */
  source: 'Airbnb' | 'VRBO' | 'Google' | 'Direct';
};

/**
 * Approved reviews.
 *
 * **Empty on purpose.** The owner has not supplied any yet, and this file is where they go once he does — with the guest's
 * permission, which is why the shape has a `source` and a `when`. Adding a review here is the whole mechanism; the block renders
 * itself once there is one.
 */
export const APPROVED_REVIEWS: readonly Review[] = [];

/** Reviews for one house, newest first. An unknown house or an empty list returns an empty array. */
export function reviewsFor(house: HouseId): Review[] {
  return APPROVED_REVIEWS.filter((review) => review.house === house);
}

/** The line under the reviews. It names the real count rather than implying more. */
export function reviewSummary(reviews: Review[]): string {
  if (reviews.length === 0) return '';
  const rated = reviews.filter((review) => typeof review.rating === 'number');
  const average = rated.length > 0 ? rated.reduce((sum, review) => sum + (review.rating ?? 0), 0) / rated.length : null;
  const count = `${reviews.length} guest ${reviews.length === 1 ? 'review' : 'reviews'}`;
  return average === null ? count : `${average.toFixed(1)} from ${count}`;
}

export type FaqRow = { question: string; answer: string };

/**
 * What a guest asks before booking, answered from this house's published facts.
 *
 * Every answer reads something real: the stay facts, the house rules, or the booking terms. A question whose answer this app
 * cannot know is not asked here.
 */
export function houseFaq(house: HouseId): FaqRow[] {
  const stay = houseStay(house);
  const rules = houseRules(house).map((rule) => rule.text);
  const rows: FaqRow[] = [];

  rows.push({
    question: 'What time is check-in and check-out?',
    answer: `Check-in is ${stay.checkIn} and check-out is ${stay.checkOut}. ${stay.arrival}`.trim(),
  });

  rows.push({
    question: 'How many people does the house sleep?',
    answer: `${stay.sleeps} guests${stay.bedrooms ? `, in ${stay.bedrooms.replace(/\.\s*$/, '')}` : ''}. ${stay.parking}`.trim(),
  });

  const pets = rules.find((rule) => /pet|dog/i.test(rule));
  if (pets) rows.push({ question: 'Are pets allowed?', answer: pets });

  /*
   * The quiet-hours answer comes from the rule, trimmed to the topic.
   *
   * The single `stay` rule carries quiet hours, parties, and smoking in one paragraph, so pointing four different
   * questions at `rules.find(...)` returned the same paragraph four times — a guest opening "Is there a quiet time?"
   * and "Is smoking allowed?" read identical answers. Each answer now quotes every sentence of that rule that mentions
   * its topic, which keeps the useful detail ("No parties. Stay within the booked guest count.") without repeating the
   * unrelated clauses.
   */
  const sentencesAbout = (pattern: RegExp) => {
    for (const rule of rules) {
      const parts = rule.split(/(?<=\.)\s+/).map((part) => part.trim()).filter(Boolean);
      if (!parts.some((part) => pattern.test(part))) continue;
      // The opening sentence of the rule is the house's standing policy, so it travels with any topic taken from it.
      const keep = parts.filter((part, index) => index === 0 || pattern.test(part));
      return keep.join(' ');
    }
    return '';
  };
  const quiet = sentencesAbout(/quiet hours/i);
  if (quiet) rows.push({ question: 'Is there a quiet time?', answer: quiet });

  const smoking = sentencesAbout(/smok|vap/i);
  if (smoking) rows.push({ question: 'Is smoking allowed?', answer: smoking });

  const events = sentencesAbout(/part(y|ies)|events?|gather/i);
  if (events) rows.push({ question: 'Can we host a gathering?', answer: events });

  rows.push({
    question: 'How do I book, and when do I pay?',
    answer:
      'Send the dates as a request. It holds them for 30 minutes while we reply, and nothing is charged when you send it. Payment and the deposit are arranged directly with the owners once the dates are confirmed.',
  });

  rows.push({
    question: 'What is the cancellation policy?',
    answer: CANCELLATION_ANSWER,
  });

  return rows;
}

/**
 * The cancellation line, until the owner supplies terms.
 *
 * The wording is deliberately a promise this house can keep: the terms are confirmed in writing with the booking, by a person.
 * An invented window would be a policy the owner never agreed to.
 */
export const CANCELLATION_ANSWER =
  'The cancellation terms are confirmed in writing with your booking before anything is due. Nothing is charged when you send a request.';

/** A short line for a booking page, where a full FAQ would be too much. */
export const CANCELLATION_LINE = `Cancellation: ${CANCELLATION_ANSWER}`;
