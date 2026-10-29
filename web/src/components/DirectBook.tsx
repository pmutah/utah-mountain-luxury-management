import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { PROPERTIES } from '../lib/api';
import { occupiedByHouse, type StaySpan } from '../lib/availability';
import { HOUSE_PHOTOS } from '../lib/house-photos';
import { formatWhole } from '../lib/luxury';
import { addDays, denverToday, weekdayIndex } from '../lib/market/dates';
import type { HouseId } from '../lib/market/types';
import { quoteStay } from '../lib/quote';
import { BrandMark } from './BrandMark';

const HOUSES: HouseId[] = ['river', 'ranch', 'lindon'];

const BLURB: Record<HouseId, string> = {
  river: 'Vivian Park · sleeps 25 · 7 king suites · first stays November 1, 2026',
  ranch: '270 East Center Street, Lindon',
  lindon: '143 Harcliff Circle, Lindon',
};

function nextOpenFriday(today: string): string {
  let cursor = today < '2026-11-01' ? '2026-11-01' : today;
  for (let i = 0; i < 14; i += 1) {
    if (weekdayIndex(cursor) === 5) return cursor;
    cursor = addDays(cursor, 1);
  }
  return today;
}

const EMPTY_TAKEN: Record<HouseId, string[]> = { ranch: [], lindon: [], river: [] };

async function loadBookedNights(): Promise<Record<HouseId, string[]> | null> {
  const from = denverToday();
  const until = addDays(from, 540);
  const live = await fetch('/api/book/availability').catch(() => null);
  const type = live?.headers.get('content-type') ?? '';
  if (live?.ok && type.includes('application/json')) {
    const body = (await live.json()) as { nights?: Record<HouseId, string[]> };
    if (body.nights?.ranch && body.nights.lindon && body.nights.river) return body.nights;
  }
  if (!import.meta.env.DEV) return null;
  const staysRes = await fetch('/api/reservations').catch(() => null);
  if (!staysRes?.ok) return null;
  const staysBody = (await staysRes.json()) as { reservations?: StaySpan[] };
  const blocksRes = await fetch('/api/calendar/blocks').catch(() => null);
  const blocksBody = blocksRes?.ok
    ? ((await blocksRes.json()) as { blocks?: { propertyId: string; start: string; end: string }[] })
    : { blocks: [] };
  const spans: StaySpan[] = [
    ...(staysBody.reservations ?? []).map((stay) => ({
      propertyId: stay.propertyId,
      checkIn: stay.checkIn,
      checkOut: stay.checkOut,
      status: stay.status,
    })),
    ...(blocksBody.blocks ?? []).map((block) => ({
      propertyId: block.propertyId,
      checkIn: block.start,
      checkOut: block.end,
    })),
  ];
  return occupiedByHouse(spans, from, until);
}

export function DirectBook() {
  const opening = nextOpenFriday(denverToday());
  const [house, setHouse] = useState<HouseId>('river');
  const [checkIn, setCheckIn] = useState(opening);
  const [checkOut, setCheckOut] = useState(addDays(opening, 2));
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', phone: '', note: '' });
  const [taken, setTaken] = useState<Record<HouseId, string[]>>(EMPTY_TAKEN);
  const [calendar, setCalendar] = useState<'loading' | 'live' | 'off'>('loading');

  useEffect(() => {
    let cancel = false;
    loadBookedNights()
      .then((nights) => {
        if (cancel) return;
        if (nights) {
          setTaken(nights);
          setCalendar('live');
        } else setCalendar('off');
      })
      .catch(() => {
        if (!cancel) setCalendar('off');
      });
    return () => {
      cancel = true;
    };
  }, []);

  const quote = useMemo(
    () => quoteStay(house, checkIn, checkOut, taken[house] ?? []),
    [house, checkIn, checkOut, taken],
  );
  const photo = HOUSE_PHOTOS[house];

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!quote.ok) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          propertyId: house,
          checkIn,
          checkOut,
          returning: false,
          note: [
            form.note,
            `Preview quote ${formatWhole(quote.stayTotal)} before tax (${quote.nights.length} nights).`,
          ]
            .filter(Boolean)
            .join(' '),
        }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error || 'Could not send the request');
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the request');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen px-4 py-10 sm:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 flex items-center gap-3">
          <BrandMark />
          <div>
            <p className="uml-kicker">Utah Mountain Luxury</p>
            <h1 className="font-display text-5xl">Stay with us</h1>
          </div>
        </div>
        <p className="mb-8 max-w-2xl text-sm text-[var(--uml-muted)]">
          This is a preview of our own booking page. The quote uses the season rates already on the books.
          It does not charge a card, and it does not hold the dates. Live direct booking still runs on the Hospitable site.
        </p>

        <div className="mb-6 grid gap-3 sm:grid-cols-3" data-bot="stay-houses">
          {HOUSES.map((id) => (
            <button
              key={id}
              type="button"
              data-bot={`stay-house-${id}`}
              aria-pressed={house === id}
              onClick={() => setHouse(id)}
              className={`uml-panel rounded-3xl px-5 py-4 text-left ${house === id ? 'ring-1 ring-[var(--uml-gold)]' : ''}`}
            >
              <p className="uml-kicker">{id}</p>
              <p className="font-display text-3xl">{PROPERTIES[id].name.replace('The ', '')}</p>
              <p className="mt-1 text-xs text-[var(--uml-muted)]">{BLURB[id]}</p>
            </button>
          ))}
        </div>

        <div className="grid items-start gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="uml-panel overflow-hidden rounded-[32px]">
            {photo && (
              <img src={photo.src} alt={PROPERTIES[house].name} className="h-64 w-full object-cover" />
            )}
            <div className="space-y-4 p-6">
              <p className="uml-kicker">{PROPERTIES[house].address}</p>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs text-[var(--uml-muted)]">
                  Check in
                  <input
                    type="date"
                    aria-label="Check in"
                    data-bot="stay-check-in"
                    value={checkIn}
                    onChange={(e) => setCheckIn(e.target.value)}
                    className="mt-1 w-full rounded-2xl border border-[var(--uml-line)] bg-transparent px-4 py-3 text-[var(--uml-ink)]"
                  />
                </label>
                <label className="text-xs text-[var(--uml-muted)]">
                  Check out
                  <input
                    type="date"
                    aria-label="Check out"
                    data-bot="stay-check-out"
                    value={checkOut}
                    onChange={(e) => setCheckOut(e.target.value)}
                    className="mt-1 w-full rounded-2xl border border-[var(--uml-line)] bg-transparent px-4 py-3 text-[var(--uml-ink)]"
                  />
                </label>
              </div>
            </div>
          </section>

          <section className="uml-panel rounded-[32px] p-6" data-bot="stay-quote">
            <p className="uml-kicker">Quote before tax</p>
            {quote.ok ? (
              <div className="mt-3 space-y-3">
                <p className="font-display text-5xl uml-num">{formatWhole(quote.stayTotal)}</p>
                <p className="text-sm text-[var(--uml-muted)]">
                  {formatWhole(quote.lodging)} lodging
                  {quote.cleaning > 0 ? ` · ${formatWhole(quote.cleaning)} cleaning` : ''}
                  {' · '}
                  {quote.nights.length} nights
                  {quote.nights[0]?.season ? ` · ${quote.nights[0].season}` : ''}
                </p>
                <p className="text-xs text-[var(--uml-muted)]">
                  Utah lodging tax is added after the rate is confirmed. Nothing is charged on this page.
                </p>
              </div>
            ) : (
              <p className="mt-3 font-display text-3xl">{quote.reason}</p>
            )}
            <p className="mt-3 text-xs text-[var(--uml-muted)]" data-bot="stay-calendar">
              {calendar === 'loading'
                ? 'Checking the calendar…'
                : calendar === 'live'
                  ? `${taken[house]?.length ?? 0} nights ahead are already booked.`
                  : 'Calendar check is not on this server yet. Confirm the dates before accepting.'}
            </p>

            {sent ? (
              <p className="mt-8 font-display text-3xl">We have the request. Someone will write back.</p>
            ) : (
              <form onSubmit={(e) => void submit(e)} className="mt-8 space-y-3">
                <input
                  required
                  placeholder="Your name"
                  aria-label="Your name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full rounded-2xl border border-[var(--uml-line)] bg-transparent px-4 py-3"
                />
                <input
                  required
                  type="email"
                  placeholder="Email"
                  aria-label="Email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full rounded-2xl border border-[var(--uml-line)] bg-transparent px-4 py-3"
                />
                <input
                  placeholder="Mobile"
                  aria-label="Mobile"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="w-full rounded-2xl border border-[var(--uml-line)] bg-transparent px-4 py-3"
                />
                <textarea
                  placeholder="Anything we should know"
                  aria-label="Note"
                  value={form.note}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                  className="min-h-24 w-full rounded-2xl border border-[var(--uml-line)] bg-transparent px-4 py-3"
                />
                {error && <p className="text-sm text-red-300">{error}</p>}
                <button
                  type="submit"
                  data-bot="stay-request"
                  disabled={busy || !quote.ok || calendar === 'loading'}
                  className="rounded-full bg-[var(--uml-gold)] px-5 py-3 text-xs uppercase tracking-[0.16em] text-[var(--uml-gold-ink)] disabled:opacity-40"
                >
                  {busy ? 'Sending' : 'Request these dates'}
                </button>
              </form>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
