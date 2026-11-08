export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export function percentileValue(values: number[], percentile: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (Math.min(100, Math.max(0, percentile)) / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower]!;
  const weight = index - lower;
  return sorted[lower]! * (1 - weight) + sorted[upper]! * weight;
}

/** Share of comp rates at or below `value`, from 0 to 100. */
export function percentileRank(value: number, values: number[]): number {
  if (values.length === 0) return 0;
  const below = values.filter((rate) => rate <= value).length;
  return Math.round((below / values.length) * 100);
}

/** The guest price that leaves `hostNet` after the Airbnb fee, for the app-side rate card. */
export function listPriceForHostNet(hostNet: number): number {
  return Math.ceil(hostNet / 0.845);
}
