const STORAGE_KEY = 'uml-stay-rules';

/** The door code and Wi-Fi show only after the stay has opened them, this phone has read the rules, and each agreement topic is open. */
export function codesReady(input: { unlocked: boolean; acknowledged: boolean; agreementRead?: boolean }): boolean {
  if (input.agreementRead === false) return false;
  return input.unlocked && input.acknowledged;
}

export type StayAccessSecrets = {
  wifiName: string | null;
  wifiPassword: string | null;
  doorCode: string | null;
  doorNotes: string | null;
};

/** Secrets for the stay phone. The first load leaves them off. A ready phone is one that already opened the rules. */
export function stayAccessSecrets(input: {
  unlocked: boolean;
  ready: boolean;
  wifiName: string;
  wifiPassword: string;
  doorCode: string;
  doorNotes: string;
}): StayAccessSecrets {
  const hidden: StayAccessSecrets = { wifiName: null, wifiPassword: null, doorCode: null, doorNotes: null };
  if (!input.unlocked || !input.ready) return hidden;
  const text = (value: string) => {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  };
  return {
    wifiName: text(input.wifiName),
    wifiPassword: text(input.wifiPassword),
    doorCode: text(input.doorCode),
    doorNotes: text(input.doorNotes),
  };
}

/** What Nora is allowed to know. The code and the password stay on the phone. */
export function conciergeAccessLine(opensOn: string, has?: { doorCode?: boolean; wifi?: boolean }): string {
  const when = /^\d{4}-\d{2}-\d{2}$/.test(opensOn) ? opensOn : 'the day before check-in';
  /*
   * Say what the house actually holds.
   *
   * This used to tell Nora, unconditionally, that "the door code and Wi-Fi ... appear on {date} after the house rules
   * are read". Only the River House has a Wi-Fi password; Ranch and Lindon have none stored. So a Lindon guest asked
   * for it and was told to read the house rules and open every agreement topic — a promise that would not be kept,
   * sending them through a checklist to find an empty field.
   *
   * When a fact is missing, the honest answer is that it is not in the guide and a person can help. That is a real
   * answer; "go look" is not.
   */
  const door = has?.doorCode !== false;
  const wifi = has?.wifi !== false;
  const parts: string[] = [];
  if (door && wifi) {
    parts.push(
      `The door code and Wi-Fi stay on the guest phone. They are not in this chat. They appear on ${when} after the house rules are read and each stay-agreement topic is opened. If they ask, say that. Do not invent a code. Do not repeat a code.`,
    );
  } else if (door) {
    parts.push(
      `The door code stays on the guest phone and is not in this chat; it appears on ${when} after the house rules are read and each stay-agreement topic is opened. Do not invent or repeat a code.`,
    );
    parts.push(
      'This house has no Wi-Fi name or password saved in its guide. If the guest asks, say the guide does not hold it and offer to have it sent — do not tell them to go looking, and never invent one.',
    );
  } else if (wifi) {
    parts.push(
      `The Wi-Fi details stay on the guest phone and appear on ${when} after the house rules are read. Do not repeat a password.`,
    );
    parts.push('This house has no door code saved in its guide. If the guest asks, say a person will confirm it.');
  } else {
    parts.push(
      'Neither a door code nor Wi-Fi details are saved in this house guide. If the guest asks for either, say the guide does not hold them and a person will help — never invent one.',
    );
  }
  const line = parts.join(' ');
  if (/code\s*\d/.test(line) || line.includes('$')) {
    return 'The door code and Wi-Fi stay on the guest phone. Do not invent a code. Do not repeat a code.';
  }
  return line;
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
