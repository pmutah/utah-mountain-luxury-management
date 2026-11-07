/**
 * A cleaner's room photo. The link is a credential with no login, so the rules are strict and they
 * live here rather than in the route: a photo is one of three image types, under a small cap, and a
 * turn holds only a few of them.
 */
import type { HouseId } from './market/types';

export const PHOTO_MAX_BYTES = 4 * 1024 * 1024;
export const PHOTOS_PER_TURN = 12;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TOKEN = /^[a-f0-9]{32}$/;

/** The types a phone camera actually produces. Anything else is refused. */
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'] as const;

export type PhotoMeta = {
  house: HouseId;
  checkout: string;
  /** Storage path in the bucket. Never a public URL. */
  path: string;
  contentType: string;
  bytes: number;
  uploadedAt: string;
};

/** What a cleaner's page sees for one stored photo. */
export type PhotoRow = { path: string; label: string; uploadedAt: string; url: string };

function isRealDay(value: string): boolean {
  if (!DATE.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (month! < 1 || month! > 12 || day! < 1 || day! > 31) return false;
  const check = new Date(Date.UTC(year!, month! - 1, day!));
  return check.getUTCFullYear() === year && check.getUTCMonth() === month! - 1 && check.getUTCDate() === day;
}

function isHouse(value: string): value is HouseId {
  return value === 'river' || value === 'ranch' || value === 'lindon';
}

/** The extension for a stored photo. A type we do not accept has no extension. */
export function photoExtension(contentType: string): string | null {
  if (contentType === 'image/jpeg') return 'jpg';
  if (contentType === 'image/png') return 'png';
  if (contentType === 'image/webp') return 'webp';
  return null;
}

/** Where a photo lives. The token is not in the path, so a leaked path says nothing about the link. */
export function photoStoragePath(house: HouseId, checkout: string, id: string, contentType: string): string | null {
  const ext = photoExtension(contentType);
  if (!ext) return null;
  if (!isHouse(house) || !isRealDay(checkout)) return null;
  if (!/^[a-zA-Z0-9_-]{6,64}$/.test(id)) return null;
  return `clean-photos/${house}/${checkout}/${id}.${ext}`;
}

export type PhotoCheck = { ok: true; contentType: string } | { ok: false; reason: string };

/**
 * Whether this upload is allowed. Size is checked on the decoded bytes, not on a header the caller
 * sends, so a caller cannot claim a small file and send a large one.
 */
export function checkPhoto(input: {
  contentType: unknown;
  bytes: number;
  alreadyStored: number;
}): PhotoCheck {
  if (typeof input.contentType !== 'string') return { ok: false, reason: 'A photo needs an image type.' };
  const type = input.contentType.trim().toLowerCase();
  if (!(ALLOWED as readonly string[]).includes(type)) {
    return { ok: false, reason: 'A photo has to be a JPEG, a PNG, or a WebP.' };
  }
  if (!Number.isFinite(input.bytes) || input.bytes <= 0) return { ok: false, reason: 'That file is empty.' };
  if (input.bytes > PHOTO_MAX_BYTES) {
    const mb = Math.round(PHOTO_MAX_BYTES / (1024 * 1024));
    return { ok: false, reason: `A photo has to be under ${mb} MB.` };
  }
  if (input.alreadyStored >= PHOTOS_PER_TURN) {
    return { ok: false, reason: `This turnover already has ${PHOTOS_PER_TURN} photos.` };
  }
  return { ok: true, contentType: type };
}

/** A file name for the cleaner to see. It carries no guest name and no house code. */
export function photoLabel(meta: PhotoMeta): string {
  const when = new Date(meta.uploadedAt);
  const time = Number.isNaN(when.getTime())
    ? ''
    : when.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Denver' });
  return time ? `Photo at ${time}` : 'Photo';
}

/** How many more a turn can take. */
export function photosLeft(stored: number): number {
  return Math.max(0, PHOTOS_PER_TURN - stored);
}

/** A line for the desk. It does not say the house is ready. */
export function photoLine(stored: number): string {
  if (stored === 0) return 'No room photo on this turn yet.';
  const count = stored === 1 ? '1 room photo' : `${stored} room photos`;
  return `${count} on this turn.`;
}

/** A stored photo a guest or cleaner may read. The path has to be one we would have written. */
export function isCleanPhotoPath(path: string): boolean {
  if (!path.startsWith('clean-photos/')) return false;
  const parts = path.split('/');
  if (parts.length !== 4) return false;
  const [, house, checkout, file] = parts;
  return isHouse(house ?? '') && isRealDay(checkout ?? '') && /^[a-zA-Z0-9_-]{6,64}\.(jpg|png|webp)$/.test(file ?? '');
}

/** A link token shape, so the route can refuse a bad path before touching storage. */
export function isLinkToken(value: string): boolean {
  return TOKEN.test(value);
}
