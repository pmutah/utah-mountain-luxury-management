import { useEffect, useMemo, useState } from 'react';
import { loadPaceStays, loadQuoteCalendar } from '../lib/booked-nights';
import { usePreferenceTimes } from '../hooks/useArrivalWindows';
import { chooseComps, loadCompChoices, saveCompChoices, type CompChoice } from '../lib/market/comps';
import { benchFor, compsFor } from '../lib/market/fixtures';
import { RIVER_FIRST_STAY } from '../lib/brand';
import { buildMarketBoard } from '../lib/market/board';
import { addDays, denverToday } from '../lib/market/dates';
import type { YearPace } from '../lib/market/fill';
import { forwardWindows, sampleBookedShare } from '../lib/market/forward';
import { runShadow, portfolioDigest } from '../lib/market/shadow';
import {
  hospitablePushAllowed,
  loadShadowLog,
  recordShadowDay,
  saveShadowLog,
  shadowClock,
  shadowClockLine,
} from '../lib/market/shadow-log';
import { judgeTrial } from '../lib/market/whatif';
import type { HouseId, NightRow } from '../lib/market/types';
import { formatWhole } from '../lib/luxury';
import { listingOpportunities } from '../lib/listing';
import { bookingStartSummary } from '../lib/booking-starts';
import { directNight } from '../lib/quote';
import { shortestStay } from '../lib/shortest-stay';
import { comparePhrase } from '../lib/also-open';
import { addonPhrase, openArrivals } from '../lib/open-arrivals';
import { stayLengths } from '../lib/stay-lengths';
import { stayLinkSearch } from '../lib/stay-link';
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
    minNights: number;
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
      last.reason === night.reason &&
      last.minNights === night.minNights
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
      minNights: night.minNights,
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
  const [closed, setClosed] = useState<Record<HouseId, string[]>>(EMPTY_TAKEN);
  const [calendar, setCalendar] = useState<'loading' | 'live' | 'off'>('loading');
  const [stays, setStays] = useState<PaceStay[] | null>(null);
  const preferenceTimes = usePreferenceTimes();
  const [paceState, setPaceState] = useState<'loading' | 'live' | 'off'>('loading');
  const [compChoices, setCompChoices] = useState(loadCompChoices);
  const [storedLog] = useState(loadShadowLog);
  const [trial, setTrial] = useState<{ date: string; text: string } | null>(null);
  const today = denverToday();
  const activeComps = useMemo(
    () => ({
      river: chooseComps('river', compChoices.river),
      ranch: chooseComps('ranch', compChoices.ranch),
      lindon: chooseComps('lindon', compChoices.lindon),
    }),
    [compChoices],
  );
  const board = useMemo(() => buildMarketBoard(house, today, 90, activeComps[house]), [house, today, activeComps]);
  const pace: YearPace =
    paceState !== 'live' || !stays ? 'unknown' : grossPace(house, stays, today).stillNeeded > 0 ? 'short' : 'met';
  const shadow = useMemo(
    () =>
      runShadow(
        board,
        calendar === 'live' ? (taken[house] ?? []) : [],
        paused[house],
        today,
        pace,
        calendar === 'live' ? (closed[house] ?? []) : [],
      ),
    [board, calendar, taken, closed, house, paused, today, pace],
  );
  const daily = useMemo(() => {
    const paceOf = (id: HouseId): YearPace =>
      paceState !== 'live' || !stays ? 'unknown' : grossPace(id, stays, today).stillNeeded > 0 ? 'short' : 'met';
    return portfolioDigest({
      asOf: today,
      taken,
      paused,
      pace: { river: paceOf('river'), ranch: paceOf('ranch'), lindon: paceOf('lindon') },
      calendarLive: calendar === 'live',
      comps: activeComps,
      closed,
      stays: paceState === 'live' && stays ? stays : undefined,
      arrivalWindows: paceState === 'live' && preferenceTimes ? preferenceTimes.arrival : null,
      departureWindows: paceState === 'live' && preferenceTimes ? preferenceTimes.departure : null,
    });
  }, [today, taken, closed, paused, stays, paceState, calendar, activeComps, preferenceTimes]);
  const settled = calendar !== 'loading' && paceState !== 'loading';
  const shadowLog = useMemo(
    () => (settled ? recordShadowDay(storedLog, today, daily) : storedLog),
    [settled, storedLog, today, daily],
  );
  const clock = shadowClock(shadowLog, today);
  const pushOpen = hospitablePushAllowed(clock.ready, false);
  useEffect(() => {
    if (!settled) return;
    saveShadowLog(shadowLog);
  }, [settled, shadowLog]);
  const moves = groupMoves(shadow.nights);
  const choice = compChoices[house];
  const cards = [...board.comps].sort((a, b) => Number(choice.pinned.includes(b.id)) - Number(choice.pinned.includes(a.id)));
  const hidden = choice.excluded
    .map((id) => [...compsFor(house), ...benchFor(house)].find((comp) => comp.id === id))
    .filter((comp): comp is NonNullable<typeof comp> => Boolean(comp));

  const windows = stays && paceState === 'live' ? forwardWindows(house, stays, today, closed[house] ?? []) : null;
  const trialNight =
    (trial && shadow.nights.find((night) => night.date === trial.date)) ||
    shadow.nights.find((night) => house !== 'river' || night.date >= RIVER_FIRST_STAY) ||
    shadow.nights[0];
  const trialText = trial && trial.date === trialNight?.date ? trial.text : String(trialNight?.ourGuest ?? '');
  const verdict = trialNight
    ? judgeTrial({
        publishedGuest: trialNight.ourGuest,
        trialGuest: Number(trialText),
        floorGuest: trialNight.floorGuest,
        ceilingGuest: trialNight.ourGuest * 2,
        maxMove: 0.08,
        compRates: trialNight.compRates,
        closed: trialNight.action === 'closed',
        booked: trialNight.action === 'booked',
        holiday: board.nights.some((night) => night.date === trialNight.date && night.action === 'locked'),
      })
    : null;
  const housePace: YearPace =
    paceState !== 'live' || !stays ? 'unknown' : grossPace(house, stays, today).stillNeeded > 0 ? 'short' : 'met';
  const bookingNight =
    trialNight && trialNight.action !== 'closed' && trialNight.action !== 'booked'
      ? directNight(house, trialNight.date, taken[house] ?? [], today, housePace)
      : null;
  const openings = useMemo(
    () => (calendar === 'live' ? openArrivals(house, taken[house] ?? [], today, pace) : []),
    [calendar, house, taken, today, pace],
  );
  const lengths = useMemo(() => {
    const first = openings[0];
    if (calendar !== 'live' || !first) return null;
    return stayLengths(house, first.checkIn, taken[house] ?? [], today, pace);
  }, [calendar, openings, house, taken, today, pace]);
  const addons = calendar === 'live' ? addonPhrase(house, taken[house] ?? [], today, pace) : '';
  const compared = useMemo(() => {
    if (calendar !== 'live') return '';
    const paceFor = (id: HouseId): YearPace =>
      paceState !== 'live' || !stays ? 'unknown' : grossPace(id, stays, today).stillNeeded > 0 ? 'short' : 'met';
    return comparePhrase(house, taken, today, paceFor, closed);
  }, [calendar, house, taken, closed, today, paceState, stays]);
  const starts = useMemo(
    () => (calendar === 'live' ? bookingStartSummary(house, taken[house] ?? [], today, pace) : ''),
    [calendar, house, taken, today, pace],
  );
  const bookingStart =
    trialNight && calendar === 'live' && trialNight.action !== 'closed' && trialNight.action !== 'booked'
      ? shortestStay(house, trialNight.date, taken[house] ?? [], today, pace)
      : undefined;

  function writeChoice(next: CompChoice) {
    const all = { ...compChoices, [house]: next };
    setCompChoices(all);
    saveCompChoices(all);
  }

  useEffect(() => {
    let cancel = false;
    loadQuoteCalendar()
      .then((rows) => {
        if (cancel) return;
        if (rows) {
          setTaken(rows.nights);
          setClosed(rows.closed);
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
      <div className="uml-panel rounded-3xl p-5 sm:p-6" data-bot="market-daily">
        <p className="uml-kicker">Daily text</p>
        <p className="mt-2 max-w-xl text-sm text-[var(--uml-muted)]">
          One summary for River, Ranch, and Lindon. Booked nights stay at the published rate. This text is not sent.
        </p>
        <pre className="mt-4 whitespace-pre-wrap font-sans text-sm leading-6" data-bot="market-daily-text">
          {daily}
        </pre>
        <p className="mt-3 text-sm" data-bot="market-shadow-clock">
          {settled ? shadowClockLine(clock) : 'This Denver day is counted once the calendar check finishes.'}
        </p>
        <p className="mt-1 text-sm text-[var(--uml-muted)]" data-bot="market-shadow-dates">
          {clock.dates.length === 0
            ? 'No shadow day is saved on this browser yet.'
            : `Saved on this browser: ${clock.dates.map(shortDate).join(', ')}.`}
        </p>
        <p className="mt-1 text-xs text-[var(--uml-muted)]" data-bot="market-shadow-push">
          {pushOpen ? 'Hospitable write open.' : 'Hospitable write closed.'}
        </p>
      </div>
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
        <div className="mt-6" data-bot="market-pace">
          <p className="uml-kicker">Next 30, 60, and 90 nights</p>
          <p className="mt-2 max-w-xl text-sm text-[var(--uml-muted)]">
            Our share is the live calendar. The comp share is the sample set. A booked night stays at the published rate. A calendar block is left out of the sellable nights.
          </p>
          {house === 'river' && today < RIVER_FIRST_STAY && (
            <p className="mt-2 text-xs text-[var(--uml-muted)]">Nights before November 1 are closed and left out.</p>
          )}
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {([30, 60, 90] as const).map((days) => {
              const ours = windows?.find((window) => window.days === days);
              const comps = sampleBookedShare(
                board.nights.map((night) => night.compBookedShare),
                days,
              );
              return (
                <article key={days} className="rounded-2xl border border-white/10 p-4" data-bot={`market-pace-${days}`}>
                  <p className="uml-kicker">{days} nights</p>
                  <p className="font-display text-3xl uml-num mt-1">{ours ? `${ours.bookedShare}%` : '—'}</p>
                  <p className="mt-1 text-sm text-[var(--uml-muted)]">
                    {paceState === 'loading' && 'Checking the calendar…'}
                    {paceState === 'off' && 'Our calendar is not on this server yet.'}
                    {paceState === 'live' &&
                      ours &&
                      `${ours.booked} of ${ours.sellable} nights booked · ${ours.startingStays} ${ours.startingStays === 1 ? 'stay begins' : 'stays begin'} here · ${ours.held} calendar blocks left out`}
                  </p>
                  <p className="mt-2 text-sm">Sample comps {comps}% booked</p>
                </article>
              );
            })}
          </div>
        </div>
        {openings.length > 0 && (
          <div className="mt-6" data-bot="market-open">
            <p className="uml-kicker">Open on our booking page</p>
            <p className="mt-2 max-w-xl text-sm text-[var(--uml-muted)]">
              The same next arrivals a guest can pick. Opening one does not send a request.
            </p>
            <ul className="mt-3 flex flex-wrap gap-2">
              {openings.map((item) => (
                <li key={item.checkIn}>
                  <a
                    className="inline-block rounded-full border border-[var(--uml-line)] px-4 py-2 text-sm"
                    data-bot="market-open-link"
                    data-in={item.checkIn}
                    data-out={item.checkOut}
                    href={`/book${stayLinkSearch({ house, checkIn: item.checkIn, checkOut: item.checkOut, guests: '' })}`}
                  >
                    {item.label} · {formatWhole(item.direct)}
                  </a>
                </li>
              ))}
            </ul>
            {lengths && (
              <div className="mt-4" data-bot="market-lengths">
                <p className="text-sm text-[var(--uml-muted)]">
                  Lengths our booking page can quote from the first open arrival. Opening one does not send a request.
                </p>
                <ul className="mt-3 flex flex-wrap gap-2">
                  {lengths.choices.map((choice) => (
                    <li key={choice.checkOut}>
                      <a
                        className="inline-block rounded-full border border-[var(--uml-line)] px-4 py-2 text-sm"
                        data-bot="market-length"
                        data-nights={choice.nights}
                        data-out={choice.checkOut}
                        href={`/book${stayLinkSearch({
                          house,
                          checkIn: openings[0]?.checkIn ?? '',
                          checkOut: choice.checkOut,
                          guests: '',
                        })}`}
                      >
                        {choice.nights === 1 ? '1 night' : `${choice.nights} nights`} · {formatWhole(choice.direct)}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {addons && (
              <p className="mt-4 text-sm text-[var(--uml-muted)]" data-bot="market-addons">
                {addons}. These stay requests. This desk does not send them.
              </p>
            )}
            {compared && (
              <p className="mt-4 text-sm" data-bot="market-compare">
                {compared} This desk does not send a request.
              </p>
            )}
          </div>
        )}
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
        {starts && (
          <p className="mt-3 text-sm" data-bot="market-starts">
            {starts} This is the booking calendar. Nothing is sent.
          </p>
        )}
        {calendar === 'loading' && <p className="text-xs text-[var(--uml-muted)]">Checking which nights are already booked…</p>}
        {calendar === 'off' && (
          <p className="text-xs text-[var(--uml-muted)]">The calendar is not on this server yet, so booked nights are not masked.</p>
        )}
        {calendar === 'live' && paused[house] && (
          <p className="text-xs text-[var(--uml-muted)]">Paused. Published rates stay, including on nights that are already booked.</p>
        )}
        {calendar === 'live' && !paused[house] && (
          <p className="text-xs text-[var(--uml-muted)]" data-bot="market-stays">
            {shadow.counts.booked} booked nights in this window stay put.{' '}
            {shadow.nights.filter((night) => night.reason.startsWith('Closed on the calendar')).length} calendar blocks stay closed.
            A block is not a booked night.
          </p>
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
                  {move.minNights > 1 ? ` · at least ${move.minNights} nights` : ''}
                  {move.action === 'raise'
                    ? ` · ${formatWhole(move.from)} → ${formatWhole(move.base)}`
                    : ` · 20% off · ${formatWhole(move.base)} base · ${formatWhole(move.offer)} after`}
                </p>
                <p className="text-[var(--uml-muted)]">{move.reason}</p>
              </li>
            ))}
          </ul>
        )}
        {trialNight && verdict && (
          <form className="mt-6 grid gap-3 sm:grid-cols-[12rem_10rem_1fr] sm:items-end" data-bot="market-whatif" onSubmit={(event) => event.preventDefault()}>
            <label className="block text-sm">
              <span className="uml-kicker">Try a night</span>
              <select
                className="mt-2 w-full rounded-xl border border-white/15 bg-transparent px-3 py-2"
                data-bot="market-whatif-date"
                value={trialNight.date}
                onChange={(event) => {
                  const date = event.target.value;
                  const next = shadow.nights.find((night) => night.date === date);
                  setTrial({ date, text: String(next?.ourGuest ?? '') });
                }}
              >
                {shadow.nights.slice(0, 21).map((night) => (
                  <option key={night.date} value={night.date}>
                    {shortDate(night.date)}
                    {night.season ? ` · ${night.season}` : ''}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="uml-kicker">Nightly ask</span>
              <input
                className="mt-2 w-full rounded-xl border border-white/15 bg-transparent px-3 py-2 uml-num"
                data-bot="market-whatif-price"
                inputMode="numeric"
                value={trialText}
                onChange={(event) => setTrial({ date: trialNight.date, text: event.target.value })}
              />
            </label>
            <p className="text-sm" data-bot="market-whatif-verdict">
              {verdict.note}
              {verdict.wouldRaise && trialNight.action !== 'raise' ? ' The shadow run is not raising this night.' : ''}
              {' '}Floor {formatWhole(trialNight.floorGuest)} · ceiling {formatWhole(trialNight.ourGuest * 2)} · most tonight {formatWhole(verdict.dailyCap)}.
              {bookingStart && bookingStart.nights > 1
                ? ` Our booking page asks for at least ${bookingStart.nights} nights.`
                : bookingStart === null
                  ? ' Our booking page cannot start a stay on this night.'
                  : trialNight.action !== 'closed' && trialNight.minNights > 1
                    ? ` Our booking page asks for at least ${trialNight.minNights} nights.`
                    : ''}
              {trialNight.action === 'booked' ? ' Our booking page leaves this night booked.' : ''}
              {trialNight.reason.startsWith('Closed on the calendar') ? ' Our booking page leaves this night closed.' : ''}
              {bookingNight ? (
                <span data-bot="market-direct">
                  {` Our booking page charges ${formatWhole(bookingNight.direct)} for this night, before tax.`}
                  {bookingNight.promotionPercent === 20 ? ' The 20% fill rate is on.' : ''}
                </span>
              ) : null}
            </p>
          </form>
        )}
      </div>

      <div className="uml-panel rounded-3xl p-5 sm:p-6" data-bot="market-opportunities">
        <p className="uml-kicker">Opportunities</p>
        <p className="mt-2 max-w-xl text-sm text-[var(--uml-muted)]">
          What our own booking page still needs. Nothing here posts to Airbnb, VRBO, or Hospitable.
        </p>
        <ul className="mt-4 space-y-3">
          {listingOpportunities(house).map((item) => (
            <li key={item.id} data-bot={`market-opportunity-${item.id}`}>
              <p className="text-sm">
                <span className="text-[#d4b56a]">{item.status === 'ready' ? 'On our page' : 'Open'}</span>
                {' · '}
                {item.title}
              </p>
              <p className="text-sm text-[var(--uml-muted)]">{item.detail}</p>
            </li>
          ))}
        </ul>
      </div>

      <div className="grid gap-3 sm:grid-cols-2" data-bot="market-comps">
        {cards.map((comp, index) => (
          <article key={comp.id} className="uml-panel rounded-3xl p-4" data-bot={index === 0 ? 'market-top-comp' : undefined}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="uml-kicker">
                  #{index + 1} · {comp.area}
                  {choice.pinned.includes(comp.id) ? ' · Pinned' : ''}
                </p>
                <h3 className="font-display text-2xl leading-tight mt-1">{comp.name.replace('Sample · ', '')}</h3>
              </div>
              <p className="uml-num text-lg">{formatWhole(comp.nextWeekendAsk)}</p>
            </div>
            <p className="mt-2 text-sm text-[var(--uml-muted)]">
              {comp.beds} bed · sleeps {comp.sleeps} · {comp.rating.toFixed(2)} · {comp.reviews} reviews
              {comp.guestFavorite ? ' · Guest favorite' : ''} · {comp.distanceMi} mi · {comp.occupancy}% booked
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                className="uml-nav"
                data-bot="comp-pin"
                data-id={comp.id}
                aria-pressed={choice.pinned.includes(comp.id)}
                onClick={() =>
                  writeChoice({
                    pinned: choice.pinned.includes(comp.id)
                      ? choice.pinned.filter((id) => id !== comp.id)
                      : [...choice.pinned, comp.id],
                    excluded: choice.excluded.filter((id) => id !== comp.id),
                  })
                }
              >
                {choice.pinned.includes(comp.id) ? 'Unpin' : 'Pin'}
              </button>
              <button
                type="button"
                className="uml-nav"
                data-bot="comp-hide"
                data-id={comp.id}
                onClick={() =>
                  writeChoice({
                    pinned: choice.pinned.filter((id) => id !== comp.id),
                    excluded: [...choice.excluded, comp.id],
                  })
                }
              >
                Hide
              </button>
            </div>
          </article>
        ))}
      </div>
      {hidden.length > 0 && (
        <div className="uml-panel rounded-3xl p-4" data-bot="market-hidden-comps">
          <p className="uml-kicker">Hidden</p>
          <ul className="mt-3 space-y-2 text-sm">
            {hidden.map((comp) => (
              <li key={comp.id} className="flex items-center justify-between gap-3">
                <span>{comp.name.replace('Sample · ', '')}</span>
                <button
                  type="button"
                  className="uml-nav"
                  data-bot="comp-restore"
                  data-id={comp.id}
                  onClick={() =>
                    writeChoice({
                      pinned: choice.pinned,
                      excluded: choice.excluded.filter((id) => id !== comp.id),
                    })
                  }
                >
                  Restore
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
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
