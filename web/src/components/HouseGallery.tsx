import { useState } from 'react';
import { houseGallery } from '../lib/house-photos';
import type { HouseId } from '../lib/market/types';

/**
 * The house photos, one at a time, with the ones after the cover behind a control.
 *
 * A single photo renders exactly as it did before — no dots, no arrows, no button that leads nowhere. The gallery appears only when
 * `HOUSE_GALLERY` actually holds more than the cover, so this changes nothing for a house whose interior shots have not arrived and
 * starts working the moment they do.
 *
 * The caption travels with the photo because the River House cover is an **architectural rendering**, and a guest deciding whether
 * to pay a deposit is entitled to know that. Hiding the label for a prettier page is the one thing this must not do.
 */
export function HouseGallery({ house }: { house: HouseId }) {
  const photos = houseGallery(house);
  const [index, setIndex] = useState(0);
  if (photos.length === 0) return null;
  const current = photos[Math.min(index, photos.length - 1)]!;
  const many = photos.length > 1;
  return (
    <figure className="overflow-hidden rounded-3xl" data-bot="house-gallery" data-count={photos.length}>
      <img
        src={current.src}
        alt={current.caption || 'The house'}
        className="h-72 w-full object-cover sm:h-96"
        data-bot="house-photo"
        loading="eager"
      />
      <figcaption className="flex flex-wrap items-baseline justify-between gap-2 px-1 pt-3 text-xs text-[var(--uml-muted)]">
        <span data-bot="house-photo-caption">{current.caption}</span>
        {many && (
          <span className="flex items-center gap-1">
            <button
              type="button"
              data-bot="house-photo-prev"
              aria-label="Previous photo"
              onClick={() => setIndex((at) => (at - 1 + photos.length) % photos.length)}
              className="rounded-full border border-[var(--uml-line)] px-2 py-0.5"
            >
              ‹
            </button>
            <span data-bot="house-photo-count">
              {index + 1} of {photos.length}
            </span>
            <button
              type="button"
              data-bot="house-photo-next"
              aria-label="Next photo"
              onClick={() => setIndex((at) => (at + 1) % photos.length)}
              className="rounded-full border border-[var(--uml-line)] px-2 py-0.5"
            >
              ›
            </button>
          </span>
        )}
      </figcaption>
      {many && (
        <ul className="mt-2 flex gap-2 overflow-x-auto px-1 pb-1" data-bot="house-photo-strip">
          {photos.map((photo, at) => (
            <li key={photo.src}>
              <button
                type="button"
                onClick={() => setIndex(at)}
                aria-current={at === index ? 'true' : undefined}
                aria-label={`Photo ${at + 1}`}
                data-bot="house-photo-thumb"
                className="block overflow-hidden rounded-xl border border-[var(--uml-line)] aria-[current=true]:border-[#d4b56a]"
              >
                <img src={photo.src} alt="" className="h-16 w-24 object-cover" loading="lazy" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </figure>
  );
}
