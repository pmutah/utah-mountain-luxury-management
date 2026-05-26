export const PROPERTIES = {
  ranch: {
    id: 'ranch',
    name: 'The Ranch House',
    address: '270 E Center St',
    cleaningFee: 350,
    accentColor: 'bg-blue-500',
    mortgage: 3133.36,
  },
  lindon: {
    id: 'lindon',
    name: 'The Lindon House',
    address: '1011 E 100 N',
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
