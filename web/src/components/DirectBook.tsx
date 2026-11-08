import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ARRIVAL_SLOTS, arrivalNote } from '../lib/arrival';
import { applyDepartureChoice, applyLateAddon, DEPARTURE_SLOTS, quoteLeave } from '../lib/departure';
import { PROPERTIES } from '../lib/api';
import { ArriveReady } from './ArriveReady';
import { HouseManual } from './HouseManual';
import { HouseDays } from './HouseDays';
import { houseDayPaper } from '../lib/house-day';
import { bothHouseCalendarAheadLine, calendarAheadLine, loadQuoteCalendar } from '../lib/booked-nights';
import { bothHouseEventPlans, eventPlans } from '../lib/event-plan';
import { HOUSE_PHOTOS } from '../lib/house-photos';
import { bothHouseMessageNote, guestTimeline, quoteCalendarLine, quoteMessageNote, quoteMessageSchedule } from '../lib/guest-timeline';
import { houseCheckout, houseStay, partyFits, partyNote, nearbyGroups, SLEEPS, STAY_EMERGENCY } from '../lib/house-stay';
import { flexStayLine, publicFlexLine } from '../lib/house-manual';
import { checkoutNightIsFree, nightBeforeIsFree, stayCountdown, stayMoment } from '../lib/journey';
import { bothHousePaperNote, bothHousePapers, quotePaperTimes, tripNearbyNote, tripPaperNote, tripSheet } from '../lib/stay-sheet';
import { placeHref, placeSite } from '../lib/place-link';
import { directRequestReady, eventHoldLine, houseRules, petRuleLine, quoteActionLine, quoteAgreementHold, quoteTimesHold, quoteTimesReady, requestHoldLine, rulesNote, rulesReadLine } from '../lib/house-rules';
import { agreementLine, agreementNote, agreementReadComplete, agreementTopics } from '../lib/stay-agreement';
import { applyPublicShare, bookShare, companionStayFacts, companionStayNote, publicHouse } from '../lib/house-page';
import { LISTING_TITLE } from '../lib/listing';
import { formatWhole } from '../lib/luxury';
import { openingStay } from '../lib/booking-open';
import { denverToday } from '../lib/market/dates';
import { stayEventLine } from '../lib/market/events';
import type { YearPace } from '../lib/market/fill';
import type { HouseId } from '../lib/market/types';
import { guestPromoLine, guestPromoMark, quoteStay, directSavings, publishedStayRule, seasonNames, seasonSpan } from '../lib/quote';
import { arrivalChipText, arrivalListHold, openArrivals } from '../lib/open-arrivals';
import { alsoHeld, alsoOpen } from '../lib/also-open';
import { bothHouseLengthNote, bothHouseLengths, bothHouseMonthNights, bothHouseMonthNote, bothHouseQuote, bothHouseRequestNote, compoundAgreementHold, compoundOffer, compoundPaperHold, compoundRequestNote, compoundRequestReady, compoundShownPaper, compoundShownTotal } from '../lib/compound';
import { longestStay } from '../lib/longest-stay';
import { publishedShortestLine, shortestStay } from '../lib/shortest-stay';
import { stayIcs } from '../lib/stay-ics';
import { liveLengthLine, liveSpanLine, publishedLengths, stayLengths } from '../lib/stay-lengths';
import { houseNextStayLine, housePickLine, otherStayRules, partyFitList } from '../lib/house-search';
import { denverHour, quietNowLine, stayRhythm } from '../lib/stay-rhythm';
import { quoteShareButton, quoteShareLine, readStayLink, stayLinkSearch } from '../lib/stay-link';
import { splitStayLine } from '../lib/stay-split';
import { addonMenuLine, bothHouseFlex, bothHouseFlexLine, bothHouseFlexRhythm, quoteAddonApart, quoteCardAddonLine, quoteGroceryLine, quoteOfferDetail, quoteOfferNote, quoteOffers, toggleUpsell, type UpsellId } from '../lib/upsells';
import { bookingGuide, printGuideButton, printPriceNote, quotePaper, stayRequestNote, stayRequestPromoLine, type PrintNoteKind } from '../lib/booking-guide';
import { BrandMark } from './BrandMark';
import { checkInHold, checkoutStopLine, heldCheckout } from '../lib/stay-calendar';
import { RateCardMonth, StayMonth } from './StayMonth';

const HOUSES: HouseId[] = ['river', 'ranch', 'lindon'];

function nightLabel(iso: string) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const EMPTY_TAKEN: Record<HouseId, string[]> = { ranch: [], lindon: [], river: [] };

/**
 * The gate a guest has already worked through, kept for this visit.
 *
 * Opening seven agreement topics and ticking "I have read the house rules" lived only in React state, so a reload
 * erased it. Measured on production: seven `data-read="yes"` before a refresh, seven `no` after, and the request form
 * gone. On a seven-step gate that is a real reason to give up and book elsewhere.
 *
 * `sessionStorage` and not `localStorage` on purpose: this is one visit. A new tab, or tomorrow, starts clean, which
 * is what "read the rules for this stay" should mean. Keyed by house, because the rules differ per house — the same
 * rule the in-memory state now follows.
 *
 * Every read and write is guarded. Private mode throws on storage, and a guest must never see a broken page because a
 * browser refused to remember something.
 */
const GATE_KEY = 'uml-book-gate';

type GateState = { topics: Partial<Record<HouseId, string[]>>; read: Partial<Record<HouseId, boolean>> };

function loadGate(): GateState {
  const empty: GateState = { topics: {}, read: {} };
  try {
    if (typeof sessionStorage === 'undefined') return empty;
    const raw = sessionStorage.getItem(GATE_KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as Partial<GateState>;
    const topics: Partial<Record<HouseId, string[]>> = {};
    const read: Partial<Record<HouseId, boolean>> = {};
    for (const id of ['river', 'ranch', 'lindon'] as HouseId[]) {
      const list = parsed.topics?.[id];
      if (Array.isArray(list)) topics[id] = list.filter((item): item is string => typeof item === 'string');
      if (parsed.read?.[id] === true) read[id] = true;
    }
    return { topics, read };
  } catch {
    return empty;
  }
}

function saveGate(next: GateState): void {
  try {
    sessionStorage.setItem(GATE_KEY, JSON.stringify(next));
  } catch {
    // A browser that refuses storage still gets a working form; it just will not survive a reload.
  }
}

export function DirectBook() {
  const linked = readStayLink(typeof window === 'undefined' ? '' : window.location.search);
  const today = denverToday();
  const seedHouse: HouseId = linked.house ?? 'river';
  const seed = openingStay(seedHouse, today);
  const [house, setHouse] = useState<HouseId>(seedHouse);
  const [checkIn, setCheckIn] = useState(linked.checkIn ?? seed.checkIn);
  const [typedOut, setCheckOut] = useState(linked.checkOut ?? seed.checkOut);
  const houseNow = useRef(house);
  const checkInNow = useRef(checkIn);
  const checkOutNow = useRef(typedOut);
  houseNow.current = house;
  checkInNow.current = checkIn;
  checkOutNow.current = typedOut;
  const [sent, setSent] = useState(false);
  /** True when the request saved but the guest's receipt could not be emailed. */
  const [receiptFailed, setReceiptFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [holdLine, setHoldLine] = useState<string | null>(null);
  /** The guest's own link to this request, once it is saved. */
  const [statusPath, setStatusPath] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [startNote, setStartNote] = useState('');
  const [form, setForm] = useState({ name: '', email: '', phone: '', note: '' });
  const [guests, setGuests] = useState(linked.guests ?? '');
  const [children, setChildren] = useState(linked.children ?? '');
  /*
   * Per house, because the house rules differ. A single flag meant ticking "I have read the house rules" on the
   * Lindon tab also opened River's request form, on rules the guest never saw. The agreement topics were already
   * keyed by house; this was the one half that leaked.
   *
   * Both halves now also survive a reload within this visit, through `loadGate`/`saveGate`. The effect below keeps
   * them in one record, so a write cannot save one without the other.
   */
  const [rulesReadByHouse, setRulesReadByHouse] = useState<Partial<Record<HouseId, boolean>>>(
    () => loadGate().read,
  );
  const rulesRead = rulesReadByHouse[house] === true;
  const setRulesRead = (value: boolean) => setRulesReadByHouse((current) => ({ ...current, [house]: value }));
  const [eventStay, setEventStay] = useState(linked.event === true);
  const [openedTopics, setOpenedTopics] = useState<Partial<Record<HouseId, string[]>>>(() => loadGate().topics);
  // One write for both halves of the gate, so they can never be saved out of step.
  useEffect(() => {
    saveGate({ topics: openedTopics, read: rulesReadByHouse });
  }, [openedTopics, rulesReadByHouse]);
  const [addons, setAddons] = useState<UpsellId[]>(linked.addons ?? []);
  const [groceryList, setGroceryList] = useState('');
  const [arrival, setArrival] = useState<string | null>(linked.arrive ?? null);
  const [departure, setDeparture] = useState<string | null>(linked.leave ?? null);
  const [chosenDay, setChosenDay] = useState<{ house: HouseId; title: string; lines: string[] } | null>(null);
  const [taken, setTaken] = useState<Record<HouseId, string[]>>(EMPTY_TAKEN);
  const [closed, setClosed] = useState<Record<HouseId, string[]>>(EMPTY_TAKEN);
  /** Guest prices the host approved. Empty until read, so the published card stands by default. */
  const [approved, setApproved] = useState<Record<HouseId, Array<{ date: string; guest: number }>>>({
    ranch: [],
    lindon: [],
    river: [],
  });
  const [calendar, setCalendar] = useState<'loading' | 'live' | 'off'>('loading');
  const [paceMap, setPaceMap] = useState<Record<HouseId, YearPace> | null>(null);
  const guestCount = /^\d+$/.test(guests) ? Number(guests) : null;
  const childCount = /^\d+$/.test(children) ? Number(children) : null;
  const bothNights = calendar === 'live' && bothHouseQuote(guestCount) ? bothHouseMonthNights(taken, closed) : null;
  const spanHouse = bothNights ? 'river' : house;
  const spanTaken = bothNights ? bothNights.taken : (taken[house] ?? []);
  const spanClosed = bothNights ? bothNights.closed : (closed[house] ?? []);
  const checkOut =
    calendar === 'live'
      ? heldCheckout(checkIn, typedOut, spanHouse, spanTaken, spanClosed)
      : typedOut;
  const limitNote =
    calendar === 'live' && checkOut !== typedOut
      ? (checkoutStopLine(checkIn, spanHouse, spanTaken, spanClosed) ?? '')
      : '';
  const shownStart =
    startNote ||
    (calendar === 'live' ? (checkInHold(checkIn, spanHouse, spanTaken, spanClosed, today) ?? '') : '');
  const eventNote = stayEventLine(checkIn, checkOut);
  const rhythm = stayRhythm(house, checkIn, checkOut);
  const pace: YearPace = paceMap?.[house] ?? 'unknown';

  const share = bookShare(house, { checkIn, checkOut, guests, children });
  useEffect(() => applyPublicShare(share), [share.title, share.description, share.url]);

  useEffect(() => {
    let cancel = false;
    loadQuoteCalendar()
      .then((rows) => {
        if (cancel) return;
        if (rows) {
          setTaken(rows.nights);
          setClosed(rows.closed);
          setApproved(rows.approved ?? { ranch: [], lindon: [], river: [] });
          setPaceMap(rows.pace);
          setCalendar('live');
          const blank = !linked.checkIn && !linked.checkOut;
          if (
            blank &&
            houseNow.current === seedHouse &&
            checkInNow.current === seed.checkIn &&
            checkOutNow.current === seed.checkOut
          ) {
            const next = openingStay(seedHouse, today, rows.nights[seedHouse] ?? [], rows.closed[seedHouse] ?? []);
            if (next.checkIn !== checkInNow.current || next.checkOut !== checkOutNow.current) {
              setCheckIn(next.checkIn);
              setCheckOut(next.checkOut);
            }
          }
        } else setCalendar('off');
      })
      .catch(() => {
        if (!cancel) setCalendar('off');
      });
    return () => {
      cancel = true;
    };
  }, []);

  const stay = houseStay(house);
  const party = guestCount === null ? partyFits(house, 0) : partyFits(house, guestCount, childCount ?? undefined);
  const partyFit = calendar !== 'live' && guestCount !== null ? partyFitList(guestCount, childCount ?? undefined) : null;
  const partyRow = partyFit?.rows.find((row) => row.house === house) ?? null;
  const stayRule =
    calendar !== 'live'
      ? publishedStayRule(house, checkIn, checkOut, guestCount ?? undefined, childCount ?? undefined, today)
      : null;
  const otherRules =
    calendar === 'off'
      ? otherStayRules(house, checkIn, checkOut, guestCount ?? undefined, childCount ?? undefined, today)
      : [];
  const seasonLine = calendar !== 'live' ? seasonSpan(house, checkIn, checkOut) : null;
  const shortestLine =
    calendar !== 'live'
      ? publishedShortestLine(house, checkIn, checkOut, today, guestCount ?? undefined, [], [], childCount ?? undefined)
      : null;
  const guestLine = partyNote(guests, children);
  const quote = useMemo(
    () =>
      quoteStay(house, checkIn, checkOut, taken[house] ?? [], {
        asOf: today,
        pace,
        closed: closed[house] ?? [],
        sheet: approved[house] ?? [],
        ...(guestCount !== null ? { guests: guestCount, ...(childCount !== null ? { children: childCount } : {}) } : {}),
      }),
    [house, checkIn, checkOut, taken, closed, today, pace, guestCount, childCount, approved],
  );
  const ics =
    party.ok && (calendar === 'live' ? quote.ok : calendar === 'off' && !stayRule)
      ? stayIcs(house, checkIn, checkOut)
      : null;
  const guideStay = houseStay(house);
  const sheet = ics
    ? tripSheet({
        house: PROPERTIES[house].name,
        houseId: house,
        checkIn,
        checkOut,
        checkInTime: guideStay.checkIn,
        checkOutTime: guideStay.checkOut,
        address: PROPERTIES[house].address,
        arrival: guideStay.arrival,
        parking: guideStay.parking,
        notes: guideStay.notes,
        nearby: guideStay.nearby,
        emergency: STAY_EMERGENCY,
        checkout: houseCheckout(house),
        rules: houseRules(house)
          .map((rule) => rule.text)
          .join(' '),
        nightBeforeFree: calendar === 'live' ? nightBeforeIsFree(checkIn, taken[house] ?? [], closed[house] ?? []) : null,
        laterLeaveOpen: calendar === 'live' ? checkoutNightIsFree(checkOut, taken[house] ?? [], closed[house] ?? []) : undefined,
      })
    : null;
  const moment = sheet ? stayMoment(today, checkIn, checkOut) : '';
  const countdown = stayCountdown(today, checkIn, checkOut, 'quote');
  const splitLine = calendar === 'live' && quote.ok && party.ok && guestCount !== null ? splitStayLine(quote.stayTotal, guestCount) : null;
  const saved = quote.ok ? directSavings(quote.channelTotal, quote.stayTotal) : null;
  const openings = useMemo(
    () =>
      calendar === 'live'
        ? openArrivals(
            house,
            taken[house] ?? [],
            today,
            pace,
            3,
            closed[house] ?? [],
            guestCount ?? undefined,
            childCount ?? undefined,
          )
        : [],
    [calendar, house, taken, closed, today, pace, guestCount, childCount],
  );
  const others = useMemo(() => {
    if (calendar !== 'live') return [];
    const paceFor = (id: HouseId): YearPace => paceMap?.[id] ?? 'unknown';
    return alsoOpen(house, checkIn, checkOut, taken, today, paceFor, guestCount ?? undefined, closed, childCount ?? undefined);
  }, [calendar, house, checkIn, checkOut, taken, closed, today, paceMap, guestCount, childCount]);
  const held = useMemo(() => {
    if (calendar !== 'live') return [];
    const paceFor = (id: HouseId): YearPace => paceMap?.[id] ?? 'unknown';
    return alsoHeld(house, checkIn, checkOut, taken, today, paceFor, guestCount ?? undefined, closed, childCount ?? undefined);
  }, [calendar, house, checkIn, checkOut, taken, closed, today, paceMap, guestCount, childCount]);
  const compound = useMemo(() => {
    if (calendar !== 'live' || guestCount === null) return { show: false } as const;
    const paceFor = (id: HouseId): YearPace => paceMap?.[id] ?? 'unknown';
    // The approved sheet goes in, so a two-house party is quoted the same price this desk would
    // quote one house. Without it the larger booking was the one that missed the host's pricing.
    return compoundOffer(checkIn, checkOut, guestCount, childCount ?? undefined, taken, today, paceFor, closed, approved);
  }, [calendar, checkIn, checkOut, guestCount, childCount, taken, closed, today, paceMap, approved]);
  const extension = useMemo(() => {
    if (calendar !== 'live' || quote.ok) return null;
    const next = shortestStay(house, checkIn, taken[house] ?? [], today, pace, guestCount ?? undefined, closed[house] ?? [], childCount ?? undefined);
    if (!next || next.checkOut === checkOut) return null;
    return next;
  }, [calendar, quote.ok, house, checkIn, checkOut, taken, closed, today, pace, guestCount, childCount]);
  const span = useMemo(() => {
    if (calendar !== 'live') return null;
    const next = longestStay(house, checkIn, taken[house] ?? [], today, pace, guestCount ?? undefined, closed[house] ?? [], childCount ?? undefined);
    if (!next || next.checkOut === checkOut || next.checkOut === extension?.checkOut) return null;
    return next;
  }, [calendar, house, checkIn, checkOut, taken, closed, today, pace, guestCount, childCount, extension]);
  const lengths = useMemo(() => {
    if (calendar !== 'live') return null;
    if (guestCount !== null && bothHouseQuote(guestCount)) {
      const paceFor = (id: HouseId): YearPace => paceMap?.[id] ?? 'unknown';
      const both = bothHouseLengths(checkIn, guestCount, childCount ?? undefined, taken, closed, today, paceFor, approved);
      return both ? { ...both, both: true as const } : null;
    }
    const one = stayLengths(house, checkIn, taken[house] ?? [], today, pace, guestCount ?? undefined, closed[house] ?? [], childCount ?? undefined);
    if (!one) return null;
    return {
      through: one.through,
      choices: one.choices.map(({ nights, checkOut: out }) => ({ nights, checkOut: out })),
      both: false as const,
    };
  }, [calendar, house, checkIn, taken, closed, today, pace, paceMap, guestCount, childCount, approved]);
  const cardLengths = useMemo(() => {
    if (calendar !== 'off') return null;
    return publishedLengths(house, checkIn, today, guestCount ?? undefined, childCount ?? undefined);
  }, [calendar, house, checkIn, today, guestCount, childCount]);
  const opened = openedTopics[house] ?? [];
  const agreementOpened = agreementReadComplete(house, opened);
  const canRequest = directRequestReady({
    quoteOk: quote.ok,
    rulesRead,
    calendarLoading: calendar === 'loading',
    calendarLive: calendar === 'live',
    partyOk: party.ok,
    event: eventStay,
    agreementRead: agreementOpened,
  });
  const adults = guestCount === null ? 0 : guestCount - (childCount ?? 0);
  const needsBoth =
    guestCount !== null && guestCount > SLEEPS.river && guestCount <= SLEEPS.river + SLEEPS.ranch && adults >= 2;
  const companions: HouseId[] = !needsBoth ? [] : house === 'lindon' ? ['river', 'ranch'] : house === 'river' ? ['ranch'] : ['river'];
  const bothOffer = compound.show && compound.ok ? compound : null;
  const twoHouse =
    bothOffer !== null &&
    compoundRequestReady({
      offerOk: true,
      calendarLive: calendar === 'live',
      rulesRead,
      event: eventStay,
      riverTopics: openedTopics.river ?? [],
      ranchTopics: openedTopics.ranch ?? [],
    });
  const requestReady = canRequest || twoHouse;
  const requestHold = requestReady
    ? ''
    : requestHoldLine({
        calendarLoading: calendar === 'loading',
        calendarLive: calendar === 'live',
        both: needsBoth,
        event: eventStay,
        agreementRead: agreementOpened,
        partyOk: party.ok,
        partyReason: party.reason ?? '',
        quoteOk: quote.ok,
        quoteReason: quote.reason,
        rulesRead,
        bothOfferOk: bothOffer !== null,
        bothReason: compound.show && !compound.ok ? compound.reason : '',
      });
  const calendarNote =
    calendar === 'loading'
      ? 'Checking the calendar.'
      : 'The calendar could not be read. This page will not say the house is open.';
  const photo = HOUSE_PHOTOS[house];
  const guideNights =
    calendar === 'live'
      ? { checkIn, checkOut, taken: taken[house] ?? [], closed: closed[house] ?? [] }
      : null;
  const guide = bookingGuide(
    house,
    checkIn,
    checkOut,
    calendar === 'off'
      ? { asOf: today, ...(guestCount !== null ? { guests: guestCount } : {}), ...(childCount !== null ? { children: childCount } : {}) }
      : undefined,
    guideNights,
  );
  const bothFlex = bothOffer ? bothHouseFlex({ checkIn, checkOut, taken, closed }) : null;
  const early = bothFlex
    ? bothHouseFlexRhythm(bothFlex)
    : needsBoth
      ? null
      : publicFlexLine(
          calendar === 'live'
            ? flexStayLine('Can we arrive early and leave later?', house, { checkIn, checkOut }, {
                taken: { [house]: taken[house] ?? [] },
                closed: { [house]: closed[house] ?? [] },
              }, today)
            : null,
        );
  const offers = quoteOffers({
    house,
    checkIn,
    checkOut,
    asOf: today,
    taken: taken[house] ?? [],
    closed: closed[house] ?? [],
    pace,
    calendarLive: calendar === 'live',
    ...(guestCount !== null ? { guests: guestCount, ...(childCount !== null ? { children: childCount } : {}) } : {}),
  });
  const selectedOffers = offers.filter((offer) => addons.includes(offer.id));
  const addonNote = quoteOfferNote(selectedOffers);
  const earlyArrival = bothFlex ? bothFlex.early && addons.includes('early') : selectedOffers.some((offer) => offer.id === 'early');
  const lateOpen = bothFlex ? bothFlex.late : offers.some((offer) => offer.id === 'late');
  const timesReady = quoteTimesReady({
    partyOk: party.ok,
    calendar,
    quoteOk: quote.ok,
    publishedRule: Boolean(stayRule),
    bothOfferOk: bothOffer !== null,
  });
  const arrivalLine = timesReady ? arrivalNote(arrival, earlyArrival) : '';
  const departureLine = timesReady ? quoteLeave(departure, lateOpen) : '';
  const paper = quotePaper({
    ok: calendar === 'live' && quote.ok,
    reason: calendar === 'live' ? quote.reason : calendarNote,
    nights: quote.nights.length,
    lodging: quote.lodging,
    cleaning: quote.cleaning,
    stayTotal: quote.stayTotal,
    party: guestLine,
    arrival: arrivalLine,
    departure: departureLine,
    event: timesReady && eventStay ? eventHoldLine(house) : '',
    agreement:
      timesReady && !agreementOpened
        ? 'Open each topic before the request. Opening a topic does not sign the agreement. This page does not send that request.'
        : '',
    addon: quoteAddonApart(calendar === 'live' ? selectedOffers : []),
    promo: calendar === 'live' && quote.ok ? guestPromoLine(quote.promotionNights) : '',
  });
  const requestPromo = stayRequestPromoLine(calendar === 'live' && quote.ok ? guestPromoLine(quote.promotionNights) : '');
  const requestNote = stayRequestNote({
    guestNote: form.note,
    party: guestLine,
    arrival: arrivalLine,
    departure: departureLine,
    preview: `Preview quote ${formatWhole(quote.stayTotal)} before tax (${quote.nights.length} nights).`,
    promo: calendar === 'live' && quote.ok ? guestPromoLine(quote.promotionNights) : '',
    addon: addonNote,
    rules: rulesNote(house),
    agreement: agreementNote(house),
  });
  const sharePath = `/book${stayLinkSearch({
    house,
    checkIn,
    checkOut,
    guests,
    children,
    addons:
      calendar === 'live'
        ? bothFlex
          ? (['early', 'late'] as const).filter((id) => addons.includes(id) && (id === 'early' ? bothFlex.early : bothFlex.late))
          : selectedOffers.map((offer) => offer.id)
        : addons,
    arrive:
      timesReady && !earlyArrival && arrival
        ? (ARRIVAL_SLOTS.find((slot) => slot === arrival) ?? undefined)
        : undefined,
    leave: timesReady && (departure === '11:00 AM' || (departure === '2:00 PM' && lateOpen)) ? departure : undefined,
    event: eventStay,
  })}`;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const node = document.querySelector('meta[property="og:url"]');
    if (node) node.setAttribute('content', `https://wilhite-portfolio.pages.dev${sharePath}`);
    if (`${window.location.pathname}${window.location.search}` === sharePath) return;
    window.history.replaceState(null, '', sharePath);
  }, [sharePath]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!requestReady) return;
    setBusy(true);
    setError(null);
    try {
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
          note: twoHouse && bothOffer
            ? [
                form.note,
                guestLine,
                compoundRequestNote(bothOffer.line),
                bothHouseRequestNote(),
                `Two-house preview ${formatWhole(bothOffer.total)} before tax (${bothOffer.nights} nights).`,
                earlyArrival ? bothHouseFlexLine('early', true) : '',
                departure === '2:00 PM' && lateOpen ? bothHouseFlexLine('late', true) : '',
                arrivalLine,
                departureLine,
                rulesNote('river'),
                rulesNote('ranch'),
                agreementNote('river'),
                agreementNote('ranch'),
              ]
                .filter(Boolean)
                .join(' ')
            : requestNote,
        }),
      });
      const body = (await res.json()) as {
        error?: string;
        held?: boolean;
        heldUntil?: string;
        statusPath?: string | null;
        /**
         * Whether the guest's receipt actually went out. The route has always reported this and the page never read
         * it, so a guest whose email failed saw a clean success screen and then waited for a receipt that was never
         * coming — with no status link either, because that link only lived in the email.
         */
        guestEmailed?: boolean;
        guestEmailError?: string | null;
      };
      if (!res.ok) throw new Error(body.error || 'Could not send the request');
      setSent(true);
      setReceiptFailed(body.guestEmailed === false);
      setStatusPath(typeof body.statusPath === 'string' ? body.statusPath : null);
      setHoldLine(
        body.heldUntil
          ? `Those nights are held for you until ${new Date(body.heldUntil).toLocaleTimeString('en-US', {
              hour: 'numeric',
              minute: '2-digit',
              timeZone: 'America/Denver',
            })} Utah time while we reply. Nothing is booked yet.`
          : null,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the request');
    } finally {
      setBusy(false);
    }
  }

  const printKind: PrintNoteKind =
    calendar !== 'live' ? 'unread' : !quote.ok ? 'refused' : eventStay || !agreementOpened ? 'held' : 'priced';

  return (
    <div className="min-h-screen px-4 py-10 sm:px-8" data-bot="stay-page" data-house={house}>
      <p className="sr-only" data-bot="page-share" data-url={share.url}>{share.title}</p>
      <script type="application/ld+json" data-bot="stay-schema" dangerouslySetInnerHTML={{ __html: JSON.stringify(publicHouse(house).schema) }} />
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 flex items-center gap-3">
          <BrandMark />
          <div>
            <p className="uml-kicker">Utah Mountain Luxury</p>
            <h1 className="font-display text-5xl">Stay with us</h1>
          </div>
        </div>
        <p className="mb-8 max-w-2xl text-sm text-[var(--uml-muted)]">
          Book direct with us. The quote uses the season rates already on the books, and a request holds the
          dates for 30 minutes while a person replies — you will get a link to check where your request
          stands. It does not charge a card: we confirm by hand, then send the door code to your phone before
          you arrive. <strong className="text-[var(--uml-text)]">Direct requests are being trialled</strong>,
          so if you need a confirmed booking today, book through our listing on Airbnb or VRBO.{' '}
          <a href="/houses/" className="underline" data-bot="stay-houses-page">
            The houses
          </a>
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
                setStartNote('');
              }}
              className={`uml-panel rounded-3xl px-5 py-4 text-left ${house === id ? 'ring-1 ring-[var(--uml-gold)]' : ''}`}
            >
              <p className="uml-kicker">{id}</p>
              <p className="font-display text-3xl">{PROPERTIES[id].name.replace('The ', '')}</p>
              <p className="mt-1 text-xs text-[var(--uml-muted)]">{LISTING_TITLE[id]}</p>
              <p className="mt-1 text-xs" data-bot={`stay-house-address-${id}`}>
                {PROPERTIES[id].address}
              </p>
              {id === 'river' && <p className="mt-1 text-xs text-[var(--uml-muted)]">First stays November 1, 2026</p>}
              {calendar === 'live' && (
                <p className="mt-2 text-xs text-[var(--uml-muted)]" data-bot={`stay-house-status-${id}`}>
                  {housePickLine(
                    id,
                    checkIn,
                    checkOut,
                    taken[id] ?? [],
                    today,
                    paceMap?.[id] ?? 'unknown',
                    closed[id] ?? [],
                    guestCount ?? undefined,
                    childCount ?? undefined,
                  )}
                </p>
              )}
              {calendar === 'live' &&
                houseNextStayLine(
                  id,
                  checkIn,
                  checkOut,
                  taken[id] ?? [],
                  today,
                  paceMap?.[id] ?? 'unknown',
                  closed[id] ?? [],
                  guestCount ?? undefined,
                  childCount ?? undefined,
                ) && (
                  <p className="mt-1 text-xs text-[var(--uml-muted)]" data-bot={`stay-house-next-${id}`}>
                    {houseNextStayLine(
                      id,
                      checkIn,
                      checkOut,
                      taken[id] ?? [],
                      today,
                      paceMap?.[id] ?? 'unknown',
                      closed[id] ?? [],
                      guestCount ?? undefined,
                      childCount ?? undefined,
                    )}
                  </p>
                )}
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
                  {printGuideButton(printKind)}
                </button>
              </div>
              <p className="text-xs text-[var(--uml-muted)]" data-bot="stay-print-note">
                {printPriceNote(printKind)}
              </p>
              <p className="font-display text-3xl">Sleeps {stay.sleeps}</p>
              <p className="text-sm text-[var(--uml-muted)]">
                Check-in {stay.checkIn} · Check-out {stay.checkOut}
              </p>
              {stay.bedrooms && <p className="text-sm">{stay.bedrooms}</p>}
              <p className="text-sm text-[var(--uml-muted)]">{stay.arrival}</p>
              <p className="text-sm text-[var(--uml-muted)]">{stay.parking}</p>
              <p className="text-sm" data-bot="stay-quiet-now">
                {quietNowLine(house, denverHour(), 'quote')}
              </p>
              <p className="text-sm" data-bot="stay-emergency">
                {stay.emergency}
              </p>
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
              <HouseManual
                house={house}
                where="quote"
                checkIn={checkIn}
                checkOut={checkOut}
                guests={guestCount}
                children={childCount ?? undefined}
              />
              {bothNights && (
                <div className="space-y-4" data-bot="stay-companion">
                  <p className="uml-kicker">The other house</p>
                  <p className="text-sm" data-bot="stay-companion-note">
                    {companionStayNote()}
                  </p>
                  {(house === 'river' ? (['ranch'] as const) : house === 'ranch' ? (['river'] as const) : (['river', 'ranch'] as const)).map((id) => {
                    const other = publicHouse(id);
                    return (
                      <div key={id} data-bot="stay-companion-house" data-house={id}>
                        {other.photo.src ? (
                          <figure>
                            <img src={other.photo.src} alt={other.name} className="h-40 w-full rounded-2xl object-cover" />
                            {other.photo.caption ? (
                              <figcaption className="pt-2 text-xs text-[var(--uml-muted)]" data-bot="stay-companion-caption">
                                {other.photo.caption}
                              </figcaption>
                            ) : null}
                          </figure>
                        ) : null}
                        <ul className="mt-2 space-y-1 text-sm">
                          {companionStayFacts(id).map((line) => (
                            <li key={line} data-bot="stay-companion-line">
                              {line}
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              )}
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
              {calendar === 'live' && guestCount !== null && arrivalListHold(party.ok) ? (
                <p className="text-sm" data-bot="stay-open-hold">
                  {arrivalListHold(party.ok)}
                </p>
              ) : null}
              {openings.length > 0 && (
                <div data-bot="stay-open">
                  <p className="uml-kicker">Arrivals this page will quote</p>
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
                            setStartNote('');
                          }}
                        >
                          {arrivalChipText(item.label, formatWhole(item.direct), guestCount === null || party.ok)}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {calendar === 'live' ? (
                <>
                <StayMonth
                  house={bothNights ? 'river' : house}
                  taken={bothNights ? bothNights.taken : (taken[house] ?? [])}
                  blocked={bothNights ? bothNights.closed : (closed[house] ?? [])}
                  sheet={approved[house] ?? []}
                  checkIn={checkIn}
                  checkOut={checkOut}
                  pace={bothNights ? (paceMap?.river ?? 'unknown') : pace}
                  quoted={quote.ok || bothOffer !== null}
                  prices={guestCount === null || party.ok}
                  onPick={(stay) => {
                    setCheckIn(stay.checkIn);
                    setCheckOut(stay.checkOut);
                    setStartNote('');
                  }}
                />
                {bothNights ? (
                  <p className="mt-2 text-xs text-[var(--uml-muted)]" data-bot="stay-both-month">
                    {bothHouseMonthNote()}
                  </p>
                ) : null}
                <ul className="mt-4 space-y-2 text-sm" data-bot="stay-event-live">
                  {(bothNights
                    ? bothHouseEventPlans(today, bothNights)
                    : eventPlans(house, today, { taken: taken[house] ?? [], closed: closed[house] ?? [] })
                  ).map((line) => (
                    <li key={line} data-bot="stay-event-live-line">
                      {line}
                    </li>
                  ))}
                </ul>
                </>
              ) : (
                <div>
                  <p className="text-sm" data-bot="stay-month-hold">
                    {calendarNote}
                  </p>
                  {calendar === 'off' && (
                    <RateCardMonth
                      house={house}
                      checkIn={checkIn}
                      checkOut={checkOut}
                      quoted={quote.ok}
                      onPick={(stay) => {
                        setCheckIn(stay.checkIn);
                        setCheckOut(stay.checkOut);
                        setStartNote('');
                      }}
                    />
                  )}
                  {calendar === 'off' && (
                    <ul className="mt-4 space-y-2 text-sm" data-bot="stay-event-plan">
                      {eventPlans(house, today).map((line) => (
                        <li key={line} data-bot="stay-event-plan-line">
                          {line}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs text-[var(--uml-muted)]">
                  Check in
                  <input
                    type="date"
                    aria-label="Check in"
                    data-bot="stay-check-in"
                    value={checkIn}
                    onChange={(e) => {
                      const next = e.target.value;
                      if (calendar === 'live' && /^\d{4}-\d{2}-\d{2}$/.test(next)) {
                        const hold = checkInHold(next, spanHouse, spanTaken, spanClosed, today);
                        if (hold) {
                          setStartNote(hold);
                          return;
                        }
                      }
                      setCheckIn(next);
                      setStartNote('');
                    }}
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
              {shownStart ? (
                <p className="mt-3 text-sm" data-bot="stay-date-start">
                  {shownStart}
                </p>
              ) : null}
              {limitNote ? (
                <p className="mt-3 text-sm" data-bot="stay-date-limit">
                  {limitNote}
                </p>
              ) : null}
            </div>
            <HouseDays
              house={house}
              where="quote"
              onChoose={(day) => setChosenDay({ house, ...day })}
            />
            <ArriveReady house={house} where="quote" />
          </section>

          <section className="uml-panel rounded-[32px] p-6" data-bot="stay-quote">
            <p className="uml-kicker">{calendar === 'live' ? 'Direct price, before tax' : 'Direct quote'}</p>
            {countdown && (
              <p className="mt-3 text-sm" data-bot="stay-countdown">
                {countdown}
              </p>
            )}
            {eventNote && (
              <p className="mt-3 text-sm" data-bot="stay-event">
                {eventNote}
              </p>
            )}
            {calendar !== 'live' ? (
              <div className="mt-3 space-y-2 text-sm">
                <p data-bot="stay-calendar-unread">{calendarNote}</p>
                {partyRow && (
                  <div data-bot="stay-party-fit">
                    <p data-bot="stay-party-line">{partyRow.line}</p>
                    {partyFit?.together && <p data-bot="stay-party-together">{partyFit.together}</p>}
                  </div>
                )}
                {stayRule && <p data-bot="stay-published-rule">{stayRule}</p>}
                {otherRules.length > 0 && (
                  <div data-bot="stay-other-rules">
                    <p data-bot="stay-other-rules-note">
                      Other houses that fail a published night rule for these dates. A house that meets the rule is left off. This does not
                      say a house is open. Nothing is sent.
                    </p>
                    <ul className="mt-2 space-y-1">
                      {otherRules.map((row) => (
                        <li key={row.house} data-bot="stay-other-rule">
                          {row.line}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {shortestLine && <p data-bot="stay-published-short">{shortestLine}</p>}
                {seasonLine && <p data-bot="stay-seasons">{seasonLine}</p>}
                {calendar === 'off' && cardLengths && (
                  <div data-bot="stay-published-lengths">
                    <p>
                      The rate card can quote these lengths from this check-in. This does not say the house is open. Choosing one does not
                      send a request. Nothing is charged yet.
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {cardLengths.choices.map((choice) => (
                        <button
                          key={choice.checkOut}
                          type="button"
                          className={`uml-nav ${checkOut === choice.checkOut ? 'ring-1 ring-[var(--uml-gold)]' : ''}`}
                          data-bot="stay-published-length"
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
              </div>
            ) : bothOffer ? (
              <p className="mt-3 text-sm" data-bot="stay-quote-both">
                This quote is the River House and the Ranch House together. Nothing is sent.
              </p>
            ) : compound.show ? null : quote.ok ? (
              <div className="mt-3 space-y-3">
                <p className="font-display text-5xl uml-num">{formatWhole(quote.stayTotal)}</p>
                <p className="text-sm text-[var(--uml-muted)]">
                  {formatWhole(quote.lodging)} for the nights
                  {quote.cleaning > 0 ? ` · ${formatWhole(quote.cleaning)} cleaning` : ''}
                  {' · '}
                  {quote.nights.length} nights
                  {seasonNames(quote.nights) ? ` · ${seasonNames(quote.nights)}` : ''}
                </p>
                <ul className="space-y-1 text-sm" data-bot="stay-quote-nights">
                  {quote.nights.map((night) => (
                    <li key={night.date}>
                      {nightLabel(night.date)} · {formatWhole(night.direct)}
                      {night.season ? ` · ${night.season}` : ''}
                      {night.promotionPercent === 20 ? ` · ${guestPromoMark()}` : ''}
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-[var(--uml-muted)]">
                  The Airbnb guest total for these nights is {formatWhole(quote.channelTotal)}. This page has no platform fee.
                  {quote.promotionNights > 0 ? ` ${guestPromoLine(quote.promotionNights)}` : ''}
                  {' '}Utah lodging tax is added after the rate is confirmed. Nothing is charged on this page.
                </p>
                {saved !== null && (
                  <p className="text-sm" data-bot="stay-save">
                    This page is {formatWhole(saved)} below the Airbnb guest total, before tax.
                  </p>
                )}
                {selectedOffers.length > 0 && (
                  <p className="text-sm" data-bot="stay-addon-apart">
                    {quoteAddonApart(selectedOffers)}
                  </p>
                )}
              </div>
            ) : (
              <p className="mt-3 font-display text-3xl">{quote.reason}</p>
            )}
            {rhythm.length > 0 && (
              <ul className="mt-4 space-y-2 text-sm" data-bot="stay-rhythm">
                {rhythm.map((line) => (
                  <li key={line.id} data-bot={`stay-rhythm-${line.id}`}>
                    {line.text}
                  </li>
                ))}
              </ul>
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
                  {liveSpanLine(span.through, span.nights)}
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
              <div className="mt-3" data-bot="stay-lengths" data-both={lengths.both ? 'yes' : 'no'}>
                <p className="text-sm">
                  {lengths.both ? bothHouseLengthNote(lengths.through) : liveLengthLine(lengths.through)}
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
            {calendar === 'live' && (
              <p
                className="mt-3 text-xs text-[var(--uml-muted)]"
                data-bot="stay-calendar"
                data-both={bothNights ? 'yes' : 'no'}
              >
                {bothNights
                  ? bothHouseCalendarAheadLine(taken, closed)
                  : calendarAheadLine(taken[house] ?? [], closed[house] ?? [])}
              </p>
            )}
            {others.length > 0 && (
              <div className="mt-4" data-bot="stay-also">
                <p className="uml-kicker">Same dates</p>
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
                        setStartNote('');
                      }}
                    >
                      {PROPERTIES[item.house].name} · {formatWhole(item.direct)}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {held.length > 0 && !compound.show && (
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
                            setStartNote('');
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
            {!party.ok && !compound.show && (
              <p className="mt-2 text-sm text-[var(--uml-muted)]" data-bot="stay-party">
                {party.reason}
              </p>
            )}
            {compound.show && (
              <div className="mt-4" data-bot="stay-compound" data-ok={compound.ok ? 'yes' : 'no'}>
                <p className="uml-kicker">Ranch and River together</p>
                {compound.ok ? (
                  <>
                    <p className="mt-1 text-sm" data-bot="stay-compound-split">
                      {compound.line}
                    </p>
                    {compoundShownTotal(compound, calendar === 'live') ? (
                      <p className="mt-1 text-sm" data-bot="stay-compound-total">
                        {compoundShownTotal(compound, calendar === 'live')}
                      </p>
                    ) : null}
                  </>
                ) : (
                  <p className="mt-1 text-sm" data-bot="stay-compound-reason">
                    {compound.reason}
                  </p>
                )}
                <p className="mt-1 text-xs text-[var(--uml-muted)]">
                  This quote does not hold either house and does not send a request.
                </p>
              </div>
            )}
            {needsBoth && (
              <div className="mt-4" data-bot="stay-companion">
                {calendar !== 'live' && (
                  <p className="text-sm" data-bot="stay-compound-wait">
                    A party this size uses the River House and the Ranch House together. The request stays off until the calendar can be read. Nothing is sent.
                  </p>
                )}
                {calendar !== 'live' &&
                  guestCount !== null &&
                  compoundPaperHold(guestCount, childCount ?? undefined).map((line) => (
                    <p key={line} className="mt-2 text-sm" data-bot="stay-compound-split-hold">
                      {line}
                    </p>
                  ))}
                {bothOffer && !twoHouse && (
                  <p className="mt-2 text-sm" data-bot="stay-compound-hold">
                    Open each agreement for the River House and the Ranch House before the request. Opening a topic does not sign it. Nothing is sent.
                  </p>
                )}
                {calendar === 'live' && !bothOffer && (
                  <p className="mt-2 text-sm" data-bot="stay-companion-off">
                    {compoundAgreementHold(requestHold)}
                  </p>
                )}
                {companions.map((id) => (
                  <div key={id} className="mt-4" data-bot={`stay-companion-${id}`}>
                    <p className="uml-kicker">{id === 'river' ? 'The River House' : 'The Ranch House'}</p>
                    <ul className="mt-2 space-y-2 text-sm">
                      {houseRules(id).map((rule) => (
                        <li key={rule.id}>{rule.text}</li>
                      ))}
                    </ul>
                    {bothOffer ? (
                    <ul className="mt-3 space-y-2 text-sm">
                      {agreementTopics(id, 'page').map((topic) => {
                        const read = (openedTopics[id] ?? []).includes(topic.id);
                        return (
                          <li key={topic.id}>
                            <button
                              type="button"
                              className="text-left"
                              data-bot={`stay-companion-open-${id}-${topic.id}`}
                              data-read={read ? 'yes' : 'no'}
                              onClick={() =>
                                setOpenedTopics((current) => {
                                  const list = current[id] ?? [];
                                  if (list.includes(topic.id)) return current;
                                  return { ...current, [id]: [...list, topic.id] };
                                })
                              }
                            >
                              {topic.title}. {topic.detail}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
            {guestLine && (
              <p className="mt-2 text-sm text-[var(--uml-muted)]" data-bot="stay-party-note" data-note={guestLine}>
                {guestLine} {quoteActionLine(!requestHold, 'tail')}
              </p>
            )}
            {splitLine && (
              <p className="mt-2 text-sm text-[var(--uml-muted)]" data-bot="stay-split">
                {splitLine}
              </p>
            )}
            {timesReady ? (
            <>
            <div className="mt-6" data-bot="stay-arrival">
              <p className="uml-kicker">Arrival</p>
              <p className="mt-2 text-sm text-[var(--uml-muted)]">
                {quoteActionLine(!requestHold, 'arrival')}
              </p>
              {earlyArrival ? (
                <p className="mt-2 text-sm" data-bot="stay-arrival-note" data-note="">
                  {quoteActionLine(!requestHold, 'early')}
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
                      {arrivalLine} {quoteActionLine(!requestHold, 'tail')}
                    </p>
                  )}
                </>
              )}
              {bothFlex && !bothFlex.early && (
                <p className="mt-2 text-sm text-[var(--uml-muted)]" data-bot="stay-both-early-closed">
                  {bothHouseFlexLine('early', false)}
                </p>
              )}
            </div>
            <div className="mt-6" data-bot="stay-departure">
              <p className="uml-kicker">Departure</p>
              <p className="mt-2 text-sm text-[var(--uml-muted)]">
                {quoteActionLine(!requestHold, 'departure')}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {DEPARTURE_SLOTS.filter((slot) => slot === '11:00 AM' || lateOpen).map((slot) => (
                  <button
                    key={slot}
                    type="button"
                    className={`uml-nav ${departure === slot ? 'ring-1 ring-[var(--uml-gold)]' : ''}`}
                    data-bot="stay-departure-slot"
                    data-time={slot}
                    aria-pressed={departure === slot}
                    onClick={() => {
                      const next = departure === slot ? null : slot;
                      const applied = applyDepartureChoice(next, addons, lateOpen);
                      setDeparture(applied.leave);
                      setAddons(applied.addons);
                    }}
                  >
                    {slot}
                  </button>
                ))}
              </div>
              {departureLine && (
                <p className="mt-2 text-sm" data-bot="stay-departure-note" data-note={departureLine}>
                  {departureLine} {quoteActionLine(!requestHold, 'tail')}
                </p>
              )}
              {calendar === 'live' && !lateOpen && (quote.ok || bothOffer !== null) && (
                <p className="mt-2 text-sm text-[var(--uml-muted)]" data-bot="stay-departure-closed">
                  {bothOffer ? bothHouseFlexLine('late', false) : 'A 2:00 PM leave is not open for this checkout.'}
                </p>
              )}
            </div>
            </>
            ) : (
              <p className="mt-6 text-sm" data-bot="stay-times-hold">
                {quoteTimesHold(requestHold)}
              </p>
            )}
            <div className="mt-4" data-bot="stay-share">
              <p className="text-xs text-[var(--uml-muted)]">
                {quoteShareLine(timesReady, timesReady ? undefined : requestHold)}
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
                {copied ? 'Copied' : quoteShareButton(timesReady)}
              </button>
            </div>

            {calendar !== 'live' && (
              <div className="mt-6" data-bot="stay-addon-menu">
                <p className="uml-kicker">Add-ons</p>
                <p className="mt-2 text-sm">{addonMenuLine(house)}</p>
                {calendar === 'off' && offers.length > 0 && (
                  <ul className="mt-3 space-y-3" data-bot="stay-card-addons">
                    {offers.map((offer) => (
                      <li key={offer.id}>
                        <label className="flex items-start gap-3 text-sm">
                          <input
                            type="checkbox"
                            className="mt-1"
                            data-bot={`stay-card-addon-${offer.id}`}
                            checked={addons.includes(offer.id)}
                            onChange={() => setAddons((current) => toggleUpsell(current, offer.id))}
                          />
                          <span>{offer.name}. Nothing is charged yet. Checking this does not send a request.</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
                {calendar === 'off' && offers.some((offer) => offer.id === 'groceries') && addons.includes('groceries') && (
                  <label className="mt-3 block text-sm">
                    Grocery list
                    <textarea
                      className="mt-2 min-h-20 w-full rounded-2xl border border-[var(--uml-line)] bg-transparent px-4 py-3"
                      data-bot="stay-card-grocery"
                      value={groceryList}
                      onChange={(event) => setGroceryList(event.target.value)}
                    />
                    <span className="mt-2 block text-xs text-[var(--uml-muted)]" data-bot="stay-card-grocery-note">
                      This list stays in this tab. Nothing is ordered or charged.
                    </span>
                  </label>
                )}
              </div>
            )}
            {calendar === 'live' && bothFlex && (bothFlex.early || bothFlex.late) && (
              <div className="mt-6" data-bot="stay-both-flex">
                <p className="uml-kicker">Add-ons</p>
                <p className="mt-2 text-sm text-[var(--uml-muted)]">
                  Checking one adds it to the request for both houses. It does not charge a card or send the request.
                </p>
                <ul className="mt-3 space-y-3">
                  {bothFlex.early && (
                    <li>
                      <label className="flex items-start gap-3 text-sm">
                        <input
                          type="checkbox"
                          className="mt-1"
                          data-bot="stay-addon-early"
                          checked={addons.includes('early')}
                          onChange={() => setAddons((current) => toggleUpsell(current, 'early'))}
                        />
                        <span>{bothHouseFlexLine('early', true)}</span>
                      </label>
                    </li>
                  )}
                  {bothFlex.late && (
                    <li>
                      <label className="flex items-start gap-3 text-sm">
                        <input
                          type="checkbox"
                          className="mt-1"
                          data-bot="stay-addon-late"
                          checked={addons.includes('late')}
                          onChange={() => {
                            const on = !addons.includes('late');
                            setDeparture(applyLateAddon(on, departure));
                            setAddons((current) => toggleUpsell(current, 'late'));
                          }}
                        />
                        <span>{bothHouseFlexLine('late', true)}</span>
                      </label>
                    </li>
                  )}
                </ul>
              </div>
            )}
            {calendar === 'live' && offers.length > 0 && (
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
                          onChange={() => {
                            if (offer.id === 'late') {
                              const on = !addons.includes('late');
                              setDeparture(applyLateAddon(on, departure));
                            }
                            setAddons((current) => toggleUpsell(current, offer.id));
                          }}
                        />
                        <span>
                          {offer.name}. {formatWhole(offer.price)}. {quoteOfferDetail(offer)}
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
              <p className="mt-3 text-sm" data-bot="stay-pet-rule">
                {petRuleLine('page')}
              </p>
              {timesReady ? (
              <>
              <label className="mt-4 flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  data-bot="stay-rules-check"
                  checked={rulesRead}
                  onChange={(event) => setRulesRead(event.target.checked)}
                />
                {rulesReadLine(!requestHold, needsBoth)}
              </label>
              <label className="mt-4 flex items-start gap-3 text-sm" data-bot="stay-event">
                <input
                  type="checkbox"
                  className="mt-1"
                  data-bot="stay-event-check"
                  checked={eventStay}
                  onChange={(event) => setEventStay(event.target.checked)}
                />
                This stay is a party or an event.
              </label>
              {eventStay && (
                <p className="mt-2 text-sm" data-bot="stay-event-note">
                  {eventHoldLine(house)}
                </p>
              )}
              <p className="mt-2 text-xs text-[var(--uml-muted)]" data-bot="stay-rules-note" data-note={rulesNote(house)}>
                {quoteActionLine(!requestHold, 'rules')}
              </p>
              <p className="mt-2 text-sm" data-bot="stay-agreement">
                {agreementLine(house, 'page')}
              </p>
              {!agreementOpened && (
                <p className="mt-2 text-sm" data-bot="stay-agreement-hold">
                  Open each topic before the request. Opening a topic does not sign the agreement. This page does not send that request.
                </p>
              )}
              <ul className="mt-3 space-y-2 text-sm" data-bot="stay-agreement-topics">
                {agreementTopics(house, 'page').map((topic) => {
                  const read = opened.includes(topic.id);
                  return (
                    <li key={topic.id} data-bot={`stay-agreement-${topic.id}`}>
                      <button
                        type="button"
                        className="text-left"
                        data-bot={`stay-agreement-open-${topic.id}`}
                        data-read={read ? 'yes' : 'no'}
                        onClick={() =>
                          setOpenedTopics((current) => {
                            const list = current[house] ?? [];
                            if (list.includes(topic.id)) return current;
                            return { ...current, [house]: [...list, topic.id] };
                          })
                        }
                      >
                        {topic.title}. {topic.detail}
                      </button>
                    </li>
                  );
                })}
                </ul>
              </>
              ) : (
                <p className="mt-4 text-sm" data-bot="stay-agreement-off">
                  {quoteAgreementHold(requestHold)}
                </p>
              )}
            </div>
            {requestPromo && (
              <p className="mt-8 text-sm" data-bot="stay-request-promo">
                {requestPromo}
              </p>
            )}
            {calendar === 'live' && !twoHouse && (
              <p className="sr-only" data-bot="stay-request-note" data-off={requestNote.includes('20% off') ? 'yes' : 'no'} data-fill={/\bfill\b/i.test(requestNote) ? 'yes' : 'no'} />
            )}
            {sent ? (
              <>
                <p className="mt-8 font-display text-3xl">We have the request. Someone will write back.</p>
                {/*
                  The route has always reported `guestEmailed`, and the page never read it. So when email failed — as it
                  does on every request on this deployment, because the Gmail secret is invalid — the guest saw a clean
                  success screen and waited for a receipt that was never sent. The status link below is the part that
                  still works, so it becomes the instruction rather than a footnote.
                */}
                {receiptFailed && (
                  <p className="mt-2 text-sm" data-bot="stay-receipt-failed">
                    The confirmation email could not be sent, so do not wait for it. Your request is saved and the
                    link below opens it — keep that link.
                  </p>
                )}
                {holdLine && (
                  <p className="mt-2 text-sm" data-bot="stay-hold-confirmed">
                    {holdLine}
                  </p>
                )}
                {statusPath && (
                  <div className="mt-5" data-bot="stay-status-link">
                    <p className="text-sm text-[var(--uml-muted)]">
                      {receiptFailed
                        ? 'This link is the only copy you will get. Keep it somewhere you can find it — no sign-in, and it shows only these dates.'
                        : 'Keep this link to check on the request yourself. No sign-in, and it shows only these dates.'}
                    </p>
                    <a
                      href={statusPath}
                      data-bot="stay-status-open"
                      className="uml-gold-btn mt-3 inline-block rounded-full px-5 py-3 text-xs uppercase tracking-[0.16em]"
                    >
                      See the request
                    </a>
                  </div>
                )}
              </>
            ) : requestHold ? (
              <p className="mt-8 text-sm" data-bot="stay-request-hold">
                {requestHold}
              </p>
            ) : (
              <form
                onSubmit={(e) => void submit(e)}
                className="mt-8 space-y-3"
                data-also-house={twoHouse ? 'ranch' : ''}
              >
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
                  disabled={busy || !requestReady}
                  className="rounded-full bg-[var(--uml-gold)] px-5 py-3 text-xs uppercase tracking-[0.16em] text-[var(--uml-gold-ink)] disabled:opacity-40"
                >
                  {busy ? 'Sending' : twoHouse ? 'Request both houses' : 'Request these dates'}
                </button>
              </form>
            )}

            {ics && (
              <button
                type="button"
                className="mt-8 text-sm underline"
                data-bot="stay-calendar-file"
                data-prep={ics.text.includes('These steps are from the published guide') ? 'yes' : 'no'}
                data-leave={ics.text.includes('Before leaving:') ? 'yes' : 'no'}
                onClick={() => {
                  const blob = new Blob([ics.text], { type: 'text/calendar' });
                  const url = URL.createObjectURL(blob);
                  const link = document.createElement('a');
                  link.href = url;
                  link.download = ics.filename;
                  link.click();
                  URL.revokeObjectURL(url);
                }}
              >
                Add these dates to a calendar. The file says the stay is not booked. This does not hold the dates.
              </button>
            )}

            {bothOffer && (
              <section className="mt-8" data-bot="stay-both-messages">
                <p className="uml-kicker">Messages</p>
                <p className="mt-2 text-sm" data-bot="stay-both-messages-note">
                  {bothHouseMessageNote()}
                </p>
                {(['river', 'ranch'] as const).map((id) => (
                  <div key={id} className="mt-6" data-bot="stay-both-message-house" data-house={id}>
                    <p className="font-display text-xl">{PROPERTIES[id].name}</p>
                    <ul className="mt-3 space-y-3 text-sm">
                      {quoteMessageSchedule(id, { checkIn, checkOut }).map((message) => (
                        <li key={message.id} data-bot="stay-both-message" data-message={message.id}>
                          <p className="text-xs uppercase tracking-wide text-[var(--uml-muted)]">{message.when}</p>
                          <p>{message.subject}</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </section>
            )}

            {bothOffer && bothFlex && (
              <section className="mt-8 space-y-4 text-sm" data-bot="stay-both-sheet">
                <p className="uml-kicker">Trip paper</p>
                <p data-bot="stay-both-sheet-note">{bothHousePaperNote()}</p>
                <p data-bot="stay-both-sheet-flex">{bothHouseFlexRhythm(bothFlex)}</p>
                {bothHousePapers({ checkIn, checkOut, early: bothFlex.early, late: bothFlex.late }).map((paper) => (
                  <div key={paper.id} className="space-y-2" data-bot="stay-both-sheet-house" data-house={paper.id}>
                    <p className="font-display text-xl">{paper.house}</p>
                    <p data-bot="stay-both-sheet-when">{paper.when}</p>
                    {paper.event && <p data-bot="stay-both-sheet-event">{paper.event}</p>}
                    {paper.photo ? <p data-bot="stay-both-sheet-photo">{paper.photo}</p> : null}
                    {paper.address && <p data-bot="stay-both-sheet-address">{paper.address}</p>}
                    <p>{paper.privateNote}</p>
                    {paper.arrival && <p>{paper.arrival}</p>}
                    {paper.parking && <p>{paper.parking}</p>}
                    {paper.notes.map((note) => (
                      <p key={note.title}>
                        {note.title}. {note.body}
                      </p>
                    ))}
                    {paper.checkout.map((step) => (
                      <p key={step} data-bot="stay-both-sheet-step">
                        {step}
                      </p>
                    ))}
                    {paper.emergency && <p>{paper.emergency}</p>}
                    {paper.agreement && <p>{paper.agreement}</p>}
                    {paper.nearby.length > 0 && (
                      <div data-bot="stay-both-sheet-nearby">
                        <p>{tripNearbyNote()}</p>
                        {nearbyGroups(paper.nearby).map((group) => (
                          <div key={group.kind}>
                            <p className="text-xs uppercase tracking-[0.16em] text-[var(--uml-muted)]">{group.label}</p>
                            <ul className="mt-1 space-y-1">
                              {group.places.map((place) => (
                                <li key={`${paper.id}-${place.name}-${place.note}`}>
                                  <a href={place.href} target="_blank" rel="noreferrer">
                                    {place.name}
                                  </a>
                                  {place.area ? `, ${place.area}` : ''}. {place.note}
                                  {place.site ? ` ${place.site}` : ''}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </section>
            )}

            {ics && (
              <section className="mt-8" data-bot="stay-messages">
                <p className="uml-kicker">Messages</p>
                <p className="mt-2 text-sm" data-bot="stay-messages-note">
                  {quoteMessageNote()}
                </p>
                <ul className="mt-4 space-y-3 text-sm">
                  {guestTimeline(house, { checkIn, checkOut }, 'quote', {
                    arrival,
                    departure,
                    lateOpen,
                    early: earlyArrival,
                  }).map((message) => (
                    <li key={message.id} data-bot="stay-message" data-message={message.id}>
                      <p className="text-xs uppercase tracking-wide text-[var(--uml-muted)]">{message.when}</p>
                      <p>{message.subject}</p>
                      <p className="text-[var(--uml-muted)]">{message.body}</p>
                      {message.id === 'booked' && (
                        <p data-bot="stay-message-calendar">{quoteCalendarLine()}</p>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {sheet && (
              <section className="mt-8 space-y-2 text-sm" data-bot="stay-sheet">
                <p className="uml-kicker">Trip paper</p>
                <p data-bot="stay-sheet-note">{tripPaperNote()}</p>
                <p data-bot="stay-sheet-when">{sheet.when}</p>
                {moment && <p data-bot="stay-sheet-moment">{moment}</p>}
                {countdown && <p data-bot="stay-sheet-countdown">{countdown}</p>}
                {sheet.event && <p data-bot="stay-sheet-event">{sheet.event}</p>}
                {sheet.address && <p>{sheet.address}</p>}
                <p>{sheet.privateNote}</p>
                {sheet.arrival && <p>{sheet.arrival}</p>}
                {timesReady && quotePaperTimes(arrival, departure, lateOpen) && (
                  <p data-bot="stay-sheet-times">{quotePaperTimes(arrival, departure, lateOpen)}</p>
                )}
                {calendar !== 'live' && quoteCardAddonLine(selectedOffers.map((offer) => offer.name)) && (
                  <p data-bot="stay-sheet-addons">{quoteCardAddonLine(selectedOffers.map((offer) => offer.name))}</p>
                )}
                {calendar !== 'live' && quoteGroceryLine(groceryList, selectedOffers.some((offer) => offer.id === 'groceries')) && (
                  <p data-bot="stay-sheet-grocery">
                    {quoteGroceryLine(groceryList, selectedOffers.some((offer) => offer.id === 'groceries'))}
                  </p>
                )}
                {sheet.parking && <p>{sheet.parking}</p>}
                {sheet.notes.map((note) => (
                  <p key={note.title}>
                    {note.title}. {note.body}
                  </p>
                ))}
                {sheet.checkout.map((step) => (
                  <p key={step}>{step}</p>
                ))}
                {sheet.agreement && <p>{sheet.agreement}</p>}
                {sheet.nearby.length > 0 && (
                  <div data-bot="stay-sheet-nearby">
                    <p>{tripNearbyNote()}</p>
                    {nearbyGroups(sheet.nearby).map((group) => (
                      <div key={group.kind} data-bot={`stay-sheet-nearby-${group.kind}`}>
                        <p className="text-xs uppercase tracking-[0.16em] text-[var(--uml-muted)]">{group.label}</p>
                        <ul className="mt-1 space-y-1">
                          {group.places.map((place) => (
                            <li key={`${place.name}-${place.note}`}>
                              <a href={place.href} target="_blank" rel="noreferrer">
                                {place.name}
                              </a>
                              {place.area ? `, ${place.area}` : ''}. {place.note}
                              {place.site ? ` ${place.site}` : ''}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}

            {calendar === 'live' && bothHouseQuote(guestCount) && (
              <p className="mt-8 text-sm" data-bot="stay-both-request">
                {bothHouseRequestNote()}
              </p>
            )}
          </section>
        </div>
      </div>
      <div className="stay-sheet-source" data-bot="stay-guide-print">
        <p>House guide</p>
        <h2>{guide.name}</h2>
        {guide.facts.map((line, index) => (
          <p key={`fact-${index}`}>{line}</p>
        ))}
        {guide.shortest && <p data-bot="stay-print-short">{guide.shortest}</p>}
        {guide.compared.length > 0 && (
          <ul data-bot="stay-print-other-rules">
            {guide.compared.map((line, index) => (
              <li key={`compared-${index}`} data-bot="stay-print-other-rule">
                {line}
              </li>
            ))}
          </ul>
        )}
        <ul data-bot="stay-guide-nights">
          {guide.nights.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>
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
        {chosenDay && chosenDay.house === house && houseDayPaper(chosenDay, 'quote').map((line) => (
          <p key={line} data-bot="stay-print-day">{line}</p>
        ))}
        {paper.map((line) => (
          <p key={line} data-bot="stay-quote-paper">
            {line}
          </p>
        ))}
        {timesReady && calendar !== 'live' && quotePaperTimes(arrival, departure, lateOpen) && (
          <p data-bot="stay-print-times">{quotePaperTimes(arrival, departure, lateOpen)}</p>
        )}
        {calendar !== 'live' && quoteCardAddonLine(selectedOffers.map((offer) => offer.name)) && (
          <p data-bot="stay-print-addons">{quoteCardAddonLine(selectedOffers.map((offer) => offer.name))}</p>
        )}
        {calendar !== 'live' && quoteGroceryLine(groceryList, selectedOffers.some((offer) => offer.id === 'groceries')) && (
          <p data-bot="stay-print-grocery">
            {quoteGroceryLine(groceryList, selectedOffers.some((offer) => offer.id === 'groceries'))}
          </p>
        )}
        {eventNote && <p data-bot="stay-event-paper">{eventNote}</p>}
        {compoundShownPaper(compound, calendar === 'live').map((line) => (
          <p key={line} data-bot="stay-compound-paper">
            {line}
          </p>
        ))}
        {calendar !== 'live' &&
          needsBoth &&
          guestCount !== null &&
          compoundPaperHold(guestCount, childCount ?? undefined).map((line) => (
            <p key={line} data-bot="stay-compound-paper-hold">
              {line}
            </p>
          ))}
        <p>{guide.close}</p>
      </div>
    </div>
  );
}
