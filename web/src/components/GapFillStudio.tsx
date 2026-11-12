import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { findNightGaps, type NightGap } from '../lib/gap-fill';
import { currentDayIso } from '../lib/months';
import { useViewer } from '../lib/platform/viewer';

export function GapFillStudio() {
  const viewer = useViewer();
  const hideLindon = viewer.known && viewer.houses !== null && !viewer.houses.includes('lindon');
  const [gaps, setGaps] = useState<NightGap[] | null>(null);
  const [focus, setFocus] = useState<string>('');
  const [copied, setCopied] = useState('');
  useEffect(() => {
    const saved = sessionStorage.getItem('uml-gap');
    if (saved) setFocus(saved);
    let cancel = false;
    api
      .getReservations()
      .then((body) => {
        if (!cancel) setGaps(findNightGaps(body.reservations, currentDayIso(), 90, hideLindon));
      })
      .catch(() => {
        if (!cancel) setGaps(null);
      });
    return () => {
      cancel = true;
    };
  }, [hideLindon]);

  return (
    <section className="uml-panel rounded-3xl p-5" data-bot="gap-fill">
      <p className="uml-kicker">Open nights between stays</p>
      <h2 className="font-display text-3xl mt-1">Gap-fill studio</h2>
      <p className="mt-2 text-sm text-[var(--uml-muted)]">
        A quote link and a note you can copy. Nothing is sent from here.
      </p>
      {gaps === null ? (
        <p className="mt-3 text-sm">Saved bookings could not be read, so no gap is listed.</p>
      ) : gaps.length === 0 ? (
        <p className="mt-3 text-sm">No 1–4 night gap between stays in the next 90 days.</p>
      ) : (
        <ul className="mt-4 grid gap-3 md:grid-cols-2">
          {gaps.map((gap) => {
            const key = `${gap.house}:${gap.checkIn}`;
            const pinned = focus.includes(gap.checkIn) && focus.includes(gap.house);
            return (
              <li key={key} className="uml-panel rounded-2xl p-4" data-bot="gap-card" data-pinned={pinned ? 'yes' : 'no'}>
                <p className="font-display text-2xl capitalize">{gap.house}</p>
                <p className="text-sm">
                  {gap.checkIn} → {gap.checkOut} · {gap.nights} night{gap.nights === 1 ? '' : 's'}
                </p>
                <a className="mt-2 inline-block text-sm underline" href={gap.link} data-bot="gap-book-link">
                  Open the quote
                </a>
                {gap.guests.length > 0 ? (
                  <p className="mt-2 text-sm text-[var(--uml-muted)]">
                    Stayed here before: {gap.guests.map((guest) => `${guest.name} (${guest.stays})`).join(', ')}
                  </p>
                ) : (
                  <p className="mt-2 text-sm text-[var(--uml-muted)]">No past guest on file with an email or phone for this house.</p>
                )}
                <p className="mt-2 text-sm" data-bot="gap-draft">
                  {gap.draft}
                </p>
                <button
                  type="button"
                  className="uml-nav mt-2"
                  onClick={() => {
                    void navigator.clipboard?.writeText(gap.draft).then(() => setCopied(key));
                  }}
                >
                  {copied === key ? 'Copied' : 'Copy note'}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
