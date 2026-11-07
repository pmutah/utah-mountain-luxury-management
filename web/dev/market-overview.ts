import { buildMarketBoard } from '../src/lib/market/board';
import { addDays, denverToday } from '../src/lib/market/dates';
import { indexSnaps, toLiveComps, toLiveSnaps, type LiveComp } from '../src/lib/market/live';
import type { HouseId } from '../src/lib/market/types';
import { devApprovedSheetFor } from './approved-rates';

/**
 * Local overview. Production HTML is not a board, and this route is not a write.
 * `live=1` seeds three saved comps with an observed ask, so the live band can be checked here.
 * The approved sheet is passed the same way the deployed route passes it, so a night approved in
 * this preview shows on the board instead of the published card.
 */
export function devMarketOverview(house: string | null, live = false) {
  const id: HouseId = house === 'ranch' || house === 'lindon' || house === 'river' ? house : 'river';
  const from = denverToday();
  const sheet = devApprovedSheetFor(id);
  if (!live) return buildMarketBoard(id, from, 90, undefined, null, sheet);
  const raw = [
    { id: 'preview-1', label: 'Saved · Sundance lodge', sleeps: 18, bedrooms: 7, distanceMi: 2.4, rating: 4.93, reviews: 64, area: 'Sundance', guestFavorite: true },
    { id: 'preview-2', label: 'Saved · Vivian Park home', sleeps: 16, bedrooms: 6, distanceMi: 0.9, rating: 4.88, reviews: 41, area: 'Vivian Park' },
    { id: 'preview-3', label: 'Saved · Provo Canyon estate', sleeps: 20, bedrooms: 8, distanceMi: 3.6, rating: 4.9, reviews: 28, area: 'Provo Canyon' },
  ];
  const comps: LiveComp[] = toLiveComps(raw);
  const nights = Array.from({ length: 30 }, (_, index) => addDays(from, index));
  const asks = comps.flatMap((comp, index) =>
    nights.map((date) => ({ compId: comp.id, date, nightlyRate: 1900 + index * 350 })),
  );
  const index = indexSnaps(toLiveSnaps(asks));
  return buildMarketBoard(id, from, 90, undefined, { comps, index }, sheet);
}
