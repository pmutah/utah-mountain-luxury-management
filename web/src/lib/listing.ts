import type { HouseId } from './market/types';

/** Titles from the pricing playbook. Our booking page uses these. Airbnb and VRBO do not. */
export const LISTING_TITLE: Record<HouseId, string> = {
  river: 'Sleeps 25 · On the Provo River · 7 King Suites',
  ranch: 'Sleeps 20 · Hot Tub · Lindon',
  lindon: 'Sleeps 12 · Family Home near BYU',
};

export type Opportunity = {
  id: 'photos' | 'title' | 'weekend' | 'payment';
  status: 'open' | 'ready';
  title: string;
  detail: string;
};

/** What is still open on our own site. Nothing here posts to Airbnb, VRBO, or Hospitable. */
export function listingOpportunities(house: HouseId): Opportunity[] {
  return [
    {
      id: 'title',
      status: 'ready',
      title: LISTING_TITLE[house],
      detail: 'This title is on our booking page. It is not posted to Airbnb or VRBO.',
    },
    {
      id: 'photos',
      status: 'open',
      title: 'One photo on our booking page',
      detail:
        house === 'river'
          ? 'The direct page still uses a rendering. Finish photos come after the house is done.'
          : 'The direct page has one photo. The channel listings still live in Hospitable.',
    },
    {
      id: 'weekend',
      status: 'ready',
      title: 'A Friday or Saturday by itself waits until the last week',
      detail: 'Our booking page asks for both weekend nights unless that night is inside 7 days. Channel minimums are unchanged.',
    },
    {
      id: 'payment',
      status: 'open',
      title: 'Direct booking still emails a request',
      detail: 'The page does not charge a card or hold the dates.',
    },
  ];
}
