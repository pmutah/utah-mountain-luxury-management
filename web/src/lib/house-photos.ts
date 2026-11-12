import type { HouseId } from './luxury';

/** The caption that travels with the listing image. A rendering stays labeled. */
export function stayPhotoCaption(house: string | null | undefined): string {
  if (house !== 'river' && house !== 'ranch' && house !== 'lindon') return '';
  const caption = HOUSE_PHOTOS[house]?.caption?.trim() ?? '';
  if (!caption || caption.includes('$') || /door\s*code|wi-?fi|password/i.test(caption)) return '';
  return caption;
}

/**
 * The cover image, and the one every other surface already reads.
 *
 * These three files are the OpenGraph `og:image` targets, the dashboard postcards, and the sitemap images.
 * The gallery below is separate on purpose: adding a photo to a house must never change what a shared link
 * previews, because a preview that silently changes is one nobody can reason about.
 */
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

/** Which room a photo shows, so the gallery can offer filters instead of one long scroll. */
export type PhotoRoom = 'exterior' | 'living' | 'kitchen' | 'bedrooms' | 'baths' | 'amenities' | 'outdoors';

export type GalleryPhoto = {
  src: string;
  caption: string;
  room: PhotoRoom;
};

const ROOM_LABEL: Record<PhotoRoom, string> = {
  exterior: 'Exterior',
  living: 'Living',
  kitchen: 'Kitchen',
  bedrooms: 'Bedrooms',
  baths: 'Baths',
  amenities: 'Amenities',
  outdoors: 'Outdoors',
};

/** The filter label for a room. An unknown value is left out rather than shown as a blank chip. */
export function photoRoomLabel(room: PhotoRoom): string {
  return ROOM_LABEL[room] ?? '';
}

/**
 * Every photo for a house, cover first.
 *
 * The files are real listing photographs, downloaded once by `scripts/harvest-house-photos.mjs` and chosen
 * by `scripts/curate-house-photos.mjs`; each house's `manifest.json` next to the images records the listing
 * each came from. Nothing here hotlinks a channel CDN, so the page does not break when a listing is edited
 * and no channel learns who is browsing our site.
 *
 * The leading word of each file name is its room, so the filter and the file cannot disagree.
 */
const GALLERY: Record<HouseId, GalleryPhoto[]> = {
  ranch: [
    { file: 'outdoors-01', caption: 'Hot tub under the pergola at night' },
    { file: 'outdoors-02', caption: 'The lit hot tub and fire pit after dark' },
    { file: 'living-01', caption: 'Living room with a brick fireplace and leather seating' },
    { file: 'living-02', caption: 'Leather sectional against the reclaimed-wood wall' },
    { file: 'kitchen-01', caption: 'The kitchen, open to the dining room' },
    { file: 'kitchen-02', caption: 'Kitchen with stainless appliances and a wide island' },
    { file: 'kitchen-03', caption: 'Dining for a full house under the round chandelier' },
    { file: 'bedrooms-01', caption: 'Bright bedroom with a king bed' },
    { file: 'bedrooms-02', caption: 'King bedroom with three bird prints' },
    { file: 'bedrooms-03', caption: 'King bedroom with blue walls and white wainscoting' },
    { file: 'bedrooms-04', caption: 'King bedroom with a mountain mural' },
    { file: 'bedrooms-05', caption: 'Bunk room with two twin bunks' },
    { file: 'bedrooms-06', caption: 'Bedroom with two twin beds' },
    { file: 'bedrooms-07', caption: 'Bunk beds and twins in the second bunk room' },
    { file: 'amenities-01', caption: 'Pool table in the game room' },
    { file: 'amenities-02', caption: 'Theater seating and a bar' },
    { file: 'amenities-03', caption: 'Stand-up arcade' },
    { file: 'amenities-04', caption: 'The arcade and the bar' },
    { file: 'outdoors-03', caption: 'The fenced yard, garden beds, and pergola' },
    { file: 'outdoors-04', caption: 'Fire pit seating on the patio' },
  ].map(withRoom('ranch')),
  lindon: [
    { file: 'living-01', caption: 'Living room with a floor-to-ceiling stone fireplace' },
    { file: 'living-02', caption: 'Sectional seating for the whole family' },
    { file: 'living-03', caption: 'The living room opens to the kitchen' },
    { file: 'kitchen-01', caption: 'Kitchen with white counters and gray cabinets' },
    { file: 'kitchen-02', caption: 'Dining table for six' },
    { file: 'bedrooms-01', caption: 'Bedroom with a wall-mounted air conditioner' },
    { file: 'baths-01', caption: 'Bath with a double vanity' },
    { file: 'exterior-01', caption: 'Brick entry and covered front porch' },
    { file: 'outdoors-01', caption: 'Private balcony with bistro seating' },
    { file: 'outdoors-02', caption: 'The Lindon Aquatics Center across the street' },
    { file: 'outdoors-03', caption: 'Utah Lake is minutes away' },
  ].map(withRoom('lindon')),
  river: [
    { file: 'exterior-01', caption: 'Architectural rendering of the front of the house' },
    { file: 'exterior-02', caption: 'Architectural rendering of the drive and garage' },
    { file: 'kitchen-01', caption: 'Architectural rendering of the kitchen and island' },
    { file: 'amenities-01', caption: 'Architectural rendering of the heated game garage' },
    { file: 'outdoors-01', caption: 'Barrel sauna and hot tub' },
    { file: 'exterior-03', caption: 'The house from across the Provo River' },
    { file: 'outdoors-02', caption: 'The footbridge over the Provo River' },
    { file: 'outdoors-03', caption: 'Fall color along the river' },
  ].map(withRoom('river')),
};

/** Turn a `{ file, caption }` row into a photo, taking the room from the file name so the two cannot drift. */
function withRoom(house: HouseId) {
  return (row: { file: string; caption: string }): GalleryPhoto => ({
    src: `/houses/${house}/${row.file}.jpg`,
    caption: row.caption,
    room: (/^([a-z]+)-/.exec(row.file)?.[1] ?? 'exterior') as PhotoRoom,
  });
}

/**
 * A house's photos, lead photo first.
 *
 * The cover in `HOUSE_PHOTOS` is the OpenGraph and dashboard image, so it must keep existing — but it is not
 * necessarily the best picture to open a gallery with. When the house has a real photo set, the strongest
 * harvested shot leads and the cover moves to the end; that way a card or a mosaic opens on "hot tub under the
 * pergola at night" instead of a file labeled "Listing photo".
 *
 * The cover is still included, because a gallery that omits the image already on the page looks broken when it
 * opens, and on a house with no photographs it is the only picture there is.
 */
export function houseGallery(house: HouseId): GalleryPhoto[] {
  const cover = HOUSE_PHOTOS[house];
  const listed = GALLERY[house] ?? [];
  const out: GalleryPhoto[] = [];
  const seen = new Set<string>();
  for (const photo of listed) {
    if (seen.has(photo.src)) continue;
    seen.add(photo.src);
    out.push(photo);
  }
  if (cover?.src && !seen.has(cover.src)) {
    out.push({ src: cover.src, caption: cover.caption, room: 'exterior' });
  }
  return out;
}

/** Whether a house has more than the single cover, so a gallery control leads somewhere. */
export function hasGallery(house: HouseId): boolean {
  return houseGallery(house).length > 1;
}

/** The rooms this house actually shows, in a fixed order, for the filter chips. */
export function photoRooms(house: HouseId): Array<{ room: PhotoRoom; label: string; count: number }> {
  const photos = houseGallery(house);
  const order: PhotoRoom[] = ['exterior', 'living', 'kitchen', 'bedrooms', 'baths', 'amenities', 'outdoors'];
  return order
    .map((room) => ({ room, label: ROOM_LABEL[room], count: photos.filter((photo) => photo.room === room).length }))
    .filter((row) => row.count > 0);
}

/** The photos in one room. An unknown room returns the whole gallery rather than an empty page. */
export function photosInRoom(house: HouseId, room: PhotoRoom | 'all'): GalleryPhoto[] {
  const photos = houseGallery(house);
  if (room === 'all') return photos;
  const subset = photos.filter((photo) => photo.room === room);
  return subset.length > 0 ? subset : photos;
}

/**
 * A published floor plan, for a house that has one.
 *
 * Only River publishes drawings today. They are the owner's own plans, so they are shown as drawings and
 * never presented as photographs of a finished room.
 */
export type FloorPlan = { src: string; title: string };

const FLOORPLANS: Partial<Record<HouseId, FloorPlan[]>> = {
  river: [
    { src: '/houses/river/floorplan-main.jpg', title: 'Main level' },
    { src: '/houses/river/floorplan-upper.jpg', title: 'Upper level' },
  ],
};

/** Floor plans for a house. Empty means the page shows no plan tab at all. */
export function houseFloorPlans(house: HouseId): FloorPlan[] {
  return FLOORPLANS[house] ?? [];
}

/**
 * A video tour, when the owner supplies one.
 *
 * Empty on purpose. No walkthrough video exists for any house yet, and a tab that opens onto nothing is
 * worse than no tab. Adding one here is the whole mechanism: the page renders the player as soon as this
 * has an entry, whether it is a hosted file or a YouTube or Vimeo link.
 */
export type HouseVideo = { title: string; url: string; poster?: string };

const VIDEOS: Partial<Record<HouseId, HouseVideo[]>> = {};

/** Video tours for a house. Empty means no watch control is drawn. */
export function houseVideos(house: HouseId): HouseVideo[] {
  return VIDEOS[house] ?? [];
}

/** A direct video file plays in a `<video>`; anything else is treated as an embeddable page. */
export function isDirectVideo(url: string): boolean {
  return /\.(mp4|webm|mov)(\?|$)/i.test(url);
}
