import assert from 'node:assert/strict';
import test from 'node:test';
import { stayPhotoCaption, HOUSE_PHOTOS } from './house-photos.ts';
import { houseCardFacts, companionStayFacts } from './house-page.ts';
import { bookingGuide } from './booking-guide.ts';
import { tripSheet } from './stay-sheet.ts';

/*
 * A guest reads these strings. River's photo caption used to be "Listing rendering · finish photos after
 * the house is done" — a note to the ops team that reached a paying guest. River has four confirmed stays,
 * the first in December, so that sentence told someone who had already booked that the house might not be
 * ready. The rendering is still labeled; what it must never carry is our to-do list.
 */

/** Copy that belongs to the desk, never to a guest. */
const INTERNAL = /\b(todo|tbd|fixme|finish|after the house is done|placeholder|lorem|coming soon|not done|in progress)\b/i;

test('no guest-facing photo caption carries an internal build note', () => {
  for (const house of ['river', 'ranch', 'lindon'] as const) {
    const caption = stayPhotoCaption(house);
    assert.equal(INTERNAL.test(caption), false, `${house} caption leaks desk copy: "${caption}"`);
  }
});

test('the River rendering is still labeled as a rendering', () => {
  // This is the accuracy the line owes: it is not a photograph of the finished house.
  assert.match(stayPhotoCaption('river'), /rendering/i);
  assert.match(HOUSE_PHOTOS.river?.caption ?? '', /rendering/i);
  assert.equal(stayPhotoCaption('ranch'), 'Listing photo');
});

test('the caption reaches a guest only through surfaces that also keep prices and codes off', () => {
  const sheet = tripSheet({
    house: 'River House',
    houseId: 'river',
    checkIn: '2026-12-10',
    checkOut: '2026-12-13',
    checkInTime: '4:00 PM',
    checkOutTime: '11:00 AM',
  });
  for (const surface of [
    houseCardFacts('river').join('\n'),
    companionStayFacts('river').join('\n'),
    bookingGuide('river', '2026-12-10', '2026-12-13').facts.join('\n'),
    sheet.photo,
  ]) {
    assert.match(surface, /rendering/i, 'the rendering label must survive on this surface');
    assert.equal(INTERNAL.test(surface), false, 'desk copy reached a guest surface');
    assert.equal(surface.includes('$'), false, 'a price reached a guest surface');
  }
});
