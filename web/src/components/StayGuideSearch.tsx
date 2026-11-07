import { useEffect, useState } from 'react';
import { loadQuoteCalendar } from '../lib/booked-nights';
import { stayGuideLookup, type FlexCalendar } from '../lib/house-manual';
import { denverHour } from '../lib/stay-rhythm';
import type { HouseId } from '../lib/market/types';

/** Published-guide search on the stay phone. Nothing is sent. */
export function StayGuideSearch({
  house,
  checkIn,
  checkOut,
}: {
  house: HouseId;
  checkIn?: string;
  checkOut?: string;
}) {
  const [query, setQuery] = useState('');
  const [calendar, setCalendar] = useState<FlexCalendar | null>(null);
  useEffect(() => {
    let cancel = false;
    loadQuoteCalendar()
      .then((rows) => {
        if (!cancel) setCalendar(rows ? { taken: rows.nights, closed: rows.closed } : null);
      })
      .catch(() => {
        if (!cancel) setCalendar(null);
      });
    return () => {
      cancel = true;
    };
  }, []);
  const found = stayGuideLookup(
    query,
    house,
    checkIn && checkOut ? { checkIn, checkOut } : undefined,
    denverHour(),
    calendar,
  );
  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5" data-bot="stay-guide-search" data-house={house}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#d4b56a]">Search the guide</p>
      <p className="mt-2 text-sm text-white/60">Looks through this house’s published guide. Nothing is sent.</p>
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        data-bot="stay-guide-search-q"
        className="mt-4 w-full rounded-full border border-white/15 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-white/35"
        placeholder="Parking, septic, ski"
      />
      {found.kind === 'secret' && (
        <p className="mt-4 text-sm text-[#d7cfc3]" data-bot="stay-guide-search-closed">
          {found.text}
        </p>
      )}
      {found.kind === 'gap' && (
        <p className="mt-4 text-sm text-[#d7cfc3]" data-bot="stay-guide-search-gap">
          {found.text}
        </p>
      )}
      {found.kind === 'empty' && (
        <p className="mt-4 text-sm text-[#d7cfc3]" data-bot="stay-guide-search-empty">
          {found.text}
        </p>
      )}
      {found.kind === 'hits' && (
        <ul className="mt-4 space-y-2 text-sm text-[#d7cfc3]">
          {found.hits.map((hit) => (
            <li key={`${hit.title}-${hit.text}`} data-bot="stay-guide-search-hit">
              <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#d4b56a]">{hit.title}</span> {hit.text}
            </li>
          ))}
        </ul>
      )}
      {found.more > 0 && (
        <p className="mt-3 text-xs text-white/45" data-bot="stay-guide-search-more">
          {found.more} more {found.more === 1 ? 'match is' : 'matches are'} in this guide.
        </p>
      )}
    </section>
  );
}
