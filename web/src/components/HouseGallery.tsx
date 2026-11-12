import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Film, Grid, Pause, Play } from 'lucide-react';
import {
  houseFloorPlans,
  houseGallery,
  houseVideos,
  isDirectVideo,
  photoRoomLabel,
  photoRooms,
  photosInRoom,
  photoSrcSet,
  type GalleryPhoto,
  type PhotoRoom,
} from '../lib/house-photos';
import type { HouseId } from '../lib/market/types';

/**
 * The house photos: a five-photo mosaic, a full-screen gallery with slide, grid, and ambient cinema-reel modes,
 * plus architectural floor plans and video tours when a house has them.
 *
 * Every photo is labeled. The River House cover is an architectural rendering and says so; hiding that for a
 * prettier page is the one thing this must not do.
 */
export function HouseGallery({ house, dense = false }: { house: HouseId; dense?: boolean }) {
  const photos = houseGallery(house);
  const rooms = useMemo(() => photoRooms(house), [house]);
  const plans = houseFloorPlans(house);
  const videos = houseVideos(house);
  const [open, setOpen] = useState(false);
  const [room, setRoom] = useState<PhotoRoom | 'all'>('all');
  const [index, setIndex] = useState(0);
  const [plan, setPlan] = useState<number | null>(null);
  const [reel, setReel] = useState(false);
  const [gridView, setGridView] = useState(false);
  const [videoOpen, setVideoOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  const shown = useMemo(() => photosInRoom(house, room), [house, room]);
  const lead = photos[0];

  useEffect(() => {
    setRoom('all');
    setIndex(0);
    setPlan(null);
    setReel(false);
    setGridView(false);
    setVideoOpen(false);
  }, [house]);

  const close = useCallback(() => {
    setOpen(false);
    setPlan(null);
    setReel(false);
    setGridView(false);
    setVideoOpen(false);
  }, []);

  /*
   * Escape closes, Space toggles the cinema reel, and the arrows walk the set.
   */
  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') close();
      if (plan !== null || videoOpen) return;
      if (event.key === ' ') {
        event.preventDefault();
        setGridView(false);
        setReel((playing) => !playing);
        return;
      }
      if (event.key === 'ArrowRight') {
        setGridView(false);
        setIndex((at) => (at + 1) % Math.max(1, shown.length));
      }
      if (event.key === 'ArrowLeft') {
        setGridView(false);
        setIndex((at) => (at - 1 + shown.length) % Math.max(1, shown.length));
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, plan, videoOpen, shown.length, close]);

  // Ambient cinema-reel auto-advance (5 seconds per frame).
  useEffect(() => {
    if (!open || !reel || plan !== null || gridView || videoOpen || shown.length <= 1) return;
    const timer = window.setTimeout(() => {
      setIndex((at) => (at + 1) % shown.length);
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [open, reel, plan, gridView, videoOpen, index, shown.length]);

  // The neighbours load while this photo is on screen, so the next arrow press does not wait on the network.
  useEffect(() => {
    if (!open || shown.length <= 1) return;
    for (const step of [1, -1]) {
      const next = shown[(index + step + shown.length) % shown.length];
      if (next) new Image().src = next.src;
    }
  }, [open, index, shown]);

  // The body must not scroll behind a full-screen gallery.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  if (!lead) return null;

  function openAt(photo: GalleryPhoto) {
    const at = shown.findIndex((row) => row.src === photo.src);
    setPlan(null);
    setVideoOpen(false);
    setGridView(false);
    setReel(false);
    setIndex(at >= 0 ? at : 0);
    setOpen(true);
  }

  const current = shown[Math.min(index, Math.max(0, shown.length - 1))];

  return (
    <div data-bot="house-gallery" data-count={photos.length} data-house={house}>
      {/* The mosaic. Five on a desktop, one swipeable image on a phone. */}
      <div className="grid gap-2 sm:grid-cols-4 sm:grid-rows-2">
        <button
          type="button"
          onClick={() => openAt(lead)}
          className="group relative overflow-hidden rounded-2xl sm:col-span-2 sm:row-span-2"
          data-bot="house-photo"
          aria-label={`Open the gallery. ${photos.length} photos.`}
        >
          <img
            src={lead.src}
            {...photoSrcSet(lead.src, '(min-width: 640px) 50vw, 100vw')}
            alt={lead.caption || 'The house'}
            className={`w-full object-cover transition duration-500 group-hover:scale-[1.02] ${dense ? 'h-64' : 'h-72 sm:h-full'}`}
            loading="eager"
            fetchPriority="high"
            decoding="async"
          />
          <PhotoLabel caption={lead.caption} />
        </button>
        {photos.slice(1, 5).map((photo) => (
          <button
            key={photo.src}
            type="button"
            onClick={() => openAt(photo)}
            className="group relative hidden overflow-hidden rounded-2xl sm:block"
            data-bot="house-photo-thumb"
          >
            <img
              src={photo.src}
              {...photoSrcSet(photo.src, '25vw')}
              alt={photo.caption || 'The house'}
              className="h-[9.5rem] w-full object-cover transition duration-500 group-hover:scale-[1.03]"
              loading="lazy"
              decoding="async"
            />
            <PhotoLabel caption={photo.caption} />
          </button>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {photos.length > 1 && (
          <button
            type="button"
            className="uml-nav rounded-full px-4 py-2 text-xs uppercase tracking-[0.14em]"
            data-bot="house-photo-all"
            onClick={() => {
              setPlan(null);
              setVideoOpen(false);
              setGridView(false);
              setReel(false);
              setOpen(true);
            }}
          >
            Show all {photos.length} photos
          </button>
        )}
        {photos.length > 1 && (
          <button
            type="button"
            className="uml-nav inline-flex items-center gap-1.5 rounded-full border border-[var(--uml-line)] px-4 py-2 text-xs uppercase tracking-[0.14em]"
            data-bot="house-reel-open"
            onClick={() => {
              setPlan(null);
              setVideoOpen(false);
              setGridView(false);
              setIndex(0);
              setReel(true);
              setOpen(true);
            }}
          >
            <Film className="h-3.5 w-3.5 text-[var(--uml-gold)]" aria-hidden="true" />
            Cinema photo tour
          </button>
        )}
        {plans.length > 0 && (
          <button
            type="button"
            className="uml-nav rounded-full px-4 py-2 text-xs uppercase tracking-[0.14em]"
            data-bot="house-floorplan-open"
            onClick={() => {
              setReel(false);
              setGridView(false);
              setVideoOpen(false);
              setPlan(0);
              setOpen(true);
            }}
          >
            Floor plans
          </button>
        )}
        {videos.length > 0 && (
          <button
            type="button"
            className="uml-nav rounded-full px-4 py-2 text-xs uppercase tracking-[0.14em]"
            data-bot="house-video-open"
            onClick={() => {
              setPlan(null);
              setReel(false);
              setGridView(false);
              setVideoOpen(true);
              setOpen(true);
            }}
          >
            Watch the tour
          </button>
        )}
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-black/95 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label={`${photos.length} photos`}
          data-bot="house-gallery-modal"
        >
          {/* Progress indicator during Cinema Reel playback */}
          {reel && plan === null && !gridView && !videoOpen && (
            <div className="h-1 w-full bg-white/10 overflow-hidden" aria-hidden="true">
              <div key={`${room}-${index}`} className="h-full w-full bg-[var(--uml-gold)] uml-reel-bar" />
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
            <p className="text-xs uppercase tracking-[0.18em] text-white/60" data-bot="house-gallery-count">
              {plan !== null
                ? `Floor plan ${plan + 1} of ${plans.length}`
                : videoOpen
                  ? `Video tour (${videos.length})`
                  : gridView
                    ? `${shown.length} photos in ${room === 'all' ? 'all rooms' : photoRoomLabel(room)}`
                    : `${Math.min(index + 1, shown.length)} / ${shown.length}${reel ? ' · Cinema Tour' : ''}`}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {plan === null && !videoOpen && shown.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setGridView(false);
                      setReel((playing) => !playing);
                    }}
                    aria-pressed={reel}
                    data-bot="house-gallery-reel-toggle"
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs uppercase tracking-[0.12em] ${
                      reel
                        ? 'border-[var(--uml-gold)] bg-[var(--uml-gold)] text-[var(--uml-gold-ink)] font-semibold'
                        : 'border-white/25 text-white/80'
                    }`}
                  >
                    {reel ? <Pause className="h-3 w-3" aria-hidden="true" /> : <Play className="h-3 w-3" aria-hidden="true" />}
                    {reel ? 'Pause tour' : 'Play tour'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setReel(false);
                      setGridView((v) => !v);
                    }}
                    aria-pressed={gridView}
                    data-bot="house-gallery-grid-toggle"
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs uppercase tracking-[0.12em] ${
                      gridView
                        ? 'border-[var(--uml-gold)] bg-[var(--uml-gold)] text-[var(--uml-gold-ink)] font-semibold'
                        : 'border-white/25 text-white/80'
                    }`}
                  >
                    <Grid className="h-3 w-3" aria-hidden="true" />
                    {gridView ? 'Slide view' : 'All grid'}
                  </button>
                </>
              )}
              {plans.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setReel(false);
                    setGridView(false);
                    setVideoOpen(false);
                    setPlan((cur) => (cur === null ? 0 : null));
                  }}
                  className={`rounded-full border px-3 py-1.5 text-xs uppercase tracking-[0.12em] ${
                    plan !== null
                      ? 'border-[var(--uml-gold)] bg-[var(--uml-gold)] text-[var(--uml-gold-ink)] font-semibold'
                      : 'border-white/25 text-white/80'
                  }`}
                >
                  {plan !== null ? 'Photos' : 'Floor plans'}
                </button>
              )}
              <button
                ref={closeRef}
                type="button"
                onClick={close}
                className="rounded-full border border-white/25 px-4 py-1.5 text-xs uppercase tracking-[0.14em] text-white/80"
                data-bot="house-gallery-close"
              >
                Close
              </button>
            </div>
          </div>

          {rooms.length > 1 && plan === null && !videoOpen && (
            <div className="flex gap-2 overflow-x-auto px-4 py-3" data-bot="house-gallery-filters">
              <FilterChip label="All" active={room === 'all'} onClick={() => { setRoom('all'); setIndex(0); }} />
              {rooms.map((row) => (
                <FilterChip
                  key={row.room}
                  label={`${row.label} ${row.count}`}
                  active={room === row.room}
                  onClick={() => {
                    setRoom(row.room);
                    setIndex(0);
                  }}
                />
              ))}
            </div>
          )}

          <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-3 pb-3">
            {plan !== null ? (
              <Plans plans={plans} at={plan} onPick={setPlan} onClose={() => setPlan(null)} />
            ) : videoOpen && videos.length > 0 ? (
              <div className="w-full max-w-4xl space-y-3" data-bot="house-video">
                {videos.map((video) =>
                  isDirectVideo(video.url) ? (
                    <video key={video.url} controls playsInline poster={video.poster} className="w-full rounded-2xl">
                      <source src={video.url} />
                    </video>
                  ) : (
                    <p key={video.url} className="text-sm text-white/70">
                      {video.title}:{' '}
                      <a href={video.url} target="_blank" rel="noreferrer" className="underline">
                        open the tour
                      </a>
                    </p>
                  ),
                )}
                {photos.length > 0 && (
                  <button type="button" className="text-sm underline text-white/70" onClick={() => setVideoOpen(false)}>
                    Back to the photos
                  </button>
                )}
              </div>
            ) : gridView ? (
              <div className="mx-auto grid max-h-full w-full max-w-6xl gap-3 self-start py-2 sm:grid-cols-2 lg:grid-cols-3" data-bot="house-gallery-grid">
                {shown.map((photo, at) => (
                  <button
                    key={photo.src}
                    type="button"
                    onClick={() => {
                      setIndex(at);
                      setGridView(false);
                    }}
                    className="group relative overflow-hidden rounded-2xl border border-white/15 text-left"
                  >
                    <img
                      src={photo.src}
                      {...photoSrcSet(photo.src, '(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw')}
                      alt={photo.caption || 'The house'}
                      className="h-52 w-full object-cover transition duration-500 group-hover:scale-[1.03]"
                      loading="lazy"
                      decoding="async"
                    />
                    <PhotoLabel caption={photo.caption} />
                  </button>
                ))}
              </div>
            ) : (
              <>
                <NavButton side="left" onClick={() => setIndex((at) => (at - 1 + shown.length) % shown.length)} />
                {current && (
                  <figure className="flex max-h-full min-h-0 flex-col items-center overflow-hidden">
                    <div className="overflow-hidden rounded-xl">
                      <img
                        key={`${current.src}-${reel ? 'reel' : 'still'}`}
                        src={current.src}
                        alt={current.caption || 'The house'}
                        className={`max-h-[calc(100vh-14rem)] w-auto max-w-full rounded-xl object-contain ${reel ? 'uml-ken-burns' : ''}`}
                        data-bot="house-gallery-image"
                      />
                    </div>
                    <figcaption className="mt-3 max-w-2xl text-center text-sm text-white/80" data-bot="house-photo-caption">
                      <span className="mr-2 rounded-full border border-white/20 px-2 py-0.5 text-[10px] uppercase tracking-wider text-white/65">
                        {photoRoomLabel(current.room)}
                      </span>
                      {current.caption}
                    </figcaption>
                  </figure>
                )}
                <NavButton side="right" onClick={() => setIndex((at) => (at + 1) % shown.length)} />
              </>
            )}
          </div>

          {plan === null && !videoOpen && !gridView && shown.length > 1 && (
            <ul className="flex gap-2 overflow-x-auto border-t border-white/10 px-4 py-3" data-bot="house-photo-strip">
              {shown.map((photo, at) => (
                <li key={photo.src}>
                  <button
                    type="button"
                    onClick={() => setIndex(at)}
                    aria-current={at === index ? 'true' : undefined}
                    aria-label={`Photo ${at + 1}`}
                    data-bot="house-photo-thumb"
                    className="block overflow-hidden rounded-lg border border-white/20 aria-[current=true]:border-[var(--uml-gold)]"
                  >
                    <img src={photo.src} {...photoSrcSet(photo.src, '80px')} alt="" className="h-14 w-20 object-cover" loading="lazy" decoding="async" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/** The caption sits on the photo, so a mosaic thumbnail still says what it shows. */
function PhotoLabel({ caption }: { caption: string }) {
  if (!caption) return null;
  return (
    <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-3 pb-2 pt-6 text-left text-[11px] leading-tight text-white/85">
      {caption}
    </span>
  );
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`shrink-0 rounded-full border px-3 py-1.5 text-xs ${
        active ? 'border-[var(--uml-gold)] bg-[var(--uml-gold)] text-[var(--uml-gold-ink)]' : 'border-white/25 text-white/75'
      }`}
    >
      {label}
    </button>
  );
}

function NavButton({ side, onClick }: { side: 'left' | 'right'; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={side === 'left' ? 'Previous photo' : 'Next photo'}
      data-bot={side === 'left' ? 'house-photo-prev' : 'house-photo-next'}
      className={`absolute ${side === 'left' ? 'left-2' : 'right-2'} top-1/2 z-10 -translate-y-1/2 rounded-full border border-white/30 bg-black/50 px-3 py-3 text-lg text-white/85`}
    >
      {side === 'left' ? '‹' : '›'}
    </button>
  );
}

function Plans({
  plans,
  at,
  onPick,
  onClose,
}: {
  plans: Array<{ src: string; title: string }>;
  at: number;
  onPick: (index: number) => void;
  onClose: () => void;
}) {
  const plan = plans[Math.min(at, plans.length - 1)];
  if (!plan) return null;
  return (
    <div className="flex w-full max-w-4xl flex-col items-center" data-bot="house-floorplan">
      <img src={plan.src} alt={`${plan.title} floor plan`} className="max-h-[calc(100vh-16rem)] w-auto max-w-full rounded-xl bg-white object-contain" />
      <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
        {plans.map((row, index) => (
          <FilterChip key={row.src} label={row.title} active={index === at} onClick={() => onPick(index)} />
        ))}
        <button type="button" onClick={onClose} className="text-sm underline text-white/70">
          Back to the photos
        </button>
      </div>
    </div>
  );
}

/** The room label for a photo, for a caller that wants the word without the chip. */
export { photoRoomLabel };
