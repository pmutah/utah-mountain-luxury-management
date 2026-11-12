import { useEffect, useMemo, useState } from 'react';
import { Camera, ExternalLink, Loader2 } from 'lucide-react';
import { cameraGroupsFor, type CanyonCam } from '../lib/canyon-cams';
import type { HouseId } from '../lib/market/types';

/** How often the picture is replaced. UDOT updates about once a minute, so faster would only refetch the same frame. */
const REFRESH_MS = 60_000;

function camUrl(cam: CanyonCam): string {
  return `/api/public/cam?key=${encodeURIComponent(cam.key)}`;
}

/**
 * The road cameras, on the page.
 *
 * A guest deciding whether to drive up in a storm does not want a link to a DOT map; they want to see the road. Each
 * tile is a live frame from UDOT fetched through `/api/public/cam`, replaced once a minute, with the location and the
 * distance from the house under it.
 *
 * A camera that fails says so and stays clickable to UDOT's own camera page. It never shows the last picture as if it
 * were current, and it never shows a broken image icon.
 */
export function CanyonCameras({ house }: { house?: HouseId }) {
  const groups = useMemo(() => cameraGroupsFor(house === 'river' || house === 'lindon' || house === 'ranch' ? house : undefined), [house]);
  const [active, setActive] = useState<string>(groups[0]?.id ?? 'provo-canyon');
  const group = groups.find((row) => row.id === active) ?? groups[0];
  if (!group) return null;

  return (
    <div data-bot="canyon-cameras" data-house={house ?? 'all'}>
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Road camera groups">
        {groups.map((row) => (
          <button
            key={row.id}
            type="button"
            role="tab"
            aria-selected={group.id === row.id}
            data-bot={`camera-group-${row.id}`}
            onClick={() => setActive(row.id)}
            className={`rounded-full px-3 py-1.5 text-[11px] uppercase tracking-[0.1em] transition-colors ${
              group.id === row.id
                ? 'bg-[var(--uml-gold)] font-semibold text-[var(--uml-gold-ink)]'
                : 'border border-[var(--uml-line)] text-[var(--uml-muted)] hover:text-[var(--uml-ink)]'
            }`}
          >
            {row.label.split(' — ')[0]}
          </button>
        ))}
      </div>

      <p className="mt-3 text-xs leading-relaxed text-[var(--uml-muted)]" data-bot="camera-group-note">
        {group.blurb}
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {group.cams.map((cam) => (
          <CameraTile key={cam.key} cam={cam} />
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-[var(--uml-muted)]">
        <span>Frames come from the Utah Department of Transportation and refresh about once a minute.</span>
        <a
          href="https://udottraffic.utah.gov/cctv"
          target="_blank"
          rel="noreferrer"
          data-bot="camera-udot-all"
          className="inline-flex items-center gap-1 text-[var(--uml-gold)] underline"
        >
          Every UDOT camera
          <ExternalLink className="h-3 w-3" aria-hidden />
        </a>
        {group.resortHref ? (
          <a
            href={group.resortHref.href}
            target="_blank"
            rel="noreferrer"
            data-bot="camera-resort-link"
            className="inline-flex items-center gap-1 text-[var(--uml-gold)] underline"
          >
            {group.resortHref.label}
            <ExternalLink className="h-3 w-3" aria-hidden />
          </a>
        ) : null}
      </div>
      <p className="mt-2 text-[11px] text-[var(--uml-muted)]">
        A camera shows the road, not whether it is open. Check UDOT for closures and traction laws, and give yourself
        longer in a storm.
      </p>
    </div>
  );
}

function CameraTile({ cam }: { cam: CanyonCam }) {
  const [round, setRound] = useState(0);
  const [state, setState] = useState<'loading' | 'live' | 'down'>('loading');
  const [timer, setTimer] = useState(true);

  // Pause the refresh while the tab is hidden, so a guest who walked away is not billing a frame a minute forever.
  useEffect(() => {
    if (!timer) return;
    const tick = window.setInterval(() => {
      if (document.visibilityState === 'visible') setRound((value) => value + 1);
    }, REFRESH_MS);
    return () => window.clearInterval(tick);
  }, [timer]);

  return (
    <figure className="overflow-hidden rounded-2xl border border-[var(--uml-line)] bg-[var(--uml-surface-2)]/50" data-bot="camera-tile" data-camera={cam.key}>
      <div className="relative aspect-video bg-black/50">
        {state === 'down' ? (
          <div className="flex h-full flex-col items-center justify-center gap-1 px-3 text-center" data-bot="camera-down">
            <Camera className="h-5 w-5 text-[var(--uml-muted)]" aria-hidden />
            <p className="text-xs text-[var(--uml-muted)]">This camera is not answering right now.</p>
            <a
              href={`https://udottraffic.utah.gov/map/Cctv/${cam.id}`}
              target="_blank"
              rel="noreferrer"
              className="text-[11px] text-[var(--uml-gold)] underline"
            >
              Try it on UDOT
            </a>
          </div>
        ) : (
          <img
            // The changing key is what triggers a new fetch after the cache window, not a CSS effect.
            key={`${cam.key}-${round}`}
            src={`${camUrl(cam)}&t=${round}`}
            alt={`Live road camera: ${cam.name}`}
            width={1280}
            height={720}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
            onLoad={() => setState('live')}
            onError={() => {
              setState('down');
              setTimer(false);
            }}
          />
        )}
        {state === 'loading' ? (
          <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-white/70" aria-hidden>
            <Loader2 className="h-4 w-4 animate-spin" />
          </span>
        ) : null}
        {state === 'live' ? (
          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[9px] uppercase tracking-[0.12em] text-white/85">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden />
            Live
          </span>
        ) : null}
      </div>
      <figcaption className="px-3 py-2">
        <p className="text-xs font-semibold">{cam.name}</p>
        <p className="mt-0.5 text-[11px] leading-snug text-[var(--uml-muted)]">
          {cam.note}
          {cam.fromRiver ? <span className="text-[var(--uml-gold)]"> · {cam.fromRiver}</span> : null}
        </p>
      </figcaption>
    </figure>
  );
}
