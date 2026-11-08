import type { HouseId } from './luxury';

/** The caption that travels with the listing image. A rendering stays labeled. */
export function stayPhotoCaption(house: string | null | undefined): string {
  if (house !== 'river' && house !== 'ranch' && house !== 'lindon') return '';
  const caption = HOUSE_PHOTOS[house]?.caption?.trim() ?? '';
  if (!caption || caption.includes('$') || /door\s*code|wi-?fi|password/i.test(caption)) return '';
  return caption;
}

/** Official listing images we host ourselves. */
export const HOUSE_PHOTOS: Partial<Record<HouseId, { src: string; caption: string }>> = {
  ranch: {
    src: '/houses/ranch.jpg',
    caption: 'Listing photo',
  },
  lindon: {
    src: '/houses/lindon.jpg',
    caption: 'Listing photo',
  },
  river: {
    src: '/houses/river.jpg',
    /*
     * A guest reads this, so it says what the picture *is* rather than what the desk still has to do.
     * The old caption — "finish photos after the house is done" — was a note to the ops team, and it
     * reached a guest who had already paid: River has four confirmed stays, the first in December. A
     * paid guest reading that sentence reasonably wonders whether the house will be ready. The
     * rendering is still labeled plainly, which is the accuracy this line owes; it no longer carries
     * an internal to-do.
     */
    caption: 'Architectural rendering of the River House',
  },
};
