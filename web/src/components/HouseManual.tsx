import { useEffect, useState } from 'react';
import { loadQuoteCalendar } from '../lib/booked-nights';
import { bookedDateLine, quotePageDateLine, type DeskCalendar } from '../lib/guide-desk';
import { dateThisStay, emergencyLine, flexStayLine, guideClockHits, guideDirectionHits, guideNearbyHits, hotTubLine, keepClockLines, keepParkingLines, manualGapLine, publicFlexLine, publishedFactHits, searchHouseManual, smokingRuleLine, swimFacts, uniqueGuideHits, winterDriveLine, type ManualHit } from '../lib/house-manual';
import { quietNowAnswer } from '../lib/stay-rhythm';
import { visitorLine, visitorQuestion } from '../lib/stay-agreement';
import { denverToday } from '../lib/market/dates';
import type { HouseId } from '../lib/market/types';

/** A published-guide search. The question stays in this view. Nothing is sent. */
export function HouseManual({
  house,
  where = 'house',
  checkIn,
  checkOut,
  guests,
  children,
}: {
  house: HouseId;
  where?: 'house' | 'quote';
  checkIn?: string;
  checkOut?: string;
  guests?: number | null;
  children?: number;
}) {
  const [query, setQuery] = useState('');
  const [calendar, setCalendar] = useState<DeskCalendar | null>(null);
  const [calendarReady, setCalendarReady] = useState(false);
  useEffect(() => {
    let cancel = false;
    loadQuoteCalendar()
      .then((rows) => {
        if (cancel) return;
        setCalendar(rows ? { taken: rows.nights, closed: rows.closed } : null);
        setCalendarReady(true);
      })
      .catch(() => {
        if (cancel) return;
        setCalendar(null);
        setCalendarReady(true);
      });
    return () => {
      cancel = true;
    };
  }, []);
  const booked = bookedDateLine(query, house, denverToday(), calendar);
  const pageDates =
    checkIn && checkOut
      ? quotePageDateLine(query, house, checkIn, checkOut, calendar, denverToday(), !calendarReady, { guests, children })
      : null;
  const bot = where === 'quote' ? 'stay-manual' : 'house-manual';
  const secret = /\b(wi-?fi|password|door code|code)\b/i.test(query);
  const flex = publicFlexLine(
    secret ? null : flexStayLine(query, house, checkIn && checkOut ? { checkIn, checkOut } : undefined, calendar),
  );
  const winter = secret || flex ? null : winterDriveLine(query, house);
  const smoke = secret || flex || winter ? null : smokingRuleLine(query, house);
  const swim = secret || flex || winter || smoke ? null : swimFacts(query, house);
  const tub = secret || flex || winter || smoke || swim ? null : hotTubLine(query, house);
  const emergency = secret || flex || winter || smoke || swim || tub ? null : emergencyLine(query);
  const visitors = secret || emergency ? '' : visitorQuestion(query) ? visitorLine('page') : '';
  const facts =
    secret || flex || winter || smoke || swim || tub || emergency || visitors ? [] : publishedFactHits(query, house);
  const found = secret || flex || winter || smoke || swim || tub || emergency || visitors || facts.length > 0 ? { hits: [], more: 0 } : keepParkingLines(query, keepClockLines(query, searchHouseManual(query, [house])));
  const gap = secret ? null : manualGapLine(query, house);
  const party = Boolean(gap && /\bsleeps \d+\b/.test(gap));
  const clock = secret || party || flex || winter ? [] : guideClockHits(query, house, undefined, found.hits);
  const directions = secret || party || flex || winter ? [] : guideDirectionHits(query, house);
  const nearby = secret || party || flex || winter ? [] : guideNearbyHits(query, house);
  const quiet = secret || party || flex || winter ? null : quietNowAnswer(query, house);
  const quietHits: ManualHit[] = quiet ? [{ house, title: 'Quiet hours', text: quiet }] : [];
  const quoteStay =
    where === 'quote' && checkIn && checkOut ? { checkIn, checkOut } : undefined;
  const hits = facts.length > 0
    ? facts
    : dateThisStay(
        uniqueGuideHits([...quietHits, ...directions, ...nearby, ...clock, ...found.hits]).slice(0, 6),
        quoteStay,
      );
  const asked = query.trim().length > 0;
  const note =
    where === 'quote'
      ? 'Looks through this house’s published guide, including nearby places. This does not say the house is open. Nothing is sent.'
      : 'Looks through this house’s published guide, including nearby places. Nothing is sent.';
  const shell = where === 'quote' ? 'mt-4 border-t border-[var(--uml-line)] pt-4' : 'uml-panel mt-6 rounded-3xl p-6';
  return (
    <section className={shell} data-bot={bot} data-house={house}>
      <p className="uml-kicker">Search the guide</p>
      <p className="mt-2 text-sm text-[var(--uml-muted)]">{note}</p>
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        data-bot={`${bot}-q`}
        className="mt-4 w-full rounded-full border border-[var(--uml-line)] bg-transparent px-4 py-3 text-sm text-[var(--uml-ink)]"
        placeholder="Septic, parking, ski"
      />
      {flex && (
        <p className="mt-4 text-sm" data-bot={`${bot}-flex`}>
          {flex}
        </p>
      )}
      {winter && (
        <p className="mt-4 text-sm" data-bot={`${bot}-winter`}>
          {winter}
        </p>
      )}
      {smoke && (
        <p className="mt-4 text-sm" data-bot={`${bot}-smoke`}>
          {smoke} Nothing is sent.
        </p>
      )}
      {swim && (
        <p className="mt-4 text-sm" data-bot={`${bot}-swim`}>
          {swim} Nothing is sent.
        </p>
      )}
      {tub && (
        <p className="mt-4 text-sm" data-bot={`${bot}-tub`}>
          {tub} Nothing is sent.
        </p>
      )}
      {emergency && (
        <p className="mt-4 text-sm" data-bot={`${bot}-emergency`}>
          {emergency}
        </p>
      )}
      {visitors && (
        <p className="mt-4 text-sm" data-bot={`${bot}-visitors`}>
          {visitors} Nothing is sent.
        </p>
      )}
      {booked && (
        <p className="mt-4 text-sm" data-bot={`${bot}-booked`}>
          {booked}
        </p>
      )}
      {pageDates && !booked && (
        <p className="mt-4 text-sm" data-bot={`${bot}-page-dates`}>
          {pageDates}
        </p>
      )}
      {secret && (
        <p className="mt-4 text-sm" data-bot={`${bot}-closed`}>
          The door code and Wi-Fi stay off this page.
        </p>
      )}
      {asked && !pageDates && !secret && !winter && !swim && !tub && !visitors && gap && (party || found.hits.length === 0) && (nearby.length === 0 || /\b\d{1,2}\b/.test(query)) && (
        <p className="mt-4 text-sm" data-bot={`${bot}-gap`}>
          {gap}
        </p>
      )}
      {asked && !pageDates && !secret && !party && !flex && !winter && !smoke && !swim && !tub && !emergency && !visitors && hits.length === 0 && !gap && (
        <p className="mt-4 text-sm" data-bot={`${bot}-empty`}>
          The published guide does not say that.
        </p>
      )}
      {!pageDates && !party && !visitors && hits.length > 0 && (
        <ul className="mt-4 space-y-2 text-sm">
          {hits.map((hit) => (
            <li key={`${hit.title}-${hit.text}`} data-bot={`${bot}-hit`}>
              <span className="uml-kicker">{hit.title}</span> {hit.text}
            </li>
          ))}
        </ul>
      )}
      {found.more > 0 && (
        <p className="mt-3 text-xs text-[var(--uml-muted)]" data-bot={`${bot}-more`}>
          {found.more} more {found.more === 1 ? 'match is' : 'matches are'} on this page.
        </p>
      )}
    </section>
  );
}
