import { corsJson } from '../../_lib/data';
import { buildMarketBoard } from '../../../src/lib/market/board';
import { denverToday } from '../../../src/lib/market/dates';

function houseFrom(value: string | null) {
  if (value === 'ranch' || value === 'lindon' || value === 'river') return value;
  return 'river';
}

export const onRequestGet: PagesFunction = async ({ request }) => {
  const url = new URL(request.url);
  const house = houseFrom(url.searchParams.get('house'));
  return corsJson(request, buildMarketBoard(house, denverToday(), 90));
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
