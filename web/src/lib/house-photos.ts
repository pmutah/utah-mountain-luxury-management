import type { HouseId } from './luxury';

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
