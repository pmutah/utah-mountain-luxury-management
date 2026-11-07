import { denverToday } from '../src/lib/market/dates';
import { sendableLine, sendableToday } from '../src/lib/stay-message-send';
import type { HouseId } from '../src/lib/market/types';

/**
 * Local preview only. The deployed route reads the real stay behind the token. This serves a stay
 * checking in today, so the arrival and confirmation messages are both ready, and remembers what this
 * preview sent so a second send is refused exactly as the real one would.
 */
const sent: Record<string, string[]> = {};

/** A stay checking in today, so the arrival and confirmation messages are both ready in the preview. */
function previewStay(): { house: HouseId; checkIn: string; checkOut: string } {
  const today = denverToday();
  const out = new Date(`${today}T00:00:00Z`);
  out.setUTCDate(out.getUTCDate() + 2);
  return { house: 'river', checkIn: today, checkOut: out.toISOString().slice(0, 10) };
}

export function devStayMessages(token: string) {
  const stay = previewStay();
  const already = sent[token] ?? [];
  // The preview shows a house with the guest app on, so every sendable message is visible.
  const ready = sendableToday({ ...stay, asOf: denverToday(), alreadySent: already, guestAppOn: true });
  return {
    ready: ready.map((message) => ({ id: message.id, when: message.when, subject: message.subject })),
    line: sendableLine(ready, already),
    sent: already.map((id) => ({ id, at: new Date().toISOString(), to: 'preview@example.com' })),
    guestAppOn: true,
    storageReads: 'ok' as const,
    source: 'dev-preview' as const,
  };
}

export function devSendStayMessage(token: string, id: string, to: string) {
  if (!to.includes('@')) return { status: 400 as const, error: 'Add the guest email first.' };
  const stay = previewStay();
  const already = sent[token] ?? [];
  const ready = sendableToday({ ...stay, asOf: denverToday(), alreadySent: already, guestAppOn: true });
  const message = ready.find((row) => row.id === id);
  if (!message) {
    return {
      status: 409 as const,
      refused: true,
      error: 'That message is not right for today, or it has already gone.',
    };
  }
  sent[token] = [...already, id];
  return {
    status: 200 as const,
    ok: true,
    id,
    subject: message.subject,
    to,
    line: `Sent "${message.subject}" to the guest. Nothing else was sent. (Preview: no real email went out.)`,
  };
}
