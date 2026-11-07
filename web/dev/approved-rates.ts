import { approvedGuestRate, sheetLine, type ApprovedRate } from '../src/lib/market/rate-sheet';
import { nightAsk } from '../src/lib/market/rates';
import { denverToday } from '../src/lib/market/dates';

/**
 * Local preview only. The deployed route reads the real sheet and the real calendar. This fixture
 * runs the same guard functions the route runs, so a preview approval is accepted or refused for
 * the same reasons, but it keeps the sheet in memory and never touches KV.
 */
const sheet: ApprovedRate[] = [];

function houseFrom(value: unknown): 'ranch' | 'lindon' | 'river' | null {
  return value === 'ranch' || value === 'lindon' || value === 'river' ? value : null;
}

export function devApprovedRates(house?: string) {
  const houseId = houseFrom(house);
  const rows = houseId ? sheet.filter((row) => row.house === houseId) : sheet;
  return {
    approved: rows,
    line: sheetLine(sheet, houseId ?? 'ranch'),
    storageReads: 'ok' as const,
    source: 'dev-preview' as const,
  };
}

export function devApproveRate(body: { house?: unknown; date?: unknown; guest?: unknown }) {
  const house = houseFrom(body.house);
  const date = typeof body.date === 'string' ? body.date.trim() : '';
  const guest = typeof body.guest === 'number' && Number.isFinite(body.guest) ? Math.round(body.guest) : 0;
  if (!house) return { status: 400 as const, error: 'Choose the Ranch, the Lindon House, or the River House.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { status: 400 as const, error: 'Choose a real night.' };
  if (guest <= 0) return { status: 400 as const, error: 'Enter a guest price above zero.' };

  const ask = nightAsk(house, date);
  const allowed = approvedGuestRate([{ date, guest }], date, { guest: ask.guest, floorGuest: ask.floorGuest });
  if (allowed === null) {
    return {
      status: 400 as const,
      error: `That price is outside what this house can quote for that night. The card is $${ask.guest} and the floor is $${ask.floorGuest}. A raise moves at most 8% in one night, and a cut goes no lower than the 20% promotion or the floor. Nothing was written.`,
    };
  }

  const row: ApprovedRate = { house, date, guest: allowed, approvedAt: new Date().toISOString() };
  const next = sheet.filter((entry) => !(entry.house === house && entry.date === date));
  next.push(row);
  sheet.length = 0;
  sheet.push(...next);
  return {
    status: 201 as const,
    ok: true,
    approved: row,
    nights: sheet.filter((entry) => entry.house === house).length,
    line: sheetLine(sheet, house),
  };
}

export function devClearApprovedRate(house: unknown, date: unknown) {
  const houseId = houseFrom(house);
  const day = typeof date === 'string' ? date : '';
  if (!houseId || !/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    return { status: 400 as const, error: 'Choose a house and a real night.' };
  }
  const keep = sheet.filter((entry) => !(entry.house === houseId && entry.date === day));
  sheet.length = 0;
  sheet.push(...keep);
  return {
    status: 200 as const,
    ok: true,
    nights: sheet.filter((entry) => entry.house === houseId).length,
    line: sheetLine(sheet, houseId),
  };
}

/** The preview's approved nights as the public calendar carries them. */
export function devApprovedForCalendar(): ApprovedRate[] {
  return sheet.filter((row) => row.date >= denverToday());
}

/** The preview's approved nights for one house, in the shape `buildMarketBoard` reads. */
export function devApprovedSheetFor(house: string): Array<{ date: string; guest: number }> {
  return sheet.filter((row) => row.house === house).map((row) => ({ date: row.date, guest: row.guest }));
}
