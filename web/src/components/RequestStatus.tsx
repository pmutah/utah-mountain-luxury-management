import { useEffect, useState } from 'react';
import type { HouseId } from '../lib/market/types';

type View = {
  status: 'waiting' | 'accepted' | 'declined' | 'expired' | 'cancelled';
  houses: HouseId[];
  houseLine: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  guests?: number;
  children?: number;
  /** The parts of the Riverhouse this request is for. Absent means the whole house. */
  parts?: string[];
  heldUntil?: string;
  reason?: string;
  answeredAt?: string;
  line: string;
  hold: string | null;
};

const KICKER: Record<View['status'], string> = {
  waiting: 'Request received',
  accepted: 'Confirmed',
  declined: 'Dates not available',
  expired: 'Hold ended',
  cancelled: 'Stay cancelled',
};

/**
 * The guest's own view of a direct request. It reads one request by the token in the link, which is
 * the whole credential, so there is nothing to sign in to and nothing else to see. It shows dates and
 * the party only: no name, no price, and no way in.
 */
export function RequestStatus({ token }: { token: string }) {
  const [view, setView] = useState<View | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancel = false;
    void fetch(`/api/book/request/${encodeURIComponent(token)}`)
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as (View & { error?: string }) | null;
        if (cancel) return;
        if (!res.ok || !body || body.error) {
          setError(body?.error ?? 'This link is not valid.');
          setView(null);
          return;
        }
        setView(body);
        setError(null);
      })
      .catch(() => {
        if (cancel) return;
        setError('The request could not be read just now. Nothing was written.');
      })
      .finally(() => {
        if (!cancel) setLoading(false);
      });
    return () => {
      cancel = true;
    };
  }, [token]);

  const day = (iso: string) =>
    new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    });

  return (
    <div className="min-h-screen bg-[var(--uml-bg)] px-5 py-12 text-[var(--uml-ink)]" data-bot="request-status">
      <div className="mx-auto max-w-2xl">
        <p className="uml-kicker">Utah Mountain Luxury</p>
        <h1 className="mt-2 font-display text-4xl sm:text-5xl">Your request</h1>

        {loading && (
          <p className="mt-6 text-sm text-[var(--uml-muted)]" data-bot="request-loading">
            Reading your request…
          </p>
        )}

        {!loading && error && (
          <>
            <p className="mt-6 text-sm" data-bot="request-invalid">
              {error}
            </p>
            <p className="mt-3 text-sm text-[var(--uml-muted)]">
              If you need an answer, reply to the email we sent you and it comes to the same inbox.
            </p>
            <a className="uml-gold-btn mt-6 inline-block rounded-full px-5 py-3 text-xs uppercase tracking-[0.16em]" href="/houses/">
              The houses
            </a>
          </>
        )}

        {!loading && view && (
          <section className="uml-panel mt-8 rounded-3xl p-6 sm:p-8" data-status={view.status}>
            <p className="uml-kicker" data-bot="request-kicker">
              {KICKER[view.status]}
            </p>
            <h2 className="mt-2 font-display text-2xl">{view.houseLine}</h2>
            {/*
              What the guest actually asked for. The page showed only the house and the dates, so a guest who had just
              requested the Garage Suite could not tell from their own link what they had asked for - while the receipt
              email named it.
            */}
            {view.parts && view.parts.length > 0 && (
              <p className="mt-1 text-sm text-[var(--uml-gold)]" data-bot="request-parts">
                {view.parts.join(' and ')}
              </p>
            )}
            <p className="mt-1 text-sm text-[var(--uml-muted)]">
              {day(view.checkIn)} to {day(view.checkOut)} · {view.nights === 1 ? '1 night' : `${view.nights} nights`}
              {typeof view.guests === 'number'
                ? ` · ${view.guests === 1 ? '1 guest' : `${view.guests} guests`}`
                : ''}
              {typeof view.children === 'number' && view.children > 0
                ? ` including ${view.children === 1 ? '1 child' : `${view.children} children`}`
                : ''}
            </p>

            <p className="mt-5 text-base" data-bot="request-line">
              {view.line}
            </p>
            {view.hold && (
              <p className="mt-2 text-sm text-[var(--uml-muted)]" data-bot="request-hold">
                {view.hold}
              </p>
            )}

            {view.status === 'declined' && (
              <a
                className="uml-gold-btn mt-6 inline-block rounded-full px-5 py-3 text-xs uppercase tracking-[0.16em]"
                href={`/book/?house=${view.houses[0] ?? 'river'}`}
                data-bot="request-try-again"
              >
                Look at other dates
              </a>
            )}
            {view.status === 'cancelled' && (
              <a
                className="uml-gold-btn mt-6 inline-block rounded-full px-5 py-3 text-xs uppercase tracking-[0.16em]"
                href={`/book/?house=${view.houses[0] ?? 'river'}`}
                data-bot="request-cancelled-book"
              >
                Look at other dates
              </a>
            )}
            {view.status === 'expired' && (
              <a
                className="uml-gold-btn mt-6 inline-block rounded-full px-5 py-3 text-xs uppercase tracking-[0.16em]"
                href={`/book/?house=${view.houses[0] ?? 'river'}&in=${view.checkIn}&out=${view.checkOut}`}
                data-bot="request-check-dates"
              >
                Check these dates
              </a>
            )}
            {view.status === 'accepted' && (
              <p className="mt-6 text-sm text-[var(--uml-muted)]" data-bot="request-next">
                We will write again before you arrive with the house guide and the way in.
              </p>
            )}

            <p className="mt-8 text-xs text-[var(--uml-muted)]">
              This page shows the house, the dates, and the party. It does not carry a price, a door code, or a way in.
            </p>
          </section>
        )}

        {!loading && view && (
          <p className="mt-6 text-xs text-[var(--uml-muted)]">
            Keep this link. It is how you check back on this request.
          </p>
        )}
      </div>
    </div>
  );
}
