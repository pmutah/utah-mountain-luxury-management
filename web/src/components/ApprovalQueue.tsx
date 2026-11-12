import { useEffect, useState } from 'react';
import { useReadOnly } from '../lib/platform/viewer';

type Item = {
  id: string;
  kind: 'refund' | 'guardrail';
  house: 'ranch' | 'lindon' | 'river';
  summary: string;
  amountCents: number | null;
  status: 'waiting' | 'approved' | 'declined';
  line: string;
};

type Payload = {
  stored: boolean;
  items: Item[];
  reason?: string;
  note: string;
  sends: false;
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
    const res = await fetch('/api/platform/approvals', { credentials: 'include' });
    const body = await readJson(res);
    if (!res.ok || !body || body.sends !== false || !Array.isArray(body.items)) {
      const reason = body && typeof body.error === 'string' ? body.error : 'the answer was not the queue';
      return { kind: 'off', reason };
    }
    return { kind: 'live', data: body as unknown as Payload };
  } catch (err) {
    return { kind: 'off', reason: err instanceof Error ? err.message : 'the read failed' };
  }
}

/**
 * Refunds and guardrail overrides wait here.
 *
 * Filing and marking stay on this desk. The server sends no text and does not change a booking, an expense, a receipt,
 * or a published rate. A read-only owner sees the list and cannot file or mark one.
 */
export function ApprovalQueue() {
  const readOnly = useReadOnly();
  const [queue, setQueue] = useState<Read>({ kind: 'loading' });
  const [kind, setKind] = useState<'refund' | 'guardrail'>('refund');
  const [house, setHouse] = useState<'ranch' | 'lindon' | 'river'>('ranch');
  const [summary, setSummary] = useState('');
  const [amount, setAmount] = useState('');
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

  const refresh = async () => {
    setQueue(await load());
  };

  const file = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const dollars = amount.trim() === '' ? null : Number(amount);
      const amountCents = dollars == null ? null : Math.round(dollars * 100);
      const res = await fetch('/api/platform/approvals', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, house, summary, ...(amountCents == null ? {} : { amountCents }) }),
      });
      const body = (await readJson(res)) as { error?: string; item?: { line: string } } | null;
      if (!res.ok || !body?.item) {
        setNotice(body?.error ?? 'The request was not filed.');
        return;
      }
      setSummary('');
      setAmount('');
      setNotice(body.item?.line ?? 'Filed. It is waiting.');
      await refresh();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'The request was not filed.');
    } finally {
      setBusy(false);
    }
  };

  const mark = async (id: string, decision: 'approved' | 'declined') => {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch('/api/platform/approvals', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, decision }),
      });
      const body = (await readJson(res)) as { error?: string; item?: { line: string } } | null;
      setNotice(body?.item?.line ?? body?.error ?? 'The decision was not saved.');
      await refresh();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'The decision was not saved.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-6" data-bot="approval-queue">
      <p className="text-xs uppercase tracking-widest text-[var(--uml-muted)]">Waiting on a host</p>
      <p className="mt-1 text-sm text-[var(--uml-muted)]">
        A refund or a guardrail override stays here until it is marked. Nothing is texted. A booking, an expense, a receipt, and a published rate stay as they are.
      </p>
      {queue.kind === 'loading' && <p className="mt-2 text-sm text-[var(--uml-muted)]">Reading the queue…</p>}
      {queue.kind === 'off' && (
        <p className="mt-2 text-sm text-[var(--uml-muted)]" data-bot="approval-queue-off">
          The queue could not be read from this server. That does not mean it is empty.
        </p>
      )}
      {queue.kind === 'live' && !queue.data.stored && (
        <p className="mt-2 text-sm text-[var(--uml-muted)]" data-bot="approval-queue-unreadable">
          {queue.data.reason} Nothing was filed.
        </p>
      )}
      {queue.kind === 'live' && queue.data.stored && (
        <ul className="mt-3 space-y-2 text-sm">
          {queue.data.items.length === 0 ? (
            <li className="text-[var(--uml-muted)]">Nothing is waiting.</li>
          ) : (
            queue.data.items.map((item) => (
              <li key={item.id} className="rounded-2xl border border-[var(--uml-line)] p-3" data-bot="approval-row" data-status={item.status}>
                <p>{item.line}</p>
                {item.status === 'waiting' && !readOnly ? (
                  <div className="mt-2 flex gap-2">
                    <button type="button" className="uml-nav" disabled={busy} data-bot="approval-approve" onClick={() => void mark(item.id, 'approved')}>
                      Approve
                    </button>
                    <button type="button" className="uml-nav" disabled={busy} data-bot="approval-decline" onClick={() => void mark(item.id, 'declined')}>
                      Decline
                    </button>
                  </div>
                ) : null}
              </li>
            ))
          )}
        </ul>
      )}
      {readOnly ? (
        <p className="mt-3 text-sm">This login can read the queue. It cannot file or mark a request.</p>
      ) : (
        <form
          className="mt-4 grid gap-3 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            void file();
          }}
        >
          <label className="text-sm">
            Kind
            <select className="mt-1 w-full rounded-xl border border-[var(--uml-line)] bg-[var(--uml-surface-input)] p-3" value={kind} onChange={(event) => setKind(event.target.value as 'refund' | 'guardrail')}>
              <option value="refund">Refund</option>
              <option value="guardrail">Guardrail override</option>
            </select>
          </label>
          <label className="text-sm">
            House
            <select className="mt-1 w-full rounded-xl border border-[var(--uml-line)] bg-[var(--uml-surface-input)] p-3" value={house} onChange={(event) => setHouse(event.target.value as 'ranch' | 'lindon' | 'river')}>
              <option value="ranch">Ranch</option>
              <option value="lindon">Lindon</option>
              <option value="river">River</option>
            </select>
          </label>
          <label className="text-sm sm:col-span-2">
            Reason
            <input className="mt-1 w-full rounded-xl border border-[var(--uml-line)] bg-[var(--uml-surface-input)] p-3" value={summary} onChange={(event) => setSummary(event.target.value)} placeholder="Why this should wait" />
          </label>
          <label className="text-sm">
            {kind === 'refund' ? 'Refund dollars' : 'Proposed nightly dollars, if any'}
            <input className="mt-1 w-full rounded-xl border border-[var(--uml-line)] bg-[var(--uml-surface-input)] p-3" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} />
          </label>
          <div className="flex items-end">
            <button type="submit" className="uml-gold-btn rounded-full px-4 py-3 text-xs uppercase tracking-widest" disabled={busy} data-bot="approval-file">
              {busy ? 'Saving…' : 'File and wait'}
            </button>
          </div>
        </form>
      )}
      {notice ? (
        <p className="mt-2 text-sm" data-bot="approval-notice">
          {notice}
        </p>
      ) : null}
    </div>
  );
}
