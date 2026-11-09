import { cleanSteps } from './clean-link';
import { isRealDay } from './market/dates';
import type { HouseId } from './market/types';

/** A cleaner's ticks for one turn. Keyed by the house and the checkout morning. */
export type CleanProgress = {
  house: HouseId;
  checkout: string;
  /** Step ids that are done. An unknown id is dropped rather than trusted. */
  done: string[];
  updatedAt: string;
};

/** A stable id for a step, so a translated label can change without losing the tick. */
export function stepIds(sameDay: boolean): string[] {
  const base = ['beds', 'linens', 'kitchen', 'baths', 'floors', 'photos'];
  return sameDay ? ['window', ...base] : base;
}

export function progressKey(house: HouseId, checkout: string): string {
  return `${house}:${checkout}`;
}

/** Only the ids this job actually has. A stale id from an older step list is dropped. */
export function keepDone(house: HouseId, checkout: string, sameDay: boolean, done: readonly unknown[]): CleanProgress | null {
  if (!isRealDay(checkout)) return null;
  const allowed = new Set(stepIds(sameDay));
  const kept = [...new Set(done.filter((id): id is string => typeof id === 'string' && allowed.has(id)))].sort();
  return { house, checkout, done: kept, updatedAt: new Date().toISOString() };
}

export type TurnState = 'none' | 'started' | 'done';

/** How far a turn has got. `none` means nobody has ticked anything. */
export function turnState(house: HouseId, checkout: string, sameDay: boolean, progress: readonly CleanProgress[]): TurnState {
  const row = progress.find((item) => item.house === house && item.checkout === checkout);
  if (!row) return 'none';
  const allowed = new Set(stepIds(sameDay));
  const done = row.done.filter((id) => allowed.has(id));
  if (done.length === 0) return 'none';
  return done.length >= allowed.size ? 'done' : 'started';
}

/** Steps still open, in the order the cleaner sees them. */
export function openSteps(house: HouseId, checkout: string, sameDay: boolean, progress: readonly CleanProgress[]): number {
  const row = progress.find((item) => item.house === house && item.checkout === checkout);
  if (!row) return stepIds(sameDay).length;
  const allowed = new Set(stepIds(sameDay));
  const done = new Set(row.done.filter((id) => allowed.has(id)));
  return allowed.size - done.size;
}

/** A host line for one turn. It names the house and the day, never a guest. */
export function turnStateLine(house: HouseId, checkout: string, sameDay: boolean, progress: readonly CleanProgress[]): string {
  const state = turnState(house, checkout, sameDay, progress);
  if (state === 'done') return 'The cleaner marked this turn done.';
  if (state === 'started') {
    const open = openSteps(house, checkout, sameDay, progress);
    return `The cleaner has started this turn. ${open === 1 ? '1 step is' : `${open} steps are`} still open.`;
  }
  return 'No step is ticked yet.';
}

/** The desk summary. It does not claim a turn is done when nothing was ticked. */
export function progressSummary(turns: readonly { house: HouseId; checkout: string; sameDay: boolean }[], progress: readonly CleanProgress[]): string {
  if (turns.length === 0) return 'No turnover to track. Nothing was booked or sent.';
  let done = 0;
  let started = 0;
  for (const turn of turns) {
    const state = turnState(turn.house, turn.checkout, turn.sameDay, progress);
    if (state === 'done') done += 1;
    else if (state === 'started') started += 1;
  }
  const untouched = turns.length - done - started;
  const parts = [
    done === 0 ? 'No turnover is marked done.' : done === 1 ? '1 turnover is done.' : `${done} turnovers are done.`,
    started === 0 ? '' : started === 1 ? '1 is in progress.' : `${started} are in progress.`,
    untouched === 0 ? '' : untouched === 1 ? '1 has no step ticked.' : `${untouched} have no step ticked.`,
  ].filter(Boolean);
  return `${parts.join(' ')} The cleaner ticks these on their own link.`;
}

/** True when the cleaner has not ticked the last step, so the desk does not call the house ready. */
export function houseReady(house: HouseId, checkout: string, sameDay: boolean, progress: readonly CleanProgress[]): boolean {
  return turnState(house, checkout, sameDay, progress) === 'done';
}

/** The step labels a cleaner ticks, paired with their ids. Scoped to the parts this turn occupies. */
export function stepRows(
  sameDay: boolean,
  lang: 'en' | 'es' = 'en',
  units: readonly string[] = [],
): Array<{ id: string; label: string }> {
  const ids = stepIds(sameDay);
  const labels = cleanSteps(sameDay, lang, units);
  return ids.map((id, index) => ({ id, label: labels[index] ?? id }));
}
