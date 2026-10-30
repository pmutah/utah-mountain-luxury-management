import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { PROPERTIES } from '../lib/api';
import { loadBookedNights, loadPaceStays } from '../lib/booked-nights';
import { HOUSE_PHOTOS } from '../lib/house-photos';
import { houseStay, partyFits } from '../lib/house-stay';
import { directRequestReady, houseRules } from '../lib/house-rules';
import { LISTING_TITLE } from '../lib/listing';
import { formatWhole } from '../lib/luxury';
import { addDays, denverToday, weekdayIndex } from '../lib/market/dates';
import type { YearPace } from '../lib/market/fill';
import type { HouseId } from '../lib/market/types';
import { quoteStay } from '../lib/quote';
import { grossPace, type PaceStay } from '../lib/revenue-goals';
import { BrandMark } from './BrandMark';
import { StayMonth } from './StayMonth';

const HOUSES: HouseId[] = ['river', 'ranch', 'lindon'];

function nextOpenFriday(today: string): string {
  let cursor = today < '2026-11-01' ? '2026-11-01' : today;
  for (let i = 0; i < 14; i += 1) {
    if (weekdayIndex(cursor) === 5) return cursor;
    cursor = addDays(cursor, 1);
  }
  return today;
}

function nightLabel(iso: string) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const EMPTY_TAKEN: Record<HouseId, string[]> = { ranch: [], lindon: [], river: [] };

export function DirectBook() {
  const opening = nextOpenFriday(denverToday());
  const [house, setHouse] = useState<HouseId>('river');
  const [checkIn, setCheckIn] = useState(opening);
  const [checkOut, setCheckOut] = useState(addDays(opening, 2));
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', phone: '', note: '' });
  const [guests, setGuests] = useState('');
  const [rulesRead, setRulesRead] = useState(false);
  const [taken, setTaken] = useState<Record<HouseId, string[]>>(EMPTY_TAKEN);
  const [calendar, setCalendar] = useState<'loading' | 'live' | 'off'>('loading');
  const [stays, setStays] = useState<PaceStay[] | null>(null);
  const today = denverToday();
  const pace: YearPace = stays
    ? grossPace(house, stays, today).stillNeeded > 0
      ? 'short'
      : 'met'
    : 'unknown';

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

  useEffect(() => {
    let cancel = false;
    loadPaceStays()
      .then((rows) => {
        if (!cancel && rows) setStays(rows);
      })
      .catch(() => undefined);
    return () => {
      cancel = true;
    };
  }, []);

  const stay = houseStay(house);
  const guestCount = /^\d+$/.test(guests) ? Number(guests) : null;
  const party = guestCount === null ? partyFits(house, 0) : partyFits(house, guestCount);
  const quote = useMemo(
    () =>
      quoteStay(house, checkIn, checkOut, taken[house] ?? [], {
        asOf: today,
        pace,
        ...(guestCount !== null ? { guests: guestCount } : {}),
      }),
    [house, checkIn, checkOut, taken, today, pace, guestCount],
  );
  const canRequest = directRequestReady({
    quoteOk: quote.ok,
    rulesRead,
    calendarLoading: calendar === 'loading',
    partyOk: party.ok,
  });
  const photo = HOUSE_PHOTOS[house];

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!canRequest) return;
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
            `Overnight guests ${guests}.`,
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
              onClick={() => {
                setHouse(id);
                setRulesRead(false);
              }}
              className={`uml-panel rounded-3xl px-5 py-4 text-left ${house === id ? 'ring-1 ring-[var(--uml-gold)]' : ''}`}
            >
              <p className="uml-kicker">{id}</p>
              <p className="font-display text-3xl">{PROPERTIES[id].name.replace('The ', '')}</p>
              <p className="mt-1 text-xs text-[var(--uml-muted)]">{LISTING_TITLE[id]}</p>
              {id === 'river' && <p className="mt-1 text-xs text-[var(--uml-muted)]">First stays November 1, 2026</p>}
            </button>
          ))}
        </div>

        <div className="grid items-start gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="uml-panel overflow-hidden rounded-[32px]">
            {photo && (
              <img src={photo.src} alt={PROPERTIES[house].name} className="h-64 w-full object-cover" />
            )}
            <div className="space-y-3 px-6 pt-6" data-bot="stay-house-facts">
              <p className="uml-kicker">The house</p>
              <p className="font-display text-3xl">Sleeps {stay.sleeps}</p>
              <p className="text-sm text-[var(--uml-muted)]">
                Check-in {stay.checkIn} · Check-out {stay.checkOut}
              </p>
              {stay.bedrooms && <p className="text-sm">{stay.bedrooms}</p>}
              <p className="text-sm text-[var(--uml-muted)]">{stay.arrival}</p>
              <p className="text-sm text-[var(--uml-muted)]">{stay.parking}</p>
              <ul className="space-y-1 text-sm" data-bot="stay-nearby">
                {stay.nearby.map((place) => (
                  <li key={place.name}>
                    {place.name}. {place.note}
                  </li>
                ))}
              </ul>
            </div>
            <div className="space-y-4 p-6">
              <p className="uml-kicker">{PROPERTIES[house].address}</p>
              <StayMonth
                house={house}
                taken={taken[house] ?? []}
                checkIn={checkIn}
                checkOut={checkOut}
                pace={pace}
                onPick={(stay) => {
                  setCheckIn(stay.checkIn);
                  setCheckOut(stay.checkOut);
                }}
              />
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
            <p className="uml-kicker">Direct price, before tax</p>
            {quote.ok ? (
              <div className="mt-3 space-y-3">
                <p className="font-display text-5xl uml-num">{formatWhole(quote.stayTotal)}</p>
                <p className="text-sm text-[var(--uml-muted)]">
                  {formatWhole(quote.lodging)} for the nights
                  {quote.cleaning > 0 ? ` · ${formatWhole(quote.cleaning)} cleaning` : ''}
                  {' · '}
                  {quote.nights.length} nights
                  {quote.nights[0]?.season ? ` · ${quote.nights[0].season}` : ''}
                </p>
                <ul className="space-y-1 text-sm" data-bot="stay-quote-nights">
                  {quote.nights.map((night) => (
                    <li key={night.date}>
                      {nightLabel(night.date)} · {formatWhole(night.direct)}
                      {night.promotionPercent === 20 ? ' · 20% fill' : ''}
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-[var(--uml-muted)]">
                  The Airbnb guest total for these nights is {formatWhole(quote.channelTotal)}. This page has no platform fee.
                  {quote.promotionNights > 0
                    ? ` ${quote.promotionNights} nights use the 20% fill rate. The published base stays the same.`
                    : ''}
                  {' '}Utah lodging tax is added after the rate is confirmed. Nothing is charged on this page.
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

            <label className="mt-6 block text-sm">
              Overnight guests
              <input
                inputMode="numeric"
                aria-label="Overnight guests"
                data-bot="stay-guests"
                value={guests}
                placeholder={`Up to ${stay.sleeps}`}
                onChange={(event) => setGuests(event.target.value.replace(/[^\d]/g, '').slice(0, 2))}
                className="mt-2 w-full rounded-2xl border border-[var(--uml-line)] bg-transparent px-4 py-3"
              />
            </label>
            {!party.ok && (
              <p className="mt-2 text-sm text-[var(--uml-muted)]" data-bot="stay-party">
                {party.reason}
              </p>
            )}

            <div className="mt-6" data-bot="stay-rules">
              <p className="uml-kicker">House rules</p>
              <ul className="mt-3 space-y-2 text-sm text-[var(--uml-muted)]">
                {houseRules(house).map((rule) => (
                  <li key={rule.id}>{rule.text}</li>
                ))}
              </ul>
              <label className="mt-4 flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  data-bot="stay-rules-check"
                  checked={rulesRead}
                  onChange={(event) => setRulesRead(event.target.checked)}
                />
                I have read the house rules. This request does not sign the stay agreement.
              </label>
            </div>

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
                  disabled={busy || !canRequest}
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
