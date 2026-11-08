import { useEffect, useMemo, useState } from 'react';
import { api, type Reservation, type SharedWorkItem } from '../lib/api';
import { usePreferenceTimes } from '../hooks/useArrivalWindows';
import { agentBrief } from '../lib/agent-brief';
import { AGENT_ROSTER } from '../lib/agents';
import { GuideDesk } from './GuideDesk';
import { loadDateBlocks, loadQuoteCalendar } from '../lib/booked-nights';
import { loadCleanFixes, loadHouseFixes } from '../lib/clean-notes';
import { loadCompChoices } from '../lib/market/comps';
import { denverToday } from '../lib/market/dates';
import { loadMarketOverview } from '../lib/market/overview-client';
import type { MarketBoard } from '../lib/market/types';
import type { RateWeekCalendar } from '../lib/rate-week';
import { loadShadowLog, saveShadowLog, shadowClock } from '../lib/market/shadow-log';
import { loadShadowCalendar, shadowDayDigest, withToday } from '../lib/shadow-day-record';
import type { ClosedSpan } from '../lib/owner-ahead';

const AGENT_NAME = {
  amanda: 'Amanda',
  'co-host': 'Co-host',
  nora: 'Nora',
  muse: 'Muse',
  build: 'Build',
} as const;

export function AgentsHub({
  reservations,
  calendar,
  booksPaused = false,
}: {
  reservations: Reservation[];
  calendar: 'loading' | 'live' | 'off';
  booksPaused?: boolean;
}) {
  const [open, setOpen] = useState<SharedWorkItem[]>([]);
  const [done, setDone] = useState<SharedWorkItem[]>([]);
  const [workState, setWorkState] = useState<'loading' | 'live' | 'off'>('loading');
  const [compChoices] = useState(loadCompChoices);
  const [fixes] = useState(loadCleanFixes);
  const [houseFixes] = useState(loadHouseFixes);
  const [closed, setClosed] = useState<ClosedSpan[]>([]);
  const [blocksReady, setBlocksReady] = useState<boolean | null>(null);
  const [rateCalendar, setRateCalendar] = useState<RateWeekCalendar | null>(null);
  const preferenceTimes = usePreferenceTimes();
  const arrivalWindows = preferenceTimes?.arrival ?? null;
  const departureWindows = preferenceTimes?.departure ?? null;
  const today = denverToday();
  /**
   * Save today as a shadow day from this page too.
   *
   * The brief was reporting "Shadow day N of 7" while only the market page ever saved one, so a host
   * who read the brief every day still never finished the week and the rate push stayed closed with
   * no explanation of what to do. Opening the brief is the daily habit, so it has to count.
   */
  const [shadowSaved, setShadowSaved] = useState<number | null>(null);
  useEffect(() => {
    if (calendar !== 'live' || booksPaused || blocksReady !== true) return;
    let cancel = false;
    // The reservations come from this page's own props, not another fetch: a second read of the same
    // key on one page load is what exhausted the daily KV limit.
    void loadShadowCalendar()
      .then(async (inputs) => {
        if (cancel || !inputs) return;
        /*
         * Only fetch the real boards when this visit would actually save a day. `withToday` keeps one record
         * per date, so a second visit on the same day wrote nothing — and each board costs three KV reads
         * (comp set, all snapshots, approved rates). This page is the daily habit, so those reads would
         * repeat on every visit for no gain, on a store that has already hit Cloudflare's daily KV limit once.
         */
        const alreadySaved = loadShadowLog().some((day) => day.date === today && day.digest);
        const boards: Partial<Record<'river' | 'ranch' | 'lindon', MarketBoard>> = {};
        if (!alreadySaved) {
          const loaded = await Promise.all(
            (['river', 'ranch', 'lindon'] as const).map(async (id) => [id, await loadMarketOverview(id)] as const),
          );
          for (const [id, board] of loaded) {
            if (board) boards[id] = board;
          }
        }
        const record = shadowDayDigest({
          asOf: today,
          calendarLive: true,
          taken: inputs.taken,
          closed: inputs.closed,
          paused: { river: false, ranch: false, lindon: false },
          stays: reservations,
          paceLive: reservations.length > 0,
          preferenceTimes,
          compChoices,
          boards,
        });
        if (record.state !== 'ready') return;
        const next = withToday(loadShadowLog(), today, record.digest);
        saveShadowLog(next);
        setShadowSaved(shadowClock(next, today).days);
        void api.saveShadowDay({ date: today, digest: record.digest }).catch(() => {
          // The local log still counts on this tab; the server clock is the durable copy.
        });
      })
      .catch(() => {
        // A brief that cannot record a shadow day is still a useful brief.
      });
    return () => {
      cancel = true;
    };
  }, [calendar, booksPaused, blocksReady, today, preferenceTimes, compChoices, reservations]);
  const brief = useMemo(
    () =>
      agentBrief({
        asOf: today,
        stays: reservations,
        shadowDays: shadowSaved ?? shadowClock(loadShadowLog(), today).days,
        openJobs: workState === 'live' ? open.length : 0,
        calendarReady: calendar === 'live' && !booksPaused,
        booksPaused,
        fixes,
        houseFixes,
        closed,
        blocksReady,
        arrivalWindows,
        departureWindows,
        hiddenComps: {
          river: compChoices.river.excluded,
          ranch: compChoices.ranch.excluded,
          lindon: compChoices.lindon.excluded,
        },
        pinnedComps: {
          river: compChoices.river.pinned,
          ranch: compChoices.ranch.pinned,
          lindon: compChoices.lindon.pinned,
        },
        rateCalendar,
      }),
    /*
     * `shadowSaved` belongs here. The brief reads it to say "Shadow day N of 7", but it was missing
     * from this list, so the memo never recomputed when the day was recorded: the save succeeded (the
     * server held 2026-11-08) and the page still said "Shadow day 0 of 7". A host reading that concludes
     * the day did not save, presses again, and the week never appears to advance.
     */
    [today, reservations, workState, open.length, calendar, booksPaused, fixes, houseFixes, closed, blocksReady, arrivalWindows, departureWindows, compChoices, rateCalendar, shadowSaved],
  );

  useEffect(() => {
    let cancel = false;
    loadQuoteCalendar()
      .then((rows) => {
        if (!cancel) setRateCalendar(rows ? { taken: rows.nights, closed: rows.closed } : null);
      })
      .catch(() => {
        if (!cancel) setRateCalendar(null);
      });
    return () => {
      cancel = true;
    };
  }, []);

  useEffect(() => {
    let cancel = false;
    loadDateBlocks()
      .then((blocks) => {
        if (cancel) return;
        if (!blocks) {
          setBlocksReady(false);
          return;
        }
        setClosed(blocks);
        setBlocksReady(true);
      })
      .catch(() => {
        if (!cancel) setBlocksReady(false);
      });
    return () => {
      cancel = true;
    };
  }, []);

  useEffect(() => {
    let cancel = false;
    api
      .getSharedWork()
      .then((board) => {
        if (cancel) return;
        setOpen(board.open ?? []);
        setDone(board.done ?? []);
        setWorkState('live');
      })
      .catch(() => {
        if (!cancel) setWorkState('off');
      });
    return () => {
      cancel = true;
    };
  }, []);

  return (
    <section className="space-y-6" data-bot="agents-hub">
      <div>
        <p className="uml-kicker">Agents</p>
        <h2 className="font-display text-5xl">Who is working</h2>
        <p className="mt-2 max-w-2xl text-sm text-[var(--uml-muted)]">
          Five agents already run. Tonightâ€™s brief is read from the calendar, the preference cards, and the shadow run. It does not claim a job, send a text, or change the books.
        </p>
      </div>
      <div className="uml-panel rounded-3xl p-6" data-bot="agent-brief" data-blocks={closed.length}>
        <p className="uml-kicker">Tonight</p>
        <ul className="mt-4 space-y-3 text-sm">
          {brief.map((line, index) => (
            <li key={`${line.agent}-${index}`} data-bot="agent-brief-line">
              <span className="text-[var(--uml-gold)]">{AGENT_NAME[line.agent]}.</span> {line.text}
            </li>
          ))}
        </ul>
      </div>
      <GuideDesk
        host
        hidden={{
          river: compChoices.river.excluded,
          ranch: compChoices.ranch.excluded,
          lindon: compChoices.lindon.excluded,
        }}
        pinned={{
          river: compChoices.river.pinned,
          ranch: compChoices.ranch.pinned,
          lindon: compChoices.lindon.pinned,
        }}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        {AGENT_ROSTER.map((agent) => (
          <article key={agent.id} className="uml-panel rounded-3xl p-6" data-bot={`agent-${agent.id}`}>
            <p className="uml-kicker">{agent.role}</p>
            <h3 className="font-display text-4xl">{agent.name}</h3>
            <p className="mt-2 text-sm text-[var(--uml-muted)]">{agent.summary}</p>
            {agent.opens && (
              <button
                type="button"
                className="uml-gold-btn mt-4 rounded-full px-4 py-2 text-xs uppercase tracking-[0.16em]"
                data-bot={`agent-open-${agent.id}`}
                onClick={() => window.dispatchEvent(new CustomEvent(agent.opens!))}
              >
                Open {agent.name}
              </button>
            )}
          </article>
        ))}
      </div>
      <div className="uml-panel rounded-3xl p-6" data-bot="agent-work">
        <p className="uml-kicker">Shared desk</p>
        {workState === 'loading' && <p className="mt-3 text-sm text-[var(--uml-muted)]">Loading the job listâ€¦</p>}
        {workState === 'off' && (
          <p className="mt-3 text-sm text-[var(--uml-muted)]">The job list is not available from this server.</p>
        )}
        {workState === 'live' && open.length === 0 && done.length === 0 && (
          <p className="mt-3 text-sm text-[var(--uml-muted)]">No shared jobs yet.</p>
        )}
        {workState === 'live' && (open.length > 0 || done.length > 0) && (
          <ul className="mt-3 space-y-2 text-sm">
            {open.map((item) => (
              <li key={item.key}>
                {item.stale
                  ? `${item.ownerName} claimed ${item.title} ${item.atDenver} and did not finish.`
                  : `${item.ownerName} has ${item.title} since ${item.atDenver}.`}
              </li>
            ))}
            {done.slice(0, 8).map((item) => (
              <li key={item.key} className="text-[var(--uml-muted)]">
                {item.ownerName} finished {item.title} {item.atDenver}.
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

