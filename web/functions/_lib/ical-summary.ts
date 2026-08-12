/** Parse Hospitable / OTA titles from iCal SUMMARY / DESCRIPTION fields. */
export function channelFromText(text?: string): string | undefined {
  if (!text) return undefined;
  if (/airbnb/i.test(text)) return 'Airbnb';
  if (/vrbo|homeaway/i.test(text)) return 'VRBO';
  if (/booking\.com/i.test(text)) return 'Booking.com';
  return undefined;
}

export function parseIcalSummary(
  summary?: string,
  description?: string,
): {
  guestName: string;
  source: string;
  blocked: boolean;
} {
  const raw = (summary ?? 'Guest').trim();
  const blocked = /\b(blocked|unavailable|not available|owner block)\b/i.test(raw);

  const source =
    channelFromText(raw) ?? channelFromText(description) ?? 'Hospitable';

  let guestName = raw
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\b(reserved|booking|blocked|unavailable)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!guestName || /^guest$/i.test(guestName)) {
    guestName = blocked ? 'Blocked' : 'Guest';
  }

  return { guestName, source, blocked };
}

export function resolveIcalSource(
  summary?: string,
  description?: string,
  existing?: string,
  seedSource?: string,
): string {
  const fromText = channelFromText(summary) ?? channelFromText(description);
  if (fromText) return fromText;
  if (existing && existing !== 'Hospitable') return existing;
  if (seedSource && seedSource !== 'Hospitable') return seedSource;
  return existing || seedSource || 'Hospitable';
}
