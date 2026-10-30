const STORAGE_KEY = 'uml-stay-rules';

/** The door code and Wi-Fi show only after the stay has opened them and this phone has read the rules. */
export function codesReady(input: { unlocked: boolean; acknowledged: boolean }): boolean {
  return input.unlocked && input.acknowledged;
}

function readStore(): Record<string, boolean> {
  try {
    if (typeof sessionStorage === 'undefined') return {};
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    const next: Record<string, boolean> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (value === true && key) next[key] = true;
    }
    return next;
  } catch {
    return {};
  }
}

export function loadRuleAck(token: string): boolean {
  if (!token) return false;
  return readStore()[token] === true;
}

export function saveRuleAck(token: string, acknowledged: boolean) {
  if (!token) return;
  try {
    const next = readStore();
    if (acknowledged) next[token] = true;
    else delete next[token];
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // The button still reveals the code for this visit.
  }
}
