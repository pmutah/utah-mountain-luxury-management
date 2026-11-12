import { useEffect, useState } from 'react';
import { formatCurrency } from '../lib/api';
import { useReadOnly } from '../lib/platform/viewer';

type Item = {
  id: string;
  house: 'ranch' | 'river' | 'both';
  amountCents: number;
  paidOn: string;
  status: 'recorded' | 'voided';
  line: string;
};

type Payload = {
  stored: boolean;
  items: Item[];
  recordedCents: number | null;
  reason?: string;
  changesBooks: false;
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
    const res = await fetch('/api/platform/owner-transfers', { credentials: 'include' });
    const body = await readJson(res);
    const stored = body?.stored === true;
    const readable =
      !!body &&
      body.changesBooks === false &&
      Array.isArray(body.items) &&
      (stored ? typeof body.recordedCents === 'number' : body.stored === false);
    if (!res.ok || !readable) {
      const reason = body && typeof body.error === 'string' ? body.error : 'the answer was not the transfer list';
      return { kind: 'off', reason };
    }
    return { kind: 'live', data: body as unknown as Payload };
  } catch (err) {
    return { kind: 'off', reason: err instanceof Error ? err.message : 'the read failed' };
  }
}

function centsOf(dollars: string): number | null {
  const cleaned = dollars.replace(/[$,\s]/g, '');
  if (!/^-?\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const negative = cleaned.startsWith('-');
  const [whole, fraction = ''] = cleaned.replace('-', '').split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents) || cents === 0) return null;
  return negative ? -cents : cents;
}

/**
 * What a host recorded as sent to Todd, beside the share the books already computed.
 *
 * Recording or voiding a row does not change that share. A read-only owner sees the list and cannot add one.
 */
export function OwnerTransfers({ months }: { months: readonly string[] }) {
  const readOnly = useReadOnly();
  const [queue, setQueue] = useState<Read>({ kind: 'loading' });
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [house, setHouse] = useState<'ranch' | 'river' | 'both'>('both');
  const [amount, setAmount] = useState('');
  const [paidOn, setPaidOn] = useState('');
  const [note, setNote] = useState('');

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

  const file = async () => {
    const amountCents = centsOf(amount);
    if (amountCents == null) {
      setNotice('Enter the dollars that were sent, or a negative amount if they were returned.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(paidOn)) {
      setNotice('Choose the date the money moved.');
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch('/api/platform/owner-transfers', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ house, amountCents, paidOn, note }),
      });
      const body = await readJson(res);
      const line = body && typeof body.item === 'object' && body.item && typeof (body.item as { line?: unknown }).line === 'string'
        ? (body.item as { line: string }).line
        : null;
      setNotice(line ?? (body && typeof body.error === 'string' ? body.error : 'The transfer was not recorded.'));
      if (line) {
        setAmount('');
        setNote('');
      }
      await refresh();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'The transfer was not recorded.');
    } finally {
      setBusy(false);
    }
  };

  const voidOne = async (id: string) => {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch('/api/platform/owner-transfers', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, void: true }),
      });
      const body = await readJson(res);
      const line = body && typeof body.item === 'object' && body.item && typeof (body.item as { line?: unknown }).line === 'string'
        ? (body.item as { line: string }).line
        : null;
      setNotice(line ?? (body && typeof body.error === 'string' ? body.error : 'The transfer was not voided.'));
      await refresh();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'The transfer was not voided.');
    } finally {
      setBusy(false);
    }
  };

  const items = queue.kind === 'live' && queue.data.stored ? queue.data.items : [];
  const windowSet = new Set(months);
  const inWindow = months.length === 0 ? items : items.filter((item) => windowSet.has(item.paidOn.slice(0, 7)));
  const outside = months.length === 0 ? [] : items.filter((item) => !windowSet.has(item.paidOn.slice(0, 7)));
  const windowCents = inWindow.reduce((sum, item) => (item.status === 'recorded' ? sum + item.amountCents : sum), 0);

  return (
    <section className="uml-panel rounded-3xl p-6" data-bot="owner-transfers">
      <p className="uml-kicker">Recorded transfers</p>
      <p className="mt-2 text-sm text-[var(--uml-muted)]">
        This is money a host recorded as sent to Todd, or returned by him. Todd’s share above stays the books. Recording a row does not change that share, a booking, or an expense.
      </p>
      {queue.kind === 'loading' && <p className="mt-3 text-sm text-[var(--uml-muted)]">Reading transfers…</p>}
      {queue.kind === 'off' && (
        <p className="mt-3 text-sm text-[var(--uml-muted)]" data-bot="owner-transfers-off">
          Recorded transfers could not be read. That does not mean none were sent.
        </p>
      )}
      {queue.kind === 'live' && !queue.data.stored && (
        <p className="mt-3 text-sm text-[var(--uml-muted)]" data-bot="owner-transfers-unreadable">
          {queue.data.reason} Nothing was recorded from this page.
        </p>
      )}
      {queue.kind === 'live' && queue.data.stored && (
        <>
          <p className="mt-3 text-sm" data-bot="owner-transfers-total">
            {months.length === 0
              ? `${formatCurrency(windowCents / 100)} recorded.`
              : `${formatCurrency(windowCents / 100)} recorded in this window. ${formatCurrency((queue.data.recordedCents ?? 0) / 100)} recorded in all.`}
            {' '}Todd’s share on this page is unchanged.
          </p>
          <ul className="mt-3 space-y-2 text-sm">
            {inWindow.length === 0 ? (
              <li className="text-[var(--uml-muted)]">Nothing is recorded in this window. That is not the same as nothing being owed.</li>
            ) : (
              inWindow.map((item) => (
                <li key={item.id} className="rounded-2xl border border-[var(--uml-line)] p-3" data-bot="owner-transfer-row" data-status={item.status}>
                  <p>{item.line}</p>
                  {item.status === 'recorded' && !readOnly ? (
                    <button type="button" className="uml-nav mt-2" disabled={busy} data-bot="owner-transfer-void" onClick={() => void voidOne(item.id)}>
                      Void
                    </button>
                  ) : null}
                </li>
              ))
            )}
          </ul>
          {outside.length > 0 && (
            <p className="mt-3 text-sm text-[var(--uml-muted)]" data-bot="owner-transfers-outside">
              {outside.length} recorded {outside.length === 1 ? 'transfer sits' : 'transfers sit'} outside this window and {outside.length === 1 ? 'is' : 'are'} still on the list.
            </p>
          )}
        </>
      )}
      {!readOnly && (
        <form
          className="mt-4 grid gap-3 print:hidden sm:grid-cols-2"
          data-bot="owner-transfer-form"
          onSubmit={(event) => {
            event.preventDefault();
            void file();
          }}
        >
          <label className="text-sm">
            House
            <select className="uml-nav mt-1 w-full" value={house} onChange={(event) => setHouse(event.target.value as 'ranch' | 'river' | 'both')}>
              <option value="both">Ranch and River</option>
              <option value="ranch">Ranch</option>
              <option value="river">River</option>
            </select>
          </label>
          <label className="text-sm">
            Dollars
            <input className="uml-nav mt-1 w-full" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="1200.00" />
          </label>
          <label className="text-sm">
            Date
            <input className="uml-nav mt-1 w-full" type="date" value={paidOn} onChange={(event) => setPaidOn(event.target.value)} />
          </label>
          <label className="text-sm">
            Note
            <input className="uml-nav mt-1 w-full" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Leave names off this note" />
          </label>
          <button type="submit" className="uml-gold-btn rounded-full px-4 py-3 text-xs uppercase tracking-widest sm:col-span-2" disabled={busy} data-bot="owner-transfer-save">
            {busy ? 'Saving…' : 'Record transfer'}
          </button>
        </form>
      )}
      {notice ? (
        <p className="mt-3 text-sm" data-bot="owner-transfer-notice">
          {notice}
        </p>
      ) : null}
    </section>
  );
}
