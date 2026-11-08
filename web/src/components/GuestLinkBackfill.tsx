import { useState } from 'react';
import { api } from '../lib/api';

type MintResult = Awaited<ReturnType<typeof api.mintGuestLinks>>;

/**
 * Give every upcoming stay its guest portal link.
 *
 * The link is minted when a host accepts a direct request or sends a survey, so a booking imported
 * from Airbnb or VRBO never had one — production held 87 bookings and zero portal links on
 * 2026-11-08, which made the guest portal look finished while no guest could open it.
 *
 * This is deliberately **not** a send. The route records the channel as `none`, and the card says so
 * in words, because "make the links" and "message every guest" are very different acts and one
 * button should never quietly be the other.
 */
export function GuestLinkBackfill() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<MintResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      setResult(await api.mintGuestLinks());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The links could not be made.');
    } finally {
      setBusy(false);
    }
  }

  const byHouse = result ? Object.entries(result.byHouse).filter(([, count]) => count > 0) : [];

  return (
    <section className="bg-slate-900 border border-slate-800 rounded-3xl p-5" data-bot="guests-portal-links">
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#d4b56a]">Guest portal links</p>
      <p className="mt-2 text-sm text-slate-400">
        A stay gets its guest portal link when you accept a direct request or send a survey. A booking that
        came in from Airbnb or VRBO has none, so the guest has no page to open. This makes the missing links
        and <strong className="text-slate-200">sends nothing</strong> to anybody. Press it again any time: a
        stay that already has a link keeps the one it has.
      </p>
      <button
        type="button"
        data-bot="guests-mint-links"
        disabled={busy}
        onClick={() => void run()}
        className="mt-3 px-4 py-2 rounded-2xl bg-cyan-800 text-white text-[10px] font-black uppercase tracking-widest min-h-[40px] disabled:opacity-40"
      >
        {busy ? 'Making links…' : 'Make missing guest links'}
      </button>

      {error && (
        <p className="mt-3 text-sm text-rose-300" data-bot="guests-mint-error">
          {error}
        </p>
      )}

      {result && (
        <div className="mt-3 space-y-1 text-sm text-slate-300" data-bot="guests-mint-result">
          <p>
            {result.minted === 0
              ? 'Every upcoming stay already had a link.'
              : `Made ${result.minted} link${result.minted === 1 ? '' : 's'}.`}{' '}
            Nothing was sent.
          </p>
          {byHouse.length > 0 && (
            <p className="text-slate-400">
              {byHouse
                .map(([house, count]) => `${count} ${house}${count === 1 ? '' : 's'}`)
                .join(' · ')}
            </p>
          )}
          {result.guideOff.length > 0 && (
            <p className="text-amber-300" data-bot="guests-mint-guide-off">
              The house guide is still off for {result.guideOff.join(', ')}. Those links open, but the guest
              sees a page without the guide until it is turned on.
            </p>
          )}
          {result.skipped > 0 && (
            <p className="text-slate-400">
              {result.skipped} stay{result.skipped === 1 ? '' : 's'} skipped. Open one to see why.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
