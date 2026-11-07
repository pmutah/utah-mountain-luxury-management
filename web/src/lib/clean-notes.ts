const STORAGE_KEY = 'uml-clean-fixes';

export type CleanFix = {
  id: string;
  house: string;
  checkout: string;
  note: string;
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Keep a short fix note. An empty note is dropped. Guest names are not added here. */
export function upsertCleanFix(current: readonly CleanFix[], next: CleanFix): CleanFix[] {
  const note = next.note.trim().slice(0, 160);
  const rest = current.filter((row) => row.id !== next.id);
  if (!note || !next.house.trim() || !DATE.test(next.checkout)) return rest;
  return [...rest, { id: next.id, house: next.house.trim(), checkout: next.checkout, note }].slice(-8);
}

function isFix(value: unknown): value is CleanFix {
  if (!value || typeof value !== 'object') return false;
  const row = value as CleanFix;
  return Boolean(row.id && row.house && DATE.test(row.checkout) && row.note?.trim());
}

export function loadCleanFixes(): CleanFix[] {
  try {
    if (typeof sessionStorage === 'undefined') return [];
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isFix).slice(-8);
  } catch {
    return [];
  }
}

export function saveCleanFixes(fixes: readonly CleanFix[]) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(fixes.filter(isFix).slice(-8)));
  } catch {
    // The note still shows for this visit.
  }
}

export type HouseFix = {
  house: 'river' | 'ranch' | 'lindon';
  note: string;
};

const HOUSES = ['river', 'ranch', 'lindon'] as const;
const HOUSE_KEY = 'uml-clean-house-notes';
const SECRET = /door\s*code|wi-?fi|password|\$|\b\d{4}\b/i;

function isHouse(value: string): value is HouseFix['house'] {
  return (HOUSES as readonly string[]).includes(value);
}

/** A note for the house when no stay is on the list. A door code or a price is refused. */
export function upsertHouseFix(
  current: readonly HouseFix[],
  house: string,
  note: string,
): { notes: HouseFix[]; refused: boolean } {
  if (!isHouse(house)) return { notes: [...current], refused: false };
  const text = note.trim().slice(0, 160);
  const rest = current.filter((row) => row.house !== house);
  if (!text) return { notes: rest, refused: false };
  if (SECRET.test(text)) return { notes: [...current], refused: true };
  return { notes: [...rest, { house, note: text }], refused: false };
}

function isHouseFix(value: unknown): value is HouseFix {
  if (!value || typeof value !== 'object') return false;
  const row = value as HouseFix;
  return isHouse(row.house) && Boolean(row.note?.trim()) && !SECRET.test(row.note);
}

export function loadHouseFixes(): HouseFix[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(HOUSE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isHouseFix);
  } catch {
    return [];
  }
}

export function saveHouseFixes(notes: readonly HouseFix[]) {
  try {
    localStorage.setItem(HOUSE_KEY, JSON.stringify(notes.filter(isHouseFix)));
  } catch {
    // The note still shows for this visit.
  }
}
