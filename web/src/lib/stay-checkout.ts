const STORAGE_KEY = 'uml-stay-checkout';

/** One checkbox per line of the house checkout note. */
export function checkoutSteps(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

export function checkoutDoneCount(steps: readonly string[], checks: readonly boolean[]): number {
  return steps.filter((_, index) => checks[index] === true).length;
}

function readStore(): Record<string, boolean[]> {
  try {
    if (typeof sessionStorage === 'undefined') return {};
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    const next: Record<string, boolean[]> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (!key || !Array.isArray(value)) continue;
      next[key] = value.filter((item) => item === true || item === false);
    }
    return next;
  } catch {
    return {};
  }
}

export function loadCheckoutChecks(token: string): boolean[] {
  if (!token) return [];
  return readStore()[token] ?? [];
}

export function saveCheckoutChecks(token: string, checks: readonly boolean[]) {
  if (!token) return;
  try {
    const next = readStore();
    next[token] = checks.map((item) => item === true);
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // The checks still show for this visit.
  }
}
