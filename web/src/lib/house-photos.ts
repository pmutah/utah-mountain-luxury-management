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

/**
 * More photos for a house, when the owner supplies them.
 *
 * The house page drew a single image because that is what `HOUSE_PHOTOS` holds, and one photo is most of why a direct booking page
 * reads as thinner than an Airbnb listing. This is the list the gallery uses: the cover above first, then these. Adding a photo is
 * dropping a file in `public/houses/` and naming it here — no component change.
 *
 * Empty today for every house: the owner has not sent the interior sets, and this file will not invent a gallery out of the one
 * image that exists. A house with one photo renders the one, without a gallery control that leads nowhere.
 */
export const HOUSE_GALLERY: Partial<Record<HouseId, Array<{ src: string; caption: string }>>> = {
  ranch: [],
  lindon: [],
  river: [],
};

/**
 * Every photo for a house, cover first, with no duplicates.
 *
 * The cover is included because a gallery that omits the image already on the page looks broken when it opens. A house with the
 * three placeholder paths the repo already carries for `ranch` returns one entry, not a repeated one.
 */
export function houseGallery(house: HouseId): Array<{ src: string; caption: string }> {
  const cover = HOUSE_PHOTOS[house];
  const extras = HOUSE_GALLERY[house] ?? [];
  const seen = new Set<string>();
  const out: Array<{ src: string; caption: string }> = [];
  for (const photo of [cover, ...extras]) {
    if (!photo || !photo.src || seen.has(photo.src)) continue;
    seen.add(photo.src);
    out.push(photo);
  }
  return out;
}

/** Whether a house has enough photos for a gallery rather than a single image. */
export function hasGallery(house: HouseId): boolean {
  return houseGallery(house).length > 1;
}
