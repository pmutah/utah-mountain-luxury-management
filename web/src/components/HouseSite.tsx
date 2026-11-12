import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { BrandMark } from './BrandMark';
import { HousePage as HouseListing } from './HouseListing';
import { GuideDesk } from './GuideDesk';
import { CanyonConditionsBar } from './CanyonConditionsBar';
import { DirectBookingPromises } from './DirectBookingPromises';
import { HouseCompareMatrix } from './HouseCompareMatrix';
import { loadQuoteCalendar } from '../lib/booked-nights';
import { applyPublicShare, GROUP_TRIP, groupQuoteLink, groupQuotePending, groupQuoteUnread, housePageHref, housePageSearch, parseHousePath, publicHouse, publicHouses, publicShare } from '../lib/house-page';
import { cardAmenities, houseFacts, houseProfile } from '../lib/house-catalog';
import { houseGallery } from '../lib/house-photos';
import { heldSearchLines, houseCardLines, houseRhythms, partyFitList, searchHouses, shortestFixLines, stayRuleLines } from '../lib/house-search';
import { eventPlanCompare } from '../lib/event-plan';
import { openingStay } from '../lib/booking-open';
import { denverToday } from '../lib/market/dates';
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
        <a className="mt-4 inline-block underline" href="/houses/" data-bot="houses-missing">
          All houses
        </a>
      </div>
    );
  }
  return <HouseListing house={publicHouse(which)} />;
}

/**
 * The house list.
 *
 * Rebuilt as three large photo cards, because this page is the first thing a guest sees and it used to open
 * with a paragraph of booking policy, an ask-the-guide box, and six stacked text panels before any picture.
 * The cards carry the pictures, the size of the house, and the three or four amenities that decide a booking.
 *
 * The date search stays — it is the one thing on a list page that saves a guest a step — but it sits under the
 * cards as a compact bar, and its results annotate the cards rather than replacing them.
 */
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
  const dated = housePageSearch(stay.checkIn, stay.checkOut);
  const cardNote = dated ? 'These house links keep the dates. They do not hold them. Nothing is charged yet.' : '';
  useEffect(() => applyPublicShare(share), [share.title, share.description, share.url]);

  return (
    <div className="min-h-screen" data-bot="houses-index">
      <p className="sr-only" data-bot="page-share">{share.title}</p>

      <header className="border-b border-white/10">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <a href="/houses/" className="flex items-center gap-2">
            <BrandMark />
            <span className="font-display text-xl">Utah Mountain Luxury</span>
          </a>
          <nav aria-label="Explore sections" className="hidden items-center gap-4 text-xs uppercase tracking-[0.15em] text-[var(--uml-muted)] md:flex">
            <a href="#houses-grid" className="hover:text-[var(--uml-ink)] transition-colors">Houses</a>
            <a href="#live-canyon" className="hover:text-[var(--uml-ink)] transition-colors">Live Canyon</a>
            <a href="#check-dates" className="hover:text-[var(--uml-ink)] transition-colors">Dates</a>
            <a href="#compare-houses" className="hover:text-[var(--uml-ink)] transition-colors">Compare</a>
            <a href="#ask-guide" className="hover:text-[var(--uml-ink)] transition-colors">Guide</a>
          </nav>
          <p className="hidden text-xs uppercase tracking-[0.16em] text-[var(--uml-muted)] sm:block">
            Book direct · Provo Canyon &amp; Utah Valley
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 pb-20 pt-8 sm:px-6">
        <h1 className="max-w-3xl font-display text-4xl leading-tight sm:text-6xl">
          Three houses for the people you travel with.
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-[var(--uml-muted)] sm:text-base">
          A riverside lodge in Provo Canyon, a group house with a game room in Lindon, and a family home across from the
          Lindon Aquatics Center. Book direct — no platform fee, and a person answers.
        </p>

        {/* The cards. One per house, picture first. */}
        <div id="houses-grid" className="mt-8 scroll-mt-20 grid gap-6 lg:grid-cols-3">
          {houses.map((house) => {
            const profile = houseProfile(house.id);
            const facts = houseFacts(house.id);
            const photos = houseGallery(house.id);
            const status = cardLines.find((row) => row.house === house.id);
            const hold = held.find((row) => row.house === house.id);
            return (
              <a
                key={house.id}
                href={housePageHref(house.id, stay.checkIn, stay.checkOut, stay.guests, stay.children)}
                data-bot={`houses-card-${house.id}`}
                className="group uml-panel flex flex-col overflow-hidden rounded-3xl transition hover:-translate-y-0.5"
              >
                <div className="relative overflow-hidden">
                  <img
                    src={photos[0]?.src ?? house.photo.src}
                    alt={house.name}
                    className="h-56 w-full object-cover transition duration-500 group-hover:scale-[1.03]"
                    loading={house.id === 'river' ? 'eager' : 'lazy'}
                  />
                  {photos[0]?.caption ? (
                    <figcaption
                      className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-4 pb-2 pt-8 text-[11px] text-white/85"
                      data-bot="houses-card-caption"
                      data-house={house.id}
                    >
                      {photos[0].caption}
                    </figcaption>
                  ) : null}
                  <span className="absolute right-3 top-3 rounded-full bg-black/55 px-2.5 py-1 text-[10px] uppercase tracking-[0.12em] text-white/85">
                    {photos.length} photos
                  </span>
                </div>
                <div className="flex flex-1 flex-col px-5 py-4">
                  <p className="font-display text-3xl leading-tight">{house.name.replace('The ', '')}</p>
                  <p className="mt-1 text-xs text-[var(--uml-muted)]">{profile.tagline}</p>
                  <ul className="mt-3 flex flex-wrap gap-1.5" data-bot="houses-card-amenities" data-house={house.id}>
                    {cardAmenities(house.id).map((item) => (
                      <li key={item} className="rounded-full border border-[var(--uml-line)] px-2.5 py-1 text-[11px]">
                        {item}
                      </li>
                    ))}
                  </ul>
                  <ul className="mt-3 space-y-0.5 text-xs text-[var(--uml-muted)]" data-bot="houses-card-facts" data-house={house.id}>
                    {facts.slice(0, 3).map((fact) => (
                      <li key={fact.label} data-bot="houses-card-fact">
                        {fact.label} {fact.value}
                      </li>
                    ))}
                  </ul>
                  {status?.line ? (
                    <p className="mt-3 text-sm" data-bot="houses-card-status" data-house={house.id}>
                      {status.line}
                    </p>
                  ) : hold?.line ? (
                    <p className="mt-3 text-sm" data-bot="houses-card-held" data-house={house.id}>
                      {hold.line}
                    </p>
                  ) : null}
                  <span className="mt-auto inline-block pt-4 text-xs uppercase tracking-[0.16em] text-[var(--uml-gold)]" data-bot="houses-card-cta">
                    View the house →
                  </span>
                </div>
              </a>
            );
          })}
        </div>

        {cardNote ? (
          <p className="mt-4 text-sm" data-bot="houses-card-note">
            {cardNote}
          </p>
        ) : null}

        <DirectBookingPromises />

        <div id="live-canyon" className="mt-8 scroll-mt-20">
          <CanyonConditionsBar targetDate={stay.checkIn} />
        </div>

        {/* The date search, compact. It annotates the cards above instead of leading the page. */}
        <section id="check-dates" className="mt-10 scroll-mt-20" data-bot="houses-search-wrap">
          <h2 className="font-display text-2xl">Have dates in mind?</h2>
          <p className="mt-1 text-sm text-[var(--uml-muted)]">
            Enter them here and each house above will say whether it fits.
          </p>
          <HouseFinder onStay={setStay} onHeld={setHeld} onCards={setCardLines} onCalendar={onListCalendar} onNights={onGroupNights} />
        </section>

        <div id="compare-houses" className="scroll-mt-20">
          <HouseCompareMatrix
            checkIn={stay.checkIn}
            checkOut={stay.checkOut}
            guests={stay.guests}
            childrenCount={stay.children}
          />
        </div>

        <section className="uml-panel mt-10 rounded-3xl px-6 py-5" data-bot="houses-group">
          <p className="uml-kicker">Bringing both sides of the family</p>
          <p className="mt-2 max-w-2xl text-sm">{GROUP_TRIP}</p>
          {listCalendar === 'loading' ? (
            <span className="mt-4 inline-block" data-bot="houses-group-quote" data-quoted="no">
              {groupQuotePending().label}
            </span>
          ) : group ? (
            <a
              className="uml-gold-btn mt-4 inline-block rounded-full px-5 py-3 text-xs uppercase tracking-[0.16em]"
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

        <section id="ask-guide" className="mt-10 scroll-mt-20" data-bot="houses-guide">
          <GuideDesk
            stay={
              stay.checkIn && stay.checkOut
                ? { checkIn: stay.checkIn, checkOut: stay.checkOut, guests: groupGuests ?? null, children: groupChildren }
                : null
            }
          />
        </section>
      </div>

      <footer className="border-t border-white/10 px-4 py-6 sm:px-6" data-bot="houses-footer">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 text-xs text-[var(--uml-muted)]">
          <nav aria-label="House policies" className="flex gap-3">
            <a href="/terms" data-bot="houses-terms" className="underline">Terms</a>
            <a href="/privacy" data-bot="houses-privacy" className="underline">Privacy</a>
            <a href="/accessibility" data-bot="houses-accessibility" className="underline">Accessibility</a>
          </nav>
          <p>Questions go to utahmountainluxury@gmail.com.</p>
        </div>
      </footer>
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
    window.history.replaceState(null, '', query ? `/houses/?${query}` : '/houses/');
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
    <form className="uml-panel mt-4 rounded-3xl px-5 py-4" data-bot="houses-search" onSubmit={ask}>
      <div className="flex flex-wrap items-end gap-3 text-sm">
        <label className="text-[11px] uppercase tracking-[0.12em] text-[var(--uml-muted)]">
          Check-in
          <input
            type="date"
            required
            value={checkIn}
            onChange={(event) => setCheckIn(event.target.value)}
            className="mt-1 rounded-xl border border-[var(--uml-line)] bg-transparent px-3 py-2 text-sm text-[var(--uml-ink)]"
            data-bot="houses-search-in"
          />
        </label>
        <label className="text-[11px] uppercase tracking-[0.12em] text-[var(--uml-muted)]">
          Check-out
          <input
            type="date"
            required
            value={checkOut}
            onChange={(event) => setCheckOut(event.target.value)}
            className="mt-1 rounded-xl border border-[var(--uml-line)] bg-transparent px-3 py-2 text-sm text-[var(--uml-ink)]"
            data-bot="houses-search-out"
          />
        </label>
        <label className="text-[11px] uppercase tracking-[0.12em] text-[var(--uml-muted)]">
          Guests
          <input
            type="number"
            min={1}
            required
            value={guests}
            onChange={(event) => setGuests(event.target.value)}
            className="mt-1 w-20 rounded-xl border border-[var(--uml-line)] bg-transparent px-3 py-2 text-sm"
            data-bot="houses-search-guests"
          />
        </label>
        <label className="text-[11px] uppercase tracking-[0.12em] text-[var(--uml-muted)]">
          Children
          <input
            type="number"
            min={0}
            value={children}
            onChange={(event) => setChildren(event.target.value)}
            className="mt-1 w-20 rounded-xl border border-[var(--uml-line)] bg-transparent px-3 py-2 text-sm"
            data-bot="houses-search-children"
          />
        </label>
        <button type="submit" className="uml-gold-btn rounded-full px-4 py-2.5 text-[11px] uppercase tracking-[0.14em]" data-bot="houses-search-submit">
          Check these dates
        </button>
      </div>
      {asked && calendar === 'loading' && <p className="mt-3 text-sm">Reading the calendar.</p>}
      {calendar !== 'loading' && (
        <div className="mt-3 space-y-2 text-sm" data-bot="houses-event-plan" data-calendar={calendar}>
          <p data-bot="houses-event-note">
            {calendar === 'ready'
              ? 'Upcoming events. A booked start is named and is not linked.'
              : 'Upcoming events at each house. This does not say a house is open.'}
          </p>
          {eventPlanCompare(denverToday(), calendar === 'ready' ? { taken, closed } : undefined).map((row) => (
            <div key={row.label} data-bot="houses-event-row">
              <p>{row.label}</p>
              {row.houses.map((house) => (
                <p key={house.house} data-bot="houses-event-house" data-house={house.house}>
                  {house.absent ? (
                    `${house.name} is not on this event.`
                  ) : house.hold ? (
                    `${house.name}: ${house.hold}`
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
        <p className="mt-3 text-sm" data-bot="houses-search-unread">
          The calendar could not be read. This page will not say a house is open.
        </p>
      )}
      {fit && fit.rows.length > 0 && (
        <div className="mt-3 space-y-1 text-sm" data-bot="houses-search-fit">
          {fit.rows.map((row) => (
            <p key={row.house} data-bot="houses-fit-row" data-house={row.house} data-fits={row.fits ? 'yes' : 'no'}>
              {row.line}
            </p>
          ))}
          {fit.together && <p data-bot="houses-fit-together">{fit.together}</p>}
        </div>
      )}
      {rules.length > 0 && (
        <div className="mt-3 space-y-1 text-sm" data-bot="houses-search-rules">
          {rules.map((row) => (
            <p key={row.house} data-bot="houses-rule-row" data-house={row.house}>
              {row.line}
            </p>
          ))}
        </div>
      )}
      {fixes.length > 0 && (
        <div className="mt-3 space-y-2 text-sm" data-bot="houses-search-short">
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
        <div className="mt-3 space-y-3 text-sm" data-bot="houses-search-rhythm">
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
        <div className="mt-3 space-y-1 text-sm" data-bot="houses-search-held">
          {held.map((row) => (
            <p key={row.house} data-bot="houses-held-row" data-house={row.house}>
              {row.line}
            </p>
          ))}
        </div>
      )}
      {asked && calendar === 'ready' && guestCount === null && <p className="mt-3 text-sm">Add the number of overnight guests.</p>}
      {result && (
        <div className="mt-3 space-y-2 text-sm">
          {result.event && <p data-bot="houses-search-event">{result.event}</p>}
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
