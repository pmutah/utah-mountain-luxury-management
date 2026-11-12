import { addDays, eachNight } from './market/dates';
import { RIVER_UNITS, type RiverUnitId } from './river-units';

export type TapeChannel = 'airbnb' | 'vrbo' | 'direct' | 'other';
export type TapeRowId =
  | 'ranch'
  | 'lindon'
  | 'river-whole'
  | 'river-main-lodge'
  | 'river-recreation-wing'
  | 'river-garage-suite';

export type TapeStay = {
  id: string;
  propertyId: string;
  checkIn: string;
  checkOut: string;
  guestName?: string;
  source?: string;
  status?: string;
  units?: string[];
};

export type TapeBlock = { propertyId: string; start: string; end: string };

export type TapeBar = {
  id: string;
  row: TapeRowId;
  start: number;
  end: number;
  label: string;
  channel: TapeChannel;
  kind: 'stay' | 'hold' | 'block';
  reservationId?: string;
};

export type TapeGap = {
  row: TapeRowId;
  house: 'ranch' | 'lindon' | 'river';
  checkIn: string;
  checkOut: string;
  nights: number;
  start: number;
};

export type TapeLayout = {
  days: string[];
  rows: Array<{ id: TapeRowId; label: string }>;
  bars: TapeBar[];
  cascades: Array<{ row: TapeRowId; day: number }>;
  turnovers: Array<{ row: TapeRowId; day: number }>;
  gaps: TapeGap[];
};

const ROW_LABEL: Record<TapeRowId, string> = {
  ranch: 'Ranch',
  lindon: 'Lindon',
  'river-whole': 'River — Whole House',
  'river-main-lodge': 'River — Main Lodge',
  'river-recreation-wing': 'River — Recreation Wing',
  'river-garage-suite': 'River — Garage Suite',
};

const PART_ROW: Record<RiverUnitId, TapeRowId> = {
  'main-lodge': 'river-main-lodge',
  'recreation-wing': 'river-recreation-wing',
  'garage-suite': 'river-garage-suite',
};

export function channelOf(source: string | undefined): TapeChannel {
  const value = (source ?? '').toLowerCase();
  if (value.includes('airbnb')) return 'airbnb';
  if (value.includes('vrbo')) return 'vrbo';
  if (value.includes('direct') || value.includes('website') || value.includes('book')) return 'direct';
  return 'other';
}

function kindOf(status: string | undefined): 'stay' | 'hold' | 'block' | 'skip' {
  const value = (status ?? 'confirmed').toLowerCase();
  if (value === 'cancelled' || value === 'declined') return 'skip';
  if (value === 'blocked' || value === 'block') return 'block';
  if (value === 'pending' || value === 'requested' || value === 'hold') return 'hold';
  return 'stay';
}

function riverUnits(stay: TapeStay): RiverUnitId[] {
  const listed = (stay.units ?? []).filter((unit): unit is RiverUnitId => (RIVER_UNITS as readonly string[]).includes(unit));
  if (stay.propertyId !== 'river') return [];
  if (listed.length === 0 || listed.length === RIVER_UNITS.length) return [...RIVER_UNITS];
  return listed;
}

function occupiesWhole(stay: TapeStay): boolean {
  return stay.propertyId === 'river' && riverUnits(stay).length === RIVER_UNITS.length;
}

export function layoutTape(input: {
  reservations: TapeStay[];
  start: string;
  days: number;
  hideLindon?: boolean;
  blocks?: TapeBlock[];
}): TapeLayout {
  const count = Math.max(1, input.days);
  const days = eachNight(input.start, count);
  const rows: Array<{ id: TapeRowId; label: string }> = [
    { id: 'ranch', label: ROW_LABEL.ranch },
    ...(input.hideLindon ? [] : [{ id: 'lindon' as const, label: ROW_LABEL.lindon }]),
    { id: 'river-whole', label: ROW_LABEL['river-whole'] },
    { id: 'river-main-lodge', label: ROW_LABEL['river-main-lodge'] },
    { id: 'river-recreation-wing', label: ROW_LABEL['river-recreation-wing'] },
    { id: 'river-garage-suite', label: ROW_LABEL['river-garage-suite'] },
  ];
  const rowIds = new Set(rows.map((row) => row.id));
  const occupied = new Map<TapeRowId, Array<'free' | 'taken'>>();
  for (const row of rows) occupied.set(row.id, Array.from({ length: count }, () => 'free'));

  const bars: TapeBar[] = [];
  const mark = (row: TapeRowId, from: number, to: number) => {
    const cells = occupied.get(row);
    if (!cells) return;
    for (let i = from; i < to; i++) cells[i] = 'taken';
  };
  const clip = (checkIn: string, checkOut: string) => {
    let start = -1;
    let end = -1;
    for (let i = 0; i < days.length; i++) {
      const iso = days[i]!;
      if (iso >= checkIn && iso < checkOut) {
        if (start < 0) start = i;
        end = i + 1;
      }
    }
    if (start < 0 || end <= start) return null;
    return { start, end };
  };

  for (const stay of input.reservations) {
    const kind = kindOf(stay.status);
    if (kind === 'skip') continue;
    const span = clip(stay.checkIn, stay.checkOut);
    if (!span) continue;
    const channel = channelOf(stay.source);
    const label = kind === 'block' ? 'Blocked' : kind === 'hold' ? stay.guestName || 'Hold' : stay.guestName || 'Stay';
    const push = (row: TapeRowId) => {
      if (!rowIds.has(row)) return;
      bars.push({
        id: `${stay.id}:${row}`,
        row,
        start: span.start,
        end: span.end,
        label,
        channel,
        kind: kind === 'hold' ? 'hold' : kind === 'block' ? 'block' : 'stay',
        reservationId: stay.id,
      });
      mark(row, span.start, span.end);
    };
    if (stay.propertyId === 'ranch') push('ranch');
    else if (stay.propertyId === 'lindon') push('lindon');
    else if (stay.propertyId === 'river') {
      if (occupiesWhole(stay)) push('river-whole');
      else for (const unit of riverUnits(stay)) push(PART_ROW[unit]);
    }
  }

  for (const block of input.blocks ?? []) {
    const span = clip(block.start, block.end);
    if (!span) continue;
    const row: TapeRowId | null =
      block.propertyId === 'ranch' ? 'ranch' : block.propertyId === 'lindon' ? 'lindon' : block.propertyId === 'river' ? 'river-whole' : null;
    if (!row || !rowIds.has(row)) continue;
    bars.push({
      id: `block:${block.propertyId}:${block.start}`,
      row,
      start: span.start,
      end: span.end,
      label: 'Blocked',
      channel: 'other',
      kind: 'block',
    });
    mark(row, span.start, span.end);
  }

  const cascades: Array<{ row: TapeRowId; day: number }> = [];
  const whole = occupied.get('river-whole') ?? [];
  const parts = (['river-main-lodge', 'river-recreation-wing', 'river-garage-suite'] as const).map(
    (row) => occupied.get(row) ?? [],
  );
  for (let day = 0; day < count; day++) {
    const partTaken = parts.some((cells) => cells[day] === 'taken');
    if (whole[day] === 'taken') {
      for (const row of ['river-main-lodge', 'river-recreation-wing', 'river-garage-suite'] as const) {
        if ((occupied.get(row)?.[day] ?? 'free') === 'free') cascades.push({ row, day });
      }
    } else if (partTaken) {
      cascades.push({ row: 'river-whole', day });
    }
  }
  const cascadeSet = new Set(cascades.map((cell) => `${cell.row}:${cell.day}`));

  const turnovers: Array<{ row: TapeRowId; day: number }> = [];
  for (const row of rows) {
    const outs = new Set<number>();
    const ins = new Set<number>();
    for (const bar of bars.filter((item) => item.row === row.id && item.kind !== 'block')) {
      outs.add(bar.end);
      ins.add(bar.start);
    }
    for (const day of outs) {
      if (ins.has(day) && day < count) turnovers.push({ row: row.id, day });
    }
  }

  const gaps: TapeGap[] = [];
  for (const row of rows) {
    const cells = occupied.get(row.id) ?? [];
    let run = -1;
    const house = row.id === 'ranch' ? 'ranch' : row.id === 'lindon' ? 'lindon' : 'river';
    const flush = (end: number) => {
      if (run < 0) return;
      const nights = end - run;
      const bounded = bars.some((bar) => bar.row === row.id && bar.end === run) && bars.some((bar) => bar.row === row.id && bar.start === end);
      if (bounded && nights >= 1 && nights <= 4) {
        gaps.push({
          row: row.id,
          house,
          checkIn: days[run]!,
          checkOut: days[end] ?? addDays(days[run]!, nights),
          nights,
          start: run,
        });
      }
      run = -1;
    };
    for (let day = 0; day < count; day++) {
      const free = cells[day] === 'free' && !cascadeSet.has(`${row.id}:${day}`);
      if (free && run < 0) run = day;
      if (!free && run >= 0) flush(day);
    }
    flush(count);
  }

  return { days, rows, bars, cascades, turnovers, gaps };
}
