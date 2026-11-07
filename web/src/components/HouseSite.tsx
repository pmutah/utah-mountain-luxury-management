import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { BrandMark } from './BrandMark';
import { RateCardMonth } from './StayMonth';
import { StayYear } from './StayYear';
import { GuideDesk } from './GuideDesk';
import { loadQuoteCalendar } from '../lib/booked-nights';
import { bothHouseMonthNote, housePageCalendar } from '../lib/compound';
import { applyPublicShare, GROUP_TRIP, groupQuoteLink, groupQuotePending, groupQuoteUnread, houseCardFacts, houseDateHold, houseDateLinkNote, houseLicenseLine, housePageHref, housePageSearch, houseSafetyLine, parseHousePath, publicHouse, publicHouses, publicShare, readHouseDates, readHouseParty, type PublicHouse } from '../lib/house-page';
import { HouseDays } from './HouseDays';
import { denverHour, quietNow } from '../lib/stay-rhythm';
import { ArriveReady } from './ArriveReady';
import { HouseManual } from './HouseManual';
import { bookingRules } from '../lib/booking-rules';
import { houseOffers, housePageAside, type HouseAsideParty, type HouseListStay } from '../lib/house-offer';
import { heldSearchLines, houseCardLines, houseMonthPace, houseNextStayLine, housePageRhythm, housePartyLine, houseQuoteCaption, houseQuotePending, houseRhythms, otherStayRules, partyFitList, quotedStayHref, quotedStayPaint, searchHouses, shortestFixLines, stayRuleLines } from '../lib/house-search';
import { eventPlanCompare } from '../lib/event-plan';
import { stayCountdown } from '../lib/journey';
import { openingStay } from '../lib/booking-open';
import { denverToday } from '../lib/market/dates';
import type { YearPace } from '../lib/market/fill';
import type { HouseId } from '../lib/market/types';

const EMPTY_NIGHTS: Record<HouseId, string[]> = { ranch: [], lindon: [], river: [] };

function readHouseQuery() {
  const params = new URLSearchParams(window.location.search);
  return {
    checkIn: params.get('in') ?? '',
    checkOut: params.get('out') ?? '',
    guests: params.get('guests') ?? '',
    children: params.get('children') ?? '',
  };
}

export function HouseSite() {
  const which = parseHousePath(window.location.pathname);
  if (which === 'index') return <HouseIndex />;
  if (!which) {
    return (
      <div className="min-h-screen px-4 py-10 sm:px-8">
        <p className="text-sm">That house is not listed.</p>
        <a className="mt-4 inline-block underline" href="/houses" data-bot="houses-missing">
          All houses
        </a>
      </div>
    );
  }
  return <HousePage house={publicHouse(which)} />;
}

function HouseIndex() {
  const houses = publicHouses();
  const share = publicShare('index');
  const initial = readHouseQuery();
  const [stay, setStay] = useState(initial);
  const [held, setHeld] = useState<{ house: HouseId; line: string }[]>([]);
  const [cardLines, setCardLines] = useState<{ house: HouseId; line: string; next: string }[]>([]);
  const [listCalendar, setListCalendar] = useState<'loading' | 'ready' | 'unread'>('loading');
  const [groupNights, setGroupNights] = useState<{ taken: Record<HouseId, string[]>; closed: Record<HouseId, string[]> } | null>(null);
  const onListCalendar = useCallback((state: 'loading' | 'ready' | 'unread') => {
    setListCalendar(state);
  }, []);
  const onGroupNights = useCallback((nights: { taken: Record<HouseId, string[]>; closed: Record<HouseId, string[]> } | null) => {
    setGroupNights(nights);
  }, []);
  const groupGuests = /^\d+$/.test(stay.guests) ? Number(stay.guests) : undefined;
  const groupChildren = /^\d+$/.test(stay.children) && Number(stay.children) > 0 ? Number(stay.children) : undefined;
  const group =
    listCalendar === 'ready' && groupNights
      ? groupQuoteLink(
          stay.checkIn,
          stay.checkOut,
          held,
          {
            asOf: denverToday(),
            taken: groupNights.taken,
            closed: groupNights.closed,
          },
          groupGuests !== undefined ? { guests: groupGuests, children: groupChildren } : undefined,
        )
      : null;
  const cardNote = housePageSearch(stay.checkIn, stay.checkOut)
    ? 'These house links keep the dates. They do not hold them. Nothing is charged yet.'
    : '';
  useEffect(() => applyPublicShare(share), [share.title, share.description, share.url]);
  return (
    <div className="min-h-screen px-4 py-10 sm:px-8" data-bot="houses-index">
      <p className="sr-only" data-bot="page-share">{share.title}</p>
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 flex items-center gap-3">
          <BrandMark />
          <div>
            <p className="uml-kicker">Utah Mountain Luxury</p>
            <h1 className="font-display text-5xl">The houses</h1>
          </div>
        </div>
        <p className="mb-8 max-w-2xl text-sm text-[var(--uml-muted)]">
          Three houses in Utah County. A quote is on the booking page. It does not charge a card, and a request
          holds the dates for 30 minutes while a person replies.
        </p>
        <div className="mb-8">
          <GuideDesk
            stay={
              stay.checkIn && stay.checkOut
                ? { checkIn: stay.checkIn, checkOut: stay.checkOut, guests: groupGuests ?? null, children: groupChildren }
                : null
            }
          />
        </div>
        <section className="mb-8 space-y-3" data-bot="houses-offers">
          <p className="uml-kicker">What each house is</p>
          <p className="text-sm text-[var(--uml-muted)]" data-bot="houses-offers-note">
            This list has no price. It does not say a house is open.
          </p>
          {houseOffers(
            listCalendar === 'ready' && groupNights && stay.checkIn && stay.checkOut
              ? ({
                  checkIn: stay.checkIn,
                  checkOut: stay.checkOut,
                  asOf: denverToday(),
                  taken: groupNights.taken,
                  closed: groupNights.closed,
                  guests: groupGuests ?? null,
                  children: groupChildren,
                } satisfies HouseListStay)
              : null,
          ).map((row) => (
            <div key={row.house} className="uml-panel rounded-3xl px-6 py-5" data-bot="houses-offer" data-house={row.house}>
              <p className="font-display text-3xl">{row.name}</p>
              <ul className="mt-2 space-y-1 text-sm">
                {row.lines.map((line) => (
                  <li key={line} data-bot={line === row.addon ? 'houses-offer-addon' : undefined}>
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
        <HouseFinder onStay={setStay} onHeld={setHeld} onCards={setCardLines} onCalendar={onListCalendar} onNights={onGroupNights} />
        {cardNote ? (
          <p className="mb-4 text-sm" data-bot="houses-card-note">
            {cardNote}
          </p>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-3">
          {houses.map((house) => (
            <a key={house.id} href={housePageHref(house.id, stay.checkIn, stay.checkOut, stay.guests, stay.children)} data-bot={`houses-card-${house.id}`} className="uml-panel block overflow-hidden rounded-3xl">
              {house.photo.src && (
                <figure>
                  <img src={house.photo.src} alt={house.name} className="h-44 w-full object-cover" />
                  {house.photo.caption ? (
                    <figcaption className="px-5 pt-3 text-xs text-[var(--uml-muted)]" data-bot="houses-card-caption" data-house={house.id}>
                      {house.photo.caption}
                    </figcaption>
                  ) : null}
                </figure>
              )}
              <div className="px-5 py-4">
                <p className="uml-kicker">{house.id}</p>
                <p className="font-display text-3xl">{house.name.replace('The ', '')}</p>
                <p className="mt-1 text-xs text-[var(--uml-muted)]">{house.title}</p>
                <ul className="mt-2 space-y-1 text-xs">
                  {houseCardFacts(house.id).slice(0, 2).map((line) => (
                    <li key={line} data-bot="houses-card-fact" data-house={house.id}>
                      {line}
                    </li>
                  ))}
                </ul>
                {house.address ? (
                  <p className="mt-1 text-xs" data-bot="houses-card-address" data-house={house.id}>
                    {house.address}
                  </p>
                ) : null}
                {cardLines.find((row) => row.house === house.id)?.line ? (
                  <p className="mt-2 text-sm" data-bot="houses-card-status" data-house={house.id}>
                    {cardLines.find((row) => row.house === house.id)?.line}
                  </p>
                ) : held.find((row) => row.house === house.id)?.line ? (
                  <p className="mt-2 text-sm" data-bot="houses-card-held" data-house={house.id}>
                    {held.find((row) => row.house === house.id)?.line}
                  </p>
                ) : null}
                {cardLines.find((row) => row.house === house.id)?.next ? (
                  <p className="mt-2 text-sm" data-bot="houses-card-next" data-house={house.id}>
                    {cardLines.find((row) => row.house === house.id)?.next}
                  </p>
                ) : null}
              </div>
            </a>
          ))}
        </div>
        <section className="uml-panel mt-8 rounded-3xl px-6 py-5" data-bot="houses-group">
          <p className="uml-kicker">Plan a group trip</p>
          <p className="mt-2 max-w-2xl text-sm">{GROUP_TRIP}</p>
          {listCalendar === 'loading' ? (
            <span className="mt-4 inline-block" data-bot="houses-group-quote" data-quoted="no">
              {groupQuotePending().label}
            </span>
          ) : group ? (
            <a
              className="mt-4 inline-block underline"
              href={group.href}
              data-bot="houses-group-quote"
              data-quoted={group.quoted ? 'yes' : 'no'}
            >
              {group.label}
            </a>
          ) : (
            <span className="mt-4 inline-block" data-bot="houses-group-quote" data-quoted="no">
              {groupQuoteUnread().label}
            </span>
          )}
        </section>
      </div>
    </div>
  );
}

function HouseFinder({
  onStay,
  onHeld,
  onCards,
  onCalendar,
  onNights,
}: {
  onStay: (stay: { checkIn: string; checkOut: string; guests: string; children: string }) => void;
  onHeld: (rows: { house: HouseId; line: string }[]) => void;
  onCards: (rows: { house: HouseId; line: string; next: string }[]) => void;
  onCalendar: (state: 'loading' | 'ready' | 'unread') => void;
  onNights: (nights: { taken: Record<HouseId, string[]>; closed: Record<HouseId, string[]> } | null) => void;
}) {
  const initial = readHouseQuery();
  const today = denverToday();
  const blank = !initial.checkIn && !initial.checkOut;
  const seed = openingStay('river', today);
  const [checkIn, setCheckIn] = useState(blank ? seed.checkIn : initial.checkIn);
  const [checkOut, setCheckOut] = useState(blank ? seed.checkOut : initial.checkOut);
  const checkInNow = useRef(checkIn);
  const checkOutNow = useRef(checkOut);
  checkInNow.current = checkIn;
  checkOutNow.current = checkOut;
  const [guests, setGuests] = useState(initial.guests);
  const [children, setChildren] = useState(initial.children);
  useEffect(() => {
    onStay({ checkIn, checkOut, guests, children });
  }, [checkIn, checkOut, guests, children, onStay]);
  const [asked, setAsked] = useState(Boolean(initial.checkIn && initial.checkOut && initial.guests));
  const [calendar, setCalendar] = useState<'loading' | 'ready' | 'unread'>('loading');
  const [taken, setTaken] = useState(EMPTY_NIGHTS);
  const [closed, setClosed] = useState(EMPTY_NIGHTS);

  useEffect(() => {
    let cancel = false;
    loadQuoteCalendar()
      .then((result) => {
        if (cancel) return;
        if (!result) {
          setCalendar('unread');
          return;
        }
        setTaken(result.nights);
        setClosed(result.closed);
        setCalendar('ready');
        if (blank && checkInNow.current === seed.checkIn && checkOutNow.current === seed.checkOut) {
          const next = openingStay('river', today, result.nights.river ?? [], result.closed.river ?? []);
          if (next.checkIn !== checkInNow.current || next.checkOut !== checkOutNow.current) {
            setCheckIn(next.checkIn);
            setCheckOut(next.checkOut);
          }
        }
      })
      .catch(() => {
        if (!cancel) setCalendar('unread');
      });
    return () => {
      cancel = true;
    };
  }, []);

  function ask(event: FormEvent) {
    event.preventDefault();
    setAsked(true);
    const params = new URLSearchParams();
    if (checkIn) params.set('in', checkIn);
    if (checkOut) params.set('out', checkOut);
    if (guests) params.set('guests', guests);
    if (children) params.set('children', children);
    const query = params.toString();
    window.history.replaceState(null, '', query ? `/houses?${query}` : '/houses');
  }

  const guestCount = /^\d+$/.test(guests) ? Number(guests) : null;
  const childCount = /^\d+$/.test(children) ? Number(children) : undefined;
  const result =
    asked && calendar === 'ready' && guestCount !== null && checkIn && checkOut
      ? searchHouses(checkIn, checkOut, guestCount, childCount, taken, denverToday(), () => 'unknown', closed)
      : null;
  const held =
    calendar === 'ready' && !result && checkIn && checkOut
      ? heldSearchLines(checkIn, checkOut, taken, denverToday(), closed)
      : [];
  const heldKey = held.map((row) => row.line).join('|');
  useEffect(() => {
    onHeld(calendar === 'ready' && checkIn && checkOut ? heldSearchLines(checkIn, checkOut, taken, denverToday(), closed) : []);
  }, [calendar, checkIn, checkOut, taken, closed, onHeld, heldKey]);
  const cardKey = houseCardLines(
    checkIn,
    checkOut,
    taken,
    denverToday(),
    closed,
    guestCount ?? undefined,
    guestCount !== null ? childCount : undefined,
  )
    .map((row) => row.line)
    .join('|');
  useEffect(() => {
    onCards(
      calendar === 'ready'
        ? houseCardLines(
            checkIn,
            checkOut,
            taken,
            denverToday(),
            closed,
            guestCount ?? undefined,
            guestCount !== null ? childCount : undefined,
          )
        : [],
    );
  }, [calendar, checkIn, checkOut, taken, closed, guestCount, childCount, onCards, cardKey]);
  useEffect(() => {
    onCalendar(calendar);
    onNights(calendar === 'ready' ? { taken, closed } : null);
  }, [calendar, taken, closed, onCalendar, onNights]);
  const rhythms = asked && checkIn && checkOut ? houseRhythms(checkIn, checkOut) : [];
  const fit = asked && calendar === 'unread' && guestCount !== null ? partyFitList(guestCount, childCount) : null;
  const rules =
    asked && calendar === 'unread' && checkIn && checkOut
      ? stayRuleLines(checkIn, checkOut, guestCount ?? undefined, childCount, denverToday())
      : [];
  const fixes =
    asked && calendar === 'unread' && checkIn && checkOut
      ? shortestFixLines(checkIn, checkOut, guestCount ?? undefined, denverToday(), childCount)
      : [];

  return (
    <form className="uml-panel mb-8 rounded-3xl px-6 py-5" data-bot="houses-search" onSubmit={ask}>
      <p className="uml-kicker">Which houses</p>
      <p className="mt-2 max-w-2xl text-sm text-[var(--uml-muted)]">
        Dates and a party. The list has no price. Opening a house does not send a request.
      </p>
      <div className="mt-4 flex flex-wrap gap-3 text-sm">
        <label>
          Check-in
          <input
            type="date"
            required
            value={checkIn}
            onChange={(event) => setCheckIn(event.target.value)}
            className="ml-2 rounded-full border border-[var(--uml-line)] bg-transparent px-3 py-1"
            data-bot="houses-search-in"
          />
        </label>
        <label>
          Check-out
          <input
            type="date"
            required
            value={checkOut}
            onChange={(event) => setCheckOut(event.target.value)}
            className="ml-2 rounded-full border border-[var(--uml-line)] bg-transparent px-3 py-1"
            data-bot="houses-search-out"
          />
        </label>
        <label>
          Guests
          <input
            type="number"
            min={1}
            required
            value={guests}
            onChange={(event) => setGuests(event.target.value)}
            className="ml-2 w-20 rounded-full border border-[var(--uml-line)] bg-transparent px-3 py-1"
            data-bot="houses-search-guests"
          />
        </label>
        <label>
          Children
          <input
            type="number"
            min={0}
            value={children}
            onChange={(event) => setChildren(event.target.value)}
            className="ml-2 w-20 rounded-full border border-[var(--uml-line)] bg-transparent px-3 py-1"
            data-bot="houses-search-children"
          />
        </label>
        <button type="submit" className="rounded-full bg-[var(--uml-gold)] px-4 py-2 text-xs uppercase tracking-[0.16em] text-[var(--uml-gold-ink)]" data-bot="houses-search-submit">
          See the houses
        </button>
      </div>
      {asked && calendar === 'loading' && <p className="mt-4 text-sm">Reading the calendar.</p>}
      {calendar !== 'loading' && (
        <div className="mt-4 space-y-3 text-sm" data-bot="houses-event-plan" data-calendar={calendar}>
          <p data-bot="houses-event-note">
            {calendar === 'ready'
              ? 'Upcoming events. A booked start is named and is not linked. Nothing is charged yet.'
              : 'Upcoming events at each house. The length is the shortest stay the rate card can quote. This does not say a house is open. Nothing is charged yet.'}
          </p>
          {eventPlanCompare(denverToday(), calendar === 'ready' ? { taken, closed } : undefined).map((row) => (
            <div key={row.label} data-bot="houses-event-row">
              <p>{row.label}</p>
              {row.houses.map((house) => (
                <p key={house.house} data-bot="houses-event-house" data-house={house.house}>
                  {house.absent ? (
                    `${house.name} is not on this event.`
                  ) : house.hold ? (
                    `${house.name}: ${house.hold} Nothing is charged yet.`
                  ) : house.nights == null || !house.checkIn || !house.checkOut ? (
                    `${house.name} cannot quote a start.`
                  ) : (
                    <a
                      href={housePageHref(house.house, house.checkIn, house.checkOut, guests, children)}
                      data-bot="houses-event-link"
                      data-house={house.house}
                    >
                      {house.name}, {house.nights === 1 ? '1 night' : `${house.nights} nights`}. This link does not hold the dates.
                    </a>
                  )}
                </p>
              ))}
            </div>
          ))}
        </div>
      )}
      {asked && calendar === 'unread' && (
        <p className="mt-4 text-sm" data-bot="houses-search-unread">
          The calendar could not be read. This page will not say a house is open.
        </p>
      )}
      {fit && fit.rows.length > 0 && (
        <div className="mt-4 space-y-1 text-sm" data-bot="houses-search-fit">
          {fit.rows.map((row) => (
            <p key={row.house} data-bot="houses-fit-row" data-house={row.house} data-fits={row.fits ? 'yes' : 'no'}>
              {row.line}
            </p>
          ))}
          {fit.together && <p data-bot="houses-fit-together">{fit.together}</p>}
        </div>
      )}
      {rules.length > 0 && (
        <div className="mt-4 space-y-1 text-sm" data-bot="houses-search-rules">
          {rules.map((row) => (
            <p key={row.house} data-bot="houses-rule-row" data-house={row.house}>
              {row.line}
            </p>
          ))}
        </div>
      )}
      {fixes.length > 0 && (
        <div className="mt-4 space-y-2 text-sm" data-bot="houses-search-short">
          {fixes.map((row) => (
            <p key={row.house} data-bot="houses-short-row" data-house={row.house}>
              {row.line}{' '}
              <a href={row.href} data-bot="houses-short-link" data-house={row.house}>
                Those dates on this house. This link does not hold the dates.
              </a>
            </p>
          ))}
        </div>
      )}
      {rhythms.length > 0 && (
        <div className="mt-4 space-y-3 text-sm" data-bot="houses-search-rhythm">
          {rhythms.map((row) => (
            <div key={row.house} data-bot="houses-rhythm-row" data-house={row.house}>
              <p className="font-display text-xl">{row.name}</p>
              {row.lines.map((line) => (
                <p key={line} className="text-[var(--uml-muted)]">
                  {line}
                </p>
              ))}
            </div>
          ))}
        </div>
      )}
      {held.length > 0 && (
        <div className="mt-4 space-y-1 text-sm" data-bot="houses-search-held">
          {held.map((row) => (
            <p key={row.house} data-bot="houses-held-row" data-house={row.house}>
              {row.line}
            </p>
          ))}
        </div>
      )}
      {asked && calendar === 'ready' && guestCount === null && <p className="mt-4 text-sm">Add the number of overnight guests.</p>}
      {result && (
        <div className="mt-4 space-y-2 text-sm">
          {result.event && (
            <p data-bot="houses-search-event">{result.event}</p>
          )}
          {result.rows.map((row) => (
            <p key={row.house}>
              <a href={row.href} data-bot="houses-search-row" data-house={row.house} data-ok={row.ok ? 'yes' : 'no'}>
                {row.line}
              </a>
            </p>
          ))}
          {result.together && (
            <p>
              <a href={result.together.href} data-bot="houses-search-together" data-ok={result.together.ok ? 'yes' : 'no'}>
                {result.together.line}
              </a>
            </p>
          )}
        </div>
      )}
    </form>
  );
}

function HousePage({ house }: { house: PublicHouse }) {
  const opened = readHouseDates(typeof window === 'undefined' ? '' : window.location.search);
  const party = readHouseParty(typeof window === 'undefined' ? '' : window.location.search);
  const today = denverToday();
  const linkedStay = opened.checkIn !== '' && opened.checkOut !== '';
  const seed = openingStay(house.id, today);
  const [checkIn, setCheckIn] = useState(linkedStay ? opened.checkIn : seed.checkIn);
  const [checkOut, setCheckOut] = useState(linkedStay ? opened.checkOut : seed.checkOut);
  const [cardMonth, setCardMonth] = useState((linkedStay ? opened.checkIn : seed.checkIn).slice(0, 7));
  const checkInNow = useRef(checkIn);
  const checkOutNow = useRef(checkOut);
  checkInNow.current = checkIn;
  checkOutNow.current = checkOut;
  const [guests, setGuests] = useState(party.guests);
  const [children, setChildren] = useState(party.children);
  const [calendar, setCalendar] = useState<'loading' | 'ready' | 'unread'>('loading');
  const [taken, setTaken] = useState(EMPTY_NIGHTS);
  const [closed, setClosed] = useState(EMPTY_NIGHTS);
  const [paceMap, setPaceMap] = useState<Record<HouseId, YearPace> | null>(null);
  useEffect(() => {
    let cancel = false;
    loadQuoteCalendar()
      .then((result) => {
        if (cancel) return;
        if (!result) {
          setCalendar('unread');
          return;
        }
        setTaken(result.nights);
        setClosed(result.closed);
        setPaceMap(result.pace);
        setCalendar('ready');
        if (!linkedStay && checkInNow.current === seed.checkIn && checkOutNow.current === seed.checkOut) {
          const next = openingStay(house.id, today, result.nights[house.id] ?? [], result.closed[house.id] ?? []);
          if (next.checkIn !== checkInNow.current || next.checkOut !== checkOutNow.current) {
            setCheckIn(next.checkIn);
            setCheckOut(next.checkOut);
            setCardMonth(next.checkIn.slice(0, 7));
          }
        }
      })
      .catch(() => {
        if (!cancel) setCalendar('unread');
      });
    return () => {
      cancel = true;
    };
  }, []);
  const pageSearch = housePageSearch(checkIn, checkOut, guests, children);
  const share = publicShare(house.id);
  const quote = quotedStayHref(
    house.id,
    checkIn,
    checkOut,
    guests,
    children,
    denverToday(),
    calendar === 'ready' ? taken : null,
    calendar === 'ready' ? closed : null,
  );
  const quoteHref = quote.href;
  const pendingQuote = calendar === 'loading' ? houseQuotePending() : null;
  const quoteLabel = pendingQuote?.label ?? quote.label;
  const dateHold = houseDateHold(checkIn, checkOut);
  const dateLink = houseDateLinkNote(checkIn, checkOut);
  const rhythm = housePageRhythm(house.id, checkIn, checkOut);
  const guestCount = /^\d+$/.test(guests) ? Number(guests) : undefined;
  const childCount = /^\d+$/.test(children) ? Number(children) : undefined;
  const nextStay =
    calendar === 'ready'
      ? houseNextStayLine(house.id, checkIn, checkOut, taken[house.id] ?? [], today, 'unknown', closed[house.id] ?? [], guestCount, childCount)
      : '';
  const ownRule =
    stayRuleLines(checkIn, checkOut, guestCount, childCount, denverToday()).find((row) => row.house === house.id) ?? null;
  const otherRules = otherStayRules(house.id, checkIn, checkOut, guestCount, childCount, denverToday());
  const shortFix =
    calendar === 'unread'
      ? (shortestFixLines(checkIn, checkOut, guestCount, denverToday(), childCount).find((row) => row.house === house.id) ?? null)
      : null;
  const partyLine = housePartyLine(house.id, guests, children);
  const span = housePageCalendar(house.id, guestCount ?? null, calendar === 'ready', taken, closed);
  const countdown = checkIn && checkOut ? stayCountdown(denverToday(), checkIn, checkOut, 'quote') : '';
  useEffect(() => applyPublicShare(pageSearch ? { ...share, url: `${share.url}${pageSearch}` } : share), [share.title, share.description, share.url, pageSearch]);
  useEffect(() => {
    const next = `${window.location.pathname}${pageSearch}`;
    if (`${window.location.pathname}${window.location.search}` === next) return;
    window.history.replaceState(null, '', next);
  }, [pageSearch]);
  return (
    <div className="min-h-screen px-4 py-10 sm:px-8" data-bot="house-page" data-house={house.id}>
      <p className="sr-only" data-bot="page-share">{share.title}</p>
      <script type="application/ld+json" data-bot="house-schema" dangerouslySetInnerHTML={{ __html: JSON.stringify(house.schema) }} />
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-center justify-between gap-3">
          <a href="/houses" className="text-sm underline" data-bot="house-back">
            All houses
          </a>
          <BrandMark />
        </div>
        {house.photo.src && (
          <figure className="overflow-hidden rounded-3xl">
            <img src={house.photo.src} alt={house.name} className="h-72 w-full object-cover sm:h-96" data-bot="house-photo" />
            <figcaption className="px-1 pt-3 text-xs text-[var(--uml-muted)]">{house.photo.caption}</figcaption>
          </figure>
        )}
        <p className="uml-kicker mt-8">{house.id}</p>
        <h1 className="font-display text-5xl">{house.name}</h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--uml-muted)]">{house.title}</p>
        <div className="mt-8">
          <GuideDesk
            house={house.id}
            stay={checkIn && checkOut ? { checkIn, checkOut, guests: guestCount ?? null, children: childCount } : null}
          />
        </div>
        <HouseManual house={house.id} checkIn={checkIn} checkOut={checkOut} guests={guestCount ?? null} children={childCount} />
        <HouseDays house={house.id} where="house" />
        <ArriveReady house={house.id} where="house" />
        <p className="mt-4 text-sm" data-bot="house-quiet-now">
          {quietNow(house.id, denverHour())}
        </p>
        {house.opening && <p className="mt-2 text-sm">{house.opening}</p>}
        <p className="mt-4 text-sm">
          <a href={house.map} data-bot="house-map">
            {house.address}
          </a>
        </p>
        <ul className="mt-6 space-y-1 text-sm" data-bot="house-aside">
          {housePageAside(
            house.id,
            denverToday(),
            calendar === 'ready'
              ? { checkIn, checkOut, taken: taken[house.id] ?? [], closed: closed[house.id] ?? [] }
              : null,
            calendar === 'ready' && span.both
              ? ({ guests: guestCount ?? null, children: childCount, taken, closed } satisfies HouseAsideParty)
              : null,
          ).map((line) => (
            <li key={line} data-bot="house-aside-line">
              {line}
            </li>
          ))}
        </ul>
        <ul className="mt-6 space-y-1 text-sm" data-bot="house-booking-rules">
          {bookingRules(house.id).map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>
        <ul className="mt-6 space-y-1 text-sm" data-bot="house-facts">
          {house.facts.map((fact) => (
            <li key={fact}>{fact}</li>
          ))}
        </ul>
        {house.notes.length > 0 && (
          <div className="mt-6 space-y-3">
            {house.notes.map((note) => (
              <p key={note.title} className="text-sm">
                <span className="uml-kicker">{note.title}</span> {note.body}
              </p>
            ))}
          </div>
        )}
        <ul className="mt-6 space-y-2 text-sm" data-bot="house-rules">
          {house.rules.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>
        {houseSafetyLine() ? (
          <p className="mt-3 text-sm" data-bot="house-safety">
            {houseSafetyLine()}
          </p>
        ) : null}
        {houseLicenseLine() ? (
          <p className="mt-3 text-sm" data-bot="house-license">
            {houseLicenseLine()}
          </p>
        ) : null}
        {house.nearby.map((group) => (
          <section key={group.kind} className="mt-8">
            <p className="uml-kicker">{group.label}</p>
            <ul className="mt-2 space-y-2 text-sm">
              {group.places.map((place) => (
                <li key={place.name}>
                  <a href={place.href}>{place.name}</a>
                  {place.site ? ` · ${place.site}` : ''} — {place.note}
                </li>
              ))}
            </ul>
          </section>
        ))}
        <p className="mt-8 text-sm">{house.emergency}</p>
        <div className="mt-8" data-bot="house-dates">
          <div className="mb-3 flex flex-wrap items-end gap-3 text-sm" data-bot="house-party-edit">
            <label>
              Guests
              <input
                type="number"
                min={1}
                value={guests}
                onChange={(event) => setGuests(event.target.value)}
                className="ml-2 w-20 rounded-full border border-[var(--uml-line)] bg-transparent px-3 py-1"
                data-bot="house-guests"
              />
            </label>
            <label>
              Children
              <input
                type="number"
                min={0}
                value={children}
                onChange={(event) => setChildren(event.target.value)}
                className="ml-2 w-20 rounded-full border border-[var(--uml-line)] bg-transparent px-3 py-1"
                data-bot="house-children"
              />
            </label>
            <p className="w-full text-sm" data-bot="house-party-note">
              Changing the party does not hold the dates. Nothing is sent.
            </p>
          </div>
          {partyLine ? (
            <p className="mb-3 text-sm" data-bot="house-party">
              {partyLine}
            </p>
          ) : null}
          {span.both && (
            <p className="mt-4 text-sm" data-bot="house-both-month">
              {bothHouseMonthNote()}
            </p>
          )}
          <StayYear
            house={house.id}
            rulesHouse={span.house}
            taken={span.taken}
            closed={span.closed}
            calendar={calendar}
            activeMonth={cardMonth}
            onMonth={setCardMonth}
          />
          <RateCardMonth
            house={span.house}
            checkIn={checkIn}
            checkOut={checkOut}
            quoted={quotedStayPaint(quote.label, quote.booked) && !(quote.shortened && quote.label === 'See both houses')}
            taken={calendar === 'ready' ? span.taken : null}
            closed={calendar === 'ready' ? span.closed : null}
            pace={houseMonthPace(house.id, guests, children, calendar, paceMap?.[house.id] ?? null)}
            shownMonth={cardMonth}
            onShownMonth={setCardMonth}
            onPick={(stay) => {
              setCheckIn(stay.checkIn);
              setCheckOut(stay.checkOut);
            }}
          />
          {dateHold ? (
            <p className="mt-3 text-sm" data-bot="house-date-hold">
              {dateHold}
            </p>
          ) : null}
          {countdown ? (
            <p className="mt-3 text-sm" data-bot="house-countdown">
              {countdown}
            </p>
          ) : null}
          {dateLink ? (
            <p className="mt-3 text-sm" data-bot="house-date-link">
              {dateLink}
            </p>
          ) : null}
          {rhythm.length > 0 ? (
            <div className="mt-4" data-bot="house-page-rhythm">
              <ul className="space-y-1 text-sm">
                {rhythm.map((line, index) => (
                  <li key={`rhythm-${index}`} data-bot="house-page-rhythm-line">
                    {line}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-sm" data-bot="house-page-rhythm-note">
                This does not say the house is open. Nothing is sent.
              </p>
            </div>
          ) : null}
          {ownRule ? (
            <p className="mt-4 text-sm" data-bot="house-stay-rule">
              {ownRule.line}
            </p>
          ) : null}
          {shortFix ? (
            <p className="mt-4 text-sm" data-bot="house-published-short">
              {shortFix.line}{' '}
              <a href={shortFix.href} data-bot="house-published-short-link">
                Those dates on this page. This link does not hold the dates.
              </a>
            </p>
          ) : null}
          {otherRules.length > 0 ? (
            <div className="mt-4 text-sm" data-bot="house-other-rules">
              <p data-bot="house-other-rules-note">
                Other houses that fail a published night rule for these dates. A house that meets the rule is left off. This does not say a
                house is open. Nothing is sent.
              </p>
              <ul className="mt-2 space-y-1">
                {otherRules.map((row) => (
                  <li key={row.house} data-bot="house-other-rule">
                    {row.line}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
        {pendingQuote ? (
          <span
            data-bot="house-quote"
            data-short="no"
            data-booked="no"
            data-quoted="no"
            className="mt-6 inline-block rounded-full border border-[var(--uml-line)] px-5 py-3 text-xs uppercase tracking-[0.16em]"
          >
            {pendingQuote.label}
          </span>
        ) : (
          <a
            href={quoteHref}
            data-bot="house-quote"
            data-short={quote.shortened ? 'yes' : 'no'}
            data-booked={quote.booked ? 'yes' : 'no'}
            data-quoted={quotedStayPaint(quote.label, quote.booked) ? 'yes' : 'no'}
            className={`mt-6 inline-block rounded-full px-5 py-3 text-xs uppercase tracking-[0.16em] ${
              quotedStayPaint(quote.label, quote.booked)
                ? 'bg-[var(--uml-gold)] text-[var(--uml-gold-ink)]'
                : 'border border-[var(--uml-line)]'
            }`}
          >
            {quoteLabel}
          </a>
        )}
        <p className="mt-3 text-xs text-[var(--uml-muted)]" data-bot="house-quote-note">
          {pendingQuote?.caption ?? houseQuoteCaption(quote.label, quote.booked, quote.shortened)}
        </p>
        {nextStay ? (
          <p className="mt-3 text-sm" data-bot="house-next-stay">
            {nextStay}
          </p>
        ) : null}
      </div>
    </div>
  );
}
