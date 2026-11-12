export type MapPinKind = 'ski' | 'river' | 'food' | 'trails' | 'house';

export type MapPin = {
  id: string;
  name: string;
  kind: MapPinKind;
  x: number;
  y: number;
  minutes: Record<'ranch' | 'lindon' | 'river', number>;
  note: string;
};

/** Typical drive minutes from each house. These are planning figures, not live traffic. */
export const CANYON_PINS: MapPin[] = [
  {
    id: 'lindon',
    name: 'Lindon / Utah Lake',
    kind: 'house',
    x: 70,
    y: 210,
    minutes: { ranch: 25, lindon: 0, river: 30 },
    note: 'Valley floor. The Lindon House is here.',
  },
  {
    id: 'riverwoods',
    name: 'Riverwoods',
    kind: 'food',
    x: 150,
    y: 170,
    minutes: { ranch: 20, lindon: 12, river: 18 },
    note: 'Dinner and groceries before the canyon.',
  },
  {
    id: 'bridal',
    name: 'Bridal Veil Falls',
    kind: 'trails',
    x: 250,
    y: 130,
    minutes: { ranch: 15, lindon: 22, river: 8 },
    note: 'A short stop on the way up Provo Canyon.',
  },
  {
    id: 'vivian',
    name: 'Vivian Park — The River House',
    kind: 'river',
    x: 340,
    y: 100,
    minutes: { ranch: 12, lindon: 30, river: 0 },
    note: 'Provo River at the house.',
  },
  {
    id: 'sundance',
    name: 'Sundance Mountain Resort',
    kind: 'ski',
    x: 470,
    y: 48,
    minutes: { ranch: 10, lindon: 40, river: 12 },
    note: 'Ski hill above the canyon.',
  },
  {
    id: 'ranch',
    name: 'The Ranch House',
    kind: 'house',
    x: 430,
    y: 78,
    minutes: { ranch: 0, lindon: 35, river: 12 },
    note: 'Upper canyon, near Sundance.',
  },
];

export function pinsFor(kind: MapPinKind | 'all'): MapPin[] {
  if (kind === 'all') return CANYON_PINS;
  return CANYON_PINS.filter((pin) => pin.kind === kind || pin.kind === 'house');
}
