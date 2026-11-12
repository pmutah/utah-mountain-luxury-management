import { useMemo, useState } from 'react';
import { CalendarPlus, Compass, Copy, Sun } from 'lucide-react';
import {
  buildItineraryIcs,
  CURATED_TRACKS,
  formatItineraryPlainText,
  generateUtahItinerary,
  type ItineraryTrackId,
} from '../lib/itinerary-studio';
import type { HouseId } from '../lib/market/types';

export function UtahItineraryStudio({
  house,
  houseName,
  checkIn,
}: {
  house: HouseId;
  houseName: string;
  checkIn?: string;
}) {
  const defaultTrack: ItineraryTrackId =
    house === 'river' ? 'ski-sauna' : house === 'lindon' ? 'summer-lake' : 'reunion-celebration';
  const [track, setTrack] = useState<ItineraryTrackId>(defaultTrack);
  const [days, setDays] = useState<2 | 3 | 4>(3);
  const [copied, setCopied] = useState(false);

  const activeTrack = CURATED_TRACKS.find((t) => t.id === track) ?? CURATED_TRACKS[0]!;
  const plans = useMemo(
    () => generateUtahItinerary({ house, track, days, startDate: checkIn }),
    [house, track, days, checkIn],
  );

  function copyItinerary() {
    const text = formatItineraryPlainText(houseName, activeTrack.label, plans);
    void navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    });
  }

  function downloadIcs() {
    const ics = buildItineraryIcs(houseName, activeTrack.label, plans);
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `utah-mountain-luxury-${house}-${track}-${days}d.ics`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <section className="uml-panel rounded-3xl p-5 sm:p-6" data-bot="itinerary-studio" data-house={house}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="uml-kicker">4-Season Concierge Trip Designer</p>
          <h2 className="font-display text-3xl mt-1">Build your days at {houseName}</h2>
          <p className="mt-1 max-w-2xl text-xs sm:text-sm text-[var(--uml-muted)]">
            Composed from our published local guide and synchronized to real sunset &amp; alpenglow times for your dates. Planning guide only — no price is quoted and dates are not held.
          </p>
        </div>

        <div className="flex items-center gap-1.5" role="group" aria-label="Trip length">
          {([2, 3, 4] as const).map((len) => (
            <button
              key={len}
              type="button"
              aria-pressed={days === len}
              data-bot={`itinerary-days-${len}`}
              onClick={() => setDays(len)}
              className={`rounded-full border px-3 py-1.5 text-xs uml-num transition-colors ${
                days === len
                  ? 'border-[var(--uml-gold)] bg-[var(--uml-gold)] text-[var(--uml-gold-ink)] font-semibold'
                  : 'border-[var(--uml-line)] text-[var(--uml-muted)] hover:text-[var(--uml-ink)]'
              }`}
            >
              {len} days
            </button>
          ))}
        </div>
      </div>

      {/* Track selector */}
      <div className="mt-4 flex flex-wrap gap-1.5" role="tablist" aria-label="Experience style">
        {CURATED_TRACKS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={track === item.id}
            data-bot={`itinerary-track-${item.id}`}
            onClick={() => setTrack(item.id)}
            className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
              track === item.id
                ? 'border-[var(--uml-gold)] bg-[var(--uml-gold)] text-[var(--uml-gold-ink)] font-semibold'
                : 'border-[var(--uml-line)] text-[var(--uml-muted)] hover:text-[var(--uml-ink)]'
            }`}
          >
            {item.label} <span className="opacity-70">· {item.seasonTag}</span>
          </button>
        ))}
      </div>

      <p className="mt-3 flex items-center gap-2 text-xs text-[var(--uml-muted)]">
        <Compass className="h-3.5 w-3.5 shrink-0 text-[var(--uml-gold)]" aria-hidden="true" />
        <span>{activeTrack.summary}</span>
      </p>

      {/* Day cards */}
      <div className="mt-5 space-y-4">
        {plans.map((day) => (
          <article
            key={day.dayNumber}
            className="rounded-2xl border border-[var(--uml-line)] bg-[var(--uml-surface-2)]/45 p-4"
            data-bot={`itinerary-day-${day.dayNumber}`}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--uml-line)]/50 pb-2.5">
              <div>
                <span className="uml-kicker text-[var(--uml-gold)]">
                  Day {day.dayNumber} · {day.dateLabel}
                </span>
                <h3 className="font-display text-2xl mt-0.5">{day.headline}</h3>
              </div>
              {day.alpenglowSummary && (
                <span className="inline-flex items-center gap-1 text-[11px] text-[var(--uml-muted)] uml-num">
                  <Sun className="h-3 w-3 text-[var(--uml-gold)]" aria-hidden="true" />
                  {day.alpenglowSummary}
                </span>
              )}
            </div>

            <ol className="mt-3 grid gap-3 sm:grid-cols-2">
              {day.stops.map((stop) => (
                <li key={`${day.dayNumber}-${stop.slot}-${stop.title}`} className="text-xs leading-relaxed">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full border border-[var(--uml-line)] px-2 py-0.5 text-[10px] uppercase tracking-wider text-[var(--uml-gold)]">
                      {stop.slot}
                    </span>
                    <span className="text-[11px] text-[var(--uml-muted)] uml-num">{stop.timeHint}</span>
                  </div>
                  <p className="mt-1 font-semibold text-sm text-[var(--uml-ink)]">{stop.title}</p>
                  <p className="mt-0.5 text-[var(--uml-muted)]">{stop.detail}</p>
                </li>
              ))}
            </ol>
          </article>
        ))}
      </div>

      {/* Share / Calendar Export actions */}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--uml-line)]/60 pt-4">
        <p className="text-[11px] text-[var(--uml-muted)]">
          Drop this plan onto your phone calendar or paste it into your family group text.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            data-bot="itinerary-copy"
            onClick={copyItinerary}
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--uml-line)] px-3.5 py-2 text-xs uppercase tracking-[0.12em] hover:border-[var(--uml-gold)] hover:text-[var(--uml-gold)] transition-colors"
          >
            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
            {copied ? 'Copied group itinerary' : 'Copy group plan'}
          </button>
          <button
            type="button"
            data-bot="itinerary-ics"
            onClick={downloadIcs}
            className="uml-gold-btn inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs uppercase tracking-[0.12em]"
          >
            <CalendarPlus className="h-3.5 w-3.5" aria-hidden="true" />
            Add {days}-day plan (.ics)
          </button>
        </div>
      </div>
    </section>
  );
}
