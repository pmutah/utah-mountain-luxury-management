import { useEffect, useMemo, useRef, useState } from 'react';
import { quoteStay } from '../lib/quote';
import { formatWhole } from '../lib/luxury';
import { BrandMark } from './BrandMark';
import { HouseGallery } from './HouseGallery';
import { HouseAmenities, HouseHighlights, HouseRooms } from './HouseStory';
import { HouseFloorLayout } from './HouseFloorLayout';
import { GroupRoomPlanner } from './GroupRoomPlanner';
import { DirectReserveCard } from './DirectReserveCard';
import { StayMonth } from './StayMonth';
import { HouseReviews, HouseFaq } from './HouseSocialProof';
import { GuestThemeToggle } from './GuestThemeToggle';
import { CanyonPocketMap } from './CanyonPocketMap';
import { CanyonConditionsBar } from './CanyonConditionsBar';
import { UtahItineraryStudio } from './UtahItineraryStudio';
import { RiverWingMap } from './RiverWingMap';
import { OpenDatesFinder } from './OpenDatesFinder';
import { loadQuoteCalendar, type PublicUnit } from '../lib/booked-nights';
import { applyPublicShare, GROUP_TRIP, housePageSearch, publicShare, readHouseDates, readHouseParty, type PublicHouse } from '../lib/house-page';
import { readStayLink } from '../lib/stay-link';
import { houseProfile, houseFacts } from '../lib/house-catalog';
import { houseGallery } from '../lib/house-photos';
import { bookingRules } from '../lib/booking-rules';
import { houseExtraSchema, houseSafetyLine, houseLicenseLine } from '../lib/house-page';
import { houseRules } from '../lib/house-rules';
import { partyFits } from '../lib/house-stay';
import { bothHouseMonthNote, housePageCalendar } from '../lib/compound';
import { openingStay } from '../lib/booking-open';
import { denverToday } from '../lib/market/dates';
import type { RiverUnitId } from '../lib/river-units';
import type { UpsellId } from '../lib/upsells';
import type { YearPace } from '../lib/market/fill';
import type { HouseId } from '../lib/market/types';

const EMPTY_NIGHTS: Record<HouseId, string[]> = { ranch: [], lindon: [], river: [] };
const EMPTY_LIST: string[] = [];
const EMPTY_APPROVED: Record<HouseId, Array<{ date: string; guest: number }>> = { ranch: [], lindon: [], river: [] };
/** The switcher's labels. Short enough to sit three-wide on a phone beside the Reserve button. */
const HOUSES: HouseId[] = ['river', 'ranch', 'lindon'];
const SHORT_NAME: Record<HouseId, string> = { river: 'River', ranch: 'Ranch', lindon: 'Lindon' };

/**
 * A house as a guest sees it: pictures first, then what the house is, then the booking card.
 *
 * This is deliberately one screen wide — Airbnb and VRBO both put the photos and the price beside each other
 * because that is how a guest decides. The old page stacked a photo, a searchable guide, a pre-arrival
 * checklist, a message timeline, and a separate quote page; a guest had to leave the house they liked to see
 * a price. Now the price sits on the page, and the extra material lives where it belongs: the guest app after
 * booking, and the printable guide for a stay already confirmed.
 */
export function HousePage({ house }: { house: PublicHouse }) {
  /*
   * A shared quote link can carry more than dates: the add-ons that were checked, an arrival time, a later checkout,
   * and whether the stay is a party. `/book/?house=…` links already sent by email, the gap-fill studio, and the group
   * quote all use those keys, so the listing reads them with the same parser rather than a second hand-written one.
   */
  const link = readStayLink(typeof window === 'undefined' ? '' : window.location.search);
  const opened = readHouseDates(typeof window === 'undefined' ? '' : window.location.search);
  const party = readHouseParty(typeof window === 'undefined' ? '' : window.location.search);
  const today = denverToday();
  const linkedStay = opened.checkIn !== '' && opened.checkOut !== '';
  const seed = openingStay(house.id, today);
  const [checkIn, setCheckIn] = useState(linkedStay ? opened.checkIn : seed.checkIn);
  const [checkOut, setCheckOut] = useState(linkedStay ? opened.checkOut : seed.checkOut);
  const checkInNow = useRef(checkIn);
  const checkOutNow = useRef(checkOut);
  checkInNow.current = checkIn;
  checkOutNow.current = checkOut;
  const [guests, setGuests] = useState(party.guests);
  const [children, setChildren] = useState(party.children);
  const [dogs, setDogs] = useState('');
  const [addons, setAddons] = useState<UpsellId[]>(link.addons ?? []);
  const [arrival, setArrival] = useState<string | null>(link.arrive ?? null);
  const [departure, setDeparture] = useState<string | null>(link.leave ?? null);
  const [eventStay, setEventStay] = useState(link.event === true);
  const [calendar, setCalendar] = useState<'loading' | 'live' | 'off'>('loading');
  const [taken, setTaken] = useState(EMPTY_NIGHTS);
  const [closed, setClosed] = useState(EMPTY_NIGHTS);
  /*
   * Nights another guest is finishing a request for. They are not booked, but they are also not this guest's to ask
   * for: `POST /api/book` refuses them with a 409 while the hold lives. The rebuilt page dropped this list, so a held
   * night rendered as free and the guest only found out after filling in the form — the same defect the calendar's own
   * `held` field exists to prevent.
   */
  const [held, setHeld] = useState(EMPTY_NIGHTS);
  const [approved, setApproved] = useState(EMPTY_APPROVED);
  const [paceMap, setPaceMap] = useState<Record<HouseId, YearPace>>({ ranch: 'unknown', lindon: 'unknown', river: 'unknown' });
  const [units, setUnits] = useState<PublicUnit[] | null | undefined>(undefined);
  const [chosenParts, setChosenParts] = useState<RiverUnitId[]>([]);

  useEffect(() => {
    if (house.id !== 'river') setChosenParts([]);
  }, [house.id]);

  useEffect(() => {
    let cancel = false;
    loadQuoteCalendar()
      .then((result) => {
        if (cancel) return;
        if (!result) {
          setUnits(null);
          setCalendar('off');
          return;
        }
        setTaken(result.nights);
        setClosed(result.closed);
        setHeld(result.held);
        setApproved(result.approved ?? EMPTY_APPROVED);
        setPaceMap(result.pace);
        setUnits(result.units ?? null);
        setCalendar('live');
        if (!linkedStay && checkInNow.current === seed.checkIn && checkOutNow.current === seed.checkOut) {
          const next = openingStay(house.id, today, result.nights[house.id] ?? [], result.closed[house.id] ?? []);
          if (next.checkIn !== checkInNow.current || next.checkOut !== checkOutNow.current) {
            setCheckIn(next.checkIn);
            setCheckOut(next.checkOut);
          }
        }
      })
      .catch(() => {
        if (!cancel) {
          setUnits(null);
          setCalendar('off');
        }
      });
    return () => {
      cancel = true;
    };
  }, []);

  const pageSearch = housePageSearch(checkIn, checkOut, guests, children);
  const share = publicShare(house.id);
  const profile = houseProfile(house.id);
  const facts = houseFacts(house.id);
  const photoCount = houseGallery(house.id).length;
  const guestCount = /^\d+$/.test(guests) ? Number(guests) : null;
  const childCount = /^\d+$/.test(children) ? Number(children) : null;
  const dogCount = /^\d+$/.test(dogs) ? Number(dogs) : null;
  const mobileQuote = useMemo(() => {
    if (calendar !== 'live' || chosenParts.length > 0) return null;
    const quoted = quoteStay(house.id, checkIn, checkOut, taken[house.id] ?? [], {
      asOf: today,
      pace: paceMap[house.id] ?? 'unknown',
      closed: [...(closed[house.id] ?? []), ...(held[house.id] ?? [])],
      sheet: approved[house.id] ?? [],
      ...(guestCount !== null ? { guests: guestCount, ...(childCount !== null ? { children: childCount } : {}) } : {}),
      ...(dogCount !== null ? { dogs: dogCount } : {}),
    });
    return quoted.ok ? quoted.stayTotal : null;
  }, [calendar, chosenParts.length, house.id, checkIn, checkOut, taken, today, paceMap, closed, held, approved, guestCount, childCount, dogCount]);
  const finderBlocked = useMemo(
    () => [...(closed[house.id] ?? []), ...(held[house.id] ?? [])],
    [closed, held, house.id],
  );

  useEffect(() => applyPublicShare(pageSearch ? { ...share, url: `${share.url}${pageSearch}` } : share), [share.title, share.description, share.url, pageSearch]);
  useEffect(() => {
    /*
     * Keep the address in step with the stay, and keep everything the address already said.
     *
     * This used to replace the whole query with just the dates, which on `/book/?house=ranch` **dropped the house** — so
     * reloading a Ranch quote silently showed the River House, and a link copied from the address bar pointed at the
     * wrong house. On a house page it left a bare `?in=…` query on a path that does not read one.
     *
     * The dates are merged into the existing parameters instead of replacing them, and the house key is written only on
     * `/book/`, which is the one page that reads it.
     */
    const params = new URLSearchParams(window.location.search);
    const stay = new URLSearchParams(pageSearch.startsWith('?') ? pageSearch.slice(1) : pageSearch);
    for (const key of ['in', 'out', 'guests', 'children']) {
      const value = stay.get(key);
      if (value) params.set(key, value);
      else params.delete(key);
    }
    const onBookPath = window.location.pathname === '/book' || window.location.pathname.startsWith('/book/');
    if (onBookPath) params.set('house', house.id);
    const query = params.toString();
    const next = `${window.location.pathname}${query ? `?${query}` : ''}`;
    if (`${window.location.pathname}${window.location.search}` === next) return;
    window.history.replaceState(null, '', next);
  }, [pageSearch, house.id]);

  const rules = useMemo(() => houseRules(house.id), [house.id]);
  const safety = houseSafetyLine();
  const license = houseLicenseLine();
  const [activeSection, setActiveSection] = useState<string>('photos');
  const [reserveSheet, setReserveSheet] = useState(false);

  useEffect(() => {
    const ids = ['photos', 'rooms', 'amenities', 'canyon', 'itinerary', 'faq', 'availability'];
    const onScroll = () => {
      const offset = window.scrollY + 140;
      let current = 'photos';
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el && el.offsetTop <= offset) current = id;
      }
      setActiveSection(current);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="min-h-screen" data-bot="house-page" data-house={house.id}>
      <p className="sr-only" data-bot="page-share">{share.title}</p>
      <script type="application/ld+json" data-bot="house-schema" dangerouslySetInnerHTML={{ __html: JSON.stringify(house.schema) }} />
      {houseExtraSchema(house.id).map((schema) => (
        <script
          key={String(schema['@type'])}
          type="application/ld+json"
          data-bot={`house-schema-${String(schema['@type']).toLowerCase()}`}
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
        />
      ))}

      {/* A slim header, not a hero: the photo mosaic is the hero. */}
      <header className="sticky top-0 z-30 border-b border-[var(--uml-line)] bg-[color-mix(in_srgb,var(--uml-bg)_94%,transparent)] text-[var(--uml-ink)] backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 py-3 sm:px-6">
          <div className="flex items-center justify-between gap-2">
          <a href="/houses/" className="flex min-w-0 items-center gap-2 text-sm" data-bot="house-back">
            <BrandMark />
            <span className="hidden sm:inline">All houses</span>
          </a>
          <div className="flex shrink-0 items-center gap-2">
          <GuestThemeToggle />
          <a
            href="#dates"
            className="uml-gold-btn rounded-full px-4 py-2 text-[11px] uppercase tracking-[0.14em]"
            data-bot="house-reserve-jump"
            onClick={(event) => {
              if (window.matchMedia('(max-width: 1023px)').matches) {
                event.preventDefault();
                setReserveSheet(true);
              }
            }}
          >
            Reserve
          </a>
          </div>
          </div>
          {/*
            The house switcher. It matters most on `/book/`, which is where every shared quote link lands: a guest sent
            a River quote may be deciding between all three, and before this the only way to look at another house was
            to go back to the list and lose their dates. The links carry the stay, so switching houses keeps it.
          */}
          <nav className="mt-2 flex items-center gap-1 overflow-x-auto" aria-label="Switch house" data-bot="house-switcher">
            {HOUSES.map((id) => (
              <a
                key={id}
                href={`/houses/${id}/${housePageSearch(checkIn, checkOut, guests, children)}`}
                aria-current={id === house.id ? 'page' : undefined}
                data-bot={`house-switch-${id}`}
                className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] uppercase tracking-[0.1em] ${
                  id === house.id
                    ? 'bg-[var(--uml-gold)] text-[var(--uml-gold-ink)]'
                    : 'border border-[var(--uml-line)] text-[var(--uml-muted)] hover:text-[var(--uml-ink)]'
                }`}
              >
                {SHORT_NAME[id]}
              </a>
            ))}
          </nav>
          <nav className="mt-2 hidden items-center gap-3 overflow-x-auto text-xs uppercase tracking-[0.14em] text-[var(--uml-muted)] lg:flex" aria-label="Listing sections">
            {(
              [
                ['photos', 'Photos'],
                ['rooms', 'Rooms'],
                ['amenities', 'Amenities'],
                ['canyon', 'Canyon & Map'],
                ['itinerary', 'Itinerary'],
                ['faq', 'FAQ'],
                ['availability', 'Dates'],
              ] as const
            ).map(([id, label]) => (
              <a
                key={id}
                href={`#${id}`}
                className={`transition-colors hover:text-[var(--uml-ink)] ${
                  activeSection === id ? 'text-[var(--uml-gold)] font-semibold' : ''
                }`}
              >
                {label}
              </a>
            ))}
          </nav>
        </div>
      </header>
      <nav
        className="sticky top-[88px] z-20 flex gap-3 overflow-x-auto border-b border-[var(--uml-line)] bg-[color-mix(in_srgb,var(--uml-bg)_94%,transparent)] px-4 py-2 text-[11px] uppercase tracking-[0.14em] text-[var(--uml-muted)] backdrop-blur lg:hidden"
        aria-label="Listing sections"
        data-bot="house-section-jump"
      >
        {(
          [
            ['photos', 'Photos'],
            ['rooms', 'Rooms'],
            ['amenities', 'Amenities'],
            ['availability', 'Dates'],
            ['faq', 'FAQ'],
          ] as const
        ).map(([id, label]) => (
          <a key={id} href={`#${id}`} className="shrink-0">
            {label}
          </a>
        ))}
      </nav>

      {/*
        A phone bar. On a narrow screen the booking card sits far below the photos, and the header's Reserve button
        scrolls away with the header. This keeps the way to book reachable while a guest reads the rooms.
        The figure is the same whole-house quote the card uses, and only when the calendar is live and no River part
        is chosen — a part stay must not be shown the house total. The bar hides while the reserve sheet is open so
        it does not cover the request button.
      */}
      <div
        className={`fixed inset-x-0 bottom-0 z-40 items-center justify-between gap-3 border-t border-[var(--uml-line)] bg-[color-mix(in_srgb,var(--uml-bg)_94%,transparent)] px-4 py-3 text-[var(--uml-ink)] backdrop-blur lg:hidden ${
          reserveSheet ? 'hidden' : 'flex'
        }`}
        data-bot="house-mobile-bar"
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">
            {mobileQuote !== null ? formatWhole(mobileQuote) : house.name}
          </p>
          <p className="text-[11px] text-[var(--uml-muted)]">
            {checkIn && checkOut
              ? `${checkIn} – ${checkOut}${chosenParts.length > 0 ? ' · part of the house' : ''}`
              : `Sleeps ${house.sleeps}`}
          </p>
        </div>
        <button
          type="button"
          className="uml-gold-btn shrink-0 rounded-full px-5 py-2.5 text-[11px] uppercase tracking-[0.14em]"
          data-bot="house-mobile-reserve"
          onClick={() => setReserveSheet(true)}
        >
          Reserve
        </button>
      </div>

      <div className="mx-auto max-w-6xl px-4 pb-24 pt-5 sm:px-6">
        {/* Title block, above the fold and above the pictures. */}
        <div className="mb-4">
          <h1 className="font-display text-4xl leading-tight sm:text-5xl">{house.name}</h1>
          <p className="mt-1 text-sm text-[var(--uml-muted)]">{profile.tagline}</p>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[var(--uml-muted)]">
            <span>{profile.scale}</span>
            <span aria-hidden="true">·</span>
            <a href={house.map} data-bot="house-map" className="underline">{house.address}</a>
            {photoCount > 1 ? (
              <>
                <span aria-hidden="true">·</span>
                <span data-bot="house-photo-count">{photoCount} photos</span>
              </>
            ) : null}
          </div>
        </div>

        <div id="photos" className="scroll-mt-20">
          <HouseGallery house={house.id} />
        </div>

        <div className="mt-5">
          <CanyonConditionsBar house={house.id} targetDate={checkIn} />
        </div>

        <div className="mt-6 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
          {/* The left column is the story. */}
          <div className="min-w-0">
            <section data-bot="house-facts-row" className="flex flex-wrap gap-2">
              {facts.map((fact) => (
                <span key={fact.label} className="rounded-full border border-[var(--uml-line)] px-3 py-1.5 text-xs">
                  <span className="text-[var(--uml-muted)]">{fact.label}</span> {fact.value}
                </span>
              ))}
            </section>

            <section className="mt-8" data-bot="house-highlights-wrap">
              <HouseHighlights house={house.id} />
            </section>

            <section id="availability" className="mt-8 scroll-mt-24 border-t border-white/10 pt-6" data-bot="house-availability">
              <h2 className="font-display text-3xl">Availability</h2>
              <p className="mt-1 text-sm text-[var(--uml-muted)]">
                Open stays and the month sit here. The total stays in the reserve card.
              </p>
              {calendar === 'live' && chosenParts.length === 0 && (
                <OpenDatesFinder
                  house={house.id}
                  asOf={today}
                  pace={paceMap[house.id] ?? 'unknown'}
                  taken={taken[house.id] ?? EMPTY_LIST}
                  blocked={finderBlocked}
                  guests={guestCount ?? undefined}
                  children={childCount ?? undefined}
                  checkIn={checkIn}
                  onPick={(stay) => {
                    setCheckIn(stay.checkIn);
                    setCheckOut(stay.checkOut);
                  }}
                />
              )}
              <div className="uml-panel mt-4 rounded-3xl p-5" data-bot="house-pick-dates">
                <p className="uml-kicker">Pick from the calendar</p>
                <p className="mt-1 text-xs text-[var(--uml-muted)]">
                  Prices are per night, before tax. A booked or closed night cannot start a stay.
                </p>
                {/*
                  A month drawn from an unread calendar is worse than no month: every night looks free, and a guest
                  can tap a date this page has no idea about. The panel says so instead.
                */}
                {calendar === 'live' ? (
                  (() => {
                    const closedAndHeld: Record<HouseId, string[]> = {
                      ranch: [...(closed.ranch ?? []), ...(held.ranch ?? [])],
                      lindon: [...(closed.lindon ?? []), ...(held.lindon ?? [])],
                      river: [...(closed.river ?? []), ...(held.river ?? [])],
                    };
                    const monthCal = housePageCalendar(house.id, guestCount, true, taken, closedAndHeld);
                    const bookingParts = house.id === 'river' && chosenParts.length > 0;
                    const showPrices =
                      !bookingParts &&
                      !monthCal.both &&
                      (guestCount === null || partyFits(house.id, guestCount, childCount ?? undefined).ok);
                    return (
                      <div className="mt-3">
                        <StayMonth
                          house={monthCal.house}
                          taken={monthCal.both ? monthCal.taken : taken[house.id] ?? []}
                          blocked={monthCal.both ? monthCal.closed : [...(closed[house.id] ?? []), ...(held[house.id] ?? [])]}
                          sheet={approved[monthCal.house] ?? []}
                          checkIn={checkIn}
                          checkOut={checkOut}
                          pace={paceMap[monthCal.house] ?? 'unknown'}
                          quoted
                          prices={showPrices}
                          onPick={(stay) => {
                            setCheckIn(stay.checkIn);
                            setCheckOut(stay.checkOut);
                          }}
                        />
                        {monthCal.both && (
                          <p className="mt-2 text-xs text-[var(--uml-muted)]" data-bot="house-both-month-note">
                            {bothHouseMonthNote()}
                          </p>
                        )}
                      </div>
                    );
                  })()
                ) : (
                  <p className="mt-3 text-xs text-[var(--uml-muted)]" data-bot="house-calendar-off">
                    {calendar === 'loading'
                      ? 'Reading the calendar.'
                      : 'The calendar could not be read, so no night on this page is marked open or booked. Enter your dates above and send a request — a person will confirm them.'}
                  </p>
                )}
              </div>
            </section>

            <section className="mt-8 border-t border-white/10 pt-6" data-bot="house-story">
              <h2 className="font-display text-3xl">About this house</h2>
              {profile.story.map((paragraph) => (
                <p key={paragraph.slice(0, 40)} className="mt-3 text-sm leading-relaxed text-[var(--uml-muted)]" data-bot="house-story-p">
                  {paragraph}
                </p>
              ))}
              {house.opening ? <p className="mt-3 text-sm" data-bot="house-opening">{house.opening}</p> : null}
            </section>

            <section id="rooms" className="mt-8 scroll-mt-20 border-t border-white/10 pt-6">
              <h2 className="font-display text-3xl">Where you&rsquo;ll sleep</h2>
              <p className="mt-1 text-sm text-[var(--uml-muted)]">
                Sleeps {house.sleeps}. Every room below is a real bed, not an air mattress.
              </p>
              <HouseRooms house={house.id} />
              {/*
                The rooms say how many beds; the diagram says who is near whom. A group choosing a house for three
                generations is asking the second question, and a list cannot answer it quickly.
              */}
              <div className="mt-5">
                <HouseFloorLayout house={house.id} />
              </div>
              <GroupRoomPlanner
                house={house.id}
                houseName={house.name}
                checkIn={checkIn}
                checkOut={checkOut}
                units={house.id === 'river' && chosenParts.length > 0 ? chosenParts : undefined}
              />
            </section>

            {house.id === 'river' ? (
              <section className="mt-8 border-t border-white/10 pt-6">
                <RiverWingMap
                  checkIn={checkIn}
                  checkOut={checkOut}
                  selected={chosenParts}
                  units={units === undefined ? undefined : units}
                  onChange={setChosenParts}
                />
              </section>
            ) : null}

            <section id="amenities" className="mt-8 scroll-mt-20 border-t border-white/10 pt-6">
              <h2 className="font-display text-3xl">What this house has</h2>
              <div className="mt-4">
                <HouseAmenities house={house.id} />
              </div>
            </section>

            <section id="canyon" className="mt-8 scroll-mt-20 border-t border-white/10 pt-6">
              <h2 className="font-display text-3xl">The area</h2>
              <p className="mt-2 text-sm text-[var(--uml-muted)]">{profile.setting}</p>
              <div className="mt-4">
                <CanyonPocketMap house={house.id} />
              </div>
              {house.nearby.map((group) => (
                <div key={group.kind} className="mt-5" data-bot="house-nearby">
                  <p className="uml-kicker">{group.label}</p>
                  <ul className="mt-1.5 space-y-1.5 text-sm">
                    {group.places.map((place) => (
                      <li key={place.name}>
                        <a href={place.href} className="underline">{place.name}</a>
                        {place.site ? ` · ${place.site}` : ''} — {place.note}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>

            <section id="itinerary" className="mt-8 scroll-mt-20 border-t border-white/10 pt-6">
              <UtahItineraryStudio house={house.id} houseName={house.name} checkIn={checkIn} />
            </section>

            <section className="mt-8 border-t border-white/10 pt-6" data-bot="house-rules">
              <h2 className="font-display text-3xl">House rules</h2>
              <ul className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                {rules.map((rule) => (
                  <li key={rule.id} className="flex items-start gap-2">
                    <span aria-hidden="true" className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[var(--uml-gold)]" />
                    <span>{rule.text}</span>
                  </li>
                ))}
              </ul>
              <ul className="mt-3 grid gap-2 text-sm sm:grid-cols-2" data-bot="house-booking-rules">
                {bookingRules(house.id).map((rule) => (
                  <li key={rule} className="text-[var(--uml-muted)]">{rule}</li>
                ))}
              </ul>
              {house.notes.map((note) => (
                <p key={note.title} className="mt-3 text-sm">
                  <span className="uml-kicker">{note.title}</span> {note.body}
                </p>
              ))}
              {safety ? <p className="mt-3 text-sm" data-bot="house-safety">{safety}</p> : null}
              {license ? <p className="mt-2 text-sm" data-bot="house-license">{license}</p> : null}
              <p className="mt-3 text-sm">{house.emergency}</p>
            </section>

            <HouseReviews house={house.id} />
            <div id="faq" className="scroll-mt-20">
              <HouseFaq house={house.id} />
            </div>
          </div>

          {reserveSheet ? (
            <button
              type="button"
              aria-label="Close reserve"
              className="fixed inset-0 z-40 bg-black/50 lg:hidden"
              onClick={() => setReserveSheet(false)}
            />
          ) : null}
          {/* The right column is the decision. It stays in view while the story scrolls. */}
          <aside
            id="dates"
            className={`scroll-mt-20 lg:sticky lg:top-20 ${
              reserveSheet
                ? 'max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:z-50 max-lg:max-h-[88vh] max-lg:overflow-y-auto max-lg:rounded-t-3xl max-lg:border max-lg:border-white/10 max-lg:bg-[var(--uml-bg)] max-lg:p-3 max-lg:pb-6 max-lg:shadow-2xl'
                : ''
            }`}
          >
            {reserveSheet ? (
              <button
                type="button"
                className="mb-2 text-xs uppercase tracking-[0.14em] text-[var(--uml-muted)] lg:hidden"
                onClick={() => setReserveSheet(false)}
              >
                Close
              </button>
            ) : null}
            <DirectReserveCard
              house={house.id}
              checkIn={checkIn}
              checkOut={checkOut}
              guests={guests}
              children={children}
              dogs={dogs}
              addons={addons}
              arrival={arrival}
              departure={departure}
              eventStay={eventStay}
              onCheckIn={setCheckIn}
              onCheckOut={setCheckOut}
              onGuests={setGuests}
              onChildren={setChildren}
              onDogs={setDogs}
              onAddons={setAddons}
              onArrival={setArrival}
              onDeparture={setDeparture}
              onEvent={setEventStay}
              taken={taken}
              closed={closed}
              held={held}
              approved={approved}
              pace={paceMap}
              calendar={calendar}
              units={units === undefined ? undefined : units}
              chosenParts={chosenParts}
              onChosenParts={(next) => setChosenParts(next as RiverUnitId[])}
            />
            {guestCount !== null && guestCount > 22 || childCount !== null ? (
              <p className="mt-3 text-xs text-[var(--uml-muted)]" data-bot="house-group-note">
                {GROUP_TRIP}
              </p>
            ) : null}
          </aside>
        </div>
      </div>

      <footer className="border-t border-white/10 px-4 pb-24 pt-6 sm:px-6 lg:pb-6">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 text-xs text-[var(--uml-muted)]">
          <nav aria-label="House policies" className="flex gap-3">
            <a href="/terms" data-bot="house-terms" className="underline">Terms</a>
            <a href="/privacy" data-bot="house-privacy" className="underline">Privacy</a>
            <a href="/accessibility" data-bot="house-accessibility" className="underline">Accessibility</a>
          </nav>
          <p>Questions go to utahmountainluxury@gmail.com.</p>
        </div>
      </footer>
    </div>
  );
}
