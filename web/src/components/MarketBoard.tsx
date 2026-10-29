import { useMemo, useState } from 'react';
import { buildMarketBoard } from '../lib/market/board';
import { addDays, denverToday } from '../lib/market/dates';
import type { HouseId, NightRow } from '../lib/market/types';
import { formatWhole } from '../lib/luxury';

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
    to: number;
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
      to: night.proposedGuest,
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

export function MarketBoard() {
  const [house, setHouse] = useState<HouseId>('river');
  const board = useMemo(() => buildMarketBoard(house, denverToday(), 90), [house]);
  const moves = groupMoves(board.nights);

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
          <Stat label="Comps booked, 30 days" value={`${board.summary.compPace30}%`} hint={`${board.summary.raiseNights} shadow raises`} />
        </dl>
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
                    ? ` · ${formatWhole(move.from)} → ${formatWhole(move.to)}`
                    : ' · hold the base, consider a promotion'}
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
