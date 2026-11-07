import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';

/** The reasons offered in the inbox. The server accepts exactly these ids. */
const DECLINE_OPTIONS: Array<{ id: string; label: string }> = [
  { id: 'dates-taken', label: 'Dates taken' },
  { id: 'too-many-guests', label: 'Party too large' },
  { id: 'minimum-stay', label: 'Too short a stay' },
  { id: 'maintenance', label: 'Closed for work' },
  { id: 'owner-stay', label: 'Family is using it' },
  { id: 'other', label: 'Other' },
];

type InboxResult = Awaited<ReturnType<typeof api.getBookingRequests>>;
/** A row as the route actually returns it, including the suggested payout. */
type InboxRowView = NonNullable<InboxResult['rows']>[number];

/**
 * The host inbox for direct requests. Read only: it does not book, hold, answer, or email.
 * Names stay off; each row names the house, the dates, and the party.
 */
export function RequestInbox() {
  const [rows, setRows] = useState<InboxRowView[] | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [preview, setPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payouts, setPayouts] = useState<Record<string, string>>({});
  const [declineReasons, setDeclineReasons] = useState<Record<string, string>>({});
  const [declineNotes, setDeclineNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [accepted, setAccepted] = useState<string | null>(null);
  const [tallyLine, setTallyLine] = useState<string | null>(null);

  /** Decline a request. The reason is required; the guest is told unless the host unticks it. */
  async function decline(id: string, summary: string) {
    const reason = declineReasons[id] ?? '';
    if (!reason) {
      setError('Choose a reason before declining. Nothing is declined without one.');
      return;
    }
    /*
     * Declining emails the guest and lets the hold go, so the dates can be taken by someone else
     * before this is noticed. Same gate as accepting: say who hears about it, and what happens to the
     * nights, before anything is sent.
     */
    if (
      !window.confirm(
        `Decline it and email the guest?\n\n${summary}\nReason: ${reason}\n\nThe guest is told the dates are not available, and the hold lets go at once so another guest can ask for those nights.`,
      )
    ) {
      return;
    }
    setBusy(id);
    setError(null);
    setAccepted(null);
    try {
      const note = declineNotes[id]?.trim();
      const result = await api.declineBookingRequest({ id, reason, ...(note ? { note } : {}) });
      const sent = result.guestEmailed
        ? 'The guest was told the dates are not available.'
        : `The guest was not told: ${result.guestEmailError ?? 'unknown reason'}`;
      setAccepted(`${result.line} ${sent}`);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The request could not be declined.');
    } finally {
      setBusy(null);
    }
  }

  async function accept(id: string, summary: string) {
    const raw = payouts[id] ?? '';
    const payout = Number(raw);
    if (raw.trim() === '' || !Number.isFinite(payout) || payout < 0) {
      setError('Add a host payout of zero or more before accepting. Nothing is booked without it.');
      return;
    }
    /*
     * Accepting books the stay and emails the guest a confirmation, and that mail cannot be taken
     * back. A single click next to a payout field is too easy to hit, so the host sees what will
     * happen and who will hear about it first.
     */
    const money = `$${payout.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (!window.confirm(`Book it and email the guest?\n\n${summary}\nPayout ${money}\n\nThe stay is saved and the guest is emailed a confirmation. Neither can be undone from here.`)) {
      return;
    }
    setBusy(id);
    setError(null);
    setAccepted(null);
    try {
      const result = await api.acceptBookingRequest({ id, payout });
      const parts = [result.line];
      // A two-house request books both. Say so, so the host can see both houses are held.
      if (result.reservations && result.reservations.length > 1) {
        parts.push(`Both houses are saved (${result.reservations.map((row) => row.propertyId).join(' and ')}).`);
      }
      // One stay page per house, so the host can resend either one.
      const pages = (result.portalLinks ?? []).filter((row) => row.link);
      if (pages.length > 1) {
        parts.push(`Guest pages: ${pages.map((row) => `${row.propertyId} ${row.link}`).join(' · ')}`);
      } else if (result.portalLink) {
        parts.push(`Guest page: ${result.portalLink}`);
      }
      if (result.portalNote) parts.push(result.portalNote);
      // The dates were not held while the request sat, so the host is told rather than left to assume.
      if (result.holdLine) parts.push(result.holdLine);
      parts.push(
        result.guestEmailed
          ? (result.guestLine ?? '')
          : `The confirmation did not send: ${result.guestEmailError ?? 'unknown reason'}`,
      );
      setAccepted(parts.filter(Boolean).join(' ').trim());
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The request could not be accepted.');
    } finally {
      setBusy(null);
    }
  }

  const apply = useCallback((result: InboxResult | null) => {
    if (!result) {
      setPreview(false);
      setRows(null);
      setSummary(null);
      setError('This desk could not read the request list. It is not empty, and nothing was booked.');
      return;
    }
    setPreview(result.source === 'dev-preview');
    setError(null);
    if (result.storageReads === 'paused' || result.rows === null) {
      setPaused(true);
      setRows(null);
      setSummary(null);
      return;
    }
    setPaused(false);
    setRows(result.rows);
    setSummary(result.summary);
    setTallyLine(result.declineTally?.line ?? null);
    /*
     * Pre-fill the payout from the quote the guest saw, so accepting is a check rather than a guess.
     * A row with no price leaves the field empty, and the line beside it says why.
     */
    const seeded: Record<string, string> = {};
    for (const row of result.rows) {
      const total = (row.payouts ?? []).reduce((sum, entry) => sum + entry.hostNet, 0);
      if (total > 0) seeded[row.id] = total.toFixed(2);
    }
    setPayouts((current) => ({ ...seeded, ...current }));
  }, []);

  const load = useCallback(() => {
    void api
      .getBookingRequests()
      .then((result) => apply(result))
      .catch(() => apply(null));
  }, [apply]);

  useEffect(() => {
    let cancel = false;
    void api
      .getBookingRequests()
      .then((result) => {
        if (!cancel) apply(result);
      })
      .catch(() => {
        if (!cancel) apply(null);
      });
    return () => {
      cancel = true;
    };
  }, [apply]);

  return (
    <section className="bg-slate-900 border border-slate-800 rounded-3xl p-5" data-bot="request-inbox">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#d4b56a]">Direct requests</p>
          <p className="mt-2 text-sm text-slate-400">
            Saved from the booking page. Each row says whether those nights are already on the calendar. Nothing is
            booked, held, or answered here.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          data-bot="request-inbox-refresh"
          className="rounded-full border border-slate-700 px-4 py-2 text-xs uppercase tracking-[0.16em] text-slate-300"
        >
          Read again
        </button>
      </div>
      {preview && !paused && (
        <p className="mt-4 text-sm text-slate-300" data-bot="request-inbox-preview">
          Sample rows for a local preview. The saved requests are on the deployed route.
        </p>
      )}
      {paused && (
        <p className="mt-4 text-sm text-slate-300" data-bot="request-inbox-paused">
          Saved requests could not be read. This list is not a stand-in, and nothing was written over them.
        </p>
      )}
      {error && !paused && (
        <p className="mt-4 text-sm text-slate-300" data-bot="request-inbox-error">
          {error}
        </p>
      )}
      {!paused && summary && (
        <p className="mt-4 text-sm text-slate-300" data-bot="request-inbox-summary">
          {summary}
        </p>
      )}
      {!paused && tallyLine && (
        <p className="mt-1 text-xs text-slate-500" data-bot="request-inbox-tally">
          {tallyLine}
        </p>
      )}
      {!paused && rows && rows.length > 0 && (
        <ul className="mt-4 space-y-2 text-sm text-slate-300">
          {rows.map((row) => (
            <li
              key={row.id}
              data-bot="request-inbox-row"
              data-taken={row.taken ? 'yes' : 'no'}
              data-accepted={row.accepted ? 'yes' : 'no'}
              data-house={row.houses.join('+')}
              className="rounded-2xl border border-slate-800 px-4 py-3"
            >
              {row.line}
              {row.stale && !row.taken && (
                <span className="ml-1 text-slate-500">This request has waited more than 2 days.</span>
              )}
              {row.accepted ? (
                <p className="mt-2 text-xs text-slate-500" data-bot="request-inbox-accepted">
                  This request is already a booking. Accepting it again would double the stay.
                </p>
              ) : row.declined ? (
                <p className="mt-2 text-xs text-amber-400/80" data-bot="request-inbox-declined">
                  {row.declineLine ?? 'This request is already declined.'}
                </p>
              ) : (
                <div className="mt-2 space-y-2">
                  {row.payoutLine && (
                    <p className="text-xs text-slate-400" data-bot="request-inbox-payout-line">
                      {row.payoutLine}
                    </p>
                  )}
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="text-xs text-slate-500">
                      Host payout
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={payouts[row.id] ?? ''}
                        onChange={(event) => setPayouts({ ...payouts, [row.id]: event.target.value })}
                        data-bot="request-inbox-payout"
                        className="ml-2 w-28 rounded-full border border-slate-700 bg-transparent px-3 py-1 text-slate-200"
                      />
                    </label>
                    <button
                      type="button"
                      disabled={busy === row.id}
                      onClick={() => void accept(row.id, row.line)}
                      data-bot="request-inbox-accept"
                      className="rounded-full border border-slate-600 px-3 py-1 text-xs uppercase tracking-[0.16em] text-slate-200 disabled:opacity-50"
                    >
                      {busy === row.id ? 'Saving…' : 'Accept as a booking'}
                    </button>
                  </div>
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="text-xs text-slate-500">
                      Why not
                      <select
                        value={declineReasons[row.id] ?? ''}
                        onChange={(event) => setDeclineReasons({ ...declineReasons, [row.id]: event.target.value })}
                        data-bot="request-inbox-reason"
                        className="ml-2 rounded-full border border-slate-700 bg-transparent px-3 py-1 text-slate-200"
                      >
                        <option value="">Choose a reason</option>
                        {DECLINE_OPTIONS.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <input
                      value={declineNotes[row.id] ?? ''}
                      onChange={(event) => setDeclineNotes({ ...declineNotes, [row.id]: event.target.value })}
                      data-bot="request-inbox-decline-note"
                      placeholder="Note for the guest (optional)"
                      className="min-w-0 flex-1 rounded-full border border-slate-700 bg-transparent px-3 py-1 text-slate-200"
                    />
                    <button
                      type="button"
                      disabled={busy === row.id}
                      onClick={() => void decline(row.id, row.line)}
                      data-bot="request-inbox-decline"
                      className="rounded-full border border-slate-700 px-3 py-1 text-xs uppercase tracking-[0.16em] text-slate-400 disabled:opacity-50"
                    >
                      {busy === row.id ? 'Saving…' : 'Decline'}
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {accepted && (
        <p className="mt-3 text-sm text-slate-300" data-bot="request-inbox-confirm">
          {accepted}
        </p>
      )}
      {!paused && rows && rows.length === 0 && !error && (
        <p className="mt-4 text-sm text-slate-400" data-bot="request-inbox-empty">
          No direct requests are waiting. Nothing is booked.
        </p>
      )}
    </section>
  );
}
