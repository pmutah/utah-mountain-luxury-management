import { useMemo } from 'react';
import { ArrowRight, CalendarClock, CloudSnow, FileSpreadsheet, Sparkles, Wrench } from 'lucide-react';
import type { Reservation } from '../lib/api';
import type { DashboardTab } from '../lib/bot-nav';
import { denverToday } from '../lib/market/dates';
import type { HouseId } from '../lib/market/types';
import type { ClosedSpan } from '../lib/owner-ahead';
import { nightsAtRisk } from '../lib/platform/nights-at-risk';
import { isActiveStay, stayNights } from '../lib/report';
import { buildTodayDesk, buildTurnovers } from '../lib/today';

function closedRecordFromSpans(spans: ClosedSpan[]): Partial<Record<HouseId, string[]>> {
  const out: Record<HouseId, Set<string>> = {
    ranch: new Set(),
    lindon: new Set(),
    river: new Set(),
  };
  for (const span of spans) {
    const house = span.propertyId as HouseId;
    if (!out[house]) continue;
    const cursor = new Date(`${span.start}T00:00:00Z`);
    const end = new Date(`${span.end}T00:00:00Z`);
    let guard = 0;
    while (cursor < end && guard < 370) {
      out[house].add(cursor.toISOString().slice(0, 10));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
      guard += 1;
    }
  }
  return {
    ranch: [...out.ranch],
    lindon: [...out.lindon],
    river: [...out.river],
  };
}

/**
 * Deterministic + AI-assisted operational playbooks inspired by Conduit, Breezeway, and Guesty.
 *
 * Every playbook computes live portfolio signals from real stays and blocks, sends nothing automatically,
 * and hands off either to the target desk or to `CommandPalette` (`uml:command`) with a tailored analytical prompt.
 */
export function AgentPlaybooks({
  reservations,
  closed,
  blocksReady,
  booksPaused,
}: {
  reservations: Reservation[];
  closed: ClosedSpan[];
  blocksReady: boolean | null;
  booksPaused: boolean;
}) {
  const today = denverToday();

  const metrics = useMemo(() => {
    if (booksPaused) return null;
    const desk = buildTodayDesk(reservations, today);
    const turns = buildTurnovers(reservations, today);
    const closedMap = blocksReady ? closedRecordFromSpans(closed) : null;
    const risk = closedMap
      ? nightsAtRisk({
          reservations: reservations.map((stay) => ({
            propertyId: stay.propertyId,
            checkIn: stay.checkIn,
            checkOut: stay.checkOut,
            status: stay.status,
          })),
          asOf: today,
          horizonDays: 14,
          closed: closedMap,
        })
      : null;

    const totalStranded = risk ? risk.reduce((sum, row) => sum + row.unsellable, 0) : null;
    const sameDayTurns = turns.filter((t) => t.gapNights === 0).length;
    const canyonArrivals = desk.arrivals.filter((a) => a.house === 'river').length;
    const yearPrefix = `${today.slice(0, 4)}-`;
    const staysOver7 = reservations.filter(
      (r) => isActiveStay(r) && r.checkIn.startsWith(yearPrefix) && stayNights(r.checkIn, r.checkOut) > 7,
    ).length;

    return {
      arrivalsCount: desk.arrivals.length,
      canyonArrivals,
      totalStranded,
      turnsCount: turns.length,
      sameDayTurns,
      staysOver7,
    };
  }, [reservations, closed, blocksReady, booksPaused, today]);

  function askCohost(prompt: string) {
    window.dispatchEvent(new CustomEvent('uml:command', { detail: { prompt } }));
  }

  function jumpTo(tab: DashboardTab) {
    if (window.UML) {
      window.UML.navigate(tab);
    } else {
      window.location.hash = `#/${tab}`;
    }
  }

  return (
    <div className="uml-panel rounded-3xl p-6" data-bot="agent-playbooks">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="uml-kicker">One-click Copilot Playbooks</p>
          <h3 className="font-display text-3xl mt-1">Smart Operations &amp; Audit Workflows</h3>
          <p className="mt-1 max-w-2xl text-xs text-[var(--uml-muted)]">
            Grounded in live calendar, turnover, and tax rules. Running a playbook drafts analysis in Co-host or opens the desk — it never texts a guest or alters a published rate.
          </p>
        </div>
        <span className="rounded-full border border-[var(--uml-line)] px-3 py-1 text-[10px] uppercase tracking-widest text-[var(--uml-muted)]">
          Copilot mode · Sends nothing
        </span>
      </div>

      {booksPaused || !metrics ? (
        <p className="mt-4 text-sm text-[var(--uml-muted)]" data-bot="agent-playbooks-paused">
          Playbook counters wait until saved bookings can be read.
        </p>
      ) : (
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {/* Playbook 1: Canyon & Storm Arrival Watch */}
          <article className="flex flex-col justify-between rounded-2xl border border-[var(--uml-line)] bg-[var(--uml-surface-2)]/50 p-4">
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--uml-gold)]">
                  <CloudSnow className="h-4 w-4" aria-hidden="true" />
                  Storm &amp; Canyon Arrival Watch
                </span>
                <span className="text-xs text-[var(--uml-muted)] uml-num">
                  {metrics.arrivalsCount} arriving · {metrics.canyonArrivals} canyon
                </span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-[var(--uml-muted)]">
                Cross-checks this week&rsquo;s check-ins against Sundance 48-hour snow, door-code readiness, and Provo Canyon winter driving prep.
              </p>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                data-bot="playbook-storm-watch"
                onClick={() =>
                  askCohost(
                    'Review upcoming arrivals over the next 7 days across River, Ranch, and Lindon, check if any snow or canyon prep tasks are needed, and list readiness items.',
                  )
                }
                className="inline-flex items-center gap-1 rounded-full border border-[var(--uml-gold)] px-3 py-1.5 text-[11px] uppercase tracking-[0.12em] text-[var(--uml-gold)] hover:bg-[var(--uml-gold)] hover:text-[var(--uml-gold-ink)] transition-colors"
              >
                <Sparkles className="h-3 w-3" aria-hidden="true" />
                Run in Co-host
              </button>
              <button
                type="button"
                onClick={() => jumpTo('guests')}
                className="inline-flex items-center gap-1 rounded-full border border-[var(--uml-line)] px-3 py-1.5 text-[11px] uppercase tracking-[0.12em] text-[var(--uml-muted)] hover:text-[var(--uml-ink)]"
              >
                Guests desk <ArrowRight className="h-3 w-3" aria-hidden="true" />
              </button>
            </div>
          </article>

          {/* Playbook 2: Stranded Gap-Night Rescue */}
          <article className="flex flex-col justify-between rounded-2xl border border-[var(--uml-line)] bg-[var(--uml-surface-2)]/50 p-4">
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--uml-gold)]">
                  <CalendarClock className="h-4 w-4" aria-hidden="true" />
                  Stranded Gap-Night Rescue
                </span>
                <span className="text-xs text-[var(--uml-muted)] uml-num">
                  {metrics.totalStranded === null ? 'Blocks unread' : `${metrics.totalStranded} stranded (14d)`}
                </span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-[var(--uml-muted)]">
                Finds 1–4 night orphan windows inside the next 14 days that minimum-stay rules block, and drafts early check-in / late checkout or direct quote links.
              </p>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                data-bot="playbook-gap-rescue"
                onClick={() =>
                  askCohost(
                    'Find open 1 to 4 night gaps across River, Ranch, and Lindon in the next 30 days and suggest how we can fill them with adjacent-guest extensions or direct links.',
                  )
                }
                className="inline-flex items-center gap-1 rounded-full border border-[var(--uml-gold)] px-3 py-1.5 text-[11px] uppercase tracking-[0.12em] text-[var(--uml-gold)] hover:bg-[var(--uml-gold)] hover:text-[var(--uml-gold-ink)] transition-colors"
              >
                <Sparkles className="h-3 w-3" aria-hidden="true" />
                Draft gap plan
              </button>
              <button
                type="button"
                onClick={() => jumpTo('market')}
                className="inline-flex items-center gap-1 rounded-full border border-[var(--uml-line)] px-3 py-1.5 text-[11px] uppercase tracking-[0.12em] text-[var(--uml-muted)] hover:text-[var(--uml-ink)]"
              >
                Market studio <ArrowRight className="h-3 w-3" aria-hidden="true" />
              </button>
            </div>
          </article>

          {/* Playbook 3: Same-Day Turnover & Canyon Drive */}
          <article className="flex flex-col justify-between rounded-2xl border border-[var(--uml-line)] bg-[var(--uml-surface-2)]/50 p-4">
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--uml-gold)]">
                  <Wrench className="h-4 w-4" aria-hidden="true" />
                  Turnover &amp; Canyon Drive Auditor
                </span>
                <span className="text-xs text-[var(--uml-muted)] uml-num">
                  {metrics.turnsCount} turns · {metrics.sameDayTurns} same-day
                </span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-[var(--uml-muted)]">
                Audits the next 14 days of turnovers for 11am–4pm clock collisions, 1pm early arrivals, and days combining Lindon with a Provo Canyon trip.
              </p>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                data-bot="playbook-turnover-audit"
                onClick={() =>
                  askCohost(
                    'Audit the next two weeks of turnovers across Ranch, Lindon, and River. Flag any same-day turns or multi-house overlap days.',
                  )
                }
                className="inline-flex items-center gap-1 rounded-full border border-[var(--uml-gold)] px-3 py-1.5 text-[11px] uppercase tracking-[0.12em] text-[var(--uml-gold)] hover:bg-[var(--uml-gold)] hover:text-[var(--uml-gold-ink)] transition-colors"
              >
                <Sparkles className="h-3 w-3" aria-hidden="true" />
                Audit schedule
              </button>
              <button
                type="button"
                onClick={() => jumpTo('clean')}
                className="inline-flex items-center gap-1 rounded-full border border-[var(--uml-line)] px-3 py-1.5 text-[11px] uppercase tracking-[0.12em] text-[var(--uml-muted)] hover:text-[var(--uml-ink)]"
              >
                Clean desk <ArrowRight className="h-3 w-3" aria-hidden="true" />
              </button>
            </div>
          </article>

          {/* Playbook 4: STR §469 & Receipt Hygiene */}
          <article className="flex flex-col justify-between rounded-2xl border border-[var(--uml-line)] bg-[var(--uml-surface-2)]/50 p-4">
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--uml-gold)]">
                  <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
                  STR §469 &amp; Receipt Hygiene Check
                </span>
                <span className="text-xs text-[var(--uml-muted)] uml-num">
                  {metrics.staysOver7} stays &gt; 7n
                </span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-[var(--uml-muted)]">
                Checks 7-day average customer stay qualification, unattached expense receipts, utility spikes, and 1099-NEC vendor totals before CPA handoff.
              </p>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                data-bot="playbook-tax-hygiene"
                onClick={() =>
                  askCohost(
                    'Summarize this month’s expenses by category across Ranch, Lindon, and River, and flag any missing receipts or unusually high bills.',
                  )
                }
                className="inline-flex items-center gap-1 rounded-full border border-[var(--uml-gold)] px-3 py-1.5 text-[11px] uppercase tracking-[0.12em] text-[var(--uml-gold)] hover:bg-[var(--uml-gold)] hover:text-[var(--uml-gold-ink)] transition-colors"
              >
                <Sparkles className="h-3 w-3" aria-hidden="true" />
                Audit expenses
              </button>
              <button
                type="button"
                onClick={() => jumpTo('tax')}
                className="inline-flex items-center gap-1 rounded-full border border-[var(--uml-line)] px-3 py-1.5 text-[11px] uppercase tracking-[0.12em] text-[var(--uml-muted)] hover:text-[var(--uml-ink)]"
              >
                Tax &amp; CPA desk <ArrowRight className="h-3 w-3" aria-hidden="true" />
              </button>
            </div>
          </article>
        </div>
      )}
    </div>
  );
}
