import { houseProfile, type HouseHighlight, type HouseRoom } from '../lib/house-catalog';
import type { HouseId } from '../lib/market/types';

/**
 * The visual story of a house: its highlights, its rooms, and its amenities.
 *
 * Airbnb and VRBO both lead a listing with a handful of reasons to book, then show where everyone sleeps, then
 * the amenity list. That order is not decoration — a group booking dies on "will my parents get a real bed",
 * so the room cards come before the amenities.
 *
 * Every value here comes from `house-catalog.ts`, which reads the published listings and derives capacities
 * from the shared tables. This file only draws.
 */

/** The glyph for a highlight. Simple strokes, no external icon set. */
function HighlightIcon({ icon }: { icon: HouseHighlight['icon'] }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const paths: Record<HouseHighlight['icon'], React.ReactNode> = {
    water: (
      <>
        <path d="M2 12c2-2 4-2 6 0s4 2 6 0 4-2 6 0" {...common} />
        <path d="M2 17c2-2 4-2 6 0s4 2 6 0 4-2 6 0" {...common} />
      </>
    ),
    tub: (
      <>
        <path d="M3 12h18v3a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5v-3Z" {...common} />
        <path d="M7 12V6a2 2 0 0 1 3.5-1.3" {...common} />
        <path d="M6 20v2M18 20v2" {...common} />
      </>
    ),
    games: (
      <>
        <rect x="2.5" y="7" width="19" height="10" rx="4" {...common} />
        <path d="M7 10v3M5.5 11.5h3M15.5 11h.01M17.5 13h.01" {...common} />
      </>
    ),
    kitchen: (
      <>
        <path d="M4 10h16v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-9Z" {...common} />
        <path d="M8 10V6a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v4" {...common} />
        <path d="M9 15h6" {...common} />
      </>
    ),
    fire: (
      <>
        <path d="M12 3c3 4 5 6 5 9a5 5 0 0 1-10 0c0-2 1-3 2-4 .5 1 1.5 1.5 2 1 1-.8.5-2 1-6Z" {...common} />
      </>
    ),
    mountain: (
      <>
        <path d="M3 19h18L14 6l-3.5 6L8 9l-5 10Z" {...common} />
        <path d="M13 10.5 14 9l1 1.5" {...common} />
      </>
    ),
    location: (
      <>
        <path d="M12 21s7-6 7-11a7 7 0 1 0-14 0c0 5 7 11 7 11Z" {...common} />
        <circle cx="12" cy="10" r="2.5" {...common} />
      </>
    ),
    bed: (
      <>
        <path d="M3 18v-7h13a4 4 0 0 1 4 4v3" {...common} />
        <path d="M3 18h18M3 11V7" {...common} />
        <path d="M7 11V9h4v2" {...common} />
      </>
    ),
    group: (
      <>
        <circle cx="9" cy="9" r="3" {...common} />
        <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" {...common} />
        <path d="M16 7.5a3 3 0 0 1 0 5.8M17 14.5c2.3.7 4 2.8 4 5.5" {...common} />
      </>
    ),
  };
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      {paths[icon]}
    </svg>
  );
}

/** The reasons-to-book row. Four at most, because more becomes a spec sheet. */
export function HouseHighlights({ house }: { house: HouseId }) {
  const { highlights } = houseProfile(house);
  if (highlights.length === 0) return null;
  return (
    <ul className="grid gap-3 sm:grid-cols-2" data-bot="house-highlights">
      {highlights.map((row) => (
        <li key={row.title} className="flex items-start gap-3" data-bot="house-highlight">
          <span className="mt-0.5 shrink-0 rounded-full border border-[var(--uml-line)] p-2 text-[var(--uml-gold)]">
            <HighlightIcon icon={row.icon} />
          </span>
          <span>
            <span className="block text-sm font-semibold text-[var(--uml-ink)]">{row.title}</span>
            <span className="mt-0.5 block text-sm text-[var(--uml-muted)]">{row.detail}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Where you'll sleep.
 *
 * Rooms are grouped by level or wing rather than listed flat, because the question a group asks is not "how
 * many beds" but "who is on which floor, and does the grandparents' room have its own bath". The group heading
 * is the answer to that, so it is rendered as a heading and not repeated on every card.
 */
export function HouseRooms({ house }: { house: HouseId }) {
  const { rooms } = houseProfile(house);
  if (rooms.length === 0) return null;
  const groups = new Map<string, HouseRoom[]>();
  for (const room of rooms) {
    const list = groups.get(room.where) ?? [];
    list.push(room);
    groups.set(room.where, list);
  }
  return (
    <div data-bot="house-rooms" data-house={house}>
      {[...groups.entries()].map(([where, list]) => (
        <div key={where} className="mt-5 first:mt-0" data-bot="house-room-group">
          <p className="uml-kicker">{where}</p>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {list.map((room) => (
              <li key={`${where}-${room.name}`} className="uml-panel rounded-2xl px-4 py-3" data-bot="house-room">
                <p className="text-sm font-semibold">{room.name}</p>
                <p className="mt-0.5 text-sm text-[var(--uml-muted)]">{room.beds}</p>
                {room.note ? <p className="mt-1 text-xs text-[var(--uml-muted)]">{room.note}</p> : null}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** The amenity list, grouped the way a guest scans it. */
export function HouseAmenities({ house }: { house: HouseId }) {
  const { amenityGroups } = houseProfile(house);
  if (amenityGroups.length === 0) return null;
  return (
    <div className="grid gap-5 sm:grid-cols-2" data-bot="house-amenities">
      {amenityGroups.map((group) => (
        <div key={group.title} data-bot="house-amenity-group">
          <p className="uml-kicker">{group.title}</p>
          <ul className="mt-2 space-y-1.5 text-sm">
            {group.items.map((item) => (
              <li key={item} className="flex items-start gap-2">
                <span aria-hidden="true" className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[var(--uml-gold)]" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
