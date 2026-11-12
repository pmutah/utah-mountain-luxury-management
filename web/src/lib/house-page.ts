import { PROPERTIES } from './api';
import { compoundOffer } from './compound';
import { HOUSE_PHOTOS } from './house-photos';
import { houseStay, nearbyGroups, partyFits, SLEEPS, STAY_EMERGENCY } from './house-stay';
import { houseRules } from './house-rules';
import { LISTING_TITLE } from './listing';
import { agreementTopicLine } from './stay-agreement';
import type { HouseId } from './market/types';
import { placeHref, placeSite } from './place-link';

const ORIGIN = 'https://wilhite-portfolio.pages.dev';
const SECRET = /door\s*code|wi-?fi|password/i;
const HOUSES: HouseId[] = ['river', 'ranch', 'lindon'];

export type PublicPlace = { name: string; note: string; href: string; site: string | null };
export type PublicGroup = { kind: string; label: string; places: PublicPlace[] };

export type PublicHouse = {
  id: HouseId;
  name: string;
  title: string;
  address: string;
  map: string;
  sleeps: number;
  checkIn: string;
  checkOut: string;
  photo: { src: string; caption: string };
  facts: string[];
  notes: { title: string; body: string }[];
  rules: string[];
  nearby: PublicGroup[];
  emergency: string;
  quoteHref: string;
  pageHref: string;
  opening: string | null;
  schema: Record<string, unknown>;
};

/** A public house page from the published guide. Door codes, Wi-Fi, and prices stay off it. */
export function publicHouse(house: HouseId): PublicHouse {
  const stay = houseStay(house);
  const photo = HOUSE_PHOTOS[house] ?? { src: '', caption: '' };
  const notes = stay.notes.filter((note) => !SECRET.test(`${note.title} ${note.body}`));
  const rules = houseRules(house)
    .map((rule) => rule.text)
    .filter((text) => !SECRET.test(text));
  const facts = [
    `Sleeps ${stay.sleeps}`,
    `Check-in ${stay.checkIn}`,
    `Check-out ${stay.checkOut}`,
    stay.bedrooms,
    stay.arrival,
    stay.parking,
  ].filter((line): line is string => typeof line === 'string' && line.length > 0 && !SECRET.test(line));
  const nearby = nearbyGroups(stay.nearby)
    .map((group) => ({
      kind: group.kind,
      label: group.label,
      places: group.places
        .filter((place) => !SECRET.test(`${place.name} ${place.note}`))
        .map((place) => ({
          name: place.name,
          note: place.note,
          href: placeHref(place),
          site: placeSite(place.url),
        })),
    }))
    .filter((group) => group.places.length > 0);
  const address = PROPERTIES[house]?.address ?? '';
  return {
    id: house,
    name: PROPERTIES[house]?.name ?? house,
    title: LISTING_TITLE[house],
    address,
    map: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`,
    sleeps: stay.sleeps,
    checkIn: stay.checkIn,
    checkOut: stay.checkOut,
    photo,
    facts,
    notes,
    rules,
    nearby,
    emergency: STAY_EMERGENCY,
    quoteHref: `/book/?house=${house}`,
    pageHref: `/houses/${house}`,
    opening: house === 'river' ? 'First stays November 1, 2026' : null,
    schema: vacationRental(house, address, photo.src),
  };
}

/** The stay-agreement safety line on the public house page. It does not sign anything. */
export function houseSafetyLine(): string {
  return agreementTopicLine('safety');
}

/** The stay is not a residential lease. The page does not sign that. */
export function houseLicenseLine(): string {
  return agreementTopicLine('license');
}

export function publicHouses(): PublicHouse[] {
  return HOUSES.map((house) => publicHouse(house));
}

/** Sleep count, times, and the photo caption on a house-list card. Prices stay off. */
export function houseCardFacts(house: HouseId): string[] {
  const page = publicHouse(house);
  return [`Sleeps ${page.sleeps}`, `Check-in ${page.checkIn} · Check-out ${page.checkOut}`, page.photo.caption].filter(
    (line) => line.trim().length > 0 && !line.includes('$') && !/door\s*code|wi-?fi|password/i.test(line),
  );
}

/** The other house on a two-house quote. Prices and door codes stay off. */
export function companionStayFacts(house: HouseId): string[] {
  const page = publicHouse(house);
  const stay = houseStay(house);
  return [page.name, `Sleeps ${page.sleeps}`, `Check-in ${page.checkIn} · Check-out ${page.checkOut}`, page.address, stay.arrival, stay.parking, page.photo.caption].filter(
    (line) => line.trim().length > 0 && !line.includes('$') && !/door\s*code|wi-?fi|password/i.test(line),
  );
}

/** Why the other house is on the quote. Nothing is held. */
export function companionStayNote(): string {
  const line = 'The other house on this quote is listed here. Nothing is held.';
  if (line.includes('$') || /\bis open\b/.test(line) || /door\s*code|wi-?fi|password/i.test(line)) return 'Nothing is held.';
  return line;
}

export const GROUP_TRIP =
  'A party larger than the River House can quote Ranch and River together. Twenty-five stay at the River House and the rest stay at the Ranch House. Each house keeps an adult. The booking page does not hold either house.';

export const GROUP_TRIP_HREF = '/book/?house=river&guests=30';

function groupHref(checkIn: string, checkOut: string, guests: number, children?: number): string {
  const dated = /^\d{4}-\d{2}-\d{2}$/.test(checkIn) && /^\d{4}-\d{2}-\d{2}$/.test(checkOut) && checkOut > checkIn;
  const params = new URLSearchParams({ house: 'river', guests: String(guests) });
  if (dated) {
    params.set('in', checkIn);
    params.set('out', checkOut);
  }
  if (children && children > 0) params.set('children', String(children));
  return `/book/?${params.toString()}`;
}

function groupLabel(reason: string): string {
  const label = /nothing is sent/i.test(reason) ? reason : `${reason} Nothing is sent.`;
  if (label.includes('$') || /\bis open\b/.test(label) || /door\s*code|wi-?fi|password/i.test(label)) {
    return 'This stay is not quoted. Nothing is sent.';
  }
  return label;
}

/** The group link keeps the list dates and the party already typed. Nothing is sent. */
export function groupQuoteLink(
  checkIn: string,
  checkOut: string,
  held: readonly { house: string; line: string }[] = [],
  nights?: {
    asOf: string;
    taken: Partial<Record<HouseId, readonly string[]>>;
    closed?: Partial<Record<HouseId, readonly string[]>>;
  },
  party?: { guests: number; children?: number },
): { href: string; label: string; quoted: boolean } {
  const dated = /^\d{4}-\d{2}-\d{2}$/.test(checkIn) && /^\d{4}-\d{2}-\d{2}$/.test(checkOut) && checkOut > checkIn;
  const guests = party && Number.isInteger(party.guests) && party.guests > 0 ? party.guests : 30;
  const children = party?.children && party.children > 0 ? party.children : undefined;
  const href = groupHref(checkIn, checkOut, guests, children);
  if (nights && dated) {
    const offer = compoundOffer(checkIn, checkOut, guests, children, nights.taken, nights.asOf, () => 'unknown', nights.closed);
    if (offer.show && offer.ok) return { href, label: 'Quote both houses', quoted: true };
    if (!offer.show && guests <= SLEEPS.river) {
      return { href, label: groupLabel('This party fits one house.'), quoted: false };
    }
    const reason = offer.show && offer.reason ? offer.reason : 'This stay is not quoted.';
    return { href, label: groupLabel(reason), quoted: false };
  }
  const blocks = held.filter((row) => row.house === 'ranch' || row.house === 'river');
  if (blocks.length === 0) return { href, label: 'Quote both houses', quoted: false };
  const label = `${blocks.map((row) => row.line).join(' ')} Nothing is sent.`;
  if (label.includes('$') || /\bis open\b/.test(label) || /door\s*code|wi-?fi|password/i.test(label)) {
    return { href, label: 'This stay is not quoted. Nothing is sent.', quoted: false };
  }
  return { href, label, quoted: false };
}

/** The group link when the booking calendar could not be read. It does not call the stay a quote. */
export function groupQuoteUnread(): { label: string } {
  const label = 'The booking calendar could not be read. Nothing is sent.';
  if (label.includes('$') || /\bquote\b/i.test(label) || /\bis open\b/.test(label)) return { label: 'Nothing is sent.' };
  return { label };
}

/** The group link while the calendar is still loading. It does not call the stay a quote. */
export function groupQuotePending(): { label: string } {
  const label = 'Reading the calendar.';
  if (label.includes('$') || /\bquote\b/i.test(label) || /\bis open\b/.test(label)) return { label: 'Reading the calendar.' };
  return { label };
}

/**
 * Tab and share tags for a public page.
 *
 * `canonical` is the address a search engine should index. `/houses/river/` and `/book/?house=river` render the same
 * listing, so without it they are two pages competing with identical content — and the sitemap lists only the first.
 * When it is absent the page's own `url` is used, which is right for the houses index and the policy pages.
 */
export type PublicShare = { title: string; description: string; url: string; image?: string; canonical?: string };

// A quote charges no card. A request does hold the dates for 30 minutes, so this line does not claim
// the page holds nothing.
const SHARE_HOLD = 'A quote does not charge a card. A request holds the dates for 30 minutes while we reply.';
const DASHBOARD_SHARE = {
  title: 'Utah Mountain Luxury Management',
  description:
    'Utah Mountain Luxury Management — short-term rental operations for The Ranch House, The Lindon House, and The River House. Agent map: /llms.txt and /api/agent/map.',
  ogDescription: 'Short-term rental management board for Utah Mountain Luxury properties.',
  url: `${ORIGIN}/`,
};

function shareText(title: string, description: string, url: string, image?: string): PublicShare {
  const share = { title, description, url, ...(image ? { image } : {}) };
  if (/\$|door\s*code|wi-?fi|password|\b801\b/i.test(`${title} ${description}`)) {
    return { title: 'Utah Mountain Luxury', description: SHARE_HOLD, url };
  }
  return share;
}

/** Tab and share text for a public house page. No price, and it does not say a house is open. */
export function publicShare(page: HouseId | 'index'): PublicShare {
  if (page === 'index') {
    return {
      ...shareText(
        'The houses · Utah Mountain Luxury',
        `River, Ranch, and Lindon. ${SHARE_HOLD}`,
        `${ORIGIN}/houses/`,
        `${ORIGIN}/houses/river.jpg`,
      ),
      canonical: `${ORIGIN}/houses/`,
    };
  }
  const house = publicHouse(page);
  /*
   * The share image is the house's own first photo, at an absolute URL. A relative path is ignored by most social scrapers, which
   * is why a shared link used to preview as a bare title.
   */
  const image = house.photo.src ? `${ORIGIN}${house.photo.src}` : undefined;
  return {
    /*
     * The share URL is the slashed form, because that is the address the app serves. The unslashed `pageHref` is kept
     * only for links already in the wild; advertising it here told every social scraper to fetch a URL that redirects,
     * and some of them do not follow redirects for `og:url` at all.
     */
    ...shareText(`${house.name} · Utah Mountain Luxury`, `${house.title}. ${SHARE_HOLD}`, `${ORIGIN}/houses/${page}/`, image),
    canonical: `${ORIGIN}/houses/${page}/`,
  };
}

function partyBits(guests = '', children = ''): string {
  const params = new URLSearchParams();
  if (/^\d{1,2}$/.test(guests) && Number(guests) > 0) params.set('guests', String(Number(guests)));
  if (/^\d{1,2}$/.test(children) && Number(children) > 0) params.set('children', String(Number(children)));
  const text = params.toString();
  return text ? `&${text}` : '';
}

/** The quote house for this party. A party that needs both houses uses the River quote. Nothing is held. */
export function quoteHouseForParty(house: HouseId, guests = '', children = ''): HouseId {
  if (!/^\d{1,2}$/.test(guests) || Number(guests) < 1) return house;
  const count = Number(guests);
  const kids = /^\d{1,2}$/.test(children) && Number(children) > 0 ? Number(children) : undefined;
  if (kids !== undefined && kids >= count) return house;
  if (partyFits(house, count, kids).ok) return house;
  if (count > SLEEPS.river && count <= SLEEPS.river + SLEEPS.ranch && count - (kids ?? 0) >= 2) return 'river';
  const fits = HOUSES.filter((id) => partyFits(id, count, kids).ok);
  return fits.length === 1 ? fits[0]! : house;
}

/** Button for the quote. It names the other house only when this one does not fit. */
export function houseQuoteLabel(house: HouseId, guests = '', children = ''): string {
  const target = quoteHouseForParty(house, guests, children);
  if (target === house) return 'See the dates';
  if (target === 'river' && /^\d{1,2}$/.test(guests) && Number(guests) > SLEEPS.river) return 'See both houses';
  if (target === 'river') return 'See the River House';
  if (target === 'ranch') return 'See the Ranch House';
  return 'See the Lindon House';
}

/** Quote link for a house page. Dates are added only after both are chosen. Nothing is held. */
export function houseQuoteHref(house: HouseId, checkIn: string, checkOut: string, guests = '', children = ''): string {
  const target = quoteHouseForParty(house, guests, children);
  const search = housePageSearch(checkIn, checkOut, guests, children);
  if (!search) {
    const party = partyBits(guests, children).replace(/^&/, '');
    return party ? `/book/?house=${target}&${party}` : `/book/?house=${target}`;
  }
  return `/book/?house=${target}&${search.slice(1)}`;
}

/** A house page for this stay. An unfinished stay stays off the link. Nothing is held. */
export function housePageHref(house: HouseId, checkIn = '', checkOut = '', guests = '', children = ''): string {
  return `/houses/${house}${housePageSearch(checkIn, checkOut, guests, children)}`;
}

function finishedStay(checkIn: string, checkOut: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(checkIn) && /^\d{4}-\d{2}-\d{2}$/.test(checkOut) && checkOut > checkIn;
}

/** Dates already on a house-page link. A backwards or partial pair is ignored. Nothing is held. */
export function readHouseDates(search: string): { checkIn: string; checkOut: string } {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const checkIn = params.get('in') ?? '';
  const checkOut = params.get('out') ?? '';
  if (!finishedStay(checkIn, checkOut)) return { checkIn: '', checkOut: '' };
  return { checkIn, checkOut };
}

/** A party already on a house link. Zero and blank counts are left off. */
export function readHouseParty(search: string): { guests: string; children: string } {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const guests = params.get('guests') ?? '';
  const children = params.get('children') ?? '';
  return {
    guests: /^\d{1,2}$/.test(guests) && Number(guests) > 0 ? String(Number(guests)) : '',
    children: /^\d{1,2}$/.test(children) && Number(children) > 0 ? String(Number(children)) : '',
  };
}

/** Query string for a chosen stay. An unfinished stay stays off the link. */
export function housePageSearch(checkIn: string, checkOut: string, guests = '', children = ''): string {
  if (!finishedStay(checkIn, checkOut)) return '';
  return `?in=${checkIn}&out=${checkOut}${partyBits(guests, children)}`;
}

/** The house-page link keeps a finished stay. It does not hold the dates. */
export function houseDateLinkNote(checkIn: string, checkOut: string): string {
  if (!housePageSearch(checkIn, checkOut)) return '';
  return 'This page link keeps these dates. It does not hold them. Nothing is charged yet.';
}

/** Shown while a house-page stay is only half chosen. It does not say the house is open. */
export function houseDateHold(checkIn: string, checkOut: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(checkIn) || checkOut) return '';
  return 'Choose the checkout morning. This does not say the house is open. Nothing is charged yet.';
}

/** Tab and share text for a quote. The link keeps the stay. No price, and it does not say the house is open. */
export function bookShare(
  house: HouseId,
  stay?: { checkIn?: string; checkOut?: string; guests?: string; children?: string },
): PublicShare {
  const page = publicShare(house);
  const checkIn = stay?.checkIn ?? '';
  const checkOut = stay?.checkOut ?? '';
  const guests = stay?.guests ?? '';
  const children = stay?.children ?? '';
  const search = housePageSearch(checkIn, checkOut, guests, children);
  const party = partyBits(guests, children).replace(/^&/, '');
  const url = search
    ? `${ORIGIN}/book/?house=${house}&${search.slice(1)}`
    : party
      ? `${ORIGIN}/book/?house=${house}&${party}`
      : `${ORIGIN}/book/?house=${house}`;
  return shareText(page.title, page.description, url);
}

/**
 * Set a meta tag's content, creating it when the document does not carry one.
 *
 * It used to only update a tag that already existed: `querySelector` returned null and the call did nothing. That is
 * silent — the page looks like it set a canonical or an image and simply did not. Creating the tag on demand means a
 * page that needs a tag `index.html` does not carry still gets one.
 */
function setMeta(selector: string, content: string) {
  if (typeof document === 'undefined') return;
  const existing = document.querySelector(selector);
  if (existing) {
    existing.setAttribute('content', content);
    return;
  }
  // `meta[name="x"]` or `meta[property="x"]` — the two forms in use here.
  const match = /^meta\[(name|property)="([^"]+)"\]$/.exec(selector);
  if (!match) return;
  const tag = document.createElement('meta');
  tag.setAttribute(match[1]!, match[2]!);
  tag.setAttribute('content', content);
  document.head.appendChild(tag);
}

/**
 * Declare the address a search engine should treat as this page's real one.
 *
 * `/houses/river/` and `/book/?house=river` render the same listing, and the sitemap lists only the house page. Without
 * a canonical they compete as two pages with the same content, which is how a listing ends up ranked below its own
 * duplicate. The link is set here because the address is only known once the browser has it.
 */
function setCanonical(href: string) {
  if (typeof document === 'undefined') return;
  let link = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement('link');
    link.rel = 'canonical';
    document.head.appendChild(link);
  }
  link.href = href;
}

/** Sets the tab and share tags, then restores the dashboard title when the page closes. */
export function applyPublicShare(share: PublicShare): () => void {
  if (typeof document === 'undefined') return () => undefined;
  document.title = share.title;
  setMeta('meta[name="description"]', share.description);
  setMeta('meta[property="og:title"]', share.title);
  setMeta('meta[property="og:description"]', share.description);
  setMeta('meta[property="og:url"]', share.url);
  /*
   * The canonical address, stripped of any query. A quote link carries dates and a party, and those are not a page —
   * each one would otherwise be indexed as its own copy of the listing.
   */
  setCanonical(share.canonical ?? share.url.split('?')[0] ?? share.url);
  /*
   * The share image.
   *
   * `index.html` carries an image and a Twitter card for the houses index, because a scraper that never runs this JavaScript has
   * to see them. A house page overrides both with its own photo here. Setting an empty string would tell the scraper "no image",
   * which is worse than leaving the generic one, so the tags are only touched when a share actually has an image.
   */
  if (share.image) {
    setMeta('meta[property="og:image"]', share.image);
    setMeta('meta[name="twitter:image"]', share.image);
  }
  setMeta('meta[name="twitter:title"]', share.title);
  setMeta('meta[name="twitter:description"]', share.description);
  return () => {
    document.title = DASHBOARD_SHARE.title;
    setMeta('meta[name="description"]', DASHBOARD_SHARE.description);
    setMeta('meta[property="og:title"]', DASHBOARD_SHARE.title);
    setMeta('meta[property="og:description"]', DASHBOARD_SHARE.ogDescription);
    setMeta('meta[property="og:url"]', DASHBOARD_SHARE.url);
    setMeta('meta[property="og:image"]', '');
    // The canonical belongs to the public page, so leaving the dashboard must not point a crawler at a house.
    setCanonical(DASHBOARD_SHARE.url);
  };
}

/** `/houses/`, `/houses/river`, or null when the path is not a public house page. */
export function parseHousePath(pathname: string): HouseId | 'index' | null {
  /*
   * Trailing slashes are stripped first, so the comparison has to be against `/houses` — checking for
   * `/houses/` after stripping can never match, which is why the index needed a second path to work.
   * Both forms are accepted because links already sent out use either.
   */
  const path = pathname.replace(/\/+$/, '') || '/';
  if (path === '/houses') return 'index';
  const match = path.match(/^\/houses\/(river|ranch|lindon)$/);
  return match ? (match[1] as HouseId) : null;
}

function vacationRental(house: HouseId, address: string, image: string): Record<string, unknown> {
  const stay = houseStay(house);
  const postal = postalAddress(address);
  return {
    '@context': 'https://schema.org',
    '@type': 'VacationRental',
    name: PROPERTIES[house]?.name ?? house,
    description: LISTING_TITLE[house],
    url: `${ORIGIN}/houses/${house}`,
    image: image ? `${ORIGIN}${image}` : undefined,
    address: { '@type': 'PostalAddress', ...postal },
    containsPlace: {
      '@type': 'Accommodation',
      occupancy: { '@type': 'QuantitativeValue', value: SLEEPS[house] },
      ...(stay.bedrooms
        ? { additionalProperty: { '@type': 'PropertyValue', name: 'Bedrooms', value: stay.bedrooms } }
        : {}),
    },
    checkinTime: stay.checkIn === '4:00 PM' ? '16:00' : stay.checkIn,
    checkoutTime: stay.checkOut === '11:00 AM' ? '11:00' : stay.checkOut,
    amenityFeature: publishedAmenities(house),
  };
}

function partyAmenity(house: HouseId): string | null {
  const text = houseRules(house)
    .map((rule) => rule.text)
    .join(' ');
  const match = text.match(/No parties[^.]*\./);
  return match ? match[0].slice(0, -1) : null;
}

/** Only facts the guest guide already publishes. */
function publishedAmenities(house: HouseId): Array<{ '@type': string; name: string; value: boolean }> {
  const features = [{ '@type': 'LocationFeatureSpecification', name: 'No smoking indoors', value: true }];
  const party = partyAmenity(house);
  if (party) features.push({ '@type': 'LocationFeatureSpecification', name: party, value: true });
  if (houseRules(house).some((rule) => rule.id === 'tub')) {
    features.push({ '@type': 'LocationFeatureSpecification', name: 'Hot tub', value: true });
  }
  features.push(
    { '@type': 'LocationFeatureSpecification', name: 'No lifeguard on duty', value: true },
    { '@type': 'LocationFeatureSpecification', name: 'No fireworks', value: true },
    { '@type': 'LocationFeatureSpecification', name: 'Short stay, not a residential lease', value: true },
  );
  return features;
}

function postalAddress(address: string): {
  streetAddress: string;
  addressLocality: string;
  addressRegion: string;
  postalCode: string;
  addressCountry: string;
} {
  const parts = address.split(',').map((part) => part.trim());
  const last = parts[parts.length - 1] ?? '';
  return {
    streetAddress: parts[0] ?? address,
    addressLocality: parts.length >= 3 ? (parts[1] ?? '') : '',
    addressRegion: /Utah|\bUT\b/.test(last) ? 'UT' : '',
    postalCode: last.match(/\d{5}/)?.[0] ?? '',
    addressCountry: 'US',
  };
}
