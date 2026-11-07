import { RIVER_FIRST_STAY } from '../brand';
import { publishedStayRule } from '../quote';
import { buildMarketBoard } from './board';
import { addDays } from './dates';
import type { HouseId } from './types';
import { judgeCardTrial } from './whatif';

const NAMES: Record<HouseId, string> = { river: 'River', ranch: 'Ranch', lindon: 'Lindon' };
const HOUSES: HouseId[] = ['river', 'ranch', 'lindon'];

/** The same typed ask on every house. No price in the line, and nothing is posted. */
export function judgeHousesOnCard(asOf: string, date: string, trialGuest: number): string[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return [];
  return HOUSES.map((house) => {
    if (house === 'river' && date < RIVER_FIRST_STAY) return 'River: Not yet. Nothing is posted.';
    const night = buildMarketBoard(house, asOf, 90).nights.find((row) => row.date === date);
    if (!night) return `${NAMES[house]}: That night is not on this card. Nothing is posted.`;
    const verdict = judgeCardTrial({
      publishedGuest: night.ourGuest,
      trialGuest,
      floorGuest: night.floorGuest,
      ceilingGuest: night.ourGuest * 2,
      maxMove: 0.08,
      compRates: night.compRates,
      holiday: night.action === 'locked',
    });
    const note = verdict.note.replace(/\$[\d,]+/g, '').replace(/\s+/g, ' ').trim();
    const rule = publishedStayRule(house, date, addDays(date, 1), undefined, undefined, asOf) ?? '';
    const stay = rule.includes('$') || /door\s*code|wi-?fi|password/i.test(rule) ? '' : rule;
    const line = `${NAMES[house]}: ${note}${stay ? ` ${stay}` : ''}`;
    return line.includes('$') ? `${NAMES[house]}: Nothing is posted.` : line;
  });
}
