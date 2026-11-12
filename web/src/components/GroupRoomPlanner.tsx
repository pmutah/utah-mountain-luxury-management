import { useEffect, useMemo, useState } from 'react';
import { BedDouble, Copy, RotateCcw, Share2, Sparkles } from 'lucide-react';
import type { HouseId } from '../lib/market/types';
import {
  decodeRoomAssignments,
  encodeRoomAssignments,
  formatRoomPlanText,
  roomsForPlanner,
  sampleFamilyAssignments,
  sanitizeGuestAssignment,
  type PlannableRoom,
  type RoomAssignments,
} from '../lib/room-planner';

export function GroupRoomPlanner({
  house,
  houseName,
  checkIn,
  checkOut,
  units,
  storageScope,
  compact = false,
}: {
  house: HouseId;
  houseName: string;
  checkIn?: string;
  checkOut?: string;
  units?: readonly string[];
  storageScope?: string;
  compact?: boolean;
}) {
  const rooms = useMemo(() => roomsForPlanner(house, units), [house, units]);
  const storageKey = `uml-room-plan-${storageScope ?? house}`;

  const [assignments, setAssignments] = useState<RoomAssignments>(() => {
    if (typeof window !== 'undefined') {
      const fromUrl = new URLSearchParams(window.location.search).get('rooms');
      if (fromUrl) {
        const parsed = decodeRoomAssignments(fromUrl, rooms);
        if (Object.keys(parsed).length > 0) return parsed;
      }
      try {
        const raw = window.localStorage.getItem(storageKey);
        if (raw) return JSON.parse(raw) as RoomAssignments;
      } catch {
        // Ignore storage failure
      }
    }
    return {};
  });

  const [copiedChart, setCopiedChart] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(assignments));
    } catch {
      // Ignore storage failure
    }
  }, [assignments, storageKey]);

  const assignedCount = rooms.filter((r) => Boolean((assignments[r.id] ?? '').trim())).length;

  const grouped = useMemo(() => {
    const map = new Map<string, PlannableRoom[]>();
    for (const room of rooms) {
      const list = map.get(room.where) ?? [];
      list.push(room);
      map.set(room.where, list);
    }
    return [...map.entries()];
  }, [rooms]);

  function buildShareUrl(): string {
    if (typeof window === 'undefined') return '';
    const url = new URL(window.location.href);
    const encoded = encodeRoomAssignments(rooms, assignments);
    if (encoded) url.searchParams.set('rooms', encoded);
    else url.searchParams.delete('rooms');
    return url.toString();
  }

  function copySleepingChart() {
    const shareUrl = assignedCount > 0 ? buildShareUrl() : undefined;
    const text = formatRoomPlanText({
      houseName,
      checkIn,
      checkOut,
      rooms,
      assignments,
      shareUrl,
    });
    void navigator.clipboard?.writeText(text).then(() => {
      setCopiedChart(true);
      window.setTimeout(() => setCopiedChart(false), 1800);
    });
  }

  function copyShareLink() {
    const shareUrl = buildShareUrl();
    if (!shareUrl) return;
    void navigator.clipboard?.writeText(shareUrl).then(() => {
      setCopiedLink(true);
      window.setTimeout(() => setCopiedLink(false), 1800);
    });
  }

  if (rooms.length === 0) return null;

  return (
    <div
      className={compact ? 'rounded-3xl border border-white/10 bg-white/[0.04] p-5' : 'uml-panel mt-5 rounded-3xl p-5'}
      data-bot="group-room-planner"
      data-house={house}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className={compact ? 'text-[11px] font-semibold uppercase tracking-[0.28em] text-[#d4b56a]' : 'uml-kicker'}>
            Interactive Sleeping Chart · {assignedCount}/{rooms.length} assigned
          </p>
          <h3 className={compact ? 'guest-display mt-1 text-2xl text-[#f6f1e8]' : 'font-display text-2xl mt-1'}>
            Assign bedrooms for your group
          </h3>
          <p className="mt-1 text-xs text-[var(--uml-muted)]">
            Type who gets each room, then copy the sleeping chart or shareable link into your family chat. Saved locally on this device.
          </p>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            data-bot="room-planner-sample"
            onClick={() => setAssignments(sampleFamilyAssignments(rooms))}
            className="inline-flex items-center gap-1 rounded-full border border-[var(--uml-line)] px-3 py-1.5 text-[11px] uppercase tracking-[0.12em] text-[var(--uml-muted)] hover:border-[var(--uml-gold)] hover:text-[var(--uml-gold)] transition-colors"
          >
            <Sparkles className="h-3 w-3 text-[var(--uml-gold)]" aria-hidden="true" />
            Sample fill
          </button>
          {assignedCount > 0 && (
            <button
              type="button"
              data-bot="room-planner-clear"
              onClick={() => setAssignments({})}
              className="inline-flex items-center gap-1 rounded-full border border-[var(--uml-line)] px-3 py-1.5 text-[11px] uppercase tracking-[0.12em] text-[var(--uml-muted)] hover:text-[var(--uml-ink)]"
            >
              <RotateCcw className="h-3 w-3" aria-hidden="true" />
              Clear
            </button>
          )}
        </div>
      </div>

      <div className="mt-4 space-y-4">
        {grouped.map(([where, list]) => (
          <div key={where}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--uml-gold)]">{where}</p>
            <div className={`mt-2 grid gap-2.5 ${compact ? 'grid-cols-1' : 'sm:grid-cols-2'}`}>
              {list.map((room) => (
                <label
                  key={room.id}
                  className="flex flex-col justify-between rounded-2xl border border-[var(--uml-line)] bg-[var(--uml-surface-2)]/40 p-3 text-xs"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 font-semibold text-[var(--uml-ink)]">
                        <BedDouble className="h-3.5 w-3.5 text-[var(--uml-gold)]" aria-hidden="true" />
                        {room.name}
                      </span>
                    </div>
                    <span className="mt-0.5 block text-[11px] text-[var(--uml-muted)]">{room.beds}</span>
                  </div>
                  <input
                    type="text"
                    value={assignments[room.id] ?? ''}
                    data-bot={`room-assign-${room.id}`}
                    onChange={(e) => {
                      const val = sanitizeGuestAssignment(e.target.value);
                      setAssignments((prev) => ({ ...prev, [room.id]: val }));
                    }}
                    placeholder="Who sleeps here? (e.g. Grandma & Grandpa)"
                    className="mt-2 w-full rounded-xl border border-[var(--uml-line)] bg-transparent px-2.5 py-1.5 text-xs text-[var(--uml-ink)] placeholder:text-[var(--uml-muted)]/65"
                  />
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-[var(--uml-line)]/60 pt-3">
        {!compact && (
          <button
            type="button"
            data-bot="room-planner-share-link"
            onClick={copyShareLink}
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--uml-line)] px-3.5 py-1.5 text-[11px] uppercase tracking-[0.12em] hover:border-[var(--uml-gold)] hover:text-[var(--uml-gold)] transition-colors"
          >
            <Share2 className="h-3 w-3" aria-hidden="true" />
            {copiedLink ? 'Copied room link' : 'Copy shareable URL'}
          </button>
        )}
        <button
          type="button"
          data-bot="room-planner-copy"
          onClick={copySleepingChart}
          className="uml-gold-btn inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-[11px] uppercase tracking-[0.12em]"
        >
          <Copy className="h-3 w-3" aria-hidden="true" />
          {copiedChart ? 'Copied sleeping chart' : 'Copy group sleeping chart'}
        </button>
      </div>
    </div>
  );
}
