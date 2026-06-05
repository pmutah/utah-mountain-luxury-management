/** Parse Hospitable / OTA titles from iCal SUMMARY fields. */
export function parseIcalSummary(summary?: string): {
  guestName: string;
  source: string;
  blocked: boolean;
} {
  const raw = (summary ?? 'Guest').trim();
  const blocked = /\b(blocked|unavailable|not available|owner block)\b/i.test(raw);

  let source = 'Hospitable';
  if (/airbnb/i.test(raw)) source = 'Airbnb';
  else if (/vrbo|homeaway/i.test(raw)) source = 'VRBO';
  else if (/booking\.com/i.test(raw)) source = 'Booking.com';

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
