import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { loadQuoteCalendar, type PublicUnit } from '../lib/booked-nights';
import { heldCheckout, checkInHold, checkoutStopLine } from '../lib/stay-calendar';
import { denverToday } from '../lib/market/dates';
import { quoteStay, directSavings, guestPromoLine } from '../lib/quote';
import { houseStay, partyFits } from '../lib/house-stay';
import { MAX_DOGS } from '../lib/house-rules';
import { formatWhole } from '../lib/luxury';
import { nightsBetween } from '../lib/booking-accept';
import { RIVER_UNIT_DETAIL } from '../lib/river-units';
import { partyFitsParts } from '../lib/party-fits-parts';
import { partSharedHouseLine, unitStayOffers, unitsTogetherSleeps, unitsTogetherTotal } from '../lib/river-unit-offers';
import { agreementTopics } from '../lib/stay-agreement';
import { houseRules } from '../lib/house-rules';
import { CANCELLATION_LINE, houseFaq } from '../lib/guest-content';
import { quoteWithTax, splitPay, formatCents } from '../lib/platform/guest-ops';
import { splitStayLine } from '../lib/stay-split';
import { useTurnstile } from '../lib/platform/useTurnstile';
import { sendFunnel } from '../lib/platform/funnel-client';
import { bothHouseQuote, bothHouseRequestNote, compoundOffer } from '../lib/compound';
import { stayLinkSearch } from '../lib/stay-link';
import { ARRIVAL_SLOTS, arrivalNote, isArrivalSlot } from '../lib/arrival';
import { applyDepartureChoice, DEPARTURE_SLOTS, isDepartureSlot } from '../lib/departure';
import { quoteOffers, quoteOfferNote, quoteAddonApart, toggleUpsell, type UpsellId } from '../lib/upsells';
import { stayRequestNote } from '../lib/booking-guide';
import { agreementNote } from '../lib/stay-agreement';
import { rulesNote } from '../lib/house-rules';
import type { YearPace } from '../lib/market/fill';
import type { HouseId } from '../lib/market/types';

/**
 * The booking card: dates, party, price, one checkbox, and the button.
 *
 * This is the whole booking path now. The old page made a guest open seven agreement topics, read a separate
 * house-rules tick, and scroll past a 15-message preview before the form appeared — measured on production, seven
 * `data-read="yes"` became `no` after a reload, and the request form disappeared. A guest who wants the house should
 * not have to work a gate to ask for it.
 *
 * What is preserved, deliberately, because it is money or safety:
 *   - the quote is the same `quoteStay` the rest of the app uses, so the figure here is the figure recorded;
 *   - a request still holds the nights for 30 minutes and still returns a status link;
 *   - the pet fee, the party-fit refusal, the part-capacity refusal, and the two-house compound all still apply;
 *   - the terms are readable before the tick, and the tick is still per house and still lasts only this visit.
 *
 * Terms live in a `<details>` the guest can open, not seven separate clicks. The agreement itself is not signed
 * here — the page says so — so nothing about this looks like a signature.
 */
const GATE_KEY = 'uml-book-gate';

type GateState = { read: Partial<Record<HouseId, boolean>> };

function loadGate(): GateState {
  try {
    if (typeof sessionStorage === 'undefined') return { read: {} };
    const raw = sessionStorage.getItem(GATE_KEY);
    if (!raw) return { read: {} };
    const parsed = JSON.parse(raw) as Partial<GateState> & { read?: Record<string, unknown> };
    const read: Partial<Record<HouseId, boolean>> = {};
    for (const id of ['river', 'ranch', 'lindon'] as HouseId[]) {
      if (parsed.read?.[id] === true) read[id] = true;
    }
    return { read };
  } catch {
    return { read: {} };
  }
}

function saveGate(next: GateState): void {
  try {
    sessionStorage.setItem(GATE_KEY, JSON.stringify(next));
  } catch {
    // A browser that refuses storage still gets a working form; it just will not survive a reload.
  }
}

export type ReserveResult = { statusPath: string | null; holdLine: string | null; receiptFailed: boolean };

export function DirectReserveCard({
  house,
  checkIn,
  checkOut,
  guests,
  children,
  dogs,
  addons,
  arrival,
  departure,
  eventStay,
  onCheckIn,
  onCheckOut,
  onGuests,
  onChildren,
  onDogs,
  onAddons,
  onArrival,
  onDeparture,
  onEvent,
  taken,
  closed,
  held,
  approved,
  pace,
  calendar,
  units: providedUnits,
  chosenParts: controlledParts,
  onChosenParts,
  onBooked,
}: {
  house: HouseId;
  checkIn: string;
  checkOut: string;
  guests: string;
  children: string;
  dogs: string;
  addons: UpsellId[];
  arrival: string | null;
  departure: string | null;
  eventStay: boolean;
  onCheckIn: (value: string) => void;
  onCheckOut: (value: string) => void;
  onGuests: (value: string) => void;
  onChildren: (value: string) => void;
  onDogs: (value: string) => void;
  onAddons: (value: UpsellId[]) => void;
  onArrival: (value: string | null) => void;
  onDeparture: (value: string | null) => void;
  onEvent: (value: boolean) => void;
  taken: Record<HouseId, string[]>;
  closed: Record<HouseId, string[]>;
  /** Nights another guest is finishing a request for. Not booked, and not this guest's to ask for yet. */
  held: Record<HouseId, string[]>;
  approved: Record<HouseId, Array<{ date: string; guest: number }>>;
  pace: Record<HouseId, YearPace>;
  calendar: 'loading' | 'live' | 'off';
  units?: PublicUnit[] | null;
  chosenParts?: string[];
  onChosenParts?: (value: string[]) => void;
  onBooked?: (result: ReserveResult) => void;
}) {
  const today = denverToday();
  const [read, setRead] = useState<Partial<Record<HouseId, boolean>>>(() => loadGate().read);
  const [form, setForm] = useState({ name: '', email: '', phone: '', note: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ReserveResult | null>(null);
  /** True when the request saved but the guest's receipt could not be emailed. */
  const [receiptFailed, setReceiptFailed] = useState(false);
  const [startNote, setStartNote] = useState('');
  const [localChosenParts, setLocalChosenParts] = useState<string[]>([]);
  const [fetchedUnits, setFetchedUnits] = useState<PublicUnit[] | null>(null);
  const chosenParts = controlledParts ?? localChosenParts;
  const updateChosenParts = (updater: (current: string[]) => string[]) => {
    const next = updater(chosenParts);
    if (controlledParts === undefined) setLocalChosenParts(next);
    onChosenParts?.(next);
  };
  const units = house !== 'river' ? [] : providedUnits !== undefined ? providedUnits : fetchedUnits;
  const [splitNamesText, setSplitNamesText] = useState('Family 1, Family 2, Family 3');
  const [copiedShare, setCopiedShare] = useState(false);
  const bot = useTurnstile('book_request');
  const stay = houseStay(house);

  useEffect(() => {
    saveGate({ read });
  }, [read]);

  // The Riverhouse parts are the only ones with prices; the other houses have no unit list at all.
  useEffect(() => {
    if (house !== 'river') {
      setFetchedUnits([]);
      setLocalChosenParts([]);
      return;
    }
    if (providedUnits !== undefined) return;
    let cancel = false;
    loadQuoteCalendar()
      .then((rows) => {
        if (!cancel) setFetchedUnits(rows?.units ?? null);
      })
      .catch(() => {
        if (!cancel) setFetchedUnits(null);
      });
    return () => {
      cancel = true;
    };
  }, [house, providedUnits]);

  const guestCount = /^\d+$/.test(guests) ? Number(guests) : null;
  const childCount = /^\d+$/.test(children) ? Number(children) : null;
  const dogCount = /^\d+$/.test(dogs) ? Number(dogs) : null;
  const party = partyFits(house, guestCount ?? 0, childCount ?? undefined);
  const bookingParts = house === 'river' && chosenParts.length > 0;
  const partOffers = useMemo(
    () => (house === 'river' && units ? unitStayOffers(units, checkIn, checkOut) : []),
    [house, units, checkIn, checkOut],
  );
  const selectedParts = partOffers.filter((offer) => chosenParts.includes(offer.unit.id) && offer.available);
  useEffect(() => {
    if (!bookingParts || partOffers.length === 0) return;
    const openChosen = chosenParts.filter((id) => partOffers.some((offer) => offer.unit.id === id && offer.available));
    if (openChosen.length !== chosenParts.length) {
      if (controlledParts === undefined) setLocalChosenParts(openChosen);
      onChosenParts?.(openChosen);
    }
  }, [bookingParts, partOffers, chosenParts, controlledParts, onChosenParts]);
  const partParty = bookingParts ? partyFitsParts(chosenParts as never, guestCount) : null;
  const partSleeps = bookingParts
    ? unitsTogetherSleeps(partOffers.filter((offer) => chosenParts.includes(offer.unit.id)))
    : RIVER_UNIT_DETAIL.filter((unit) => chosenParts.includes(unit.id)).reduce((sum, unit) => sum + unit.sleeps, 0);
  const sharedHouseLine = bookingParts ? partSharedHouseLine(selectedParts) : null;

  /*
   * A held night is treated as closed everywhere on this card.
   *
   * It is not a booking, and the copy never says it is — but it is also not available, and `POST /api/book` refuses it
   * with a 409 while the hold lives. Composing it into `closed` once, here, makes the quote, the checkout limit, the
   * check-in guard, and the submit gate all agree. Threading a fifth list through each of them is how two of the four
   * end up disagreeing, which is the bug this avoids.
   */
  const takenNights = taken[house] ?? [];
  const closedNights = [...(closed[house] ?? []), ...(held[house] ?? [])];
  const closedWithHeld = useMemo<Record<HouseId, string[]>>(
    () => ({
      ranch: [...(closed.ranch ?? []), ...(held.ranch ?? [])],
      lindon: [...(closed.lindon ?? []), ...(held.lindon ?? [])],
      river: [...(closed.river ?? []), ...(held.river ?? [])],
    }),
    [closed, held],
  );

  const quote = useMemo(
    () =>
      quoteStay(house, checkIn, checkOut, takenNights, {
        asOf: today,
        pace: pace[house] ?? 'unknown',
        closed: closedNights,
        sheet: approved[house] ?? [],
        ...(guestCount !== null ? { guests: guestCount, ...(childCount !== null ? { children: childCount } : {}) } : {}),
        ...(dogCount !== null ? { dogs: dogCount } : {}),
      }),
    [house, checkIn, checkOut, taken, closed, held, approved, today, pace, guestCount, childCount, dogCount],
  );

  const basePartTotal =
    bookingParts && selectedParts.length === chosenParts.length ? unitsTogetherTotal(selectedParts) : null;
  const partTotal = basePartTotal === null ? null : basePartTotal + quote.petFee;

  const needsBoth = !bookingParts && guestCount !== null && guestCount > 22 && bothHouseQuote(guestCount);
  const compound = useMemo(() => {
    if (calendar !== 'live' || guestCount === null || bookingParts) return { show: false } as const;
    return compoundOffer(
      checkIn,
      checkOut,
      guestCount,
      childCount ?? undefined,
      taken,
      today,
      (id) => pace[id] ?? 'unknown',
      closedWithHeld,
      approved,
    );
  }, [calendar, bookingParts, checkIn, checkOut, guestCount, childCount, taken, today, pace, closedWithHeld, approved]);
  const twoHouse = needsBoth && compound.show && compound.ok;
  const compoundTotal = twoHouse && compound.show && compound.ok ? compound.total + quote.petFee : null;

  const limitNote = calendar === 'live' ? checkoutStopLine(checkIn, house, takenNights, closedNights) : null;
  const shownStart = startNote || (calendar === 'live' ? checkInHold(checkIn, house, takenNights, closedNights, today) ?? '' : '');
  const saved = quote.ok ? directSavings(quote.channelTotal, quote.stayTotal) : null;
  const splitTotal = bookingParts ? partTotal : compoundTotal ?? quote.stayTotal;
  const splitLine =
    calendar === 'live' &&
    guestCount !== null &&
    splitTotal !== null &&
    ((bookingParts && partParty?.ok === true) || (!bookingParts && party.ok && quote.ok) || twoHouse)
      ? splitStayLine(splitTotal, guestCount)
      : null;
  const rulesRead = read[house] === true && (!needsBoth || (read.river === true && read.ranch === true));
  const topics = agreementTopics(house, 'page');
  const nights = checkIn && checkOut && checkOut > checkIn ? nightsBetween(checkIn, checkOut) : 0;

  /*
   * Add-ons are offered only for dates this page can actually quote, because an early arrival and a later checkout
   * each depend on a night being free. `quoteOffers` makes that judgement; a house with no live calendar gets none,
   * which is the same rule the old page followed.
   */
  const offers = quoteOffers({
    house,
    checkIn,
    checkOut,
    asOf: today,
    taken: takenNights,
    closed: closedNights,
    pace: pace[house] ?? 'unknown',
    calendarLive: calendar === 'live',
    ...(guestCount !== null ? { guests: guestCount, ...(childCount !== null ? { children: childCount } : {}) } : {}),
  });
  const selectedOffers = offers.filter((offer) => addons.includes(offer.id));
  const earlyArrival = selectedOffers.some((offer) => offer.id === 'early');
  const lateOpen = selectedOffers.some((offer) => offer.id === 'late') || offers.some((offer) => offer.id === 'late');
  const departureLineOpen = lateOpen;
  const arrivalLine = arrival && !earlyArrival ? arrivalNote(arrival, false) : '';

  const partReady =
    bookingParts &&
    calendar === 'live' &&
    partTotal !== null &&
    selectedParts.length === chosenParts.length &&
    partParty?.ok === true &&
    rulesRead &&
    !eventStay;
  const singleHouseReady = !needsBoth && calendar === 'live' && quote.ok && party.ok && rulesRead && !eventStay;
  const bothHousesReady = twoHouse && calendar === 'live' && rulesRead && !eventStay;
  const houseReady = singleHouseReady || bothHousesReady;
  const submitReady = Boolean(partReady || houseReady);
  const sendReady = submitReady && !(bot.enforced && !bot.token);

  useEffect(() => {
    if (!import.meta.env.PROD || typeof window === 'undefined') return;
    if (calendar !== 'live' || !quote.ok) return;
    void sendFunnel('quote', house, { prod: true, visit: '', storage: window.sessionStorage });
  }, [calendar, quote.ok, house]);

  function pickCheckIn(next: string) {
    if (calendar === 'live' && /^\d{4}-\d{2}-\d{2}$/.test(next)) {
      const hold = checkInHold(next, house, takenNights, closedNights, today);
      if (hold) {
        setStartNote(hold);
        return;
      }
    }
    onCheckIn(next);
    setStartNote('');
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!sendReady) return;
    setBusy(true);
    setError(null);
    try {
      const splitTotal = bookingParts ? partTotal : compoundTotal ?? quote.stayTotal;
      const res = await fetch('/api/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          propertyId: twoHouse ? 'river' : house,
          ...(twoHouse ? { alsoPropertyId: 'ranch' } : {}),
          checkIn,
          checkOut,
          ...(guestCount !== null ? { guests: guestCount } : {}),
          ...(childCount !== null ? { children: childCount } : {}),
          ...(dogCount !== null ? { dogs: dogCount } : {}),
          ...(bookingParts ? { units: chosenParts } : {}),
          ...(bot.enforced && bot.token ? { turnstileToken: bot.token } : {}),
          ...(splitTotal !== null ? { quotedTotal: splitTotal } : {}),
          /*
           * The note is built by `stayRequestNote`, the same function the older page used, so an add-on or an arrival
           * time reads identically on the host desk regardless of which page filed it. It also strips a door code or
           * Wi-Fi password if one ever reached the field.
           */
          note: stayRequestNote({
            guestNote: twoHouse ? `${form.note} ${compoundRequestNote()} ${bothHouseRequestNote()}`.trim() : form.note,
            party:
              guestCount !== null
                ? `Overnight guests ${guestCount}${childCount ? `, including ${childCount} ${childCount === 1 ? 'child' : 'children'}` : ''}.`
                : '',
            arrival: arrivalLine,
            departure: departure === '2:00 PM' && !earlyArrival && departureLineOpen ? 'Leave at 2:00 PM.' : '',
            preview: '',
            promo: '',
            addon: [quoteOfferNote(selectedOffers), dogCount !== null && dogCount > 0 ? `${dogCount} ${dogCount === 1 ? 'dog' : 'dogs'} declared.` : '']
              .filter(Boolean)
              .join(' '),
            rules: rulesNote(house),
            agreement: agreementNote(house),
          }),
        }),
      });
      const body = (await res.json()) as {
        error?: string;
        heldUntil?: string;
        statusPath?: string | null;
        guestEmailed?: boolean;
      };
      if (!res.ok) throw new Error(body.error || 'Could not send the request');
      const next: ReserveResult = {
        statusPath: typeof body.statusPath === 'string' ? body.statusPath : null,
        holdLine: body.heldUntil
          ? `Those nights are held for you until ${new Date(body.heldUntil).toLocaleTimeString('en-US', {
              hour: 'numeric',
              minute: '2-digit',
              timeZone: 'America/Denver',
            })} Utah time while we reply. Nothing is booked yet.`
          : null,
        receiptFailed: body.guestEmailed === false,
      };
      /*
       * `guestEmailed` has always been on this response and the older page never read it, so a guest whose receipt
       * failed saw a clean success screen and waited for an email that was never coming. The route reports which half
       * failed; this is the half that has to be said out loud.
       */
      setReceiptFailed(body.guestEmailed === false);
      if (import.meta.env.PROD && typeof window !== 'undefined') {
        void sendFunnel('checkout', house, { prod: true, visit: '', storage: window.sessionStorage });
      }
      setResult(next);
      onBooked?.(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the request');
      if (bot.enforced) bot.reset();
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <section className="uml-panel rounded-3xl p-5" data-bot="reserve-card" data-state="sent">
        <p className="font-display text-2xl">Request sent</p>
        <p className="mt-2 text-sm text-[var(--uml-muted)]">
          Someone will write back to confirm the dates. Nothing has been charged.
        </p>
        {receiptFailed && (
          <p className="mt-2 text-sm text-amber-300/90" data-bot="stay-receipt-failed">
            The confirmation email could not be sent, so do not wait for it. Your request is saved and the link below
            opens it — keep that link.
          </p>
        )}
        {result.holdLine && (
          <p className="mt-2 text-sm" data-bot="stay-hold-confirmed">
            {result.holdLine}
          </p>
        )}
        {result.statusPath && (
          <div className="mt-5" data-bot="stay-status-link">
            <p className="text-sm text-[var(--uml-muted)]">
              {receiptFailed
                ? 'This link is the only copy you will get. Keep it somewhere you can find it — no sign-in, and it shows only these dates.'
                : 'Keep this link to check on the request yourself. No sign-in, and it shows only these dates.'}
            </p>
            <a
              href={result.statusPath}
              className="uml-gold-btn mt-3 inline-block rounded-full px-5 py-3 text-xs uppercase tracking-[0.16em]"
              data-bot="stay-status-open"
            >
              See the request
            </a>
          </div>
        )}
      </section>
    );
  }

  return (
    <section className="uml-panel rounded-3xl p-5" data-bot="reserve-card" id="reserve">
      {/*
        The headline follows what is being booked: the chosen parts' total, both houses, or the house. When a chosen
        part has no price, `partTotal` is null and this used to fall back to `0` — reading "$0" as though the stay were
        free. No figure is shown in that case; the unpriced note below says why.
      */}
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-display text-2xl" data-bot="stay-headline">
          {calendar !== 'live'
            ? 'Add dates'
            : bookingParts
              ? partTotal === null
                ? 'Part not priced'
                : formatWhole(partTotal)
              : compoundTotal !== null
                ? formatWhole(compoundTotal)
                : quote.ok
                  ? formatWhole(quote.stayTotal)
                  : 'Not quoted'}
        </p>
        <p className="text-xs text-[var(--uml-muted)]">
          {calendar === 'live' && nights > 0 && ((bookingParts && partTotal !== null) || twoHouse || (!bookingParts && quote.ok))
            ? `for ${nights} ${nights === 1 ? 'night' : 'nights'}${bookingParts ? ' · part of the house' : twoHouse ? ' · both houses' : ''}`
            : 'before tax'}
        </p>
      </div>
      {/*
        The saving is only a saving when the calendar was actually read. `quoteStay` still answers with an empty
        taken list while the calendar is unread, so showing this unconditionally claimed a discount on dates the
        page could not confirm — the card said "could not be read" and "$175 below Airbnb" at the same time.
      */}
      {saved !== null && !bookingParts && calendar === 'live' && quote.ok && (
        <p className="mt-1 text-xs text-[var(--uml-glacier)]" data-bot="stay-save">
          {formatWhole(saved)} below the Airbnb guest total — no platform fee.
        </p>
      )}

      <div className="mt-4 grid grid-cols-2 gap-2">
        <label className="text-[11px] uppercase tracking-[0.12em] text-[var(--uml-muted)]">
          Check in
          <input
            type="date"
            aria-label="Check in"
            data-bot="stay-check-in"
            value={checkIn}
            onChange={(event) => pickCheckIn(event.target.value)}
            className="mt-1 w-full rounded-xl border border-[var(--uml-line)] bg-transparent px-3 py-2 text-sm text-[var(--uml-ink)]"
          />
        </label>
        <label className="text-[11px] uppercase tracking-[0.12em] text-[var(--uml-muted)]">
          Check out
          <input
            type="date"
            aria-label="Check out"
            data-bot="stay-check-out"
            value={checkOut}
            onChange={(event) => {
              const next = event.target.value;
              onCheckOut(calendar === 'live' ? heldCheckout(checkIn, next, house, takenNights, closedNights) : next);
            }}
            className="mt-1 w-full rounded-xl border border-[var(--uml-line)] bg-transparent px-3 py-2 text-sm text-[var(--uml-ink)]"
          />
        </label>
        <label className="text-[11px] uppercase tracking-[0.12em] text-[var(--uml-muted)]">
          Guests
          <input
            inputMode="numeric"
            aria-label="Overnight guests"
            data-bot="stay-guests"
            value={guests}
            placeholder={bookingParts ? `Up to ${partSleeps}` : `Up to ${stay.sleeps}`}
            onChange={(event) => onGuests(event.target.value.replace(/[^\d]/g, '').slice(0, 2))}
            className="mt-1 w-full rounded-xl border border-[var(--uml-line)] bg-transparent px-3 py-2 text-sm"
          />
        </label>
        <label className="text-[11px] uppercase tracking-[0.12em] text-[var(--uml-muted)]">
          Children
          <input
            inputMode="numeric"
            aria-label="Children"
            data-bot="stay-children"
            value={children}
            placeholder="0"
            onChange={(event) => onChildren(event.target.value.replace(/[^\d]/g, '').slice(0, 2))}
            className="mt-1 w-full rounded-xl border border-[var(--uml-line)] bg-transparent px-3 py-2 text-sm"
          />
        </label>
        <label className="col-span-2 text-[11px] uppercase tracking-[0.12em] text-[var(--uml-muted)]">
          Dogs <span className="normal-case tracking-normal text-[var(--uml-muted)]">($149 per stay, up to {MAX_DOGS})</span>
          <input
            inputMode="numeric"
            aria-label="Dogs"
            data-bot="stay-dogs"
            value={dogs}
            placeholder="0"
            onChange={(event) => {
              const digits = event.target.value.replace(/[^\d]/g, '').slice(0, 2);
              onDogs(digits === '' ? '' : String(Math.min(Number(digits), MAX_DOGS)));
            }}
            className="mt-1 w-full rounded-xl border border-[var(--uml-line)] bg-transparent px-3 py-2 text-sm"
          />
        </label>
      </div>

      {/*
        The fee is named, because a guest paying it is entitled to see it as a line rather than a total that jumped.
        The limit is explained too: a field that silently rewrites 5 to 2 is worse than one that says why.
      */}
      {dogCount !== null && dogCount > 0 && (
        <p className="mt-2 text-sm text-[var(--uml-muted)]" data-bot="stay-pet-fee">
          {`${dogCount === 1 ? '1 dog' : `${dogCount} dogs`}: $${quote.petFee} pet fee, once per stay.`}
        </p>
      )}
      {dogs !== '' && Number(dogs) >= MAX_DOGS && (
        <p className="mt-1 text-xs text-[var(--uml-muted)]" data-bot="stay-dogs-limit">
          Two dogs is the most we take, each under 50 lb. Message us if that does not fit.
        </p>
      )}

      {shownStart ? (
        <p className="mt-2 text-sm" data-bot="stay-date-start">
          {shownStart}
        </p>
      ) : null}
      {limitNote ? (
        <p className="mt-2 text-xs text-[var(--uml-muted)]" data-bot="stay-date-limit">
          {limitNote}
        </p>
      ) : null}

      {house === 'river' && !needsBoth && units !== null && partOffers.length > 0 && (
        <div className="mt-4 rounded-2xl border border-[var(--uml-line)] p-3" data-bot="stay-parts">
          <p className="uml-kicker">Or part of the house</p>
          <ul className="mt-2 space-y-1.5">
            {partOffers.map((offer) => {
              const chosen = chosenParts.includes(offer.unit.id);
              return (
                <li key={offer.unit.id} className="flex items-center justify-between gap-2" data-bot={`stay-part-${offer.unit.id}`} data-available={offer.available ? 'yes' : 'no'}>
                  <span className="text-sm">
                    {offer.unit.name.replace('River ', '')}
                    <span className="ml-1 text-xs text-[var(--uml-muted)]">sleeps {offer.unit.sleeps}</span>
                  </span>
                  <button
                    type="button"
                    disabled={!offer.available}
                    aria-pressed={chosen}
                    onClick={() =>
                      updateChosenParts((current) =>
                        current.includes(offer.unit.id) ? current.filter((id) => id !== offer.unit.id) : [...current, offer.unit.id],
                      )
                    }
                    className="rounded-full border border-[var(--uml-line)] px-3 py-1 text-[11px] uppercase tracking-[0.1em] disabled:opacity-40"
                  >
                    {chosen ? 'Chosen' : 'Add'}
                  </button>
                </li>
              );
            })}
          </ul>
          {sharedHouseLine && (
            <p className="mt-2 text-xs text-[var(--uml-muted)]" data-bot="stay-parts-shared">
              {sharedHouseLine}
            </p>
          )}
          {bookingParts && partParty?.ok === false && (
            <p className="mt-2 text-xs text-amber-300/90" data-bot="stay-parts-capacity" data-code={partParty.code}>
              {partParty.reason}
            </p>
          )}
          {bookingParts && partTotal === null && (
            <p className="mt-2 text-xs" data-bot="stay-parts-unpriced">
              One of the chosen parts has no price, so there is no total to show.
            </p>
          )}
        </div>
      )}
      {house === 'river' && units === null && (
        <p className="mt-3 text-xs text-[var(--uml-muted)]" data-bot="stay-parts-paused">
          The part prices could not be read. The whole house is still bookable.
        </p>
      )}

      {calendar === 'live' && quote.ok && !bookingParts && !twoHouse && (
        <ul className="mt-4 space-y-1 text-xs text-[var(--uml-muted)]" data-bot="stay-quote-breakdown">
          <li>
            {formatWhole(quote.lodging)} for {quote.nights.length} {quote.nights.length === 1 ? 'night' : 'nights'}
          </li>
          {quote.cleaning > 0 && <li>{formatWhole(quote.cleaning)} cleaning</li>}
          {quote.petFee > 0 && <li>{formatWhole(quote.petFee)} pet fee</li>}
          {quote.promotionNights > 0 && <li>{guestPromoLine(quote.promotionNights)}</li>}
        </ul>
      )}

      {/*
        Utah lodging tax, shown before the guest sends rather than discovered at checkout. The figures are estimates,
        and the line says so — `quoteWithTax` is the same calculator the receipt uses, so this is not a second
        arithmetic that can drift from what they are eventually charged.
      */}
      {calendar === 'live' && ((bookingParts && basePartTotal !== null) || twoHouse || (!bookingParts && quote.ok)) && (
        <p className="mt-2 text-xs text-[var(--uml-muted)]" data-bot="stay-tax-estimate">
          {(() => {
            const estimate = bookingParts
              ? quoteWithTax({
                  lodging: selectedParts.reduce((sum, offer) => sum + (offer.lodging ?? 0), 0),
                  cleaning: selectedParts.reduce((sum, offer) => sum + (offer.cleaning ?? 0), 0),
                  pet: quote.petFee,
                })
              : twoHouse && compound.show && compound.ok
                ? quoteWithTax({ lodging: compound.total, cleaning: 0, pet: quote.petFee })
                : quoteWithTax({ lodging: quote.lodging, cleaning: quote.cleaning, pet: quote.petFee });
            return `With Utah lodging tax, about ${formatWhole(estimate.estimatedTotal)}. The tax is confirmed with the booking. Nothing is charged now.`;
          })()}
        </p>
      )}

      {/*
        Add-ons. Offered only when the dates are quoted, because an early arrival depends on the night before being
        free. They are named on the request and never added to the total — `quoteAddonApart` says that on screen so a
        guest is not surprised either way.
      */}
      {calendar === 'live' && quote.ok && offers.length > 0 && (
        <div className="mt-4" data-bot="stay-addons">
          <p className="uml-kicker">Extras</p>
          <ul className="mt-2 space-y-1.5">
            {offers.map((offer) => (
              <li key={offer.id}>
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1"
                    data-bot={`stay-addon-${offer.id}`}
                    checked={addons.includes(offer.id)}
                    onChange={() => onAddons(toggleUpsell(addons, offer.id))}
                  />
                  <span>
                    {offer.name}. <span className="text-[var(--uml-muted)]">{offer.detail}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          {selectedOffers.length > 0 && (
            <p className="mt-2 text-xs text-[var(--uml-muted)]" data-bot="stay-addon-apart">
              {quoteAddonApart(selectedOffers)}
            </p>
          )}
        </div>
      )}

      {/*
        Arrival time. A guest arriving at 6pm should be able to say so on the request rather than by text afterwards.
        The early-arrival add-on already names 1:00 PM, so the slots hide while it is checked.
      */}
      {calendar === 'live' && quote.ok && !earlyArrival && (
        <div className="mt-4" data-bot="stay-arrival">
          <p className="uml-kicker">Arrival time</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {ARRIVAL_SLOTS.map((slot) => (
              <button
                key={slot}
                type="button"
                data-bot="stay-arrival-slot"
                data-time={slot}
                aria-pressed={arrival === slot}
                onClick={() => onArrival(arrival === slot ? null : slot)}
                className={`rounded-full border px-2.5 py-1 text-[11px] ${
                  arrival === slot
                    ? 'border-[var(--uml-gold)] bg-[var(--uml-gold)] text-[var(--uml-gold-ink)]'
                    : 'border-[var(--uml-line)] text-[var(--uml-muted)]'
                }`}
              >
                {slot}
              </button>
            ))}
          </div>
          {arrivalLine && (
            <p className="mt-1.5 text-xs text-[var(--uml-muted)]" data-bot="stay-arrival-note">
              {arrivalLine}
            </p>
          )}
        </div>
      )}

      {/*
        Departure. A 2:00 PM leave is the late-checkout extra, so the two cannot disagree: choosing it here checks that
        extra, and unchecking the extra clears this. A shared link that carried `leave=2:00 PM` arrives already set.
      */}
      {calendar === 'live' && quote.ok && offers.some((offer) => offer.id === 'late') && (
        <div className="mt-4" data-bot="stay-departure">
          <p className="uml-kicker">Checkout time</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {DEPARTURE_SLOTS.map((slot) => (
              <button
                key={slot}
                type="button"
                data-bot="stay-departure-slot"
                data-time={slot}
                aria-pressed={(departure ?? '11:00 AM') === slot}
                onClick={() => {
                  const applied = applyDepartureChoice(slot, addons, true);
                  onDeparture(applied.leave);
                  onAddons(applied.addons);
                }}
                className={`rounded-full border px-2.5 py-1 text-[11px] ${
                  (departure ?? '11:00 AM') === slot
                    ? 'border-[var(--uml-gold)] bg-[var(--uml-gold)] text-[var(--uml-gold-ink)]'
                    : 'border-[var(--uml-line)] text-[var(--uml-muted)]'
                }`}
              >
                {slot}
              </button>
            ))}
          </div>
        </div>
      )}

      {!party.ok && guestCount !== null && !bookingParts && !twoHouse && (
        <p className="mt-3 text-sm text-amber-300/90" data-bot="stay-party">
          {compound.show && !compound.ok ? compound.reason : party.reason}
        </p>
      )}
      {calendar !== 'live' && (
        <p className="mt-3 text-sm text-[var(--uml-muted)]" data-bot="stay-calendar">
          {calendar === 'loading' ? 'Checking the calendar.' : 'The calendar could not be read, so this page will not quote a date.'}
        </p>
      )}
      {calendar === 'live' && !quote.ok && !bookingParts && !compound.show && (
        <p className="mt-3 text-sm" data-bot="stay-quote-blocked">
          {quote.reason}
        </p>
      )}
      {twoHouse && (
        <p className="mt-3 text-sm" data-bot="stay-compound">
          A party this size uses the River House and the Ranch House together. {compound.ok ? compound.line : ''}
        </p>
      )}

      {/*
        The per-guest share. It splits the total of **what is being booked** — the whole house normally, or the chosen
        parts — because a part guest reading a share of the house total saw two prices for one stay.
      */}
      {splitLine && (
        <p className="mt-2 text-sm text-[var(--uml-muted)]" data-bot="stay-split">
          {splitLine}
        </p>
      )}

      {calendar === 'live' && splitTotal !== null && (bookingParts || quote.ok || twoHouse) && (
        <details className="mt-3 rounded-2xl border border-[var(--uml-line)] px-3 py-2" data-bot="stay-split-calc">
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.12em] text-[var(--uml-gold)]">
            Split across families &amp; share trip quote
          </summary>
          <div className="mt-2.5 space-y-2.5 text-xs">
            <p className="text-[var(--uml-muted)]">
              Enter household or couple names (comma-separated) to divide {formatWhole(splitTotal)} to the exact cent.
              Planning math only — nothing is billed or collected here.
            </p>
            <input
              type="text"
              aria-label="Household or couple names"
              data-bot="stay-split-names"
              value={splitNamesText}
              onChange={(event) => setSplitNamesText(event.target.value)}
              placeholder="e.g. Brandon & Steph, Mark's family, Grandparents"
              className="w-full rounded-xl border border-[var(--uml-line)] bg-transparent px-3 py-1.5 text-xs text-[var(--uml-ink)]"
            />
            {(() => {
              const names = splitNamesText
                .split(',')
                .map((item) => item.trim())
                .filter(Boolean)
                .slice(0, 12);
              const shares = splitPay(splitTotal, names);
              if (shares.length === 0) return null;
              return (
                <ul className="space-y-1 rounded-xl bg-[var(--uml-surface-2)]/60 p-2.5 uml-num" data-bot="stay-split-rows">
                  {shares.map((row, idx) => (
                    <li key={`${row.name}-${idx}`} className="flex items-center justify-between gap-2">
                      <span className="truncate">{row.name}</span>
                      <span className="font-semibold text-[var(--uml-ink)]">{formatCents(row.amount)}</span>
                    </li>
                  ))}
                </ul>
              );
            })()}
            <button
              type="button"
              data-bot="stay-copy-share"
              onClick={() => {
                const sharePath = `/book${stayLinkSearch({
                  house,
                  checkIn,
                  checkOut,
                  guests,
                  children,
                  addons,
                  arrive: arrival && isArrivalSlot(arrival) ? arrival : undefined,
                  leave: departure && isDepartureSlot(departure) ? departure : undefined,
                  event: eventStay,
                })}`;
                const fullUrl =
                  typeof window !== 'undefined' ? `${window.location.origin}${sharePath}` : sharePath;
                const names = splitNamesText
                  .split(',')
                  .map((item) => item.trim())
                  .filter(Boolean)
                  .slice(0, 12);
                const shares = splitPay(splitTotal, names);
                const shareSummary =
                  shares.length > 1
                    ? `\nSplit (${shares.length} ways): ${shares.map((s) => `${s.name} ${formatCents(s.amount)}`).join(' · ')}`
                    : '';
                const textToCopy = `Utah Mountain Luxury — ${checkIn} to ${checkOut} (${nights} ${nights === 1 ? 'night' : 'nights'}): ${formatWhole(splitTotal)} before tax.${shareSummary}\nView & request dates (does not hold dates until sent): ${fullUrl}`;
                void navigator.clipboard?.writeText(textToCopy).then(() => {
                  setCopiedShare(true);
                  window.setTimeout(() => setCopiedShare(false), 2000);
                });
              }}
              className="w-full rounded-full border border-[var(--uml-gold)] px-3 py-1.5 text-[11px] uppercase tracking-[0.12em] text-[var(--uml-gold)] hover:bg-[var(--uml-gold)] hover:text-[var(--uml-gold-ink)] transition-colors"
            >
              {copiedShare ? 'Copied trip quote & link' : 'Copy trip quote & shareable link'}
            </button>
          </div>
        </details>
      )}

      <details className="mt-4 rounded-2xl border border-[var(--uml-line)] px-3 py-2" data-bot="stay-terms">
        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.12em]">House rules and stay terms</summary>
        <ul className="mt-2 space-y-1.5 text-xs text-[var(--uml-muted)]">
          {houseRules(house).map((rule) => (
            <li key={rule.id}>{rule.text}</li>
          ))}
          {topics.map((topic) => (
            <li key={topic.id} data-bot={`stay-agreement-${topic.id}`}>
              <span className="font-semibold text-[var(--uml-ink)]">{topic.title}.</span> {topic.detail}
            </li>
          ))}
          {needsBoth &&
            (['river', 'ranch'] as const)
              .filter((id) => id !== house)
              .flatMap((id) => [
                ...houseRules(id).map((rule) => <li key={`${id}-${rule.id}`}>{rule.text}</li>),
                ...agreementTopics(id, 'page').map((topic) => (
                  <li key={`${id}-${topic.id}`} data-bot={`stay-agreement-${id}-${topic.id}`}>
                    <span className="font-semibold text-[var(--uml-ink)]">{topic.title}.</span> {topic.detail}
                  </li>
                )),
              ])}
          <li>{CANCELLATION_LINE}</li>
        </ul>
      </details>

      {/*
        The questions a guest asks before booking, answered from this house's own published facts. `<details>` needs no
        JavaScript and a screen reader announces it as a disclosure, which is why the old footer used one too.
      */}
      <details className="mt-2 rounded-2xl border border-[var(--uml-line)] px-3 py-2" data-bot="stay-faq">
        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.12em]">Questions before you book</summary>
        <dl className="mt-2 space-y-2 text-xs text-[var(--uml-muted)]">
          {houseFaq(house).map((row) => (
            <div key={row.question}>
              <dt className="font-semibold text-[var(--uml-ink)]">{row.question}</dt>
              <dd className="mt-0.5" data-bot="stay-faq-answer">
                {row.answer}
              </dd>
            </div>
          ))}
        </dl>
      </details>

      {/*
        The policies, reachable from the page a guest agrees on. They are the extensionless addresses because Pages
        answers `/terms.html` with a 308 to `/terms`.
      */}
      <nav aria-label="House policies" className="mt-3 flex gap-3 text-[11px] text-[var(--uml-muted)]" data-bot="stay-policies">
        <a href="/terms" className="underline">Terms</a>
        <a href="/privacy" className="underline">Privacy</a>
        <a href="/accessibility" className="underline">Accessibility</a>
      </nav>

      <label className="mt-3 flex items-start gap-2 text-sm" data-bot="stay-rules-check">
        <input
          type="checkbox"
          className="mt-1"
          checked={rulesRead}
          onChange={(event) => {
            const checked = event.target.checked;
            setRead((current) => ({
              ...current,
              [house]: checked,
              ...(needsBoth ? { river: checked, ranch: checked } : {}),
            }));
          }}
        />
        <span>I have read the house rules and stay terms above.</span>
      </label>

      {/*
        A party needs saying out loud, because a house that does not take one has to refuse it before a guest counts on
        it. Checking this keeps the request button off and points at a person, which is the rule the old page followed.
      */}
      <label className="mt-2 flex items-start gap-2 text-sm" data-bot="stay-event-check">
        <input type="checkbox" className="mt-1" checked={eventStay} onChange={(event) => onEvent(event.target.checked)} />
        <span>This stay is a party or an event.</span>
      </label>
      {eventStay && (
        <p className="mt-1.5 text-sm text-amber-300/90" data-bot="stay-event-note">
          A party or event needs written approval before it can be booked. Untick this box if it does not apply, or
          leave the request off and message us.
        </p>
      )}

      {submitReady ? (
        <form onSubmit={(e) => void submit(e)} className="mt-4 space-y-2" data-bot="stay-form">
          <input
            required
            placeholder="Your name"
            aria-label="Your name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full rounded-xl border border-[var(--uml-line)] bg-transparent px-3 py-2 text-sm"
          />
          <input
            required
            type="email"
            placeholder="Email"
            aria-label="Email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="w-full rounded-xl border border-[var(--uml-line)] bg-transparent px-3 py-2 text-sm"
          />
          <input
            placeholder="Mobile (optional)"
            aria-label="Mobile"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            className="w-full rounded-xl border border-[var(--uml-line)] bg-transparent px-3 py-2 text-sm"
          />
          <textarea
            placeholder="Anything we should know"
            aria-label="Note"
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
            className="min-h-20 w-full rounded-xl border border-[var(--uml-line)] bg-transparent px-3 py-2 text-sm"
          />
          {error && <p className="text-sm text-red-300">{error}</p>}
          {bot.enforced && (
            <div data-bot="stay-bot-check">
              <div ref={bot.host} data-bot="stay-bot-widget" />
              {bot.failed && (
                <p className="text-sm text-red-300" data-bot="stay-bot-failed">
                  The bot check could not load. Reload the page to try again.
                </p>
              )}
            </div>
          )}
          <button
            type="submit"
            data-bot="stay-request"
            disabled={busy || !sendReady}
            className="uml-gold-btn w-full rounded-full px-5 py-3 text-xs uppercase tracking-[0.16em] disabled:opacity-40"
          >
            {busy ? 'Sending' : 'Request to book'}
          </button>
          <p className="text-center text-[11px] text-[var(--uml-muted)]">
            No card now. A request holds these nights for 30 minutes while we reply.
          </p>
        </form>
      ) : null}
    </section>
  );
}

/** The note a two-house request carries. */
function compoundRequestNote(): string {
  return 'River House and Ranch House together.';
}

/** The shareable link for the dates currently chosen, for the copy button on the page. */
export function reserveSharePath(house: HouseId, checkIn: string, checkOut: string, guests: string, children: string): string {
  return `/book${stayLinkSearch({ house, checkIn, checkOut, guests, children })}`;
}
