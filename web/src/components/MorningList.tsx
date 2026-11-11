import { useEffect, useState } from 'react';

type Blocker = { id: string; need: string };

type Status = {
  blockers: Blocker[];
  checkoutArmed: boolean;
  send: boolean;
  bulkDelete: boolean;
  cutoverReady: boolean;
};

/**
 * The morning list: what the platform cannot do yet, and what it needs.
 *
 * The plan says a missing key is collected in one morning list rather than being discovered as a feature that quietly does
 * nothing. `GET /api/platform/status` has carried that list since the platform spine landed and **nothing read it** — a
 * host had to know the URL. It sits on the Today desk because that is the page read every day.
 *
 * A failed read says so and does not invent an empty list: "nothing is waiting" and "the list could not be read" are
 * different statements, and only one of them is true when the route refuses.
 */
export function MorningList() {
  const [status, setStatus] = useState<Status | null>(null);
  const [state, setState] = useState<'loading' | 'live' | 'off'>('loading');

  useEffect(() => {
    let cancel = false;
    fetch('/api/platform/status', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((body: Status) => {
        if (cancel) return;
        setStatus(body);
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
    <div className="mt-6" data-bot="morning-list" data-state={state}>
      <p className="uml-kicker">Waiting on</p>
      {state === 'loading' && <p className="mt-2 text-sm text-[var(--uml-muted)]">Reading the list…</p>}
      {state === 'off' && (
        <p className="mt-2 text-sm text-[var(--uml-muted)]" data-bot="morning-list-off">
          The morning list could not be read from this server. This does not mean nothing is waiting.
        </p>
      )}
      {state === 'live' && status && status.blockers.length === 0 && (
        <p className="mt-2 text-sm text-[var(--uml-muted)]">Nothing is waiting on a key.</p>
      )}
      {state === 'live' && status && status.blockers.length > 0 && (
        <>
          <ul className="mt-2 space-y-2 text-sm">
            {status.blockers.map((row) => (
              <li key={row.id} data-bot={`morning-need-${row.id}`}>
                {row.need}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-[var(--uml-muted)]" data-bot="morning-list-safety">
            {status.checkoutArmed
              ? 'Checkout is armed.'
              : 'Checkout is not armed, so no card is charged.'}{' '}
            {status.send ? 'Something on this platform sends.' : 'Nothing on this list sends a rate or a guest message.'}
          </p>
        </>
      )}
    </div>
  );
}
