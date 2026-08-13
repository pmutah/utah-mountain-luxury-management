export const PROPERTIES = {
  ranch: {
    id: 'ranch',
    name: 'The Ranch House',
    address: '270 East Center Street, Lindon, Utah 84042',
    cleaningFee: 350,
    accentColor: 'bg-blue-500',
    mortgage: 3133.36,
  },
  river: {
    id: 'river',
    name: 'The River House',
    address: 'Vivian Park, Provo Canyon, Utah 84604',
    cleaningFee: 0,
    accentColor: 'bg-cyan-500',
    mortgage: 0,
  },
  lindon: {
    id: 'lindon',
    name: 'The Lindon House',
    address: '143 Harcliff Circle, Lindon, Utah 84042',
    cleaningFee: 160,
    accentColor: 'bg-emerald-500',
    mortgage: 1265.14,
  },
} as const;

export type PropertyId = keyof typeof PROPERTIES;

export function currentYearMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}
