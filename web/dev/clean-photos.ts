import type { PhotoRow } from '../src/lib/clean-photos';

/**
 * Local preview only. The deployed routes upload to Firebase Storage; this fixture keeps the photos
 * in memory so the cleaner page and its upload control can be checked in a dev browser.
 */
const stored = new Map<string, PhotoRow[]>();

function key(house: string, checkout: string) {
  return `${house}:${checkout}`;
}

export function devCleanPhotos(house: string | null, checkout: string | null) {
  const rows = stored.get(key(house ?? '', checkout ?? '')) ?? [];
  return {
    photos: rows,
    line: rows.length === 0 ? 'No room photo on this turn yet.' : `${rows.length} on this turn.`,
    storageConfigured: true,
    storageReads: 'ok' as const,
    source: 'dev-preview' as const,
  };
}

export function devUploadCleanPhoto(body: { house?: string; checkout?: string; contentType?: string; base64?: string }) {
  const house = body.house ?? '';
  const checkout = body.checkout ?? '';
  const type = (body.contentType ?? '').toLowerCase();
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(type)) {
    return { status: 400 as const, error: 'A photo has to be a JPEG, a PNG, or a WebP.' };
  }
  const bytes = body.base64 ? Math.floor((body.base64.length * 3) / 4) : 0;
  if (bytes > 4 * 1024 * 1024) return { status: 400 as const, error: 'A photo has to be under 4 MB.' };
  const path = `clean-photos/${house}/${checkout}/preview${(stored.get(key(house, checkout)) ?? []).length + 1}.jpg`;
  const rows = stored.get(key(house, checkout)) ?? [];
  rows.push({
    path,
    label: `Photo at ${new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`,
    uploadedAt: new Date().toISOString(),
    url: '/favicon.svg',
  });
  stored.set(key(house, checkout), rows);
  return { status: 201 as const, ok: true, path, url: '/favicon.svg', line: `${rows.length} on this turn.` };
}

export function devDeleteCleanPhoto(house: string | null, checkout: string | null, path: string | null) {
  const rows = (stored.get(key(house ?? '', checkout ?? '')) ?? []).filter((row) => row.path !== path);
  stored.set(key(house ?? '', checkout ?? ''), rows);
  return { ok: true };
}

/** The desk's view: every photo the fixture holds, keyed the same way the real route keys it. */
export function devCleanPhotoTurns() {
  const turns: Record<string, Array<{ path: string; label: string; url: string }>> = {};
  const counts: Record<string, string> = {};
  for (const [turnKey, rows] of stored.entries()) {
    turns[turnKey] = rows.map((row) => ({ path: row.path, label: row.label, url: row.url }));
    counts[turnKey] = rows.length === 1 ? '1 room photo on this turn.' : `${rows.length} room photos on this turn.`;
  }
  for (const turnKey of ['river:2026-11-14', 'ranch:2026-11-16', 'lindon:2026-11-19']) {
    if (!turns[turnKey]) {
      turns[turnKey] = [];
      counts[turnKey] = 'No room photo on this turn yet.';
    }
  }
  return { turns, counts, storageReads: 'ok' as const, source: 'dev-preview' as const };
}
