import { percentileRank, percentileValue } from './stats';

export type ProposeInput = {
  ourGuest: number;
  compRates: number[];
  floorGuest: number;
  ceilingGuest: number;
  targetPercentile: number;
  /** Maximum one-day move, as a fraction. 0.08 is 8%. */
  maxMove: number;
  lockBase: boolean;
};

export type ProposeResult = {
  proposedGuest: number;
  percentile: number;
  targetGuest: number;
  reason: string;
  action: 'hold' | 'raise' | 'promote' | 'locked';
};

export function proposeGuestRate(input: ProposeInput): ProposeResult {
  const percentile = percentileRank(input.ourGuest, input.compRates);
  const targetGuest = Math.round(percentileValue(input.compRates, input.targetPercentile));
  const clamp = (value: number) =>
    Math.round(Math.max(input.floorGuest, Math.min(input.ceilingGuest, value)));

  if (input.lockBase) {
    return {
      proposedGuest: clamp(input.ourGuest),
      percentile,
      targetGuest,
      action: 'locked',
      reason: 'Holiday rate stays on the season table.',
    };
  }
  if (input.compRates.length < 3) {
    return {
      proposedGuest: clamp(input.ourGuest),
      percentile,
      targetGuest,
      action: 'hold',
      reason: 'Fewer than 3 comps are still open. Holding the rate.',
    };
  }
  if (input.ourGuest < targetGuest * 0.97) {
    const stepped = Math.min(input.ourGuest * (1 + input.maxMove), targetGuest);
    const proposedGuest = clamp(stepped);
    return {
      proposedGuest,
      percentile,
      targetGuest,
      action: proposedGuest > input.ourGuest ? 'raise' : 'hold',
      reason:
        proposedGuest > input.ourGuest
          ? `Open comps are higher. Shadow raise toward p${input.targetPercentile}, capped at ${Math.round(input.maxMove * 100)}% today.`
          : 'The floor or ceiling stops a move today.',
    };
  }
  const hot = percentileValue(input.compRates, 90);
  if (input.ourGuest > hot && input.ourGuest > targetGuest * 1.12) {
    return {
      proposedGuest: clamp(input.ourGuest),
      percentile,
      targetGuest,
      action: 'promote',
      reason: 'Above the comp cluster. The base stays. A promotion can fill the night.',
    };
  }
  return {
    proposedGuest: clamp(input.ourGuest),
    percentile,
    targetGuest,
    action: 'hold',
    reason: 'Inside the target band. Hold the rate.',
  };
}
