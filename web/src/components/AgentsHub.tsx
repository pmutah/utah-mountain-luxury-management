import { useEffect, useMemo, useState } from 'react';
import { api, type Reservation, type SharedWorkItem } from '../lib/api';
import { agentBrief } from '../lib/agent-brief';
import { AGENT_ROSTER } from '../lib/agents';
import { denverToday } from '../lib/market/dates';
import { loadShadowLog, shadowClock } from '../lib/market/shadow-log';

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
}: {
  reservations: Reservation[];
  calendar: 'loading' | 'live' | 'off';
}) {
  const [open, setOpen] = useState<SharedWorkItem[]>([]);
  const [done, setDone] = useState<SharedWorkItem[]>([]);
  const [workState, setWorkState] = useState<'loading' | 'live' | 'off'>('loading');
  const today = denverToday();
  const brief = useMemo(
    () =>
      agentBrief({
        asOf: today,
        stays: reservations,
        shadowDays: shadowClock(loadShadowLog(), today).days,
        openJobs: workState === 'live' ? open.length : 0,
        calendarReady: calendar !== 'loading',
      }),
    [today, reservations, workState, open.length, calendar],
  );

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
          Five agents already run. Tonight’s brief is read from the calendar and the shadow clock. It does not claim a job, send a text, or change the books.
        </p>
      </div>
      <div className="uml-panel rounded-3xl p-6" data-bot="agent-brief">
        <p className="uml-kicker">Tonight</p>
        <ul className="mt-4 space-y-3 text-sm">
          {brief.map((line, index) => (
            <li key={`${line.agent}-${index}`} data-bot="agent-brief-line">
              <span className="text-[var(--uml-gold)]">{AGENT_NAME[line.agent]}.</span> {line.text}
            </li>
          ))}
        </ul>
      </div>
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
        {workState === 'loading' && <p className="mt-3 text-sm text-[var(--uml-muted)]">Loading the job list…</p>}
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
