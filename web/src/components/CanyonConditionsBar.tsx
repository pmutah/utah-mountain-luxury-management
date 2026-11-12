import { AlertTriangle, Camera, CloudSnow, Compass, ExternalLink, MoonStar, Sun, Thermometer, Waves } from 'lucide-react';
import { denverToday } from '../lib/market/dates';
import type { HouseId } from '../lib/market/types';
import { computeMountainLight } from '../lib/mountain-alpenglow';
import {
  formatDayPill,
  formatRiverBadge,
  formatSundanceBadge,
  usePublicConditions,
} from '../lib/public-conditions';

/**
 * Live canyon, valley, ski-hill, and Provo River telemetry bar for public house pages.
 *
 * Reads `GET /api/public/conditions` (NWS + USGS Vivian Park gauge 10163000). Never invents clear skies or an open road
 * when a feed fails, and provides direct links to official UDOT Provo Canyon cameras and Sundance Resort webcams.
 */
export function CanyonConditionsBar({ house, targetDate }: { house?: HouseId; targetDate?: string }) {
  const state = usePublicConditions();
  const focusHouse: HouseId = house ?? 'river';
  const lightDate = targetDate && /^\d{4}-\d{2}-\d{2}$/.test(targetDate) ? targetDate : denverToday();
  const light = computeMountainLight(lightDate, focusHouse);

  if (state.kind === 'loading') {
    return (
      <section
        className="uml-panel rounded-3xl px-4 py-3 sm:px-5"
        data-bot="public-conditions"
        data-state="loading"
        aria-label="Live mountain and canyon conditions"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--uml-muted)]">
          <span className="uml-kicker">Live Provo Canyon &amp; Valley Telemetry</span>
          <span>Reading National Weather Service &amp; USGS Vivian Park river gauge…</span>
        </div>
      </section>
    );
  }

  if (state.kind === 'off' || (!state.data.ok && !state.data.river.ok)) {
    return (
      <section
        className="uml-panel rounded-3xl px-4 py-3 sm:px-5"
        data-bot="public-conditions"
        data-state="off"
        aria-label="Live mountain and canyon conditions"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-[var(--uml-muted)]">
          <p>
            Live weather and river telemetry could not be read right now. That does not mean clear weather or an open canyon road.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <a
              href="https://udottraffic.utah.gov/"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[var(--uml-gold)] underline"
              data-bot="conditions-udot-link"
            >
              UDOT US-189 road cams <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>
            <a
              href="https://www.sundanceresort.com/mountain-report/"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[var(--uml-gold)] underline"
              data-bot="conditions-sundance-link"
            >
              Sundance mountain cams <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>
          </div>
        </div>
      </section>
    );
  }

  const { data } = state;
  const focusId: HouseId = house ?? 'river';
  const houseForecast = data.houses.find((row) => row.id === focusId);
  const valleyForecast = data.houses.find((row) => row.id === 'lindon');
  const canyonForecast = data.houses.find((row) => row.id === 'river');

  return (
    <section
      className="uml-panel rounded-3xl px-4 py-4 sm:px-5"
      data-bot="public-conditions"
      data-state="live"
      aria-label="Live mountain and canyon conditions"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-[var(--uml-success)] uml-live-pulse" aria-hidden="true" />
          <p className="uml-kicker">
            {house ? `Live Conditions · ${houseForecast?.label ?? 'Utah Mountain'}` : 'Live Canyon, River & Valley Conditions'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[11px]">
          <a
            href="https://udottraffic.utah.gov/"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-[var(--uml-muted)] hover:text-[var(--uml-gold)] transition-colors"
            data-bot="conditions-udot-link"
          >
            <Compass className="h-3.5 w-3.5 text-[var(--uml-gold)]" aria-hidden="true" />
            UDOT US-189 Traffic &amp; Cams
          </a>
          <a
            href="https://www.sundanceresort.com/mountain-report/"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-[var(--uml-muted)] hover:text-[var(--uml-gold)] transition-colors"
            data-bot="conditions-sundance-link"
          >
            <Camera className="h-3.5 w-3.5 text-[var(--uml-gold)]" aria-hidden="true" />
            Sundance Live Cams
          </a>
        </div>
      </div>

      {data.advisory ? (
        <div
          className="mt-3 flex items-start gap-2.5 rounded-2xl border border-amber-500/40 bg-amber-950/30 px-3.5 py-2.5 text-xs text-amber-100"
          data-bot="public-conditions-advisory"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--uml-gold)]" aria-hidden="true" />
          <span>{data.advisory}</span>
        </div>
      ) : null}

      <div className="mt-3 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        {/* Card 1: House or Valley/Canyon Weather */}
        <div className="rounded-2xl border border-[var(--uml-line)] bg-[var(--uml-surface-2)]/60 px-3.5 py-2.5">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.16em] text-[var(--uml-muted)]">
            <Thermometer className="h-3.5 w-3.5 text-[var(--uml-gold)]" aria-hidden="true" />
            <span>{house ? houseForecast?.label.replace(/^The /, '') : 'Provo Canyon & Lindon'}</span>
          </div>
          {house ? (
            <p className="mt-1 text-xs font-medium uml-num" data-bot="public-conditions-house">
              {houseForecast && houseForecast.days.length > 0
                ? formatDayPill(houseForecast.days[0])
                : 'NWS forecast unavailable right now'}
            </p>
          ) : (
            <div className="mt-1 space-y-0.5 text-xs uml-num" data-bot="public-conditions-house">
              <p>
                <span className="text-[var(--uml-muted)]">Canyon:</span>{' '}
                {canyonForecast?.days[0] ? formatDayPill(canyonForecast.days[0]) : 'Unread'}
              </p>
              <p>
                <span className="text-[var(--uml-muted)]">Lindon:</span>{' '}
                {valleyForecast?.days[0] ? formatDayPill(valleyForecast.days[0]) : 'Unread'}
              </p>
            </div>
          )}
          {house && houseForecast && houseForecast.days.length > 1 ? (
            <p className="mt-1 text-[11px] text-[var(--uml-muted)] uml-num">
              Next: {houseForecast.days.slice(1, 3).map((d) => `${d.name} ${d.high ?? '—'}°`).join(' · ')}
            </p>
          ) : null}
        </div>

        {/* Card 2: Sundance Snow & Alpine */}
        <div className="rounded-2xl border border-[var(--uml-line)] bg-[var(--uml-surface-2)]/60 px-3.5 py-2.5">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.16em] text-[var(--uml-muted)]">
            <CloudSnow className="h-3.5 w-3.5 text-[var(--uml-glacier)]" aria-hidden="true" />
            <span>Sundance Mountain (8,250&prime;)</span>
          </div>
          <p className="mt-1 text-xs font-medium uml-num" data-bot="public-conditions-sundance">
            {formatSundanceBadge(data.sundance)}
          </p>
          <p className="mt-1 text-[11px] text-[var(--uml-muted)]">
            10 min above Vivian Park · NWS 48-hour grid snowfall
          </p>
        </div>

        {/* Card 3: Provo River Flow */}
        <div className="rounded-2xl border border-[var(--uml-line)] bg-[var(--uml-surface-2)]/60 px-3.5 py-2.5">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.16em] text-[var(--uml-muted)]">
            <Waves className="h-3.5 w-3.5 text-[var(--uml-glacier)]" aria-hidden="true" />
            <span>Provo River · Vivian Park</span>
          </div>
          <p className="mt-1 text-xs font-medium uml-num" data-bot="public-conditions-river">
            {formatRiverBadge(data.river)}
          </p>
          <p className="mt-1 text-[11px] text-[var(--uml-muted)]">
            USGS Gauge #10163000 · Blue-ribbon trout water
          </p>
        </div>

        {/* Card 4: Alpenglow, Sunset & Stargazing for Trip Date */}
        {light ? (
          <div className="rounded-2xl border border-[var(--uml-line)] bg-[var(--uml-surface-2)]/60 px-3.5 py-2.5" data-bot="public-conditions-alpenglow">
            <div className="flex items-center justify-between gap-1 text-[10px] uppercase tracking-[0.16em] text-[var(--uml-muted)]">
              <span className="inline-flex items-center gap-1.5">
                <Sun className="h-3.5 w-3.5 text-[var(--uml-gold)]" aria-hidden="true" />
                <span>Alpenglow &amp; Stars</span>
              </span>
              <span className="uml-num">{light.date}</span>
            </div>
            <p className="mt-1 text-xs font-medium uml-num">
              Golden hr {light.goldenHourStart} · Sunset {light.sunset}
            </p>
            <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-[var(--uml-muted)]">
              <MoonStar className="h-3 w-3 shrink-0 text-[var(--uml-gold)]" aria-hidden="true" />
              <span className="truncate">{light.moon.name} ({light.moon.illuminationPct}%) · Stars {light.stargazingStart}</span>
            </p>
          </div>
        ) : null}
      </div>

      <p className="mt-2.5 text-[11px] text-[var(--uml-muted)]">
        From the National Weather Service and USGS. Weather forecasts are not road reports and never state whether US-189 or SR-92 is open.
      </p>
    </section>
  );
}
