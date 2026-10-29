import { useEffect, useMemo, useState } from 'react';
import { loadBookedNights, loadPaceStays } from '../lib/booked-nights';
import { buildMarketBoard } from '../lib/market/board';
import { addDays, denverToday } from '../lib/market/dates';
import type { YearPace } from '../lib/market/fill';
import { runShadow } from '../lib/market/shadow';
import type { HouseId, NightRow } from '../lib/market/types';
import { formatWhole } from '../lib/luxury';
import { grossPace, type PaceStay } from '../lib/revenue-goals';

const HOUSES: { id: HouseId; label: string }[] = [
  { id: 'river', label: 'River' },
  { id: 'ranch', label: 'Ranch' },
  { id: 'lindon', label: 'Lindon' },
];

function shortDate(iso: string) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function dateSpan(first: string, last: string) {
  return first === last ? shortDate(first) : `${shortDate(first)} – ${shortDate(last)}`;
}

function groupMoves(nights: NightRow[]) {
  const groups: Array<{
    first: string;
    last: string;
    action: NightRow['action'];
    reason: string;
    season: string | null;
    from: number;
    base: number;
    offer: number;
  }> = [];
  for (const night of nights) {
    if (night.action !== 'raise' && night.action !== 'promote') continue;
    const last = groups[groups.length - 1];
    if (
      last &&
      addDays(last.last, 1) === night.date &&
      last.action === night.action &&
      last.reason === night.reason
    ) {
      last.last = night.date;
      continue;
    }
    groups.push({
      first: night.date,
      last: night.date,
      action: night.action,
      reason: night.reason,
      season: night.season,
    from: night.ourGuest,
    base: night.proposedGuest,
    offer: night.offerGuest,
  });
  }
  return groups.slice(0, 6);
}

function RateBand({ nights }: { nights: NightRow[] }) {
  const width = 920;
  const height = 220;
  const pad = 28;
  const rates = nights.flatMap((night) => [night.p25, night.p75, night.ourGuest, night.proposedGuest]);
  const max = Math.max(...rates);
  const min = Math.min(...rates) * 0.92;
  const x = (index: number) => pad + (index / Math.max(1, nights.length - 1)) * (width - pad * 2);
  const y = (value: number) => height - pad - ((value - min) / (max - min || 1)) * (height - pad * 2);
  const line = (pick: (night: NightRow) => number) =>
    nights.map((night, index) => `${index === 0 ? 'M' : 'L'} ${x(index).toFixed(1)} ${y(pick(night)).toFixed(1)}`).join(' ');
  const band = [
    ...nights.map((night, index) => `${index === 0 ? 'M' : 'L'} ${x(index).toFixed(1)} ${y(night.p75).toFixed(1)}`),
    ...[...nights].reverse().map((night, index) => `L ${x(nights.length - 1 - index).toFixed(1)} ${y(night.p25).toFixed(1)}`),
    'Z',
  ].join(' ');

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-56" role="img" aria-label="Our nightly ask against the comp rate band">
      <path d={band} fill="rgba(61, 143, 138, 0.28)" />
      <path d={line((night) => night.median)} fill="none" stroke="#7eb8b4" strokeWidth="1.5" />
      <path d={line((night) => night.ourGuest)} fill="none" stroke="#d4b56a" strokeWidth="2.4" />
      {nights.filter((_, index) => index % 14 === 0).map((night) => {
        const index = nights.indexOf(night);
        return (
          <text key={night.date} x={x(index)} y={height - 6} fill="currentColor" fontSize="11" opacity="0.55">
            {shortDate(night.date)}
          </text>
        );
      })}
    </svg>
  );
}

const EMPTY_TAKEN: Record<HouseId, string[]> = { ranch: [], lindon: [], river: [] };

export function MarketBoard() {
  const [house, setHouse] = useState<HouseId>('river');
  const [paused, setPaused] = useState<Record<HouseId, boolean>>({ ranch: false, lindon: false, river: false });
  const [taken, setTaken] = useState<Record<HouseId, string[]>>(EMPTY_TAKEN);
  const [calendar, setCalendar] = useState<'loading' | 'live' | 'off'>('loading');
  const [stays, setStays] = useState<PaceStay[] | null>(null);
  const [paceState, setPaceState] = useState<'loading' | 'live' | 'off'>('loading');
  const today = denverToday();
  const board = useMemo(() => buildMarketBoard(house, today, 90), [house, today]);
  const pace: YearPace =
    paceState !== 'live' || !stays ? 'unknown' : grossPace(house, stays, today).stillNeeded > 0 ? 'short' : 'met';
  const shadow = useMemo(
    () => runShadow(board, calendar === 'live' ? (taken[house] ?? []) : [], paused[house], today, pace),
    [board, calendar, taken, house, paused, today, pace],
  );
  const moves = groupMoves(shadow.nights);

  useEffect(() => {
    let cancel = false;
    loadBookedNights()
      .then((nights) => {
        if (cancel) return;
        if (nights) {
          setTaken(nights);
          setCalendar('live');
        } else setCalendar('off');
      })
      .catch(() => {
        if (!cancel) setCalendar('off');
      });
    return () => {
      cancel = true;
    };
  }, []);

  useEffect(() => {
    let cancel = false;
    loadPaceStays()
      .then((rows) => {
        if (cancel) return;
        if (rows) {
          setStays(rows);
          setPaceState('live');
        } else setPaceState('off');
      })
      .catch(() => {
        if (!cancel) setPaceState('off');
      });
    return () => {
      cancel = true;
    };
  }, []);

  return (
    <section className="space-y-6" data-bot="market-board">
      <div className="uml-panel rounded-3xl p-5 sm:p-6">
        <p className="uml-kicker">Market</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-4xl leading-none">Top 10 comps</h2>
            <p className="mt-2 max-w-xl text-sm text-[var(--uml-muted)]">
              Sample canyon and valley homes, so the board can be judged before live data is connected.
              Shadow mode only. Nothing here changes Airbnb, VRBO, or Hospitable.
            </p>
          </div>
          <div className="flex gap-2" role="tablist" aria-label="House">
            {HOUSES.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={house === item.id}
                data-bot={`market-house-${item.id}`}
                onClick={() => setHouse(item.id)}
                className="uml-nav"
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
        <dl className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Our ask, next 30" value={formatWhole(board.summary.ourTypical)} />
          <Stat label="Comp median" value={formatWhole(board.summary.medianAsk)} />
          <Stat label="Our percentile" value={`p${board.summary.ourPercentile}`} hint={`Target p${board.targetPercentile}`} />
          <Stat label="Comps booked, 30 days" value={`${board.summary.compPace30}%`} hint={`${shadow.counts.raise} shadow raises`} />
        </dl>
      </div>

      <div className="uml-panel rounded-3xl p-5 sm:p-6" data-bot="market-shadow">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="uml-kicker">Tonight's shadow run</p>
            <p className="mt-2 max-w-xl text-sm text-[var(--uml-muted)]">
              Booked nights, closed nights, and a paused house stay at the published rate. A promotion is 20% off that rate on Airbnb and VRBO, and only when the fill rules say so. This summary is the daily text. It is not sent.
            </p>
          </div>
          <button
            type="button"
            className="uml-nav"
            data-bot="market-pause"
            aria-pressed={paused[house]}
            onClick={() => setPaused((current) => ({ ...current, [house]: !current[house] }))}
          >
            {paused[house] ? 'Resume this house' : 'Pause this house'}
          </button>
        </div>
        <pre className="mt-4 whitespace-pre-wrap font-sans text-sm leading-6" data-bot="market-digest">
          {shadow.digest}
        </pre>
        {calendar === 'loading' && <p className="text-xs text-[var(--uml-muted)]">Checking which nights are already booked…</p>}
        {calendar === 'off' && (
          <p className="text-xs text-[var(--uml-muted)]">The calendar is not on this server yet, so booked nights are not masked.</p>
        )}
        {calendar === 'live' && paused[house] && (
          <p className="text-xs text-[var(--uml-muted)]">Paused. Published rates stay, including on nights that are already booked.</p>
        )}
        {calendar === 'live' && !paused[house] && (
          <p className="text-xs text-[var(--uml-muted)]">{shadow.counts.booked} booked nights in this window stay put.</p>
        )}
      </div>

      <div className="uml-panel rounded-3xl p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="uml-kicker">Next 90 nights</p>
          <p className="text-xs text-[var(--uml-muted)]">
            <span className="text-[#d4b56a]">Gold</span> is our ask. The band is the open comps, 25th to 75th.
          </p>
        </div>
        <div className="mt-3 text-[var(--uml-muted)]">
          <RateBand nights={board.nights} />
        </div>
        {moves.length === 0 ? (
          <p className="mt-2 text-sm text-[var(--uml-muted)]">No shadow moves in this window. Hold the rate.</p>
        ) : (
          <ul className="mt-2 grid gap-3 sm:grid-cols-2">
            {moves.map((move) => (
              <li key={move.first} className="text-sm">
                <p>
                  <span className="text-[#d4b56a]">{dateSpan(move.first, move.last)}</span>
                  {move.season ? ` · ${move.season}` : ''}
                  {move.action === 'raise'
                    ? ` · ${formatWhole(move.from)} → ${formatWhole(move.base)}`
                    : ` · 20% off · ${formatWhole(move.base)} base · ${formatWhole(move.offer)} after`}
                </p>
                <p className="text-[var(--uml-muted)]">{move.reason}</p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {board.comps.map((comp, index) => (
          <article key={comp.id} className="uml-panel rounded-3xl p-4" data-bot={index === 0 ? 'market-top-comp' : undefined}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="uml-kicker">#{index + 1} · {comp.area}</p>
                <h3 className="font-display text-2xl leading-tight mt-1">{comp.name.replace('Sample · ', '')}</h3>
              </div>
              <p className="uml-num text-lg">{formatWhole(comp.nextWeekendAsk)}</p>
            </div>
            <p className="mt-2 text-sm text-[var(--uml-muted)]">
              {comp.beds} bed · sleeps {comp.sleeps} · {comp.rating.toFixed(2)} · {comp.reviews} reviews
              {comp.guestFavorite ? ' · Guest favorite' : ''} · {comp.distanceMi} mi · {comp.occupancy}% booked
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <dt className="uml-kicker">{label}</dt>
      <dd className="font-display text-3xl uml-num mt-1">{value}</dd>
      {hint && <p className="text-xs text-[var(--uml-muted)]">{hint}</p>}
    </div>
  );
}
