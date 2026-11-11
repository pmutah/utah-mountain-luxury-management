import { useEffect, useState } from 'react';

type Change = {
  house: string;
  date: string;
  before_rate: number;
  after_rate: number;
  reason: string;
  mode: string;
  created_at: string;
};

type Loaded = { changes: Change[]; lines: string[]; stored: boolean; reason?: string };

/**
 * The change log panel, from the plan's Market tab list.
 *
 * "Every change is logged with a reason" was a requirement with a table and no writer; the table now fills from the plan.
 * This panel is the reader. It distinguishes three states the plan's own rubric asks for:
 *
 *   - a real empty log ("no night has moved yet"),
 *   - a failed read ("the log could not be read"), which is not the same thing, and
 *   - rows, each of which says nothing was sent.
 */
export function ChangeLogPanel() {
  const [data, setData] = useState<Loaded | null>(null);
  const [state, setState] = useState<'loading' | 'live' | 'off'>('loading');

  useEffect(() => {
    let cancel = false;
    fetch('/api/pricing/changes?limit=20', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((body: Loaded) => {
        if (cancel) return;
        setData(body);
        setState('live');
      })
      .catch(() => {
        if (!cancel) setState('off');
      });
    return () => {
      cancel = true;
    };
  }, []);

  return (
    <div className="uml-panel rounded-3xl p-5 sm:p-6" data-bot="market-changes" data-state={state}>
      <p className="uml-kicker">Change log</p>
      <p className="mt-2 max-w-xl text-sm text-[var(--uml-muted)]">
        Every night whose rate moved, with the reason. Every row is a shadow row: nothing was sent to Airbnb, VRBO, or
        Hospitable.
      </p>
      {state === 'loading' && <p className="mt-3 text-sm text-[var(--uml-muted)]">Reading the log…</p>}
      {state === 'off' && (
        <p className="mt-3 text-sm" data-bot="market-changes-off">
          The change log could not be read. This does not mean no rate moved.
        </p>
      )}
      {state === 'live' && data && !data.stored && (
        <p className="mt-3 text-sm" data-bot="market-changes-off">
          The change log could not be read{data.reason ? `: ${data.reason}` : ''}. This does not mean no rate moved.
        </p>
      )}
      {state === 'live' && data && data.stored && data.changes.length === 0 && (
        <p className="mt-3 text-sm text-[var(--uml-muted)]" data-bot="market-changes-empty">
          No night has moved yet. A night appears here when the plan would change its rate.
        </p>
      )}
      {state === 'live' && data && data.stored && data.changes.length > 0 && (
        <ul className="mt-3 space-y-2 text-sm">
          {data.changes.map((row, index) => (
            <li key={`${row.house}-${row.date}-${index}`} data-bot="market-change-row">
              {data.lines[index]}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
