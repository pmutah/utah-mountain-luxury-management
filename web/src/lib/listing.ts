import type { HouseId } from './market/types';
import { addonMenuLine } from './upsells';

/** Titles from the pricing playbook. Our booking page uses these. Airbnb and VRBO do not. */
export const LISTING_TITLE: Record<HouseId, string> = {
  river: 'Sleeps 25 · On the Provo River · 7 King Suites',
  ranch: 'Sleeps 20 · Hot Tub · Lindon',
  lindon: 'Sleeps 12 · Family Home near BYU',
};

export type Opportunity = {
  id: 'photos' | 'title' | 'weekend' | 'payment' | 'addons' | 'agreement';
  status: 'open' | 'ready';
  title: string;
  detail: string;
};

const HOUSE_LABEL: Record<HouseId, string> = { river: 'River', ranch: 'Ranch', lindon: 'Lindon' };

/** Open listing facts for all three houses. No price, and nothing is posted. */
export function listingOpenLine(): string {
  const houses: HouseId[] = ['river', 'ranch', 'lindon'];
  const photos = houses.flatMap((house) => {
    const item = listingOpportunities(house).find((row) => row.id === 'photos');
    if (!item || item.status !== 'open') return [];
    return [/rendering/i.test(item.detail) ? `${HOUSE_LABEL[house]} still uses a rendering` : `${HOUSE_LABEL[house]} has one photo`];
  });
  const payment = listingOpportunities('river').find((row) => row.id === 'payment');
  const parts = [...photos];
  if (payment?.status === 'open') parts.push('Direct booking still emails a request');
  const line = parts.length
    ? `${parts.join('. ')}. Nothing is posted to Airbnb or VRBO.`
    : 'Our booking page has no open listing items.';
  if (line.includes('$') || /door\s*code|wi-?fi|password/i.test(line)) {
    return 'Our booking page still has open listing items. Nothing is posted to Airbnb or VRBO.';
  }
  return line;
}

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
      // The hold landed, so the old "does not hold the dates" claim is no longer true. What is still
      // open is the card: nothing on this page charges one.
      detail:
        'The page holds the dates for 30 minutes while a person replies, and it does not charge a card.',
    },
    {
      id: 'addons',
      status: 'ready',
      title: 'Add-ons are named, not charged',
      detail: addonMenuLine(house),
    },
    {
      id: 'agreement',
      status: 'ready',
      title: 'The stay agreement is listed, not signed',
      detail:
        'The quote lists the topics for that house, including that the house is provided as-is. Reading them does not sign the agreement.',
    },
  ];
}
