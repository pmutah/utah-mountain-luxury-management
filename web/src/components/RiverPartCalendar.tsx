import { useMemo } from 'react';
import type { Reservation } from '../lib/api';
import type { DateBlock } from '../lib/booked-nights';
import { riverMonth, riverMonthLine, type RiverDayInput } from '../lib/river-calendar';
import { RIVER_UNIT_DETAIL } from '../lib/river-units';

/**
 * The Riverhouse month, whole and in parts.
 *
 * A house calendar paints a booked night one colour, which is right for the Ranch and Lindon and wrong here: the
 * Riverhouse can be sold four ways, and a night with the Main Lodge sold is a night with two parts *still for sale*. A
 * host cannot see that from a single colour, so every day carries which parts are gone, which are open, and a line
 * saying so.
 *
 * It shows the truth as the blocking rules see it. It does not offer to book, block, or price anything.
 */

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export function RiverPartCalendar({
  month,
  reservations,
  blocks,
  todayIso,
}: {
  month: string;
  reservations: Reservation[];
  blocks: DateBlock[];
  todayIso: string;
}) {
  const spans = useMemo<RiverDayInput[]>(() => {
    const stays: RiverDayInput[] = reservations.map((stay) => ({
      propertyId: stay.propertyId,
      checkIn: stay.checkIn,
      checkOut: stay.checkOut,
      status: stay.status,
      ...(stay.units && stay.units.length > 0 ? { units: stay.units } : {}),
    }));
    const closed: RiverDayInput[] = blocks.map((block) => ({
      propertyId: block.propertyId,
      checkIn: block.start,
      checkOut: block.end,
      blocked: true,
    }));
    return [...stays, ...closed];
  }, [reservations, blocks]);

  const days = useMemo(() => riverMonth(month, spans, todayIso), [month, spans, todayIso]);
  if (days.length === 0) return null;

  const [y, m] = month.split('-').map(Number);
  const firstDow = new Date(y!, (m ?? 1) - 1, 1).getDay();
  const cells: Array<(typeof days)[number] | null> = [
    ...Array.from({ length: firstDow }, () => null),
    ...days,
  ];
  const heading = `${MONTHS[(m ?? 1) - 1] ?? ''} ${y}`;

  return (
    <section className="uml-panel rounded-3xl p-5 sm:p-6" data-bot="river-parts-calendar" data-month={month}>
      <p className="uml-kicker">The house, whole and in parts · {heading}</p>
      <p className="mt-2 max-w-2xl text-sm text-[var(--uml-muted)]">
        One night is only ever sold once. A part sold blocks the whole house for that night and leaves the other two
        open, and a whole-house stay blocks all three. This is the calendar those rules produce.
      </p>
      <p className="mt-2 text-sm" data-bot="river-parts-month-line">
        {riverMonthLine(days)}
      </p>

      <div className="mt-4 grid grid-cols-7 gap-1 text-center text-[9px] font-bold uppercase text-[var(--uml-muted)]">
        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((day, index) => {
          if (!day) return <div key={`blank-${index}`} className="min-h-[4.5rem]" />;
          const isToday = day.date === todayIso;
          return (
            <div
              key={day.date}
              data-bot="river-parts-day"
              data-date={day.date}
              data-house-taken={day.houseTaken ? 'yes' : 'no'}
              data-free-parts={day.freeParts.join(',')}
              data-closed={day.closed ? 'yes' : 'no'}
              className={`min-h-[4.5rem] rounded-lg border p-1.5 text-left ${
                day.closed
                  ? 'border-slate-600 bg-slate-800/60'
                  : day.wholeHouseSold
                    ? 'border-rose-800/60 bg-rose-950/40'
                    : day.houseTaken
                      ? 'border-amber-700/50 bg-amber-950/30'
                      : 'border-[var(--uml-line)] bg-transparent'
              }${isToday ? ' ring-2 ring-[var(--uml-gold)]' : ''}`}
            >
              <p className={`text-[10px] font-bold ${isToday ? 'text-[var(--uml-gold)]' : 'text-[var(--uml-ink)]'}`}>
                {day.day}
              </p>
              {/*
                Every part is listed every day, so a host can see at a glance which of the three is gone. A day with the
                whole house free shows three open dots rather than an empty cell, because an empty cell reads as missing
                data.
              */}
              <ul className="mt-0.5 flex flex-wrap gap-0.5">
                {day.parts.map((part) => {
                  const short = RIVER_UNIT_DETAIL.find((detail) => detail.id === part.unit)?.name.replace('River ', '') ?? part.unit;
                  return (
                    <li
                      key={part.unit}
                      data-bot="river-parts-dot"
                      data-unit={part.unit}
                      data-taken={part.taken ? 'yes' : 'no'}
                      title={`${short}: ${part.taken ? 'sold' : 'open'}`}
                      className={`inline-block h-2 w-2 rounded-full ${
                        part.taken ? 'bg-rose-500' : day.closed ? 'bg-slate-600' : 'bg-emerald-500'
                      }`}
                    />
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-[var(--uml-muted)]" data-bot="river-parts-legend">
        Three dots per day, in order: Garage Suite, Recreation Wing, Main Lodge. Green is open, red is sold, grey is
        closed.
      </p>
      {/*
        The reasons are listed below the grid rather than crammed into a cell: a 40-character sentence in a 70px box is
        unreadable, and the host needs the sentence more than they need it in place.
      */}
      <details className="mt-3" data-bot="river-parts-reasons">
        <summary className="cursor-pointer text-xs uppercase tracking-[0.12em] text-[var(--uml-muted)]">
          What each day says
        </summary>
        <ul className="mt-2 space-y-1 text-xs">
          {days
            .filter((day) => day.houseTaken || day.closed)
            .map((day) => (
              <li key={day.date} data-bot="river-parts-reason" data-date={day.date}>
                <span className="tabular-nums">{day.date}</span> · {day.reason}
              </li>
            ))}
        </ul>
      </details>
    </section>
  );
}
