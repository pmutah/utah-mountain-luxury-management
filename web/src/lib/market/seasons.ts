/**
 * River host-net seasons. Keep this in step with `riverSeasonOn` in
 * `functions/_lib/pricing-doctrine.ts`. The market board reads it here so the
 * dashboard can price a night without loading the server pricing module.
 */
export type RiverSeason = {
  name: string;
  holiday: boolean;
  weekendHostNet: number;
  weekdayHostNet: number;
  minWeekend: number;
  minWeekday: number;
};

const RIVER_HOLIDAYS: Array<RiverSeason & { start: string; end: string }> = [
  { start: '2026-11-24', end: '2026-11-30', name: 'Thanksgiving', holiday: true, weekendHostNet: 2900, weekdayHostNet: 2900, minWeekend: 4, minWeekday: 4 },
  { start: '2026-12-19', end: '2027-01-03', name: 'Christmas through New Year', holiday: true, weekendHostNet: 3400, weekdayHostNet: 3400, minWeekend: 5, minWeekday: 5 },
  { start: '2027-01-15', end: '2027-01-19', name: 'MLK weekend', holiday: true, weekendHostNet: 2800, weekdayHostNet: 2800, minWeekend: 3, minWeekday: 3 },
  { start: '2027-02-12', end: '2027-02-16', name: 'Presidents Day weekend', holiday: true, weekendHostNet: 2800, weekdayHostNet: 2800, minWeekend: 3, minWeekday: 3 },
  { start: '2027-05-28', end: '2027-06-01', name: 'Memorial Day weekend', holiday: true, weekendHostNet: 2600, weekdayHostNet: 2600, minWeekend: 3, minWeekday: 3 },
  { start: '2027-07-01', end: '2027-07-06', name: 'July 4 week', holiday: true, weekendHostNet: 3000, weekdayHostNet: 3000, minWeekend: 4, minWeekday: 4 },
  { start: '2027-07-22', end: '2027-07-26', name: 'Pioneer Day weekend', holiday: true, weekendHostNet: 2900, weekdayHostNet: 2900, minWeekend: 4, minWeekday: 4 },
  { start: '2027-09-03', end: '2027-09-07', name: 'Labor Day weekend', holiday: true, weekendHostNet: 2600, weekdayHostNet: 2600, minWeekend: 3, minWeekday: 3 },
  { start: '2027-11-23', end: '2027-11-29', name: 'Thanksgiving', holiday: true, weekendHostNet: 2900, weekdayHostNet: 2900, minWeekend: 4, minWeekday: 4 },
  { start: '2027-12-18', end: '2028-01-03', name: 'Christmas through New Year', holiday: true, weekendHostNet: 3400, weekdayHostNet: 3400, minWeekend: 5, minWeekday: 5 },
];

export function riverSeasonOn(iso: string): RiverSeason {
  const holiday = RIVER_HOLIDAYS.find((season) => iso >= season.start && iso < season.end);
  if (holiday) {
    return {
      name: holiday.name,
      holiday: true,
      weekendHostNet: holiday.weekendHostNet,
      weekdayHostNet: holiday.weekdayHostNet,
      minWeekend: holiday.minWeekend,
      minWeekday: holiday.minWeekday,
    };
  }
  const monthDay = iso.slice(5);
  if (monthDay >= '06-01' && monthDay < '08-01') {
    return { name: 'June and July peak', holiday: false, weekendHostNet: 2700, weekdayHostNet: 2200, minWeekend: 4, minWeekday: 3 };
  }
  if (monthDay >= '08-01' && monthDay < '08-17') {
    return { name: 'Late summer', holiday: false, weekendHostNet: 2400, weekdayHostNet: 1950, minWeekend: 3, minWeekday: 2 };
  }
  if (monthDay >= '01-01' && monthDay < '04-01') {
    return { name: 'Ski season', holiday: false, weekendHostNet: 2400, weekdayHostNet: 1950, minWeekend: 3, minWeekday: 2 };
  }
  if (monthDay >= '12-01') {
    return { name: 'Early ski season', holiday: false, weekendHostNet: 2200, weekdayHostNet: 1875, minWeekend: 3, minWeekday: 2 };
  }
  return { name: 'Shoulder', holiday: false, weekendHostNet: 2100, weekdayHostNet: 1875, minWeekend: 2, minWeekday: 2 };
}
