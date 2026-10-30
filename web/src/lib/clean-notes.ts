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
