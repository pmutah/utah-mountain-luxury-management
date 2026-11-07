import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PHOTOS_PER_TURN,
  PHOTO_MAX_BYTES,
  checkPhoto,
  isCleanPhotoPath,
  isLinkToken,
  photoExtension,
  photoLabel,
  photoLine,
  photoStoragePath,
  photosLeft,
} from './clean-photos.ts';

test('only the three camera types get an extension', () => {
  assert.equal(photoExtension('image/jpeg'), 'jpg');
  assert.equal(photoExtension('image/png'), 'png');
  assert.equal(photoExtension('image/webp'), 'webp');
  assert.equal(photoExtension('image/gif'), null);
  assert.equal(photoExtension('application/pdf'), null);
  assert.equal(photoExtension(''), null);
});

test('a storage path is built only for a real house and day', () => {
  assert.equal(photoStoragePath('river', '2026-11-14', 'abc123', 'image/jpeg'), 'clean-photos/river/2026-11-14/abc123.jpg');
  assert.equal(photoStoragePath('river', '2026-13-01', 'abc123', 'image/jpeg'), null);
  assert.equal(photoStoragePath('river', 'not-a-day', 'abc123', 'image/jpeg'), null);
  assert.equal(photoStoragePath('denver' as never, '2026-11-14', 'abc123', 'image/jpeg'), null);
  assert.equal(photoStoragePath('river', '2026-11-14', 'abc123', 'image/gif'), null);
  assert.equal(photoStoragePath('river', '2026-11-14', '../etc', 'image/jpeg'), null);
});

test('an upload is refused for a bad type, an empty file, or an oversized one', () => {
  assert.equal(checkPhoto({ contentType: 'image/gif', bytes: 1000, alreadyStored: 0 }).ok, false);
  assert.equal(checkPhoto({ contentType: 42, bytes: 1000, alreadyStored: 0 }).ok, false);
  assert.equal(checkPhoto({ contentType: 'image/jpeg', bytes: 0, alreadyStored: 0 }).ok, false);
  assert.equal(checkPhoto({ contentType: 'image/jpeg', bytes: PHOTO_MAX_BYTES + 1, alreadyStored: 0 }).ok, false);
  assert.equal(checkPhoto({ contentType: 'image/jpeg', bytes: PHOTO_MAX_BYTES, alreadyStored: 0 }).ok, true);
  assert.equal(checkPhoto({ contentType: 'IMAGE/JPEG', bytes: 900, alreadyStored: 0 }).ok, true);
});

test('a turn holds a bounded number of photos', () => {
  assert.equal(checkPhoto({ contentType: 'image/jpeg', bytes: 900, alreadyStored: PHOTOS_PER_TURN }).ok, false);
  assert.equal(photosLeft(0), PHOTOS_PER_TURN);
  assert.equal(photosLeft(PHOTOS_PER_TURN - 1), 1);
  assert.equal(photosLeft(PHOTOS_PER_TURN), 0);
  assert.equal(photosLeft(999), 0);
});

test('a readable path is one we would have written', () => {
  assert.equal(isCleanPhotoPath('clean-photos/river/2026-11-14/abc123.jpg'), true);
  assert.equal(isCleanPhotoPath('clean-photos/river/2026-11-14/abc123.gif'), false);
  assert.equal(isCleanPhotoPath('clean-photos/river/2026-13-01/abc123.jpg'), false);
  assert.equal(isCleanPhotoPath('receipts/river/2026-11-14/abc123.jpg'), false);
  assert.equal(isCleanPhotoPath('clean-photos/river/abc123.jpg'), false);
  assert.equal(isCleanPhotoPath('clean-photos/../../etc/passwd'), false);
  assert.equal(isCleanPhotoPath(''), false);
});

test('a photo line does not claim the house is ready', () => {
  assert.match(photoLine(0), /No room photo/);
  assert.match(photoLine(1), /1 room photo on this turn/);
  assert.match(photoLine(4), /4 room photos on this turn/);
  assert.equal(/ready|cleaned|approved|done/i.test(photoLine(4)), false);
});

test('a photo label carries a time and no name', () => {
  const label = photoLabel({
    house: 'river',
    checkout: '2026-11-14',
    path: 'clean-photos/river/2026-11-14/abc123.jpg',
    contentType: 'image/jpeg',
    bytes: 1000,
    uploadedAt: '2026-11-14T22:30:00.000Z',
  });
  assert.match(label, /^Photo at /);
  assert.equal(/Ada|Lovelace/.test(label), false);
  assert.match(photoLabel({ house: 'river', checkout: '2026-11-14', path: 'p', contentType: 'image/jpeg', bytes: 1, uploadedAt: 'not-a-date' }), /Photo$/);
});

test('a link token is 32 hex characters', () => {
  assert.equal(isLinkToken('a'.repeat(32)), true);
  assert.equal(isLinkToken('a'.repeat(31)), false);
  assert.equal(isLinkToken('Z'.repeat(32)), false);
});
