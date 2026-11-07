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
    caption: 'Listing rendering · finish photos after the house is done',
  },
};
