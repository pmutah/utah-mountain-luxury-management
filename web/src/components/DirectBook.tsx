import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ARRIVAL_SLOTS, arrivalNote } from '../lib/arrival';
import { PROPERTIES } from '../lib/api';
import { calendarAheadLine, loadPaceStays, loadQuoteCalendar } from '../lib/booked-nights';
import { HOUSE_PHOTOS } from '../lib/house-photos';
import { houseStay, partyFits, partyNote, accessLine, earlyLine, nearbyGroups } from '../lib/house-stay';
import { placeHref, placeSite } from '../lib/place-link';
import { directRequestReady, houseRules, rulesNote } from '../lib/house-rules';
import { agreementLine, agreementNote } from '../lib/stay-agreement';
import { LISTING_TITLE } from '../lib/listing';
import { formatWhole } from '../lib/luxury';
import { addDays, denverToday, weekdayIndex } from '../lib/market/dates';
import type { YearPace } from '../lib/market/fill';
import type { HouseId } from '../lib/market/types';
import { quoteStay, directSavings } from '../lib/quote';
import { openArrivals } from '../lib/open-arrivals';
import { alsoHeld, alsoOpen } from '../lib/also-open';
import { longestStay } from '../lib/longest-stay';
import { shortestStay } from '../lib/shortest-stay';
import { stayLengths } from '../lib/stay-lengths';
import { readStayLink, stayLinkSearch } from '../lib/stay-link';
import { splitStayLine } from '../lib/stay-split';
import { quoteOfferNote, quoteOffers, toggleUpsell, type UpsellId } from '../lib/upsells';
import { grossPace, type PaceStay } from '../lib/revenue-goals';
import { bookingGuide, quotePaper } from '../lib/booking-guide';
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
  const linked = readStayLink(typeof window === 'undefined' ? '' : window.location.search);
  const [house, setHouse] = useState<HouseId>(linked.house ?? 'river');
  const [checkIn, setCheckIn] = useState(linked.checkIn ?? opening);
  const [checkOut, setCheckOut] = useState(linked.checkOut ?? addDays(linked.checkIn ?? opening, 2));
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', phone: '', note: '' });
  const [guests, setGuests] = useState(linked.guests ?? '');
  const [children, setChildren] = useState(linked.children ?? '');
  const [rulesRead, setRulesRead] = useState(false);
  const [addons, setAddons] = useState<UpsellId[]>(linked.addons ?? []);
  const [arrival, setArrival] = useState<string | null>(linked.arrive ?? null);
  const [taken, setTaken] = useState<Record<HouseId, string[]>>(EMPTY_TAKEN);
  const [closed, setClosed] = useState<Record<HouseId, string[]>>(EMPTY_TAKEN);
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
    loadQuoteCalendar()
      .then((rows) => {
        if (cancel) return;
        if (rows) {
          setTaken(rows.nights);
          setClosed(rows.closed);
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
  const childCount = /^\d+$/.test(children) ? Number(children) : null;
  const party = guestCount === null ? partyFits(house, 0) : partyFits(house, guestCount, childCount ?? undefined);
  const guestLine = partyNote(guests, children);
  const quote = useMemo(
    () =>
      quoteStay(house, checkIn, checkOut, taken[house] ?? [], {
        asOf: today,
        pace,
        closed: closed[house] ?? [],
        ...(guestCount !== null ? { guests: guestCount, ...(childCount !== null ? { children: childCount } : {}) } : {}),
      }),
    [house, checkIn, checkOut, taken, closed, today, pace, guestCount, childCount],
  );
  const splitLine = quote.ok && party.ok && guestCount !== null ? splitStayLine(quote.stayTotal, guestCount) : null;
  const saved = quote.ok ? directSavings(quote.channelTotal, quote.stayTotal) : null;
  const openings = useMemo(
    () => (calendar === 'live' ? openArrivals(house, taken[house] ?? [], today, pace) : []),
    [calendar, house, taken, today, pace],
  );
  const others = useMemo(() => {
    if (calendar !== 'live') return [];
    const paceFor = (id: HouseId): YearPace =>
      stays ? (grossPace(id, stays, today).stillNeeded > 0 ? 'short' : 'met') : 'unknown';
    return alsoOpen(house, checkIn, checkOut, taken, today, paceFor, guestCount ?? undefined, closed, childCount ?? undefined);
  }, [calendar, house, checkIn, checkOut, taken, closed, today, stays, guestCount, childCount]);
  const held = useMemo(() => {
    if (calendar !== 'live') return [];
    const paceFor = (id: HouseId): YearPace =>
      stays ? (grossPace(id, stays, today).stillNeeded > 0 ? 'short' : 'met') : 'unknown';
    return alsoHeld(house, checkIn, checkOut, taken, today, paceFor, guestCount ?? undefined, closed, childCount ?? undefined);
  }, [calendar, house, checkIn, checkOut, taken, closed, today, stays, guestCount, childCount]);
  const extension = useMemo(() => {
    if (calendar !== 'live' || quote.ok) return null;
    const next = shortestStay(house, checkIn, taken[house] ?? [], today, pace, guestCount ?? undefined);
    if (!next || next.checkOut === checkOut) return null;
    return next;
  }, [calendar, quote.ok, house, checkIn, checkOut, taken, today, pace, guestCount]);
  const span = useMemo(() => {
    if (calendar !== 'live') return null;
    const next = longestStay(house, checkIn, taken[house] ?? [], today, pace, guestCount ?? undefined);
    if (!next || next.checkOut === checkOut || next.checkOut === extension?.checkOut) return null;
    return next;
  }, [calendar, house, checkIn, checkOut, taken, today, pace, guestCount, extension]);
  const lengths = useMemo(() => {
    if (calendar !== 'live') return null;
    return stayLengths(house, checkIn, taken[house] ?? [], today, pace, guestCount ?? undefined);
  }, [calendar, house, checkIn, taken, today, pace, guestCount]);
  const canRequest = directRequestReady({
    quoteOk: quote.ok,
    rulesRead,
    calendarLoading: calendar === 'loading',
    partyOk: party.ok,
  });
  const photo = HOUSE_PHOTOS[house];
  const guide = bookingGuide(house, checkIn, checkOut);
  const access = accessLine(checkIn);
  const early = calendar === 'live' ? earlyLine(checkIn, taken[house] ?? [], today) : null;
  const offers = quoteOffers({
    house,
    checkIn,
    checkOut,
    asOf: today,
    taken: taken[house] ?? [],
    calendarLive: calendar === 'live',
  });
  const selectedOffers = offers.filter((offer) => addons.includes(offer.id));
  const addonNote = quoteOfferNote(selectedOffers);
  const earlyArrival = selectedOffers.some((offer) => offer.id === 'early');
  const arrivalLine = arrivalNote(arrival, earlyArrival);
  const paper = quotePaper({
    ok: quote.ok,
    reason: quote.reason,
    nights: quote.nights.length,
    lodging: quote.lodging,
    cleaning: quote.cleaning,
    stayTotal: quote.stayTotal,
    party: guestLine,
    arrival: arrivalLine,
  });
  const sharePath = `/book${stayLinkSearch({
    house,
    checkIn,
    checkOut,
    guests,
    children,
    addons: calendar === 'live' ? selectedOffers.map((offer) => offer.id) : addons,
    arrive: earlyArrival || !arrival ? undefined : (ARRIVAL_SLOTS.find((slot) => slot === arrival) ?? undefined),
  })}`;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (`${window.location.pathname}${window.location.search}` === sharePath) return;
    window.history.replaceState(null, '', sharePath);
  }, [sharePath]);

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
            guestLine,
            arrivalLine,
            `Preview quote ${formatWhole(quote.stayTotal)} before tax (${quote.nights.length} nights).`,
            addonNote,
            rulesNote(house),
            agreementNote(house),
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
              <>
                <img src={photo.src} alt={PROPERTIES[house].name} className="h-64 w-full object-cover" />
                <p className="px-6 pt-4 text-xs text-[var(--uml-muted)]" data-bot="stay-photo">
                  {photo.caption}
                </p>
              </>
            )}
            <div className="space-y-3 px-6 pt-6" data-bot="stay-house-facts">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="uml-kicker">The house</p>
                <button type="button" className="uml-nav" data-bot="stay-print" data-print-hide onClick={() => window.print()}>
                  Print this quote
                </button>
              </div>
              <p className="text-xs text-[var(--uml-muted)]" data-bot="stay-print-note">
                The printed guide includes this price, the party, and the arrival time. It does not charge a card or hold the dates. A name stays off the paper.
              </p>
              <p className="font-display text-3xl">Sleeps {stay.sleeps}</p>
              <p className="text-sm text-[var(--uml-muted)]">
                Check-in {stay.checkIn} · Check-out {stay.checkOut}
              </p>
              {stay.bedrooms && <p className="text-sm">{stay.bedrooms}</p>}
              <p className="text-sm text-[var(--uml-muted)]">{stay.arrival}</p>
              <p className="text-sm text-[var(--uml-muted)]">{stay.parking}</p>
              <p className="text-sm" data-bot="stay-emergency">
                {stay.emergency}
              </p>
              {access && (
                <p className="text-sm" data-bot="stay-access">
                  {access}
                </p>
              )}
              {early && (
                <p className="text-sm" data-bot="stay-early">
                  {early}
                </p>
              )}
              <ul className="space-y-1 text-sm" data-bot="stay-leaving">
                {stay.checkout.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ul>
              {stay.notes.length > 0 && (
                <ul className="space-y-2 text-sm" data-bot="stay-notes">
                  {stay.notes.map((note) => (
                    <li key={note.title}>
                      <span className="text-[var(--uml-gold)]">{note.title}.</span> {note.body}
                    </li>
                  ))}
                </ul>
              )}
              <div className="space-y-3 text-sm" data-bot="stay-nearby">
                {nearbyGroups(stay.nearby).map((group) => (
                  <div key={group.kind} data-bot={`stay-nearby-${group.kind}`}>
                    <p className="text-xs uppercase tracking-[0.16em] text-[var(--uml-muted)]">{group.label}</p>
                    <ul className="mt-1 space-y-1">
                      {group.places.map((place) => (
                        <li key={place.name}>
                          <a href={placeHref(place)} target="_blank" rel="noreferrer">
                            {place.name}
                          </a>
                          {place.area ? `, ${place.area}` : ''}. {place.note}
                          {placeSite(place.url) ? ` ${placeSite(place.url)}` : ''}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-4 p-6">
              <a
                className="uml-kicker"
                data-bot="stay-map"
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(PROPERTIES[house].address)}`}
                target="_blank"
                rel="noreferrer"
              >
                {PROPERTIES[house].address}
              </a>
              {openings.length > 0 && (
                <div data-bot="stay-open">
                  <p className="uml-kicker">Open arrivals</p>
                  <p className="mt-1 text-xs text-[var(--uml-muted)]">
                    The shortest stay this page will quote. Picking one fills the dates and does not send a request.
                  </p>
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {openings.map((item) => (
                      <li key={item.checkIn}>
                        <button
                          type="button"
                          data-bot="stay-open-pick"
                          data-in={item.checkIn}
                          data-out={item.checkOut}
                          className="rounded-full border border-[var(--uml-line)] px-4 py-2 text-left text-sm"
                          onClick={() => {
                            setCheckIn(item.checkIn);
                            setCheckOut(item.checkOut);
                          }}
                        >
                          {item.label} · {formatWhole(item.direct)}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <StayMonth
                house={house}
                taken={taken[house] ?? []}
                blocked={closed[house] ?? []}
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
                {saved !== null && (
                  <p className="text-sm" data-bot="stay-save">
                    This page is {formatWhole(saved)} below the Airbnb guest total, before tax.
                  </p>
                )}
              </div>
            ) : (
              <p className="mt-3 font-display text-3xl">{quote.reason}</p>
            )}
            {extension && (
              <div className="mt-3" data-bot="stay-extend">
                <p className="text-sm">
                  This check-in can start a {extension.nights === 1 ? '1-night' : `${extension.nights}-night`} stay, through{' '}
                  {extension.through}. Using it does not send a request.
                </p>
                <button
                  type="button"
                  className="uml-gold-btn mt-2 rounded-full px-4 py-2 text-sm"
                  data-bot="stay-extend-use"
                  data-out={extension.checkOut}
                  onClick={() => setCheckOut(extension.checkOut)}
                >
                Use this stay
              </button>
            </div>
            )}
            {span && !lengths && (
              <div className="mt-3" data-bot="stay-span">
                <p className="text-sm">
                  This check-in is open through {span.through}, {span.nights === 1 ? '1 night' : `${span.nights} nights`}. Using
                  the full stretch does not send a request.
                </p>
                <button
                  type="button"
                  className="uml-gold-btn mt-2 rounded-full px-4 py-2 text-sm"
                  data-bot="stay-span-use"
                  data-out={span.checkOut}
                  data-nights={span.nights}
                  onClick={() => setCheckOut(span.checkOut)}
                >
                  Use the full stretch
                </button>
              </div>
            )}
            {lengths && (
              <div className="mt-3" data-bot="stay-lengths">
                <p className="text-sm">
                  This check-in is open through {lengths.through}. Choose a length. Choosing one does not send a request.
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {lengths.choices.map((choice) => (
                    <button
                      key={choice.checkOut}
                      type="button"
                      className={`uml-nav ${checkOut === choice.checkOut ? 'ring-1 ring-[var(--uml-gold)]' : ''}`}
                      data-bot="stay-length"
                      data-nights={choice.nights}
                      data-out={choice.checkOut}
                      aria-pressed={checkOut === choice.checkOut}
                      onClick={() => setCheckOut(choice.checkOut)}
                    >
                      {choice.nights === 1 ? '1 night' : `${choice.nights} nights`}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <p className="mt-3 text-xs text-[var(--uml-muted)]" data-bot="stay-calendar">
              {calendar === 'loading'
                ? 'Checking the calendar…'
                : calendar === 'live'
                  ? calendarAheadLine(taken[house] ?? [], closed[house] ?? [])
                  : 'Calendar check is not on this server yet. Confirm the dates before accepting.'}
            </p>
            {others.length > 0 && (
              <div className="mt-4" data-bot="stay-also">
                <p className="uml-kicker">Also open</p>
                <p className="mt-1 text-xs text-[var(--uml-muted)]">
                  These houses will quote the same dates. Choosing one does not send a request.
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {others.map((item) => (
                    <button
                      key={item.house}
                      type="button"
                      data-bot={`stay-also-${item.house}`}
                      className="rounded-full border border-[var(--uml-line)] px-4 py-2 text-sm"
                      onClick={() => {
                        setHouse(item.house);
                        setRulesRead(false);
                      }}
                    >
                      {PROPERTIES[item.house].name} · {formatWhole(item.direct)}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {held.length > 0 && (
              <div className="mt-4" data-bot="stay-held">
                <p className="uml-kicker">Not these dates</p>
                <ul className="mt-2 space-y-1 text-sm">
                  {held.map((item) => (
                    <li key={item.house} data-bot={`stay-held-${item.house}`}>
                      {item.reason}
                      {item.longer && (
                        <button
                          type="button"
                          className="ml-2 underline"
                          data-bot={`stay-held-open-${item.house}`}
                          data-nights={item.longer.nights}
                          data-out={item.longer.checkOut}
                          onClick={() => {
                            setHouse(item.house);
                            setCheckOut(item.longer?.checkOut ?? checkOut);
                            setRulesRead(false);
                          }}
                        >
                          Look at {item.longer.nights} nights
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
                <p className="mt-1 text-xs text-[var(--uml-muted)]">
                  A longer stay can be opened. A party that does not fit stays closed. Nothing is sent.
                </p>
              </div>
            )}

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
            <label className="mt-4 block text-sm">
              Children, included in that count
              <input
                inputMode="numeric"
                aria-label="Children"
                data-bot="stay-children"
                value={children}
                placeholder="0"
                onChange={(event) => setChildren(event.target.value.replace(/[^\d]/g, '').slice(0, 2))}
                className="mt-2 w-full rounded-2xl border border-[var(--uml-line)] bg-transparent px-4 py-3"
              />
            </label>
            {!party.ok && (
              <p className="mt-2 text-sm text-[var(--uml-muted)]" data-bot="stay-party">
                {party.reason}
              </p>
            )}
            {guestLine && (
              <p className="mt-2 text-sm text-[var(--uml-muted)]" data-bot="stay-party-note" data-note={guestLine}>
                {guestLine} Nothing is sent until you use the button.
              </p>
            )}
            {splitLine && (
              <p className="mt-2 text-sm text-[var(--uml-muted)]" data-bot="stay-split">
                {splitLine}
              </p>
            )}
            <div className="mt-6" data-bot="stay-arrival">
              <p className="uml-kicker">Arrival</p>
              <p className="mt-2 text-sm text-[var(--uml-muted)]">
                Check-in is 4:00 PM. A time is included in the request. Nothing is sent until you use the button.
              </p>
              {earlyArrival ? (
                <p className="mt-2 text-sm" data-bot="stay-arrival-note" data-note="">
                  Arrive at 1:00 PM is already on this request.
                </p>
              ) : (
                <>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {ARRIVAL_SLOTS.map((slot) => (
                      <button
                        key={slot}
                        type="button"
                        className={`uml-nav ${arrival === slot ? 'ring-1 ring-[var(--uml-gold)]' : ''}`}
                        data-bot="stay-arrival-slot"
                        data-time={slot}
                        aria-pressed={arrival === slot}
                        onClick={() => setArrival((current) => (current === slot ? null : slot))}
                      >
                        {slot}
                      </button>
                    ))}
                  </div>
                  {arrivalLine && (
                    <p className="mt-2 text-sm" data-bot="stay-arrival-note" data-note={arrivalLine}>
                      {arrivalLine} Nothing is sent until you use the button.
                    </p>
                  )}
                </>
              )}
            </div>
            <div className="mt-4" data-bot="stay-share">
              <p className="text-xs text-[var(--uml-muted)]">
                This link reopens the quote, the arrival time, how many guests are children, and the add-ons that are checked. It does not send a request.
              </p>
              <p className="mt-1 text-sm">{sharePath}</p>
              <button
                type="button"
                data-bot="stay-share-copy"
                className="uml-gold-btn mt-2 rounded-full px-4 py-2 text-sm"
                onClick={() => {
                  const url = `${window.location.origin}${sharePath}`;
                  void navigator.clipboard.writeText(url).then(
                    () => setCopied(true),
                    () => setCopied(false),
                  );
                }}
              >
                {copied ? 'Copied' : 'Copy quote link'}
              </button>
            </div>

            {offers.length > 0 && (
              <div className="mt-6" data-bot="stay-addons" data-note={addonNote}>
                <p className="uml-kicker">Add-ons</p>
                <p className="mt-2 text-sm text-[var(--uml-muted)]">
                  Checking one adds it to the request. It does not charge a card or send the request.
                </p>
                <ul className="mt-3 space-y-3">
                  {offers.map((offer) => (
                    <li key={offer.id}>
                      <label className="flex items-start gap-3 text-sm">
                        <input
                          type="checkbox"
                          className="mt-1"
                          data-bot={`stay-addon-${offer.id}`}
                          checked={addons.includes(offer.id)}
                          onChange={() => setAddons((current) => toggleUpsell(current, offer.id))}
                        />
                        <span>
                          {offer.name}. {formatWhole(offer.price)}. {offer.detail}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
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
              <p className="mt-2 text-xs text-[var(--uml-muted)]" data-bot="stay-rules-note" data-note={rulesNote(house)}>
                A request includes these rules in the note. Nothing is sent until you use the button.
              </p>
              <p className="mt-2 text-sm" data-bot="stay-agreement">
                {agreementLine(house, 'page')}
              </p>
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
      <div className="stay-sheet-source" data-bot="stay-guide-print">
        <p>House guide</p>
        <h2>{guide.name}</h2>
        {guide.facts.map((line) => (
          <p key={line}>{line}</p>
        ))}
        <ul>
          {guide.rules.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>
        <ul>
          {guide.checkout.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ul>
        <ul>
          {guide.nearby.map((place) => (
            <li key={place}>{place}</li>
          ))}
        </ul>
        {paper.map((line) => (
          <p key={line} data-bot="stay-quote-paper">
            {line}
          </p>
        ))}
        <p>{guide.close}</p>
      </div>
    </div>
  );
}
