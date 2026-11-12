import { useEffect, useState } from 'react';
import { useReadOnly, useViewer } from '../lib/platform/viewer';

type Item = {
  id: string;
  house: 'ranch' | 'lindon' | 'river';
  kind: string;
  status: 'waiting' | 'noted' | 'declined';
  line: string;
};

type Payload = {
  stored: boolean;
  items: Item[];
  reason?: string;
  sends: false;
  changesBooking: false;
};

type Read = { kind: 'loading' } | { kind: 'live'; data: Payload } | { kind: 'off'; reason: string };

async function readJson(res: Response): Promise<Record<string, unknown> | null> {
  const text = await res.text();
  try {
    const body = JSON.parse(text) as unknown;
    return body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

async function load(): Promise<Read> {
  try {
    const res = await fetch('/api/platform/stay-requests', { credentials: 'include' });
    const body = await readJson(res);
    if (!res.ok || !body || body.sends !== false || body.changesBooking !== false || !Array.isArray(body.items)) {
      const reason = body && typeof body.error === 'string' ? body.error : 'the answer was not the request list';
      return { kind: 'off', reason };
    }
    return { kind: 'live', data: body as unknown as Payload };
  } catch (err) {
    return { kind: 'off', reason: err instanceof Error ? err.message : 'the read failed' };
  }
}

/**
 * Add-ons a guest asked for from the stay app.
 *
 * Noting or declining a row does not move the booking, charge anything, or send a text. A read-only owner sees the
 * list and cannot mark one. Lindon is left out when this login cannot see that house.
 */
export function StayRequestDesk() {
  const readOnly = useReadOnly();
  const viewer = useViewer();
  const [queue, setQueue] = useState<Read>({ kind: 'loading' });
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancel = false;
    void load().then((result) => {
      if (!cancel) setQueue(result);
    });
    return () => {
      cancel = true;
    };
  }, []);

  const refresh = async () => setQueue(await load());

  const mark = async (id: string, decision: 'noted' | 'declined') => {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch('/api/platform/stay-requests', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, decision }),
      });
      const body = (await readJson(res)) as { error?: string; item?: { line?: string } } | null;
      setNotice(body?.item?.line ?? body?.error ?? 'The mark was not saved.');
      await refresh();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'The mark was not saved.');
    } finally {
      setBusy(false);
    }
  };

  const items =
    queue.kind === 'live'
      ? queue.data.items.filter((item) => viewer.houses === null || viewer.houses.includes(item.house))
      : [];

  return (
    <section className="uml-panel rounded-3xl p-5" data-bot="stay-request-desk">
      <p className="text-xs uppercase tracking-widest text-[var(--uml-muted)]">Asked from the stay app</p>
      <p className="mt-1 text-sm text-[var(--uml-muted)]">
        An early arrival, a later checkout, the hot tub, or a grocery drop waits here. Nothing is charged or texted, and the booking stays where it is.
      </p>
      {queue.kind === 'loading' && <p className="mt-2 text-sm text-[var(--uml-muted)]">Reading requests…</p>}
      {queue.kind === 'off' && (
        <p className="mt-2 text-sm text-[var(--uml-muted)]" data-bot="stay-request-off">
          Requests could not be read from this server. That does not mean nobody asked.
        </p>
      )}
      {queue.kind === 'live' && !queue.data.stored && (
        <p className="mt-2 text-sm text-[var(--uml-muted)]" data-bot="stay-request-unreadable">
          {queue.data.reason} Nothing was marked.
        </p>
      )}
      {queue.kind === 'live' && queue.data.stored && (
        <ul className="mt-3 space-y-2 text-sm">
          {items.length === 0 ? (
            <li className="text-[var(--uml-muted)]">Nothing is waiting.</li>
          ) : (
            items.map((item) => (
              <li key={item.id} className="rounded-2xl border border-[var(--uml-line)] p-3" data-bot="stay-request-row" data-status={item.status}>
                <p>{item.line}</p>
                {item.status === 'waiting' && !readOnly ? (
                  <div className="mt-2 flex gap-2">
                    <button type="button" className="uml-nav" disabled={busy} data-bot="stay-request-note" onClick={() => void mark(item.id, 'noted')}>
                      Noted
                    </button>
                    <button type="button" className="uml-nav" disabled={busy} data-bot="stay-request-decline" onClick={() => void mark(item.id, 'declined')}>
                      Decline
                    </button>
                  </div>
                ) : null}
              </li>
            ))
          )}
        </ul>
      )}
      {notice ? (
        <p className="mt-2 text-sm" data-bot="stay-request-notice">
          {notice}
        </p>
      ) : null}
    </section>
  );
}
