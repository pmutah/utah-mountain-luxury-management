import { percentileRank } from './stats';

export type TrialBlock = 'blank' | 'closed' | 'booked' | 'holiday' | 'base' | 'floor' | 'ceiling' | 'daily';

export type TrialVerdict = {
  trialGuest: number;
  /** True only when the trial would become a higher base inside the guardrails. */
  wouldRaise: boolean;
  blockedBy: TrialBlock[];
  dailyCap: number;
  percentile: number;
  note: string;
};

/**
 * Judge a typed nightly ask. This does not change the published rate.
 * A number under the published ask is not a new base. Promotions are a separate step.
 */
export function judgeTrial(input: {
  publishedGuest: number;
  trialGuest: number;
  floorGuest: number;
  ceilingGuest: number;
  maxMove: number;
  compRates: number[];
  closed: boolean;
  booked: boolean;
  holiday: boolean;
}): TrialVerdict {
  const trialGuest = Math.round(input.trialGuest);
  const dailyCap = Math.round(input.publishedGuest * (1 + input.maxMove));
  const percentile = percentileRank(trialGuest, input.compRates);
  if (!Number.isFinite(trialGuest) || trialGuest <= 0) {
    return {
      trialGuest: 0,
      wouldRaise: false,
      blockedBy: ['blank'],
      dailyCap,
      percentile: 0,
      note: 'Enter a nightly ask.',
    };
  }
  const blockedBy: TrialBlock[] = [];
  if (input.closed) blockedBy.push('closed');
  if (input.booked) blockedBy.push('booked');
  if (input.holiday && trialGuest !== input.publishedGuest) blockedBy.push('holiday');
  if (trialGuest < input.publishedGuest) blockedBy.push('base');
  if (trialGuest < input.floorGuest) blockedBy.push('floor');
  if (trialGuest > input.ceilingGuest) blockedBy.push('ceiling');
  if (trialGuest > dailyCap) blockedBy.push('daily');
  const wouldRaise = blockedBy.length === 0 && trialGuest > input.publishedGuest;
  return {
    trialGuest,
    wouldRaise,
    blockedBy,
    dailyCap,
    percentile,
    note: trialNote(blockedBy, trialGuest === input.publishedGuest, percentile, input.maxMove),
  };
}

function trialNote(blockedBy: TrialBlock[], same: boolean, percentile: number, maxMove: number): string {
  if (blockedBy.includes('closed')) return 'This night is closed. The published rate stays.';
  if (blockedBy.includes('booked')) return 'This night is booked. The published rate stays.';
  if (blockedBy.includes('holiday')) return 'Holiday rate stays on the season table.';
  if (blockedBy.includes('base')) return 'The published base stays. A lower ask is not a new base.';
  if (blockedBy.includes('floor')) return 'Below the floor.';
  if (blockedBy.includes('ceiling')) return 'Above the ceiling.';
  if (blockedBy.includes('daily')) return `More than ${Math.round(maxMove * 100)}% above the published ask.`;
  if (same) return `This is the published ask, at p${percentile}.`;
  return `Inside the guardrails. This would be a new base at p${percentile}.`;
}
